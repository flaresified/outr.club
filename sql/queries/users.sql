-- User queries (used by db.js prepared statements)

-- Get user by id
-- SELECT * FROM users WHERE id = ?;

-- Get user by email (case-insensitive)
-- SELECT * FROM users WHERE email = ? COLLATE NOCASE;

-- Get user by username (case-insensitive)
-- SELECT * FROM users WHERE username = ? COLLATE NOCASE;

-- Get user with profile (JOIN)
SELECT
  u.id, u.email, u.username, u.email_verified, u.is_active,
  u.created_at, u.updated_at, u.last_login_at,
  up.bio, up.avatar_url, up.display_name, up.location, up.website
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE u.id = ?;

-- Create user
-- INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?);

-- Update last login
-- UPDATE users SET last_login_at = datetime('now') WHERE id = ?;
