# Backend setup (one time, after the Supabase project exists)

1. Apply `schema.sql` (tables, row-level security, storage, realtime).
2. Server config: `cron_secret` is generated inside the database; `vapid_public` is stored in `server_config`; the PRIVATE VAPID key is set as the edge function secret `VAPID_PRIVATE_KEY` in the Supabase dashboard (value in `.secrets/vapid.json`, never committed).
3. Deploy `functions/send-due` with JWT verification OFF (it checks the cron secret itself).
4. Run `cron.sql.template` with the project ref filled in.
5. In `app/.env.local` set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (public key is in `app/.env.local.pending`).
6. Supabase dashboard > Authentication: decide whether email confirmation stays on (recommended).

7. Apply `migration_002_approval_linking.sql` (join approval, roles, linking accounts to family people).
