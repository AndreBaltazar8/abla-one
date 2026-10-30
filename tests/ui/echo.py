"""Echo server for the services UI test. /echo reports what it received:
method, selected headers, body size and a short digest; multipart bodies are
summarised per part. /big serves 3 MB of predictable bytes. With a second
argument, other GET paths serve files from that directory (the Wasm client
page and module), so the page and the echo share an origin."""
import hashlib, http.server, json, mimetypes, os, sys

STATIC = sys.argv[2] if len(sys.argv) > 2 else ''

BIG = bytes(i % 251 for i in range(3 * 1024 * 1024))

class Echo(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def body(self):
        if self.headers.get('Transfer-Encoding', '').lower() == 'chunked':
            data = b''
            while True:
                size = int(self.rfile.readline().strip(), 16)
                if size == 0:
                    self.rfile.readline()
                    return data
                data += self.rfile.read(size)
                self.rfile.readline()
        return self.rfile.read(int(self.headers.get('Content-Length', '0')))
    def reply(self, payload):
        data = json.dumps(payload, sort_keys=True).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('X-Echo', 'yes')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def echo(self):
        data = self.body()
        kind = self.headers.get('Content-Type', '')
        out = {'m': self.command, 'len': len(data), 'sha': hashlib.sha256(data).hexdigest()[:10], 'x': self.headers.get('X-Abla', ''), 'type': kind.split(';')[0]}
        if kind.startswith('multipart/form-data'):
            boundary = kind.split('boundary=')[1].encode()
            parts = []
            for chunk in data.split(b'--' + boundary)[1:-1]:
                head, _, content = chunk.strip(b'\r\n').partition(b'\r\n\r\n')
                name = head.split(b'name="')[1].split(b'"')[0].decode()
                parts.append(f'{name}:{len(content)}')
            out['parts'] = parts
        elif len(data) <= 64:
            out['body'] = data.decode(errors='replace')
        self.reply(out)
    do_POST = do_PUT = do_PATCH = echo
    def do_GET(self):
        if self.path == '/big':
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Length', str(len(BIG)))
            self.end_headers()
            self.wfile.write(BIG)
        elif STATIC and not self.path.startswith('/echo'):
            path = os.path.join(STATIC, self.path.split('?')[0].lstrip('/'))
            if not os.path.isfile(path):
                self.send_error(404)
                return
            data = open(path, 'rb').read()
            self.send_response(200)
            kind = 'application/wasm' if path.endswith('.wasm') else (mimetypes.guess_type(path)[0] or 'application/octet-stream')
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else: self.echo()

http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Echo).serve_forever()
