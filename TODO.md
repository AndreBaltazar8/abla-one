# TODO

## Rules

- All open work on Abla One is tracked here. Add new tasks as they come up.
- Each big item gets at least one commit of its own, and can take several.
- This file can be committed at any time, along with the work or on its own.
- As soon as a task is completed, take it off this file, in the commit that
  finishes it. Git history is the record of what got done.
- Any bug or error seen goes here right away, even if it looks minor or unrelated, with what
  was seen and how to reproduce it. Don't only mention it in a report.
- Only list what is really open. A task is done when it is verified where it
  runs (on the device for device work), not just when it compiles.

PaperMono is parked (owner, 2026-11-02): its tasks are in `TODO_PARKED.md`, not to be touched for now.

## Web session recovery



- [ ] Support raw `OneRequest.file`/multipart file handles in recovery mode with bounded shared-store chunk materialization and a durable acknowledgement barrier, without serializing raw HTTP requests. Until then recovery sessions return501 for these paths; applications must call `readFile` and send the resulting bytes. NovaKind has no raw bodyFile/multipart callers (lead-approved deferral, 2026-11-03).

## Bugs seen

- [ ] Finish451 ownership/nullable corrections: first unpublished prototype compile stopped with171 semantic errors, second with161 (no parser/IR errors). The documented alias rules require mutations through an owned field path, not a local nullable alias; pending storage now uses a single-element owner array and fresh request records. Corrected compile is queued before runtime/publish claims. Evidence /tmp/abla-one-recovery-multipart-evidence/check.log.

- [ ] Finish verification of multipart metadata fixes: unchanged071 protocol3 checks/2 failures confirms unescaped quotes and CRLF filename corruption; boundary override assertion already passes old code (header dedup is cleanup, not a reproduced override failure). Current branch rejects control bytes/escapes quoted parameters; positive control queued. A picked newline corrupts a part header, not the outer HTTP request headers.

- [ ] Audit the live `.file()` MIME contract: OneRequest.file documents using OneFile.mime unless a Content-Type header is already set, but its builder retains only the handle and oneLiveExecute reads bytes without restoring the MIME. Add an actual handler-header control for default MIME and an explicit override before fixing across backends. No MIME behavior change is included in451.

## Remote contract lock

- [ ] Make server.lock declaration order canonical (sorted). NovaKind make app and runner builds currently order new routes differently on the same source; owner46 recorded it in NovaKind16109b9e. Assigned36 after451. Preserve parameter/field order and wire signatures; prove old build-path divergence and sorted equality, publish One and bump the NovaKind pin with focused/full checks.

## ablac bugs seen (worked around, not confirmed fixed)

- ablac0.2.35 rejects the function-valued class default `val participates: (HttpRequest)->bool = oneRecoveryAllPages()` with repeated `constructor.argument:OneLiveRecoveryStore`; requiring and passing the policy explicitly compiles. Original case is in commit7f51fb3, fixed at the call sites in9358303.

- A `when` over an f32 gives `when.match` for literal cases (documented).
- A class's methods are all compiled, used or not, so what only one method reaches stays in every program that has the class (why `Style.wrap` is an extension). 0.2.29.

## Font regeneration

- [ ] An Abla tool for fonts, if they ever need regenerating. The previous generator is in git history at `f43b77f`; see `docs/fonts.md` for its inputs and outputs.
