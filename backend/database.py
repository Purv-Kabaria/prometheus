"""
database.py — SQLite-backed proposal store with WAL mode.
Replaces the flat JSON file to eliminate race conditions.
On first run, automatically migrates existing proposals_db.json if present.
"""
import json
import os
import sqlite3
import threading
from contextlib import contextmanager

_DB_DIR  = os.path.dirname(os.path.abspath(__file__))
DB_FILE  = os.path.join(_DB_DIR, "proposals.db")
_JSON_DB = os.path.join(_DB_DIR, "proposals_db.json")

_write_lock = threading.Lock()


@contextmanager
def _get_conn():
    conn = sqlite3.connect(DB_FILE, timeout=15, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_db():
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS proposals (
                id    TEXT PRIMARY KEY,
                data  TEXT NOT NULL,
                rowno INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS _seq (
                id INTEGER PRIMARY KEY AUTOINCREMENT
            )
        """)
    _migrate_json()


def _migrate_json():
    """One-time migration from proposals_db.json → SQLite."""
    if not os.path.exists(_JSON_DB):
        return
    with _get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) as c FROM proposals").fetchone()["c"]
        if count > 0:
            return  # already migrated
    try:
        with open(_JSON_DB, "r") as f:
            proposals = json.load(f)
        for i, p in enumerate(proposals):
            with _get_conn() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO proposals (id, data, rowno) VALUES (?, ?, ?)",
                    (p["id"], json.dumps(p), i),
                )
        print(f"[DB] Migrated {len(proposals)} proposals from JSON → SQLite.")
    except Exception as e:
        print(f"[DB] Migration skipped ({e}).")


_init_db()


def load_proposals():
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT data FROM proposals ORDER BY rowno ASC"
        ).fetchall()
    return [json.loads(r["data"]) for r in rows]


def save_proposals(proposals):
    """Legacy compatibility — prefer add_proposal / update_proposal."""
    with _write_lock:
        with _get_conn() as conn:
            conn.execute("DELETE FROM proposals")
            for i, p in enumerate(proposals):
                conn.execute(
                    "INSERT INTO proposals (id, data, rowno) VALUES (?, ?, ?)",
                    (p["id"], json.dumps(p), i),
                )


def add_proposal(proposal: dict):
    with _write_lock:
        with _get_conn() as conn:
            conn.execute("INSERT INTO _seq DEFAULT VALUES")
            rowno = conn.execute("SELECT last_insert_rowid() as r").fetchone()["r"]
            conn.execute(
                "INSERT OR REPLACE INTO proposals (id, data, rowno) VALUES (?, ?, ?)",
                (proposal["id"], json.dumps(proposal), rowno),
            )


def update_proposal(proposal_id: str, updates: dict) -> bool:
    with _write_lock:
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT data FROM proposals WHERE id = ?", (proposal_id,)
            ).fetchone()
            if not row:
                return False
            proposal = json.loads(row["data"])
            proposal.update(updates)
            conn.execute(
                "UPDATE proposals SET data = ? WHERE id = ?",
                (json.dumps(proposal), proposal_id),
            )
    return True
