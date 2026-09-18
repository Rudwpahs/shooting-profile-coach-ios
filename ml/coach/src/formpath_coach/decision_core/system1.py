from __future__ import annotations

import torch
from torch import nn
from torch.nn import functional as F

from formpath_coach.decision_core.motion_features import FEATURE_DIM_V1
from formpath_coach.decision_core.schemas import DECISION_LABELS_V1


class _CausalConvBlock(nn.Module):
    def __init__(self, channels: int, kernel_size: int) -> None:
        super().__init__()
        if kernel_size <= 0:
            raise ValueError("kernel_size must be positive")
        self.kernel_size = kernel_size
        self.conv = nn.Conv1d(channels, channels, kernel_size=kernel_size)
        self.norm = nn.GroupNorm(1, channels)
        self.activation = nn.GELU()

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        padded = F.pad(inputs, (self.kernel_size - 1, 0))
        hidden = self.conv(padded)
        hidden = self.norm(hidden)
        return self.activation(hidden)


class System1BaselineV1(nn.Module):
    """Small temporal baseline that shares one encoder across all decision heads."""

    def __init__(self, hidden_dim: int = 64) -> None:
        super().__init__()
        if hidden_dim <= 0:
            raise ValueError("hidden_dim must be positive")

        self.input_norm = nn.LayerNorm(FEATURE_DIM_V1)
        self.input_projection = nn.Linear(FEATURE_DIM_V1, hidden_dim)
        self.temporal = nn.Sequential(
            _CausalConvBlock(hidden_dim, kernel_size=5),
            _CausalConvBlock(hidden_dim, kernel_size=3),
        )
        self.heads = nn.ModuleDict(
            {
                head: nn.Linear(hidden_dim, len(labels))
                for head, labels in DECISION_LABELS_V1.items()
            }
        )

    def forward(self, features: torch.Tensor) -> dict[str, torch.Tensor]:
        if features.ndim != 3:
            raise ValueError("features must have shape [batch, time, feature]")
        if features.shape[-1] != FEATURE_DIM_V1:
            raise ValueError(f"features must have width {FEATURE_DIM_V1}")
        if features.shape[1] <= 0:
            raise ValueError("features must contain at least one timestep")
        if not torch.isfinite(features).all():
            raise ValueError("features must be finite")

        hidden = self.input_projection(self.input_norm(features))
        hidden = hidden.transpose(1, 2)
        hidden = self.temporal(hidden)
        pooled = hidden.mean(dim=-1)
        return {head: layer(pooled) for head, layer in self.heads.items()}
