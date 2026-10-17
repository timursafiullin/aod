---
name: aod-implementer
description: Rules for an implementer working on one AOD task packet (T-xxxx) in a worktree slot. Use whenever the prompt is an AOD brief (<task>T-xxxx ...</task>) or you are asked to implement or revise an AOD task.
---

# AOD implementer

You implement exactly one task. The architect owns contracts, acceptance tests and decisions; you own the code
and unit tests inside the packet's `scope`.

1. Read the packet named in the brief (`.agents/tasks/T-xxxx.md`) first; it is authoritative. Then read what its
   `read_first`, `contracts` and `spec` point to. Do not paste or rewrite them.
2. Change only paths matching `scope`. Never touch `schemas/**`, `tests/acceptance/**`, `.agents/**` or anything
   in `forbidden`.
3. Stop rule: if a test, contract or requirement looks wrong or contradictory, stop with status `blocked` and ask
   exactly one precise question. Never change, skip, special-case or weaken a test or tolerance, and never write
   code that detects a test run.
4. Do not run git commands that change state (add, commit, push, reset, rebase, clean, switch, branch). Leave your
   changes in the working tree; AOD commits them after you finish.
5. Work in small steps and run tests as you go. Before answering, run every acceptance command from the packet.
6. Answer only with the JSON report the output schema requires. `summary` (at most 600 characters) describes
   the change, not the git state. `checks` lists every command you ran with its real exit code. Declare anything
   you did differently from the packet in `deviations`, and anything uncertain in `risks`.
7. English only. No new dependencies. No links to AI sessions.
