import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { dbHelpers, transaction } from "../db.js";
import { config } from "../config.js";
import { logToDiscord } from "../services/discord.js";

const router = Router();

function getIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

function getUserAgent(req) {
  return req.headers["user-agent"] || "";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/signup", async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({
        error: "Missing fields",
        required: ["email", "username", "password"],
      });
    }

    const emailStr = String(email).trim().toLowerCase();
    const usernameStr = String(username).trim();

    if (usernameStr.length < 2) {
      return res.status(400).json({ error: "Username must be at least 2 characters" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check for existing user using optimized query
    const existing = dbHelpers.findUserByEmail(emailStr) || dbHelpers.findUserByUsername(usernameStr);
    if (existing) {
      return res.status(409).json({ error: "Email or username already in use" });
    }

    // Use transaction for atomic user creation + audit log
    const password_hash = await bcrypt.hash(password, 10);
    const user = transaction(() => {
      const newUser = dbHelpers.createUser(emailStr, usernameStr, password_hash);
      
      // Create audit log entry
      dbHelpers.logAction(
        newUser.id,
        "signup",
        getIp(req),
        getUserAgent(req),
        { username: usernameStr }
      );

      return newUser;
    })();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Create session (optional - for session management)
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    dbHelpers.createSession(
      sessionId,
      user.id,
      hashToken(token),
      getIp(req),
      getUserAgent(req),
      expiresAt
    );

    // Discord webhook (non-blocking)
    logToDiscord({
      type: "signup",
      email: user.email,
      username: user.username,
      ip: getIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {}); // Don't fail signup if Discord fails

    res.status(201).json({
      message: "Account created",
      user: { 
        id: user.id, 
        email: user.email, 
        username: user.username, 
        created_at: user.created_at 
      },
      token,
    });
  } catch (err) {
    console.error("[auth] signup error:", err);
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Email or username already in use" });
    }
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const emailStr = String(email).trim().toLowerCase();
    const user = dbHelpers.findUserByEmail(emailStr);

    if (!user) {
      // Log failed login attempt
      dbHelpers.logAction(
        null,
        "login_failed",
        getIp(req),
        getUserAgent(req),
        { email: emailStr, reason: "user_not_found" }
      );
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.is_active === 0) {
      dbHelpers.logAction(
        user.id,
        "login_failed",
        getIp(req),
        getUserAgent(req),
        { reason: "account_inactive" }
      );
      return res.status(403).json({ error: "Account is inactive" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      // Log failed login attempt
      dbHelpers.logAction(
        user.id,
        "login_failed",
        getIp(req),
        getUserAgent(req),
        { reason: "invalid_password" }
      );
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login and create session in transaction
    transaction(() => {
      dbHelpers.updateLastLogin(user.id);
      
      // Create audit log
      dbHelpers.logAction(
        user.id,
        "login",
        getIp(req),
        getUserAgent(req)
      );
    })();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    dbHelpers.createSession(
      sessionId,
      user.id,
      hashToken(token),
      getIp(req),
      getUserAgent(req),
      expiresAt
    );

    // Discord webhook (non-blocking)
    logToDiscord({
      type: "login",
      email: user.email,
      username: user.username,
      ip: getIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {}); // Don't fail login if Discord fails

    res.json({
      message: "Logged in",
      user: { id: user.id, email: user.email, username: user.username },
      token,
    });
  } catch (err) {
    console.error("[auth] login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret);
        const sessionId = crypto.createHash("sha256").update(token).digest("hex");
        
        // Delete session and log logout
        transaction(() => {
          dbHelpers.deleteSession(sessionId);
          dbHelpers.logAction(
            payload.userId,
            "logout",
            getIp(req),
            getUserAgent(req)
          );
        })();
      } catch {
        // Invalid token, ignore
      }
    }

    res.json({ message: "Logged out" });
  } catch (err) {
    console.error("[auth] logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
});

export default router;
