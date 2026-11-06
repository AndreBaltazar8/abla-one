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

## Bugs seen

- [x] Server/lock scaling (NovaKind523): official048 default44 plus auxiliary and complete remote checks passed, including exact legacy/indexed generation parity, 1280 records below16M and four512-field DTOs below8M. All18 measured record/order cases retained exact bytes. At1280 records writer26.96M→10.86M and imported generator23.99M→9.29M; field512 writer10.68M→5.92M. Small-input overhead remains explicit; normal50M unchanged. Historical717/042 failure attribution stays qualified.

- [ ] Audit the live `.file()` MIME contract: OneRequest.file documents using OneFile.mime unless a Content-Type header is already set, but its builder retains only the handle and oneLiveExecute reads bytes without restoring the MIME. Add an actual handler-header control for default MIME and an explicit override before fixing across backends. No MIME behavior change is included in451.

## ablac bugs seen (worked around, not confirmed fixed)

- ablac0.2.35 rejects the function-valued class default `val participates: (HttpRequest)->bool = oneRecoveryAllPages()` with repeated `constructor.argument:OneLiveRecoveryStore`; requiring and passing the policy explicitly compiles. Original case is in commit7f51fb3, fixed at the call sites in9358303.

- A `when` over an f32 gives `when.match` for literal cases (documented).
- A class's methods are all compiled, used or not, so what only one method reaches stays in every program that has the class (why `Style.wrap` is an extension). 0.2.29.

## Font regeneration

- [ ] An Abla tool for fonts, if they ever need regenerating. The previous generator is in git history at `f43b77f`; see `docs/fonts.md` for its inputs and outputs.
