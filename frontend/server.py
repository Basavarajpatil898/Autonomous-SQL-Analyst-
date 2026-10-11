from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent
    handler = lambda *args, **kwargs: SimpleHTTPRequestHandler(*args, directory=str(root), **kwargs)
    server = ThreadingHTTPServer(("0.0.0.0", 5500), handler)
    print("Frontend available at http://127.0.0.1:5500")
    server.serve_forever()


if __name__ == "__main__":
    main()

