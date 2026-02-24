"""ICT Trading Dashboard — FastAPI application."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import POLL_INTERVAL
from data_feed import DataFeed
from ict_engine import ICTEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Support PyInstaller frozen bundle
import sys
if getattr(sys, "frozen", False):
    BASE = Path(sys._MEIPASS)
else:
    BASE = Path(__file__).parent
feed = DataFeed()
engine = ICTEngine()
clients: set[WebSocket] = set()


# ── background broadcaster ───────────────────────────────────────────
async def broadcast_loop():
    """Poll data and push to all connected WebSocket clients."""
    while True:
        try:
            data = await asyncio.to_thread(feed.fetch_all)
            metrics = engine.compute(data)
            payload = json.dumps(metrics)

            dead: set[WebSocket] = set()
            for ws in clients:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.add(ws)
            clients.difference_update(dead)

            logger.info(
                "Broadcast to %d client(s)  NQ=%s  ES=%s",
                len(clients),
                metrics["tickers"].get("NQ=F", {}).get("price"),
                metrics["tickers"].get("ES=F", {}).get("price"),
            )
        except Exception:
            logger.exception("Error in broadcast loop")

        await asyncio.sleep(POLL_INTERVAL)


# ── lifespan ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(broadcast_loop())
    logger.info("Dashboard running at http://localhost:8000")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="ICT Dashboard", lifespan=lifespan)


# ── routes ───────────────────────────────────────────────────────────
@app.get("/")
async def index():
    return FileResponse(BASE / "static" / "index.html")


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    logger.info("Client connected  (%d total)", len(clients))
    try:
        # Send initial data immediately
        try:
            data = await asyncio.to_thread(feed.fetch_all)
            metrics = engine.compute(data)
            await websocket.send_text(json.dumps(metrics))
        except Exception:
            logger.exception("Error sending initial data")

        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(websocket)
        logger.info("Client disconnected  (%d total)", len(clients))


# ── main ─────────────────────────────────────────────────────────────
def _start_server():
    """Run uvicorn in a background thread."""
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


def _wait_for_server(url="http://127.0.0.1:8000", timeout=30):
    """Block until the server responds or timeout."""
    import time
    import urllib.request
    import urllib.error

    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.5)
    return False


if __name__ == "__main__":
    import threading

    # Start FastAPI server in a daemon thread
    server_thread = threading.Thread(target=_start_server, daemon=True)
    server_thread.start()

    # Wait until server is actually responding
    _wait_for_server()

    # Open native desktop window
    import webview  # pywebview
    webview.create_window(
        "ICT Dashboard \u2014 NQ & ES",
        "http://127.0.0.1:8000",
        width=1400,
        height=900,
        min_size=(900, 600),
    )
    webview.start()  # blocks until window is closed
