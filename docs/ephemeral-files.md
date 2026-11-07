# Opt-in ephemeral file flow

`OneServices.pickEphemeralFile(mime, maximumBytes, lifetimeMilliseconds)` selects
one file without using the ordinary recovery picker/blob/inbox path. The default
implementation returns `0`, so adapters lacking this transport fail closed.
Ordinary `pickFiles`, file recovery and durable effects are unchanged.

The live web adapter keeps its chooser, pending authorization and file bytes in
bounded node memory. The chooser has a fresh nonce and owner epoch; inspection
receives authorization metadata with an empty body and no original filename.
Asynchronous inspection keeps the HTTP request pending in memory. It does not
submit the file to the recovery adapter. A crash loses the operation. Web reads
and deletes of its opaque handles also bypass durable file callbacks.

Limits are 16 MiB per file, one active chooser/file per session, 15 minutes
absolute lifetime and 64 MiB across pending private uploads. Applications can
request smaller limits. The server enforces bounds before accepting the file.
The opt-in Wasm transport is not implemented: it returns `0` rather than falling
back to ordinary uploads. Android uses existing process-local ContentResolver
handles, with no copy of the selected original document; applications enforce
their size/read budgets and clear the handle after use.

Read with `readFile` and release with `deleteFile` as usual. Use
`cancelEphemeralFiles()` on Back, logout, scope change or abandonment. Track a
private parse request with `trackEphemeralRequest(id)` immediately after sending
it; its pending request/completion then shares the volatile flow lifetime.
Cancellation discards tracked unsent requests and late replies. Web expiry also
delivers `receive("ephemeral-expired", "")` so the app can erase its own parsed
values even while normal recovery is unavailable. Native apps must enforce their
own absolute lifetime and visibility/scope handling. Late picker completions
must have their handles released after a cancelled app flow.

This transport does not make app-owned values private automatically. Keep file
bytes and parsed rows out of the app recovery codec and secure storage. Private
row text must not appear in event names or event-bearing control labels, which
form part of checkpoint event maps. Noninteractive text can sit beside controls
whose labels and semantic names are opaque. Verify the entire real checkpoint
and adapter calls, including cancellation, pending inspection and restore.

No ephemeral content is restored after checkpoint hydration. Existing ordinary
picker/file metadata is restored through its original mechanism. Releasing an
Android picked URI handle never deletes the user's original file.

The live web flow also discards on its owner socket disconnect and browser
pagehide/visibility loss. The expected OS chooser handoff is exempt until that
chooser closes. An interrupted upload is refused rather than recovered on a
different node; the application asks the person to choose the file again.

Validation on the NovaKind 299 backport lineage, released compiler 0.2.48:
`make test test-remote` passed all 45 default suites and the complete remote
contract/canonical/indexed-generation checks. The separate actual-browser
fixture `tests/ui/web_ephemeral.mjs` passed 12 checks against a real disk-backed
synthetic recovery store: held asynchronous inspection, upload/read, entire
store scans, cancellation, expiry, browser reload and process loss/resume.
The fixture is built from `tests/ui/ephemeral_live.ab`. Android app lifecycle
acceptance remains the consuming application's responsibility.
