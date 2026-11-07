# Direct uploads

For files too large to pass through the app, the bytes go from where the file is
straight to storage URLs the app signs (an S3 multipart upload, say). The app sees
only the file's name and size and the parts' ETags.

- `pickDirectFile(mime, maximumBytes)` opens the chooser. It completes with
  `response.files()`: one file whose handle starts with `direct-`, its name, size
  and type, nothing read; empty if cancelled. A file over `maximumBytes` fails in
  the page ("File exceeds the upload limit") before anything is sent.
- `uploadDirectParts(file, firstPart, partBytes, urls)` sends parts `firstPart`,
  `firstPart + 1`, ... to `urls`, in order: part n is the bytes from
  `(n - 1) * partBytes` up to `n * partBytes`. At most 100 URLs a call, each
  `https://` (or `http://127.0.0.1:`/`http://localhost:` for tests). It completes
  with `{"parts":[{"part":n,"etag":"..."}]}` or a 502 naming the failure. The
  page tries each part up to three times, two at a time.
- `releaseDirectFile(file)` forgets it.

On the live web the page keeps the `File`: nothing goes into recovery
checkpoints, effects or the file store, and a reload, or a session restored on
another node, loses it (the answer to a request the server is no longer waiting
on is dropped). Storage must allow `PUT` from the app's origin and expose `ETag`
(CORS). Adapters without it (Wasm, the desktop, PaperMono, tests) return 0, and
the app keeps its ordinary path. On Android a direct pick is an ordinary document
pick (the caller checks its size against the limit) and abla-mobile's `FILEPUT`
streams the parts from the phone; it needs an abla-mobile host that has it.

`tests/backends/web_direct.ab` checks the relay and its bounds;
`tests/ui/web_direct.mjs` (in `make ui-web-live`) sends a file's parts from a
real browser to a local storage stand-in.
