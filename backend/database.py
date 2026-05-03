import json
import os

DB_FILE = os.path.join(os.path.dirname(__file__), "proposals_db.json")

def load_proposals():
    if not os.path.exists(DB_FILE):
        return []
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def save_proposals(proposals):
    with open(DB_FILE, "w") as f:
        json.dump(proposals, f, indent=2)

def add_proposal(proposal):
    proposals = load_proposals()
    proposals.append(proposal)
    save_proposals(proposals)

def update_proposal(proposal_id, updates):
    proposals = load_proposals()
    for prop in proposals:
        if prop["id"] == proposal_id:
            prop.update(updates)
            save_proposals(proposals)
            return True
    return False
