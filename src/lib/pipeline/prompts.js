// Prompts live in /prompts as plain files so they can be edited without touching code.
// To try a new version, add a file and change its number here.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GAME_SPEC_SCHEMA, STYLES, WORLDS, contractText } from "../spec/contract.js";
import { AVOID_WORDS, FOCUS_WORDS } from "../templates/focus.js";
import { TEMPLATES } from "../templates/index.js";

export const PROMPT_VERSIONS = { intent: "v3", generate: "v3", revise: "v2" };

export async function loadPrompt(stage, versions = PROMPT_VERSIONS) {
  const file = path.join(process.cwd(), "prompts", `${stage}.${versions[stage]}.md`);
  const template = await readFile(file, "utf8");
  return template.replace("{{contract}}", contractText());
}

const text = { type: "string" };
const oneOf = (items) => ({ type: "string", enum: items.map((item) => item.id) });
const words = (items) => ({ type: "array", items: { type: "string", enum: items } });
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const INTENT_SCHEMA = object({
  status: { type: "string", enum: ["ready", "clarify", "unsupported"] },
  brief: object({ template: oneOf(TEMPLATES), world: oneOf(WORLDS), style: oneOf(STYLES), goal: text }),
  // What the creator wants to work and to leave out, so code can check the template against it.
  body: object({ focus: words(FOCUS_WORDS), avoid: words(AVOID_WORDS) }),
  question: text,
  options: { type: "array", items: text },
  unsupported: object({ requested: text, closest: text }),
});

export const REVISION_SCHEMA = object({
  changeKind: { type: "string", enum: ["gameplay", "look", "both"] },
  changeSummary: text,
  spec: GAME_SPEC_SCHEMA,
});
