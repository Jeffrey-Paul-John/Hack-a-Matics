"""WebSocket fan-out for the live dashboard channel with session isolation support."""
from __future__ import annotations
from collections import defaultdict
from fastapi import WebSocket


class ConnectionManager:
    """Maintains connected listeners with optional per-session targeting."""

    def __init__(self):
        self.clients: list[WebSocket] = []
        self.session_clients: dict[str, list[WebSocket]] = defaultdict(list)
        self.client_sessions: dict[WebSocket, str] = {}

    async def connect(self, socket: WebSocket, session_id: str = "default"):
        await socket.accept()
        self.clients.append(socket)
        self.session_clients[session_id].append(socket)
        self.client_sessions[socket] = session_id

    def disconnect(self, socket: WebSocket):
        if socket in self.clients:
            self.clients.remove(socket)
        session_id = self.client_sessions.pop(socket, None)
        if session_id and socket in self.session_clients.get(session_id, []):
            self.session_clients[session_id].remove(socket)

    async def broadcast(self, state: dict, session_id: str | None = None):
        """Broadcast state either to subscribers of a specific session or to all active clients."""
        target_clients = self.session_clients.get(session_id, []) if session_id else self.clients
        for client in target_clients[:]:
            try:
                await client.send_json(state)
            except Exception:
                self.disconnect(client)
