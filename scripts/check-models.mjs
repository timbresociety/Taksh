// Lists the Claude models this project's own configuration can reach.
// Credentials come only from the environment or .env.local; only model IDs are printed.
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

try {
  const client = new Anthropic();
  const ids = [];
  for await (const model of client.models.list()) ids.push(model.id);
  console.log(`reachable models (${ids.length}):`);
  for (const id of ids) console.log(`  ${id}`);
} catch (error) {
  console.log(`no model access: ${error.constructor.name}: ${error.message.split("\n")[0]}`);
  process.exitCode = 2;
}
