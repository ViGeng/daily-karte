from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    directory = Path(__file__).resolve().parents[1] / "dist"
    handler = partial(PreviewHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 4173), handler)
    print("Local preview is running at http://127.0.0.1:4173", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
