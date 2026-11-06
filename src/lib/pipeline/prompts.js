// Prompts live in /prompts as plain files so they can be edited without touching code.
// To try a new version, add a file and change its number here.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GAME_SPEC_SCHEMA, contractText } from "../spec/contract.js";

export const PROMPT_VERSIONS = { intent: "v1", generate: "v1", revise: "v1" };

export async function loadPrompt(stage, versions = PROMPT_VERSIONS) {
  const file = path.join(process.cwd(), "prompts", `${stage}.${versions[stage]}.md`);
  const template = await readFile(file, "utf8");
  return template.replace("{{contract}}", contractText());
}

const text = { type: "string" };
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const INTENT_SCHEMA = object({
  status: { type: "string", enum: ["ready", "clarify", "unsupported"] },
  brief: object({ artStyle: text, coreAction: text, goal: text, feedback: text }),
  question: text,
  options: { type: "array", items: text },
  unsupported: object({ requested: text, closest: text }),
});

export const REVISION_SCHEMA = object({
  changeKind: { type: "string", enum: ["gameplay", "look", "both"] },
  changeSummary: text,
  spec: GAME_SPEC_SCHEMA,
});
