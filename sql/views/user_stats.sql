-- View: user_stats
-- Pre-aggregated stats per user (active sessions, login count, etc.).
-- Dropped and recreated by db.js after migrations so it always matches the users schema.

DROP VIEW IF EXISTS user_stats;

CREATE VIEW user_stats AS
SELECT
  u.id,
  u.username,
  u.email,
  u.email_verified,
  u.is_active,
  u.created_at,
  u.last_login_at,
  COUNT(DISTINCT s.id) AS active_sessions,
  COUNT(DISTINCT CASE WHEN al.action = 'login' THEN al.id END) AS login_count,
  MAX(CASE WHEN al.action = 'login' THEN al.created_at END) AS last_login_log
FROM users u
LEFT JOIN sessions s ON s.user_id = u.id AND s.expires_at > datetime('now')
LEFT JOIN audit_logs al ON al.user_id = u.id AND al.action = 'login'
GROUP BY u.id;
