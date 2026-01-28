import { config } from "../config.js";

const maxPerMinute = config.rateLimit?.maxMessagesPerMinute ?? 45;
const timeoutMs = (config.rateLimit?.timeoutMinutes ?? 3) * 60 * 1000;
const windowMs = 60_000;

let webhookCount = 0;
let windowStart = Date.now();
let cooldownUntil = 0;

/**
 * Log signup or login events to the outr.club Discord webhook.
 * Throttled to 45 sends per minute, then 3 min cooldown, so Discord doesn't rate-limit us.
 */
export async function logToDiscord({ type, email, username, ip, userAgent }) {
  const url = config.discordWebhookUrl;
  if (!url) return;

  const now = Date.now();
  if (cooldownUntil > now) return; // in cooldown, skip this webhook
  if (now - windowStart > windowMs) {
    windowStart = now;
    webhookCount = 0;
  }
  if (webhookCount >= maxPerMinute) {
    cooldownUntil = now + timeoutMs;
    return; // over limit, skip and start cooldown
  }
  webhookCount += 1;

  const isSignup = type === "signup";
  const title = isSignup ? "New signup" : "Login";
  const color = isSignup ? 0x00ff00 : 0x0099ff; // green / blue

  const body = JSON.stringify({
    embeds: [
      {
        title: `outr.club — ${title}`,
        color,
        fields: [
          { name: "Type", value: type, inline: true },
          { name: "Username", value: username ?? "—", inline: true },
          { name: "Email", value: email ?? "—", inline: true },
          { name: "IP", value: ip ?? "—", inline: true },
          { name: "User-Agent", value: (userAgent || "—").slice(0, 1024), inline: false },
          { name: "Time", value: new Date().toISOString(), inline: false },
        ],
        footer: { text: "outr.club" },
      },
    ],
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      console.warn("[discord] webhook failed:", res.status, await res.text());
    }
  } catch (err) {
    console.warn("[discord] webhook error:", err.message);
  }
}
