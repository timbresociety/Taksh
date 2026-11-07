// Prompts live in /prompts as plain files so they can be edited without touching code.
// To try a new version, add a file and change its number here.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GAME_SPEC_SCHEMA, STYLES, WORLDS, contractText } from "../spec/contract.js";
import { TEMPLATES } from "../templates/index.js";

export const PROMPT_VERSIONS = { intent: "v2", generate: "v2", revise: "v2", level: "v1" };

export async function loadPrompt(stage, versions = PROMPT_VERSIONS) {
  const file = path.join(process.cwd(), "prompts", `${stage}.${versions[stage]}.md`);
  const template = await readFile(file, "utf8");
  return template.replace("{{contract}}", contractText());
}

const text = { type: "string" };
const oneOf = (items) => ({ type: "string", enum: items.map((item) => item.id) });
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const INTENT_SCHEMA = object({
  status: { type: "string", enum: ["ready", "clarify", "unsupported"] },
  brief: object({ template: oneOf(TEMPLATES), world: oneOf(WORLDS), style: oneOf(STYLES), goal: text }),
  question: text,
  options: { type: "array", items: text },
  unsupported: object({ requested: text, closest: text }),
});

export const REVISION_SCHEMA = object({
  changeKind: { type: "string", enum: ["gameplay", "look", "both"] },
  changeSummary: text,
  spec: GAME_SPEC_SCHEMA,
});

// The next level: the same game with new tuning, and a reason per changed field.
export const LEVEL_SCHEMA = object({
  headline: text,
  tuning: { type: "array", items: object({ key: text, value: { type: "number" } }) },
  changes: { type: "array", items: object({ key: text, why: text }) },
});
