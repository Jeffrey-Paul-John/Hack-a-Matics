import pytest
from fastapi import WebSocketDisconnect
from medflow.api.main import live, sockets

@pytest.mark.anyio
async def test_websocket_disconnect_handled_gracefully():
    class MockSocket:
        async def accept(self):
            pass
        async def receive_text(self):
            raise WebSocketDisconnect(1005, None)

    mock_sock = MockSocket()
    await live(mock_sock)
    assert mock_sock not in sockets.clients
