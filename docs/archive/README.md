# Archive — superseded documents

These described the system at a point in time and no longer match it. They are
kept for history. **Do not rely on anything here.**

| file | last meaningful update | superseded by |
|---|---|---|
| `SPEC.md` | 02.2026 | `SYSTEM_OVERVIEW.md` |
| `PREVIEW.md` | 02.2026 | — feature shipped |
| `CHAT_HISTORY.md` | 02.2026 | — working notes |
| `SESSION_SUMMARY.md` | 08.2026 | `AUDIT-2026-09-18.md` |
| `DESIGN_PROMPT.md` | 08.2026 | — duplicate pair |
| `CLAUDE_DESIGN_PROMPT.md` | 08.2026 | — duplicate pair |
| `NOTIFICATIONS_AUDIT_COMPLETE.md` | 09.2026 | `NOTIFICATIONS_ROUTING.md` |
| `NOTIFICATION_REFACTOR_REPORT.md` | 09.2026 | `NOTIFICATIONS_ROUTING.md` |

## The current documents

| file | what it covers |
|---|---|
| `CLAUDE.md` | development guide, schema, standing rules |
| `SYSTEM_OVERVIEW.md` | full system reference, including known technical debt |
| `BUSINESS_PROCESS.md` | the business process |
| `NOTIFICATIONS_ROUTING.md` | notification routing and past incidents |
| `AUDIT-2026-09-18.md` | the September 2026 audit |
| `DEPLOYMENT_CHECKLIST.md` | pre-deployment checks |
| `SUPABASE_MIGRATION_GUIDE.md` | a possible future region move (not in progress) |

## Why these were moved

Twenty markdown files sat in the repo root, several describing a system that no
longer existed — and nothing marked which were still true.

**Stale documentation is more dangerous than none**, because people read it and
believe it. This was not theoretical here: the `push-to-prod` skill instructed
pushing to a remote that deploys nothing, and following it cost eight days of
undeployed work while production ran old code against a migrated database.

Nothing was deleted; full history remains in git.
