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

## ablac bugs seen (worked around, not confirmed fixed)

- ablac0.2.35 rejects the function-valued class default `val participates: (HttpRequest)->bool = oneRecoveryAllPages()` with repeated `constructor.argument:OneLiveRecoveryStore`; requiring and passing the policy explicitly compiles. Original case is in commit7f51fb3, fixed at the call sites in9358303.

- A `when` over an f32 gives `when.match` for literal cases (documented).
- A class's methods are all compiled, used or not, so what only one method reaches stays in every program that has the class (why `Style.wrap` is an extension). 0.2.29.

## Font regeneration

- [ ] An Abla tool for fonts, if they ever need regenerating. The previous generator is in git history at `f43b77f`; see `docs/fonts.md` for its inputs and outputs.
