
Authenticated Android exports use the app's ordinary `OneRequest` with its
`Authorization` header and `.saveToFile()`. After a successful response with
`hasFile()`, call `oneSaveFile(services, response.file, filename, mime)` or
`oneShareFile(...)`. The system prompts for a save destination or a receiving
app. These effects carry only an opaque process-local file handle and a display
name/MIME; they never hand the HTTP URL or credentials to another app. Keep the
handle alive until the `fileExport` event reports `saved`, `shared`, `cancelled`
or `failed`, together with the opaque `handle`; then `deleteFile` can remove the original HTTP cache entry. A
`shared` event means a chooser was launched, not that the recipient read it.
Only Android implements these effects; unsupported backends return `false`.
Web applications can use authenticated same-origin download links.

The services demo and Android regression use a loopback-only fixture via an
individually removed adb reverse mapping. Its `/big` download requires a synthetic
Authorization header. The test-only APK explicitly permits cleartext HTTP; this
does not change the default for applications built with Abla Mobile.
