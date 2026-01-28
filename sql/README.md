# SQL files

Schema and migrations live here. The server loads these on startup.

| Path | Purpose |
|------|---------|
| **schema.sql** | Tables, indexes, triggers. Run on fresh DB or when adding new objects. |
| **views/user_stats.sql** | View for per-user stats (sessions, login count, etc.). Run after schema. |
| **migrations/001_add_users_columns.sql** | Adds `email_verified`, `is_active`, `last_login_at`, `updated_at` to `users`. Applied conditionally by `server/db.js` when upgrading from the original schema. |
| **queries/users.sql** | Reference for user-related queries (used by prepared statements in `db.js`). |
| **queries/audit_logs.sql** | Reference for audit-log queries. |

To inspect or run manually (e.g. with `sqlite3 data/outr.db`):

```bash
sqlite3 data/outr.db < sql/schema.sql
sqlite3 data/outr.db < sql/views/user_stats.sql
```

Migrations are applied by the app using the logic in `server/db.js`; the `.sql` files in `migrations/` document and mirror that logic.
