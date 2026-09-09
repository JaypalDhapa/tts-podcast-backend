import mongoose from "mongoose";
import dns from "node:dns";
import { env } from "../config/env";

// Force reliable DNS resolvers (fixes intermittent/blocked SRV lookups
// with some ISPs, VPNs, and Windows network configs).
dns.setServers(["8.8.8.8", "1.1.1.1"]);

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) return;

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(env.MONGODB_URI);
    isConnected = true;
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB Atlas:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB connection lost");
    isConnected = false;
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  isConnected = false;
}