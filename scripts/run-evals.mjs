// Runs the same small prompt set through the real pipeline and records whether each result keeps
// the idea, passes validation, plays correctly and responds fast enough for the demo.
//
//   npm run eval                       default model, real provider
//   npm run eval -- --model claude-sonnet-5-5
//   npm run eval -- --fixture          exercises this script only; proves nothing about a model
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { clarifyIdea, generateGame, reviseGame } from "../src/lib/pipeline/pipeline.js";
import { PROMPT_VERSIONS } from "../src/lib/pipeline/prompts.js";
import { checkClaude, createClaudeProvider, DEFAULT_MODEL } from "../src/lib/pipeline/provider-claude.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";
import { simulate, templateInfo } from "../src/lib/templates/index.js";

// The demo budget: type an idea, and be playing inside this many seconds.
const BUDGET_MS = { intent: 8000, generate: 30000, revise: 30000 };

const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : DEFAULT_MODEL;

// A fixture run needs no credentials, so it never opens them.
if (!useFixture) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const check = await checkClaude(model);
  if (!check.ok) {
    console.error(`Cannot reach ${model}: ${check.reason}\nAdd ANTHROPIC_API_KEY to .env.local, or run with --fixture to test this script.`);
    process.exit(2);
  }
}
const provider = useFixture ? createFixtureProvider() : createClaudeProvider({ model });

function keepsIdea(spec, expect) {
  const misses = [];
  if (expect.templates && !expect.templates.includes(spec.template)) misses.push(`template is ${spec.template}`);
  if (expect.world && spec.skin.world !== expect.world) misses.push(`world is ${spec.skin.world}`);
  if (expect.style && spec.skin.style !== expect.style) misses.push(`style is ${spec.skin.style}`);
  return misses;
}

// The same 90 seconds the validator proves a game with, for each kind of simulated player.
function plays(spec) {
  const template = templateInfo(spec.template);
  const score = (skill) => simulate(template, spec, { skill, maxMs: 90000 }).score;
  return { quickScore: score("quick"), casualScore: score("casual") };
}

const cases = JSON.parse(await readFile("evals/cases.json", "utf8"));
const specs = {};
const rows = [];

async function timed(work) {
  const startedAt = Date.now();
  try {
    return { value: await work(), ms: Date.now() - startedAt };
  } catch (error) {
    return { error: error.message, ms: Date.now() - startedAt };
  }
}

for (const item of cases.filter((entry) => entry.kind !== "revision")) {
  const row = { id: item.id, kind: item.kind };
  const reading = await timed(() => clarifyIdea({ idea: item.idea }, provider));
  row.intentMs = reading.ms;

  if (reading.error) {
    rows.push({ ...row, pass: false, notes: reading.error });
    continue;
  }
  row.status = reading.value.status;
  const statusOk = row.status === item.expect.status;
  const notes = statusOk ? [] : [`status ${row.status}, wanted ${item.expect.status}`];

  let reply = reading.value;
  let clarification;
  if (item.expect.status === "clarify" && statusOk) {
    row.question = reading.value.question;
    clarification = item.answer;
    const second = await timed(() => clarifyIdea({ idea: item.idea, clarification }, provider));
    if (second.error) notes.push(second.error);
    else {
      reply = second.value;
      if (reply.status !== item.expect.afterAnswer) notes.push(`after answer: ${reply.status}`);
    }
  }
  if (reply.status === "unsupported") row.closest = reply.unsupported.closest;

  const built = await timed(() => generateGame({ idea: item.idea, clarification, brief: reply.brief }, provider));
  row.generateMs = built.ms;
  if (built.error || !built.value.ok) {
    notes.push(built.error ?? `invalid after repair: ${built.value.errors[0]}`);
    rows.push({ ...row, pass: false, valid: false, notes: notes.join("; ") });
    continue;
  }

  const { spec, attempts, firstErrors } = built.value;
  specs[item.id] = spec;
  row.valid = true;
  row.attempts = attempts;
  row.firstErrors = firstErrors.slice(0, 3);
  row.title = spec.title;
  Object.assign(row, plays(spec));
  notes.push(...keepsIdea(spec, item.expect));
  if (row.quickScore <= 0) notes.push("a quick player cannot score");
  if (row.intentMs > BUDGET_MS.intent) notes.push("intent over budget");
  if (row.generateMs > BUDGET_MS.generate) notes.push("generate over budget");
  rows.push({ ...row, pass: notes.length === 0, notes: notes.join("; ") });
}

for (const item of cases.filter((entry) => entry.kind === "revision")) {
  const row = { id: item.id, kind: item.kind };
  const base = specs[item.base];
  if (!base) {
    rows.push({ ...row, pass: false, notes: `base case ${item.base} failed` });
    continue;
  }
  const revised = await timed(() => reviseGame({ spec: base, request: item.request }, provider));
  row.generateMs = revised.ms;
  if (revised.error || !revised.value.ok) {
    rows.push({ ...row, pass: false, valid: false, notes: revised.error ?? revised.value.errors[0] });
    continue;
  }
  const { spec, attempts, changeSummary, comparison } = revised.value;
  const { metric, orMetric, direction, minChange } = item.expect;
  const before = base.tuning;
  const after = spec.tuning;
  const moved = (key) => (direction === "up" ? after[key] >= before[key] * minChange : before[key] >= after[key] * minChange);
  const notes = keepsIdea(spec, item.expect);
  if (metric && !moved(metric) && !(orMetric && moved(orMetric))) notes.push(`${metric} ${before[metric]} -> ${after[metric]}`);
  if (item.expect.lookChanged && !comparison.lookChanged) notes.push("look did not change");
  if (row.generateMs > BUDGET_MS.revise) notes.push("revise over budget");
  const measured = comparison.changes.map((change) => `${change.key} ${change.before} -> ${change.after}`).join(", ");
  Object.assign(row, { valid: true, attempts, changeSummary, measured, casualBefore: plays(base).casualScore, ...plays(spec) });
  if (row.quickScore <= 0) notes.push("a quick player cannot score");
  rows.push({ ...row, pass: notes.length === 0, notes: notes.join("; ") });
}

const report = {
  source: provider.source,
  model: provider.model,
  promptVersions: PROMPT_VERSIONS,
  budgetMs: BUDGET_MS,
  ranAt: new Date().toISOString(),
  passed: rows.filter((row) => row.pass).length,
  total: rows.length,
  rows,
};

await mkdir("evals/results", { recursive: true });
const name = `evals/results/${report.ranAt.slice(0, 10)}-${provider.model}.json`;
await writeFile(name, JSON.stringify(report, null, 2));

console.log(`\n${provider.source === "fixture" ? "FIXTURE RUN: proves the script works, says nothing about a model\n" : ""}${provider.model}: ${report.passed}/${report.total} passed\n`);
for (const row of rows) {
  const speed = [row.intentMs, row.generateMs].filter((ms) => ms !== undefined).map((ms) => `${(ms / 1000).toFixed(1)}s`).join(" + ");
  console.log(`${row.pass ? "pass" : "FAIL"}  ${row.id.padEnd(24)} ${speed.padEnd(14)} ${row.notes || row.title || row.changeSummary || ""}`);
}
console.log(`\nSaved ${name}`);
