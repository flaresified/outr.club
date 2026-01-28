import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || "outr-club-dev-secret",
  discordWebhookUrl:
    process.env.DISCORD_WEBHOOK_URL ||
    "https://discord.com/api/webhooks/1465894946321203440/GMDZy3Gyn8AkTOJoYUVe5WS5UB9THDAI2r4oOI5gy766ZncfOrt1SlmLHFSZRpXNkNMl",
  rateLimit: {
    maxMessagesPerMinute: 45,
    timeoutMinutes: 3,
  },
};
