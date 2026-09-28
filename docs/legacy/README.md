# Legacy — historical only, nothing here runs

Files in this folder are kept for history. **Nothing here is executed, applied,
or referenced by the application.** Do not edit anything here expecting an
effect.

## `db-migrations-pre-supabase-cli/`

The original SQL migrations (001–049), from before this project moved to the
Supabase CLI. They were tracked in a `public.schema_migrations` table that is
also no longer used.

**The live migrations are `supabase/migrations/`**, applied with:

```bash
npx supabase db push --linked
```

### Why this was moved

Both directories existed side by side with near-identical contents, and the dead
one was the easier of the two to stumble into. During the September 2026 audit a
search for storage policies returned a match in
`src/db/migrations/017_soft_delete_and_painter.sql` — a dead file — and nearly
produced a wrong conclusion about what production was enforcing.

Two directories of migrations, one of which silently does nothing, is a trap for
whoever looks next. Moving it under `docs/legacy/` makes the status obvious from
the path alone.

Nothing was deleted; full history remains in git.
