import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { podcastRouter } from "./routes/podcast.routes";
import { voiceRouter } from "./routes/voice.routes";
import { providerRouter, providerCredentialRouter } from "./routes/provider.routes";
import { settingsRouter } from "./routes/settings.routes";
import { blockRouter } from "./routes/block.routes";
import { generationRouter } from "./routes/generation.routes";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Public
  app.use("/api/auth", authRouter);

  // Everything else requires a valid session — this is a private,
  // single-user app with no public routes beyond login.
  app.use("/api/podcasts", requireAuth, podcastRouter);
  app.use("/api/voices", requireAuth, voiceRouter);
  app.use("/api", requireAuth, providerRouter);
  app.use("/api/provider-credentials", requireAuth, providerCredentialRouter);
  app.use("/api/settings", requireAuth, settingsRouter);
  app.use("/api/blocks", requireAuth, blockRouter);
  app.use("/api/generations", requireAuth, generationRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
