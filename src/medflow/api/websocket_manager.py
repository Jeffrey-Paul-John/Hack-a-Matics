"""WebSocket fan-out for the optional live dashboard channel."""
from fastapi import WebSocket
class ConnectionManager:
    """Maintains connected listeners without any simulation business logic."""
    def __init__(self): self.clients: list[WebSocket] = []
    async def connect(self, socket: WebSocket): await socket.accept(); self.clients.append(socket)
    def disconnect(self, socket: WebSocket):
        if socket in self.clients: self.clients.remove(socket)
    async def broadcast(self, state: dict):
        for client in self.clients[:]:
            try: await client.send_json(state)
            except Exception: self.disconnect(client)
