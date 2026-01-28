-- Migration 001: add new columns to existing users table
-- (Used when upgrading from the original schema that only had id, email, username, password_hash, created_at)
-- db.js runs these conditionally; safe to run manually only on DBs that don't have the columns yet.

ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

-- Backfill updated_at for existing rows (run after adding the column)
UPDATE users SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;
