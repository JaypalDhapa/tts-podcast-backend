import { env } from "./config/env";
import { connectDatabase } from "./db/connection";
import { createApp } from "./app";

async function main() {
  await connectDatabase();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`🎙️  Podcast Studio API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
