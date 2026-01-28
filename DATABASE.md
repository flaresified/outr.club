# Advanced SQL Database Architecture

## Overview

The outr.club backend now uses advanced SQL features including:
- **Normalized schema** with foreign keys and constraints
- **Prepared statements** for optimized query performance
- **Transactions** for atomic operations
- **Triggers** for automatic timestamp updates
- **Views** for common query patterns
- **Comprehensive indexing** strategy
- **Audit logging** for security and compliance

## Schema Structure

### Tables

#### `users`
- Core user authentication data
- Email and username are case-insensitive (COLLATE NOCASE)
- Includes `email_verified`, `is_active` flags
- Automatic `updated_at` via trigger

#### `user_profiles`
- Normalized profile data (bio, avatar, display name, etc.)
- Foreign key to `users` with CASCADE delete
- Separate table for better performance and flexibility

#### `sessions`
- Tracks active user sessions
- Stores token hashes (SHA-256) for security
- Automatic expiration handling
- Indexed for fast lookups

#### `audit_logs`
- Complete audit trail of user actions
- Tracks: signup, login, login_failed, logout, password_change, email_change, profile_update
- Includes IP, user agent, and optional JSON metadata
- Foreign key with SET NULL on user delete (preserves logs)

### Advanced Features

#### Foreign Keys
- Enabled with `PRAGMA foreign_keys = ON`
- Ensures referential integrity
- CASCADE deletes for related data

#### WAL Mode
- Write-Ahead Logging for better concurrency
- Multiple readers don't block writers
- Better performance under load

#### Triggers
- `update_users_timestamp`: Auto-updates `updated_at` on user changes
- `update_profiles_timestamp`: Auto-updates profile timestamps

#### Views
- `user_stats`: Pre-aggregated user statistics
  - Active session count
  - Login count
  - Last login timestamp
  - Optimized for dashboard queries

#### Indexes
- **Primary keys**: Auto-indexed
- **Unique constraints**: Auto-indexed (email, username)
- **Partial indexes**: For `email_verified` and `is_active` (only index active rows)
- **Foreign key indexes**: On `sessions.user_id`, `audit_logs.user_id`
- **Query optimization**: Indexes on `sessions.expires_at`, `audit_logs.created_at DESC`

## Prepared Statements

All common queries use pre-compiled prepared statements for:
- **Performance**: Compiled once, executed many times
- **Security**: Parameterized queries prevent SQL injection
- **Consistency**: Centralized query logic

### Available Statements

- `getUserById`, `getUserByEmail`, `getUserByUsername`
- `getUserWithProfile` (JOIN query)
- `createUser`, `updateUserLastLogin`
- `getProfile`, `upsertProfile` (INSERT ... ON CONFLICT)
- `createSession`, `getSession`, `updateSessionActivity`
- `createAuditLog`, `getAuditLogsByUser`, `getRecentAuditLogs`

## Transaction Support

Use `transaction()` helper for atomic operations:

```javascript
import { transaction } from './db.js';

const result = transaction(() => {
  // Multiple operations that must succeed or fail together
  const user = dbHelpers.createUser(...);
  dbHelpers.logAction(user.id, 'signup', ...);
  return user;
})();
```

## Database Helpers

The `dbHelpers` object provides high-level functions:

### User Operations
- `findUserById(id)`
- `findUserByEmail(email)` - case-insensitive
- `findUserByUsername(username)` - case-insensitive
- `findUserWithProfile(id)` - includes profile data
- `createUser(email, username, passwordHash)`
- `updateLastLogin(userId)`

### Profile Operations
- `getProfile(userId)`
- `upsertProfile(userId, profile)` - creates or updates

### Session Operations
- `createSession(sessionId, userId, tokenHash, ip, userAgent, expiresAt)`
- `getSession(sessionId)`
- `updateSessionActivity(sessionId)`
- `deleteSession(sessionId)`
- `deleteUserSessions(userId)` - logout all sessions

### Audit Logging
- `logAction(userId, action, ip, userAgent, metadata)`
- `getAuditLogs(userId, limit, offset)`
- `getRecentLogs(limit)` - system-wide recent logs

## API Endpoints

### Enhanced `/api/me`
Returns user data with profile information:
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "user",
    "email_verified": 0,
    "is_active": 1,
    "created_at": "2026-01-28 12:00:00",
    "updated_at": "2026-01-28 12:00:00",
    "last_login_at": "2026-01-28 12:00:00",
    "profile": {
      "bio": "...",
      "avatar_url": "...",
      "display_name": "...",
      "location": "...",
      "website": "..."
    }
  }
}
```

### `/api/profile` (GET)
Get current user's profile

### `/api/profile` (PUT)
Update profile:
```json
{
  "bio": "My bio",
  "avatar_url": "https://...",
  "display_name": "Display Name",
  "location": "City, Country",
  "website": "https://..."
}
```

### `/api/auth/logout` (POST)
Logs out and deletes session, creates audit log entry

## Performance Optimizations

1. **Prepared Statements**: All queries pre-compiled
2. **Strategic Indexing**: Partial indexes, covering indexes where beneficial
3. **WAL Mode**: Better concurrency
4. **View for Stats**: Pre-aggregated common queries
5. **Transaction Batching**: Multiple operations in single transaction
6. **Case-Insensitive Collation**: Efficient email/username lookups

## Security Features

1. **Password Hashing**: bcrypt with salt rounds
2. **Token Hashing**: SHA-256 for session tokens
3. **Audit Logging**: Complete action history
4. **Failed Login Tracking**: Logs failed attempts
5. **Session Management**: Tracks and expires sessions
6. **SQL Injection Prevention**: Parameterized queries only

## Maintenance

### Cleanup Operations
- Expired sessions are cleaned up on server startup
- Use `dbHelpers.cleanupExpiredSessions()` for manual cleanup

### Migration Notes
- Existing `users` table will be upgraded automatically
- New tables (`user_profiles`, `sessions`, `audit_logs`) created on first run
- No data loss - existing users remain intact
