// The idea-to-game pipeline. Each stage asks a provider for structured data, then validates it in
// code. A provider is anything with complete(); see provider-claude.js and provider-fixture.js.
import { compareSpecs } from "../spec/compare.js";
import { validateSpec } from "../spec/validate.js";
import { GAME_SPEC_SCHEMA } from "../spec/contract.js";
import { TEMPLATES, templateInfo } from "../templates/index.js";
import { INTENT_SCHEMA, LEVEL_SCHEMA, PROMPT_VERSIONS, REVISION_SCHEMA, loadPrompt } from "./prompts.js";
import { brainFor, cleanObservation } from "../agent/rival.js";

const tag = (name, value) => `<${name}>\n${value}\n</${name}>`;

// A saved spec keeps tuning as an object, but a model reads and writes the { key, value } list.
const forModel = (spec) => ({ ...spec, tuning: Object.entries(spec.tuning).map(([key, value]) => ({ key, value })) });

// traces are the 0G receipts (request ID, provider, cost) for each model call. Other providers have none.
function meta(provider, startedAt, attempts, replies = []) {
  const traces = replies.map((reply) => reply?.trace).filter(Boolean);
  return {
    source: provider.source,
    model: provider.model,
    ...(provider.payer && { payer: provider.payer }),
    ms: Date.now() - startedAt,
    attempts,
    promptVersions: PROMPT_VERSIONS,
    ...(traces.length && { trustMode: provider.trustMode, traces }),
  };
}

export async function clarifyIdea({ idea, clarification }, provider) {
  const startedAt = Date.now();
  const system = await loadPrompt("intent");
  const parts = [tag("idea", idea)];
  if (clarification) parts.push(tag("clarification_answer", clarification));

  const reply = await provider.complete({
    stage: "intent",
    system,
    user: parts.join("\n\n"),
    schema: INTENT_SCHEMA,
    input: { idea, clarification },
  });
  const { data } = reply;

  // One question at most, whatever the model decides.
  const status = data.status === "clarify" && clarification ? "ready" : data.status;
  // The closest game has to be one we can really build, whatever the model named.
  const template = templateInfo(data.brief?.template) ?? TEMPLATES[0];
  const result = { status, brief: { ...data.brief, template: template.id }, ...meta(provider, startedAt, 1, [reply]) };
  if (status === "clarify") {
    result.question = data.question;
    result.options = data.options.slice(0, 4);
  }
  if (status === "unsupported") {
    result.unsupported = { ...data.unsupported, closest: data.unsupported.closest || `${template.name}: ${template.pitch}` };
    result.message = `We're still working on complex interactions like ${data.unsupported.requested}. Here's the closest game you can play today.`;
  }
  return result;
}

export async function generateGame({ idea, clarification, brief }, provider) {
  const startedAt = Date.now();
  const system = await loadPrompt("generate");
  const request = [tag("idea", idea), clarification && tag("clarification_answer", clarification), tag("brief", JSON.stringify(brief))]
    .filter(Boolean)
    .join("\n\n");
  const input = { idea, clarification, brief };

  const first = await provider.complete({ stage: "generate", system, user: request, schema: GAME_SPEC_SCHEMA, input });
  // glm-5.3 sometimes writes "..." for the objective, even twice running. The brief's goal is the
  // same model's sentence about the same game, so it stands in rather than fail the whole game.
  const hasWords = (value) => typeof value === "string" && /\p{L}/u.test(value);
  if (first.data && !hasWords(first.data.objective) && hasWords(brief?.goal)) first.data.objective = brief.goal;
  let attempts = 1;
  let check = validateSpec(first.data);
  const firstErrors = check.errors;
  const replies = [first];

  if (!check.ok) {
    attempts = 2;
    const repaired = await provider.complete({
      stage: "generate",
      system,
      user: repairMessage(request, first.data, check.errors),
      schema: GAME_SPEC_SCHEMA,
      input: { ...input, repair: true },
    });
    replies.push(repaired);
    check = validateSpec(repaired.data);
  }

  return { ok: check.ok, spec: check.spec, errors: check.errors, firstErrors, ...meta(provider, startedAt, attempts, replies) };
}

export async function reviseGame({ spec, request }, provider) {
  const startedAt = Date.now();
  const system = await loadPrompt("revise");
  const message = [tag("spec", JSON.stringify(forModel(spec))), tag("request", request)].join("\n\n");
  const input = { spec, request };

  const review = (data) => {
    const check = validateSpec(data.spec);
    if (!check.ok) return { check, comparison: null, errors: check.errors };
    const comparison = compareSpecs(spec, check.spec);
    return { check, comparison, errors: claimErrors(data.changeKind, comparison) };
  };

  const first = await provider.complete({ stage: "revise", system, user: message, schema: REVISION_SCHEMA, input });
  let attempts = 1;
  let data = first.data;
  let outcome = review(data);
  const replies = [first];

  if (outcome.errors.length) {
    attempts = 2;
    const repaired = await provider.complete({
      stage: "revise",
      system,
      user: repairMessage(message, data, outcome.errors),
      schema: REVISION_SCHEMA,
      input: { ...input, repair: true },
    });
    replies.push(repaired);
    data = repaired.data;
    outcome = review(data);
  }

  const ok = outcome.errors.length === 0;
  return {
    ok,
    spec: ok ? outcome.check.spec : null,
    errors: outcome.errors,
    changeKind: data.changeKind,
    changeSummary: data.changeSummary,
    comparison: outcome.comparison,
    ...meta(provider, startedAt, attempts, replies),
  };
}

// A player's earlier runs of one game, as the browser kept them. Only numbers, known moves and the
// stats the template really reports get through, so the route can't carry free text to a paid model.
const MAX_RUNS = 5;
const OUTCOMES = ["win", "lose", "complete"];

export function cleanRuns(spec, raw) {
  const template = templateInfo(spec.template);
  const labels = template.result(template.create(spec)).stats.map((stat) => stat.label);
  const brain = brainFor(spec.template);
  const whole = (value, max) => (Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0);
  return (Array.isArray(raw) ? raw : []).slice(-MAX_RUNS).map((run) => {
    const stats = Object.fromEntries((Array.isArray(run?.stats) ? run.stats : []).map((stat) => [stat?.label, Number(stat?.value)]));
    const sides = brain && run?.observed ? cleanObservation(brain, run.observed)?.lastShots : null;
    return {
      level: Math.max(1, whole(run?.level, 99)),
      outcome: OUTCOMES.includes(run?.outcome) ? run.outcome : "complete",
      score: whole(run?.score, 10_000_000),
      seconds: whole(run?.ms / 1000, 3600),
      stats: Object.fromEntries(labels.map((label) => [label, whole(stats[label], 1_000_000)])),
      moves: Object.fromEntries(template.actions.map(({ id }) => [id, whole(run?.moves?.[id], 100_000)])),
      ...(sides?.length && { lastShots: sides }),
    };
  });
}

// The next level: the same game and look, with tuning the model picked from the player's runs. Every
// changed field needs the model's reason, and the before and after numbers come from code.
export async function designLevel({ spec, runs }, provider) {
  const startedAt = Date.now();
  const template = templateInfo(spec.template);
  const system = await loadPrompt("level");
  const fields = Object.entries(template.tuning).map(([key, field]) => ({
    key, label: field.label, unit: field.unit, min: field.min, max: field.max, higherIsHarder: field.higherIsHarder, value: spec.tuning[key],
  }));
  const message = [
    tag("game", JSON.stringify({ name: template.name, rules: template.pitch, title: spec.title })),
    tag("tuning", JSON.stringify(fields)),
    tag("runs", JSON.stringify(runs)),
  ].join("\n\n");
  const input = { spec, runs };

  // A field the model left out keeps its value rather than falling back to the default.
  const review = (data) => {
    const check = validateSpec({ ...spec, tuning: [...Object.entries(spec.tuning).map(([key, value]) => ({ key, value })), ...(data.tuning ?? [])] });
    if (!check.ok) return { errors: check.errors };
    const { changes } = compareSpecs(spec, check.spec);
    if (!changes.length) return { errors: ["Nothing in tuning changed, so this would be the same level."] };
    const reasons = new Map((data.changes ?? []).map((change) => [change.key, change.why]));
    const missing = changes.filter((change) => !/\p{L}/u.test(reasons.get(change.key) ?? ""));
    if (missing.length) return { errors: missing.map((change) => `changes has no reason for ${change.key}.`) };
    return { errors: [], spec: check.spec, changes: changes.map((change) => ({ ...change, why: reasons.get(change.key) })) };
  };

  const first = await provider.complete({ stage: "level", system, user: message, schema: LEVEL_SCHEMA, input });
  let data = first.data;
  let outcome = review(data);
  let attempts = 1;
  const replies = [first];
  if (outcome.errors.length) {
    attempts = 2;
    const repaired = await provider.complete({ stage: "level", system, user: repairMessage(message, data, outcome.errors), schema: LEVEL_SCHEMA, input: { ...input, repair: true } });
    replies.push(repaired);
    data = repaired.data;
    outcome = review(data);
  }

  const ok = outcome.errors.length === 0;
  // A new seed too, so the next level isn't the same layout with new numbers.
  return {
    ok,
    spec: ok ? { ...outcome.spec, seed: (spec.seed + 1) % 2_147_483_647 } : null,
    changes: ok ? outcome.changes : [],
    headline: ok && /\p{L}/u.test(data.headline ?? "") ? data.headline : "",
    errors: outcome.errors,
    runs: runs.length,
    ...meta(provider, startedAt, attempts, replies),
  };
}

// What a revision says it changed has to be what compareSpecs measured.
function claimErrors(changeKind, { rulesChanged, lookChanged }) {
  if (!rulesChanged && !lookChanged) return ["The revised spec is identical to the original."];
  const errors = [];
  if (changeKind !== "look" && !rulesChanged) errors.push(`changeKind says ${changeKind}, but the template and tuning are unchanged.`);
  if (changeKind !== "gameplay" && !lookChanged) errors.push(`changeKind says ${changeKind}, but the skin and title are unchanged.`);
  if (changeKind === "look" && rulesChanged) errors.push("changeKind says look, but the template or tuning changed. Use both, or put the rules back.");
  if (changeKind === "gameplay" && lookChanged) errors.push("changeKind says gameplay, but the skin or title changed. Use both, or put the look back.");
  return errors;
}

function repairMessage(original, output, errors) {
  return [
    original,
    tag("previous_output", JSON.stringify(output)),
    tag("validation_errors", errors.map((error) => `- ${error}`).join("\n")),
    "Your previous output failed validation. Return a corrected version that fixes every error above and keeps the idea.",
  ].join("\n\n");
}
