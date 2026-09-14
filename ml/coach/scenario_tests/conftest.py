"""Focused tests may not use the network or fetch weights."""

import os
import socket

import pytest

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    original = socket.socket.connect

    def loopback_only(sock, address):
        # Windows asyncio creates its wakeup pipe through a loopback socketpair.
        if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
            return original(sock, address)
        raise AssertionError("B2-C tests must remain offline")

    def refuse(*args, **kwargs):
        raise AssertionError("B2-C tests must remain offline")

    monkeypatch.setattr(socket.socket, "connect", loopback_only)
    monkeypatch.setattr(socket, "create_connection", refuse)
