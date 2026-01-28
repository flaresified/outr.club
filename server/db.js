import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const dataDir = join(projectRoot, "data");
const sqlDir = join(projectRoot, "sql");

mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "outr.db");

const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// Migration helper: check if table exists
function tableExists(tableName) {
  try {
    const result = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
    `).get(tableName);
    return !!result;
  } catch {
    return false;
  }
}

// Migration helper: check if column exists
function columnExists(tableName, columnName) {
  try {
    const info = db.pragma(`table_info(${tableName})`);
    return info.some(col => col.name === columnName);
  } catch {
    return false;
  }
}

// Migration: upgrade existing users table (logic matches sql/migrations/001_add_users_columns.sql)
function migrateUsersTable() {
  if (!tableExists("users")) {
    return;
  }
  if (!columnExists("users", "email_verified")) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`);
  }
  if (!columnExists("users", "is_active")) {
    db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
  }
  if (!columnExists("users", "last_login_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT`);
  }
  if (!columnExists("users", "updated_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN updated_at TEXT`);
    db.exec(`UPDATE users SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL`);
  }
}

migrateUsersTable();

// Load and run schema from sql/schema.sql
const schemaPath = join(sqlDir, "schema.sql");
db.exec(readFileSync(schemaPath, "utf8"));

// Load and run view from sql/views/user_stats.sql
const viewPath = join(sqlDir, "views", "user_stats.sql");
db.exec(readFileSync(viewPath, "utf8"));

// Prepared statements for common queries (pre-compiled for performance)
const preparedStatements = {
  // User queries
  getUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE"),
  getUserByUsername: db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE"),
  getUserWithProfile: db.prepare(`
    SELECT 
      u.id, u.email, u.username, u.email_verified, u.is_active,
      u.created_at, u.updated_at, u.last_login_at,
      up.bio, up.avatar_url, up.display_name, up.location, up.website
    FROM users u
    LEFT JOIN user_profiles up ON u.id = up.user_id
    WHERE u.id = ?
  `),
  createUser: db.prepare(`
    INSERT INTO users (email, username, password_hash) 
    VALUES (?, ?, ?)
  `),
  updateUserLastLogin: db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?"),
  updateUserActive: db.prepare("UPDATE users SET is_active = ? WHERE id = ?"),

  // Profile queries
  getProfile: db.prepare("SELECT * FROM user_profiles WHERE user_id = ?"),
  upsertProfile: db.prepare(`
    INSERT INTO user_profiles (user_id, bio, avatar_url, display_name, location, website)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      bio = excluded.bio,
      avatar_url = excluded.avatar_url,
      display_name = excluded.display_name,
      location = excluded.location,
      website = excluded.website,
      updated_at = datetime('now')
  `),

  // Session queries
  createSession: db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getSession: db.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"),
  updateSessionActivity: db.prepare("UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE id = ?"),
  deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  cleanupExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),

  // Audit log queries
  createAuditLog: db.prepare(`
    INSERT INTO audit_logs (user_id, action, ip_address, user_agent, metadata)
    VALUES (?, ?, ?, ?, ?)
  `),
  getAuditLogsByUser: db.prepare(`
    SELECT * FROM audit_logs 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `),
  getRecentAuditLogs: db.prepare(`
    SELECT al.*, u.username, u.email
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT ?
  `),
};

// Transaction helpers
export const transaction = (callback) => {
  const trx = db.transaction(callback);
  return trx;
};

// Query helpers
export const dbHelpers = {
  // User operations
  findUserById: (id) => preparedStatements.getUserById.get(id),
  findUserByEmail: (email) => preparedStatements.getUserByEmail.get(email.toLowerCase()),
  findUserByUsername: (username) => preparedStatements.getUserByUsername.get(username),
  findUserWithProfile: (id) => preparedStatements.getUserWithProfile.get(id),
  
  createUser: (email, username, passwordHash) => {
    const result = preparedStatements.createUser.run(
      email.toLowerCase(),
      username,
      passwordHash
    );
    return preparedStatements.getUserById.get(result.lastInsertRowid);
  },

  updateLastLogin: (userId) => {
    preparedStatements.updateUserLastLogin.run(userId);
  },

  // Profile operations
  getProfile: (userId) => preparedStatements.getProfile.get(userId),
  
  upsertProfile: (userId, profile) => {
    preparedStatements.upsertProfile.run(
      userId,
      profile.bio || null,
      profile.avatar_url || null,
      profile.display_name || null,
      profile.location || null,
      profile.website || null
    );
    return preparedStatements.getProfile.get(userId);
  },

  // Session operations
  createSession: (sessionId, userId, tokenHash, ip, userAgent, expiresAt) => {
    preparedStatements.createSession.run(
      sessionId,
      userId,
      tokenHash,
      ip,
      userAgent,
      expiresAt
    );
  },

  getSession: (sessionId) => preparedStatements.getSession.get(sessionId),
  
  updateSessionActivity: (sessionId) => {
    preparedStatements.updateSessionActivity.run(sessionId);
  },

  deleteSession: (sessionId) => {
    preparedStatements.deleteSession.run(sessionId);
  },

  deleteUserSessions: (userId) => {
    preparedStatements.deleteUserSessions.run(userId);
  },

  // Audit log operations
  logAction: (userId, action, ip, userAgent, metadata = null) => {
    preparedStatements.createAuditLog.run(
      userId,
      action,
      ip,
      userAgent,
      metadata ? JSON.stringify(metadata) : null
    );
  },

  getAuditLogs: (userId, limit = 50, offset = 0) => {
    return preparedStatements.getAuditLogsByUser.all(userId, limit, offset);
  },

  getRecentLogs: (limit = 100) => {
    return preparedStatements.getRecentAuditLogs.all(limit);
  },

  // Cleanup operations
  cleanupExpiredSessions: () => {
    return preparedStatements.cleanupExpiredSessions.run();
  },
};

// Run cleanup on startup
dbHelpers.cleanupExpiredSessions();

export default db;
export { preparedStatements };
