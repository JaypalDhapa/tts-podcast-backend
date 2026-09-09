import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Run with: npm run hash-password
 * Paste the output into APP_USER_PASSWORD_HASH in your .env file.
 */
async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const password = await rl.question("Choose a password for your app login: ");
  rl.close();

  if (!password.trim()) {
    console.error("Password cannot be empty.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  console.log("\nAdd this to your .env file:\n");
  console.log(`APP_USER_PASSWORD_HASH=${hash}\n`);
}

main();
