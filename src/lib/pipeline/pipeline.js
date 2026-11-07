// The idea-to-game pipeline. Each stage asks a provider for structured data, then validates it in
// code. A provider is anything with complete(); see provider-claude.js and provider-fixture.js.
import { compareSpecs } from "../spec/compare.js";
import { validateSpec } from "../spec/validate.js";
import { GAME_SPEC_SCHEMA } from "../spec/contract.js";
import { conflicts } from "../templates/focus.js";
import { templateInfo } from "../templates/index.js";
import { bestTemplate } from "./match.js";
import { INTENT_SCHEMA, PROMPT_VERSIONS, REVISION_SCHEMA, loadPrompt } from "./prompts.js";

const tag = (name, value) => `<${name}>\n${value}\n</${name}>`;

// A saved spec keeps tuning as an object, but a model reads and writes the { key, value } list.
const forModel = (spec) => ({ ...spec, tuning: Object.entries(spec.tuning).map(([key, value]) => ({ key, value })) });

// traces are the 0G receipts (request ID, provider, cost) for each model call. Other providers have none.
function meta(provider, startedAt, attempts, replies = []) {
  const traces = replies.map((reply) => reply?.trace).filter(Boolean);
  return {
    source: provider.source,
    model: provider.model,
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
  const said = [idea, clarification].filter(Boolean).join(" ");
  const pick = bestTemplate(said, data.body);
  const body = pick.reading;

  // One question at most, and none once the idea names a body goal: go straight to its best game.
  const status = data.status === "clarify" && (clarification || body.focus.length) ? "ready" : data.status;
  // A forced answer is chosen again from the idea and the answer, not left on the model's stale guess.
  const reselect = status !== data.status && pick.evidence;
  // The game has to be one we can build, and one that fits the body the creator asked for.
  const named = templateInfo(data.brief?.template);
  const misfit = named ? conflicts(named.id, body) : "not a game we have";
  const template = reselect || misfit ? pick.template : named;
  const result = { status, brief: { ...data.brief, template: template.id }, body, ...meta(provider, startedAt, 1, [reply]) };
  if (misfit && template !== named) result.swapped = { from: data.brief?.template ?? "", why: misfit };
  if (status === "clarify") {
    result.question = data.question;
    result.options = data.options.slice(0, 4);
  }
  if (status === "unsupported") {
    const closest = template === named && data.unsupported.closest ? data.unsupported.closest : `${template.name}: ${template.pitch}`;
    result.unsupported = { ...data.unsupported, closest };
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
