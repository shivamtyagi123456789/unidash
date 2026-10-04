import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "**.authorization",
      "**.cookie",
      "**.set-cookie",
      "**.password",
      "**.token",
      "**.secret",
      "**.session",
      "**.sesskey",
      "**.email",
      "**.phone",
      "**.messageBody",
    ],
    censor: "[REDACTED]",
  },
});
