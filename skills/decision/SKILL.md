---
name: decision
description: Ask the product owner (the user) for a decision in the AOD format - one line of what, short context, options with trade-offs, a recommendation, and what happens without an answer - then record the answer. Use when a choice is genuinely the user's (product, cost, licence, public commitments, equal architectural options, round-3 review disputes).
---

# Decision request to the product owner

The user's time is the scarcest resource. Ask only what cannot be derived from the vision, invariants and
accepted ADRs; decide everything else yourself and record it.

Write the request exactly in this shape (in the user's language; keep it short):

```text
Decision needed on: <task/feature, one line>
Context: <2-3 sentences: what is known, why it matters now>
Options:
  A. <option> - pros / cons / cost
  B. <option> - pros / cons / cost
Recommendation: <A|B> because <reason>
Without an answer: <I continue with the recommendation | work on <branch/task> waits>
```

Rules:
- At most one decision per request; two or three options, never a menu of everything.
- For a review dispute after round 3: name the task, what the implementer and the reviewer disagree on, and the
  evidence (failing command, diff lines).
- If the answer can wait, say so and keep working on something else.
- Record the answer the moment it arrives: an ADR (`/aod:adr`) for architectural or product decisions, the packet
  for task-level answers (then `aod revise T-xxxx --findings <file> --answer` if an implementer is blocked), and
  a line in the journal's Decisions or Open questions section.
