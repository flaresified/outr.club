-- Audit log queries

-- Insert audit log
-- INSERT INTO audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES (?, ?, ?, ?, ?);

-- Get audit logs by user (paginated)
-- SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?;

-- Get recent audit logs (with user info)
SELECT al.*, u.username, u.email
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC
LIMIT ?;
