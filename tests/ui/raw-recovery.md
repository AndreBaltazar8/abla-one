# Raw file recovery

`make test-recovery` runs the existing shared-store browser matrix and the raw
file matrix. `make test-recovery-raw` runs only the latter; its slow-read case
waits for the real sixty-second deadline. Both compile the same local fixture.
Override `ABLAC` to select a released compiler.

The raw proof uses two independent processes and a private synthetic store. It
kills an owner halfway through a16MiB assembly and again after a business effect
but before acknowledgement. It checks exact binary bytes, one fenced effect,
original operation replay, no reload, consumption-only CAS/frontier behavior,
ordinary inbox isolation, duplicate/out-of-order completions, independent
multipart parsing, refusal limits, busy409, and result-CAS-before-file effects.
The business fixture owns its atomic fence/idempotency; the SDK preserves its
operation identity. No generic HTTP command is persisted in checkpoints.

Large synthetic chunk payloads live in separate private files rather than the
frequently parsed session metadata row. This models individual production inbox
rows and avoids quadratic base64 reparsing. Completed inbox IDs remain until the
checkpoint CAS consumes them. No real database, object store or credentials are
used by this SDK matrix.

`tests/backends/recovery_raw.ab` checks bounds, strict completion envelopes,
immutable request metadata, ID namespaces, deadline/reservation cleanup and
barriers. `multipart_protocol.ab` checks HTML quote encoding and control-byte
refusal. Native job entropy stays in web_live.ab; shared session codecs must also
compile for the Wasm client. Run `make test ui-web-live ui-web-client` when
changing the shared session/backend boundary.
