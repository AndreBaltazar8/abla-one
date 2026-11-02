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

## ablac bugs seen (worked around, not confirmed fixed)

- A `when` over an f32 gives `when.match` for literal cases (documented).
- A class's methods are all compiled, used or not, so what only one method reaches stays in every program that has the class (why `Style.wrap` is an extension). 0.2.29.

## Tests

- The UI suites and `tests/remote` use fixed ports, so simultaneous runs in two checkouts can fail each other. `tests/integration/live_sockets.ab` now chooses a port from a range, but can still collide (exit 101, "it has the port", seen 2026-11-02); make concurrent runs independent.

## Tools in Python

- [ ] `tools/fonts.py` uses Python and FontTools to regenerate the Inter font assets and data.
