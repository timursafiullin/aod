# .agents — project memory

| Folder | Holds | Changes when |
| --- | --- | --- |
| `context/` | Vision, invariants, architecture, glossary | Architecture evolves (via ADR) |
| `rules/` | Code style, testing, review checklist | A rule is added or clarified |
| `decisions/` | ADR-xxxx and `index.md` | A significant decision is made |
| `specs/` | Feature specs `S-xxxx` before implementation | A feature is planned |
| `tasks/` | Packets `T-xxxx.md`, reports, `index.json` (source of truth), generated `index.md` | Work is delegated |
| `plans/` | `roadmap.md`, milestone plans, backlog | Planning changes |
| `journal/` | One entry per session: `YYYY-MM-DD-<slug>.md` | Every session |

Precedence on conflict: accepted ADR > `context/invariants.md` > other `context/` > `rules/` > specs > tasks.
Report a contradiction instead of choosing silently.
