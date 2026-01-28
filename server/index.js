import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "./config.js";
import db from "./db.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import { dbHelpers } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicDir = join(projectRoot, "public");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

function sendPage(name) {
  return (_, res) => res.sendFile(join(publicDir, name));
}
app.get("/", (_, res) => res.redirect(302, "/app"));
app.get("/signup", sendPage("signup.html"));
app.get("/login", sendPage("login.html"));
app.get("/app", sendPage("app.html"));

app.use(express.static(publicDir));

app.get("/health", (_, res) => {
  res.json({ ok: true, service: "outr.club" });
});

app.use("/api/auth", authRoutes);

app.get("/api/me", requireAuth, (req, res) => {
  const user = dbHelpers.findUserWithProfile(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ 
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      email_verified: user.email_verified,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
      profile: {
        bio: user.bio,
        avatar_url: user.avatar_url,
        display_name: user.display_name,
        location: user.location,
        website: user.website,
      }
    }
  });
});

app.get("/api/profile", requireAuth, (req, res) => {
  const profile = dbHelpers.getProfile(req.user.userId);
  res.json({ profile: profile || {} });
});

app.put("/api/profile", requireAuth, (req, res) => {
  try {
    const { bio, avatar_url, display_name, location, website } = req.body;
    const profile = dbHelpers.upsertProfile(req.user.userId, {
      bio,
      avatar_url,
      display_name,
      location,
      website,
    });
    
    dbHelpers.logAction(
      req.user.userId,
      "profile_update",
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown",
      req.headers["user-agent"] || "",
      { fields: Object.keys(req.body) }
    );
    
    res.json({ profile });
  } catch (err) {
    console.error("[api] profile update error:", err);
    res.status(500).json({ error: "Profile update failed" });
  }
});

const server = app.listen(config.port, () => {
  console.log(`outr.club API listening on http://localhost:${config.port}`);
});

process.on("SIGINT", () => {
  db.close();
  server.close();
  process.exit(0);
});
