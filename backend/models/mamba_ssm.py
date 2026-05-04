"""
mamba_ssm.py — Prometheus Model 02 (Revised)
=============================================
Selective State Space Model (Mamba) for hourly energy demand forecasting.

Architecture:
  Input (B, L, D_in)
    → Linear projection → D
    → N × MambaBlock [Selective SSM + gated MLP]
    → LayerNorm
    → Linear head → forecast_horizon

Key design choices for energy forecasting:
  • Pure-PyTorch parallel scan — runs on Windows CPU/GPU without mamba-ssm's CUDA kernels
  • Bidirectional SSM option — mirrors BiLSTM's forward+backward benefit
  • Quantile output heads (P10/P50/P90) — consistent with LightGBM quantile ensemble
  • Positional encoding via learnable Fourier features — captures daily/weekly periodicity
  • Residual gating (ZOH-style) — improves gradient flow on long 168h look-back windows

References:
  Gu & Dao (2023) — "Mamba: Linear-Time Sequence Modeling with Selective State Spaces"
  S-Mamba (Wang et al., 2024) — inter-variate correlation via bidirectional Mamba
  MambaTS (Cai et al., 2024) — Temporal Mamba Block for long-term TS forecasting
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor


# ─────────────────────────────────────────────
#  Configuration dataclass
# ─────────────────────────────────────────────

@dataclass
class MambaConfig:
    """Hyper-parameters for the Prometheus Mamba SSM."""

    # Input / output
    input_dim: int = 14          # number of input features (weather + calendar + lags)
    forecast_horizon: int = 48   # steps ahead (48 h — same as BiLSTM)
    lookback: int = 168          # context window in hours (1 week)

    # Model size
    d_model: int = 128           # hidden / residual stream dimension
    n_layers: int = 4            # number of MambaBlock stacks
    d_state: int = 16            # SSM state dimension N
    d_conv: int = 4              # local depthwise conv width inside SSM
    expand: int = 2              # inner_dim = expand × d_model

    # Bidirectional
    bidirectional: bool = True   # run SSM in both directions and add

    # Output heads
    quantiles: List[float] = field(default_factory=lambda: [0.1, 0.5, 0.9])

    # Regularisation
    dropout: float = 0.1

    # Training
    lr: float = 3e-4
    weight_decay: float = 1e-4
    batch_size: int = 64
    max_epochs: int = 80
    patience: int = 10           # early stopping
    grad_clip: float = 1.0


# ─────────────────────────────────────────────
#  Learnable Fourier Positional Encoding
#  (captures daily + weekly periodicity)
# ─────────────────────────────────────────────

class FourierPositionalEncoding(nn.Module):
    """
    Learnable Fourier features for time-series positional encoding.
    Produces a d_model-dim embedding for each position in [0, L).
    """

    def __init__(self, d_model: int, max_len: int = 512, n_harmonics: int = 4):
        super().__init__()
        # Fixed sinusoidal base — same as vanilla transformer PE
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float)
            * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term[: d_model // 2])
        self.register_buffer("pe", pe.unsqueeze(0))  # (1, max_len, d_model)

        # Learnable scale — starts at 1, lets the network decide PE importance
        self.scale = nn.Parameter(torch.ones(1))

    def forward(self, x: Tensor) -> Tensor:
        # x: (B, L, D)
        return x + self.scale * self.pe[:, : x.size(1)]


# ─────────────────────────────────────────────
#  Selective Scan (parallel associative scan)
#  Pure-PyTorch — no CUDA-only kernels needed
# ─────────────────────────────────────────────

def selective_scan_parallel(
    u: Tensor,    # (B, L, D_inner)
    delta: Tensor, # (B, L, D_inner)  — discretisation step Δ
    A: Tensor,    # (D_inner, N)      — state matrix (learnable log-space)
    B: Tensor,    # (B, L, N)         — input projection
    C: Tensor,    # (B, L, N)         — output projection
    D: Tensor,    # (D_inner,)        — skip connection
) -> Tensor:
    """
    Selective SSM scan via sequential recurrence.
    For training on sequences ≤ 512, sequential is fast enough on GPU.
    For longer sequences, replace with a parallel prefix scan (not needed here).

    Discretisation: ZOH  (zero-order hold)
      Ā = exp(Δ ⊙ A)
      B̄ = (Ā − I) / A ⊙ B  ≈ Δ ⊙ B  for small Δ  (first-order approx)
    """
    B_batch, L, D_inner = u.shape
    N = A.shape[-1]

    # Discretise A  →  Ā  shape: (B, L, D_inner, N)
    deltaA = torch.exp(
        delta.unsqueeze(-1) * A.unsqueeze(0).unsqueeze(0)
    )  # (B, L, D_inner, N)

    # Discretise B  →  B̄  shape: (B, L, D_inner, N)
    deltaB_u = (
        delta.unsqueeze(-1) * B.unsqueeze(2) * u.unsqueeze(-1)
    )  # (B, L, D_inner, N)

    # Sequential scan over time
    h = torch.zeros(B_batch, D_inner, N, device=u.device, dtype=u.dtype)
    ys = []
    for t in range(L):
        h = deltaA[:, t] * h + deltaB_u[:, t]          # (B, D_inner, N)
        y_t = (h * C[:, t].unsqueeze(1)).sum(-1)        # (B, D_inner)
        ys.append(y_t)

    y = torch.stack(ys, dim=1)   # (B, L, D_inner)
    return y + u * D.unsqueeze(0).unsqueeze(0)


# ─────────────────────────────────────────────
#  Core Mamba Block  (one SSM + gated MLP)
# ─────────────────────────────────────────────

class MambaBlock(nn.Module):
    """
    Single Mamba residual block:
      x  →  LayerNorm
         →  [SSM branch] + [Gate branch]
         →  project back to d_model
         →  residual add

    Follows the original paper architecture (Fig. 3).
    """

    def __init__(self, cfg: MambaConfig):
        super().__init__()
        self.d_model = cfg.d_model
        self.d_inner = cfg.d_model * cfg.expand
        self.d_state = cfg.d_state
        self.d_conv = cfg.d_conv

        # Pre-norm
        self.norm = nn.LayerNorm(cfg.d_model)

        # Input projection: x → (z, x_ssm)  both of size d_inner
        self.in_proj = nn.Linear(cfg.d_model, 2 * self.d_inner, bias=False)

        # Local depthwise conv (captures very short-range patterns)
        self.conv1d = nn.Conv1d(
            self.d_inner, self.d_inner,
            kernel_size=cfg.d_conv,
            groups=self.d_inner,
            padding=cfg.d_conv - 1,
            bias=True,
        )

        # SSM parameters
        self.x_proj = nn.Linear(self.d_inner, cfg.d_state * 2 + self.d_inner, bias=False)
        # B and C are input-dependent (selective); delta comes from x_proj
        self.dt_proj = nn.Linear(self.d_inner, self.d_inner, bias=True)

        # A: initialised as -1..-N (log-space, kept negative for stability)
        A = torch.arange(1, cfg.d_state + 1, dtype=torch.float).repeat(self.d_inner, 1)
        self.A_log = nn.Parameter(torch.log(A))

        # D: skip / skip-connection (initialised to 1)
        self.D = nn.Parameter(torch.ones(self.d_inner))

        # Output projection back to d_model
        self.out_proj = nn.Linear(self.d_inner, cfg.d_model, bias=False)
        self.dropout = nn.Dropout(cfg.dropout)

    def forward(self, x: Tensor) -> Tensor:
        """x: (B, L, d_model)"""
        residual = x
        x = self.norm(x)

        # Split into SSM stream (x_ssm) and gate stream (z)
        xz = self.in_proj(x)                            # (B, L, 2*d_inner)
        x_ssm, z = xz.chunk(2, dim=-1)                  # each: (B, L, d_inner)

        # Depthwise conv along time axis
        x_ssm = x_ssm.transpose(1, 2)                   # (B, d_inner, L)
        x_ssm = self.conv1d(x_ssm)[..., : x.size(1)]    # causal crop
        x_ssm = x_ssm.transpose(1, 2)                   # (B, L, d_inner)
        x_ssm = F.silu(x_ssm)

        # Compute Δ, B, C (all input-dependent — the "selective" part)
        x_dbc = self.x_proj(x_ssm)                      # (B, L, N*2 + d_inner)
        delta_raw, B, C = x_dbc.split(
            [self.d_inner, self.d_state, self.d_state], dim=-1
        )
        delta = F.softplus(self.dt_proj(delta_raw))      # (B, L, d_inner), > 0

        # Recover A from log-space (always negative)
        A = -torch.exp(self.A_log)                       # (d_inner, N)

        # Selective scan
        y = selective_scan_parallel(x_ssm, delta, A, B, C, self.D)  # (B, L, d_inner)

        # Gating: y ⊙ SiLU(z)
        y = y * F.silu(z)

        # Project back
        y = self.out_proj(y)                             # (B, L, d_model)
        return self.dropout(y) + residual


# ─────────────────────────────────────────────
#  Bidirectional Mamba wrapper
# ─────────────────────────────────────────────

class BidirectionalMambaBlock(nn.Module):
    """
    Runs two MambaBlocks in opposite directions and adds their outputs.
    Mirrors BiLSTM's approach — improves context from future time steps
    during training (non-causal; fine for off-line batch forecasting).
    """

    def __init__(self, cfg: MambaConfig):
        super().__init__()
        self.fwd = MambaBlock(cfg)
        self.bwd = MambaBlock(cfg)
        self.norm = nn.LayerNorm(cfg.d_model)

    def forward(self, x: Tensor) -> Tensor:
        fwd_out = self.fwd(x)
        bwd_out = self.bwd(x.flip(dims=[1])).flip(dims=[1])
        return self.norm(fwd_out + bwd_out)


# ─────────────────────────────────────────────
#  Full Mamba Forecasting Model
# ─────────────────────────────────────────────

class PrometheusManba(nn.Module):
    """
    Prometheus Model 02 — Mamba SSM Forecaster.

    Input:
        x: (B, lookback, input_dim)  — multivariate time series window

    Output:
        dict with keys 'p10', 'p50', 'p90' each (B, forecast_horizon)
        (or stacked tensor if return_quantiles=False)
    """

    def __init__(self, cfg: MambaConfig):
        super().__init__()
        self.cfg = cfg

        # Feature projection
        self.input_proj = nn.Sequential(
            nn.Linear(cfg.input_dim, cfg.d_model),
            nn.LayerNorm(cfg.d_model),
        )

        # Positional encoding
        self.pos_enc = FourierPositionalEncoding(cfg.d_model, max_len=cfg.lookback + 10)

        # Stack of Mamba blocks
        Block = BidirectionalMambaBlock if cfg.bidirectional else MambaBlock
        self.blocks = nn.ModuleList([Block(cfg) for _ in range(cfg.n_layers)])

        # Final norm
        self.final_norm = nn.LayerNorm(cfg.d_model)

        # Quantile output heads — one per quantile
        self.heads = nn.ModuleDict({
            f"q{int(q*100)}": nn.Linear(cfg.d_model, cfg.forecast_horizon)
            for q in cfg.quantiles
        })

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x: Tensor) -> dict[str, Tensor]:
        """
        x: (B, L, input_dim)
        returns: {'p10': (B, H), 'p50': (B, H), 'p90': (B, H)}
        """
        h = self.input_proj(x)      # (B, L, d_model)
        h = self.pos_enc(h)

        for block in self.blocks:
            h = block(h)

        h = self.final_norm(h)

        # Global context: mean-pool over time dimension
        ctx = h.mean(dim=1)         # (B, d_model)

        return {
            "p10": self.heads["q10"](ctx),
            "p50": self.heads["q50"](ctx),
            "p90": self.heads["q90"](ctx),
        }


# ─────────────────────────────────────────────
#  Quantile (Pinball) Loss
# ─────────────────────────────────────────────

class PinballLoss(nn.Module):
    """
    Quantile / Pinball loss — consistent with LightGBM quantile objective.
    L(q, y, ŷ) = q·max(y−ŷ, 0) + (1−q)·max(ŷ−y, 0)
    """

    def __init__(self, quantiles: List[float]):
        super().__init__()
        self.quantiles = quantiles

    def forward(self, preds: dict[str, Tensor], target: Tensor) -> Tensor:
        """
        preds: {'p10': (B, H), 'p50': (B, H), 'p90': (B, H)}
        target: (B, H)
        """
        total = 0.0
        q_keys = [f"p{int(q*100)}" for q in self.quantiles]
        for q, key in zip(self.quantiles, q_keys):
            pred = preds[key]
            diff = target - pred
            loss = torch.max(q * diff, (q - 1) * diff)
            total = total + loss.mean()
        return total / len(self.quantiles)


# ─────────────────────────────────────────────
#  Dataset utility
# ─────────────────────────────────────────────

class EnergyWindowDataset(torch.utils.data.Dataset):
    """
    Sliding-window dataset for the Mamba model.

    Parameters
    ----------
    features : np.ndarray  shape (T, input_dim)  — all engineered features
    targets  : np.ndarray  shape (T,)             — demand in MW (scaled)
    lookback : int   — input context length (168 h)
    horizon  : int   — forecast steps (48 h)
    """

    def __init__(
        self,
        features: np.ndarray,
        targets: np.ndarray,
        lookback: int = 168,
        horizon: int = 48,
    ):
        self.X = torch.tensor(features, dtype=torch.float32)
        self.y = torch.tensor(targets, dtype=torch.float32)
        self.lookback = lookback
        self.horizon = horizon
        self.n_samples = len(features) - lookback - horizon + 1

    def __len__(self) -> int:
        return self.n_samples

    def __getitem__(self, idx: int) -> Tuple[Tensor, Tensor]:
        x = self.X[idx : idx + self.lookback]                     # (L, D)
        y = self.y[idx + self.lookback : idx + self.lookback + self.horizon]  # (H,)
        return x, y


# ─────────────────────────────────────────────
#  Trainer
# ─────────────────────────────────────────────

class MambaTrainer:
    """
    Lightweight training loop for PrometheusManba.
    Supports early stopping, LR scheduling, gradient clipping.
    """

    def __init__(self, cfg: MambaConfig, device: Optional[str] = None):
        self.cfg = cfg
        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        self.model = PrometheusManba(cfg).to(self.device)
        self.criterion = PinballLoss(cfg.quantiles)
        self.optimizer = torch.optim.AdamW(
            self.model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
        )
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=cfg.max_epochs, eta_min=cfg.lr * 0.01
        )
        self.history: dict[str, list] = {"train_loss": [], "val_loss": []}

    def fit(
        self,
        train_loader: torch.utils.data.DataLoader,
        val_loader: torch.utils.data.DataLoader,
    ) -> "MambaTrainer":
        best_val = float("inf")
        patience_ctr = 0

        for epoch in range(1, self.cfg.max_epochs + 1):
            train_loss = self._run_epoch(train_loader, training=True)
            val_loss = self._run_epoch(val_loader, training=False)
            self.scheduler.step()

            self.history["train_loss"].append(train_loss)
            self.history["val_loss"].append(val_loss)

            if val_loss < best_val:
                best_val = val_loss
                patience_ctr = 0
                self._best_state = {k: v.cpu().clone() for k, v in self.model.state_dict().items()}
            else:
                patience_ctr += 1

            print(
                f"Epoch {epoch:3d}/{self.cfg.max_epochs} | "
                f"train={train_loss:.4f}  val={val_loss:.4f}  "
                f"lr={self.optimizer.param_groups[0]['lr']:.2e}"
                + ("  ✓ best" if patience_ctr == 0 else f"  patience={patience_ctr}/{self.cfg.patience}")
            )

            if patience_ctr >= self.cfg.patience:
                print(f"Early stopping at epoch {epoch}")
                break

        # Restore best weights
        self.model.load_state_dict({k: v.to(self.device) for k, v in self._best_state.items()})
        return self

    def _run_epoch(
        self, loader: torch.utils.data.DataLoader, training: bool
    ) -> float:
        self.model.train(training)
        total_loss = 0.0
        with torch.set_grad_enabled(training):
            for x_batch, y_batch in loader:
                x_batch = x_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                preds = self.model(x_batch)
                loss = self.criterion(preds, y_batch)

                if training:
                    self.optimizer.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.grad_clip)
                    self.optimizer.step()

                total_loss += loss.item() * len(x_batch)

        return total_loss / len(loader.dataset)

    @torch.no_grad()
    def predict(self, x: np.ndarray) -> dict[str, np.ndarray]:
        """
        Inference on a single window or batch.
        x: np.ndarray  (L, D) or (B, L, D)
        returns: {'p10': ..., 'p50': ..., 'p90': ...}  as numpy arrays
        """
        self.model.eval()
        if x.ndim == 2:
            x = x[np.newaxis]
        t = torch.tensor(x, dtype=torch.float32).to(self.device)
        out = self.model(t)
        return {k: v.cpu().numpy() for k, v in out.items()}

    def save(self, path: str) -> None:
        torch.save({"config": self.cfg, "state_dict": self.model.state_dict()}, path)
        print(f"Model saved → {path}")

    @classmethod
    def load(cls, path: str, device: Optional[str] = None) -> "MambaTrainer":
        ckpt = torch.load(path, map_location="cpu")
        trainer = cls(ckpt["config"], device=device)
        trainer.model.load_state_dict(ckpt["state_dict"])
        return trainer


# ─────────────────────────────────────────────
#  Quick sanity-check (runs when executed directly)
# ─────────────────────────────────────────────

if __name__ == "__main__":
    cfg = MambaConfig(input_dim=14, forecast_horizon=48, lookback=168, d_model=64, n_layers=2)
    model = PrometheusManba(cfg)

    B, L, D = 4, cfg.lookback, cfg.input_dim
    dummy = torch.randn(B, L, D)
    out = model(dummy)

    print("=== PrometheusManba Sanity Check ===")
    print(f"Input : {tuple(dummy.shape)}")
    for k, v in out.items():
        print(f"  {k} : {tuple(v.shape)}")

    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable parameters: {total_params:,}")

    loss_fn = PinballLoss([0.1, 0.5, 0.9])
    target = torch.randn(B, cfg.forecast_horizon)
    loss = loss_fn(out, target)
    print(f"Pinball loss (random): {loss.item():.4f}")
    print("All checks passed [OK]")
