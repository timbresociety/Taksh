// Builds what the model reads for a request: the shared rules, the kind's skill and the live catalogue.
// Skills live in /skills as plain Markdown, so they can be edited without touching code.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { KINDS, triageCatalogueText } from "./kinds.js";

const tag = (name, value) => `<${name}>\n${value}\n</${name}>`;
const withoutFrontMatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n+/, "");

async function skillFile(...parts) {
  return withoutFrontMatter(await readFile(path.join(process.cwd(), "skills", ...parts), "utf8"));
}

export async function triagePrompt() {
  const shared = await skillFile("shared.md");
  return [
    "You read a player's request for Taksh and decide which kind of thing they are asking for:",
    "- world: a place to play in",
    "- style: how the whole game looks (an art style)",
    "- character: who the player plays as, or their rival",
    "- boss: an enemy or boss to fight",
    "- game: a new way to play that is not one of the games below",
    "If the request fits two kinds, pick the one the player cares about most. If they name a kind, use it unless it is clearly wrong.",
    "Decline only what the rules below do not allow, and then offer an alternative in reason. Otherwise go, and restate the request in brief, making anything copied from an existing work original.",
    shared,
    `## What exists today\n\n${triageCatalogueText()}`,
  ].join("\n\n");
}

export async function draftPrompt(kind) {
  const [shared, skill] = await Promise.all([skillFile("shared.md"), skillFile(kind, "SKILL.md")]);
  return [shared, skill, `## Catalogue\n\n${KINDS[kind].catalogue()}`].join("\n\n");
}

export function triageMessage({ text, kind }) {
  return [kind ? tag("kind_chosen_by_player", kind) : null, tag("request", text)].filter(Boolean).join("\n\n");
}

export function draftMessage({ text, brief }) {
  return [tag("request", text), tag("brief", brief)].join("\n\n");
}

export function repairMessage(original, output, problems) {
  return [
    original,
    tag("previous_output", JSON.stringify(output)),
    tag("problems", problems.map((problem) => `- ${problem}`).join("\n")),
    "Your previous answer failed these checks. Return a corrected answer that fixes every problem and still answers the request.",
  ].join("\n\n");
}
