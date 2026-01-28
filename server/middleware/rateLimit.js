import { config } from "../config.js";

const maxPerMinute = config.rateLimit?.maxMessagesPerMinute ?? 45;
const timeoutSeconds = (config.rateLimit?.timeoutMinutes ?? 3) * 60;
const windowMs = 60_000; // 1 minute

const store = new Map(); // key -> { count, windowStart, blockedUntil }

function getKey(req) {
  const id = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  return id;
}

function cleanup() {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (data.blockedUntil && data.blockedUntil < now) store.delete(key);
    if (!data.blockedUntil && data.windowStart && now - data.windowStart > windowMs * 2) store.delete(key);
  }
}
setInterval(cleanup, 60_000);

/**
 * 45 messages in 1 minute = 3 minute timeout (per IP).
 * Prevents abuse and keeps Discord webhook under rate limits.
 */
export function rateLimit(req, res, next) {
  const key = getKey(req);
  const now = Date.now();

  let data = store.get(key);
  if (!data) {
    data = { count: 0, windowStart: now, blockedUntil: null };
    store.set(key, data);
  }

  if (data.blockedUntil && data.blockedUntil > now) {
    const retryAfter = Math.ceil((data.blockedUntil - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Too many requests",
      retryAfterSeconds: retryAfter,
      message: "45 requests per minute allowed. Try again later.",
    });
  }

  if (data.blockedUntil && data.blockedUntil <= now) {
    data.blockedUntil = null;
    data.count = 0;
    data.windowStart = now;
  }

  if (now - data.windowStart > windowMs) {
    data.windowStart = now;
    data.count = 0;
  }

  data.count += 1;

  if (data.count >= maxPerMinute) {
    data.blockedUntil = now + timeoutSeconds * 1000;
    res.set("Retry-After", String(timeoutSeconds));
    return res.status(429).json({
      error: "Too many requests",
      retryAfterSeconds: timeoutSeconds,
      message: `${maxPerMinute} requests per minute exceeded. Timeout ${config.rateLimit?.timeoutMinutes ?? 3} minutes.`,
    });
  }

  next();
}
