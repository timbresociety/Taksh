// The idea-to-game pipeline. Each stage asks a provider for structured data, then validates it in
// code. A provider is anything with complete(); see provider-claude.js and provider-fixture.js.
import { compareSpecs } from "../spec/compare.js";
import { validateSpec } from "../spec/validate.js";
import { GAME_SPEC_SCHEMA } from "../spec/contract.js";
import { TEMPLATES, templateInfo } from "../templates/index.js";
import { INTENT_SCHEMA, PROMPT_VERSIONS, REVISION_SCHEMA, loadPrompt } from "./prompts.js";

const tag = (name, value) => `<${name}>\n${value}\n</${name}>`;

// A saved spec keeps tuning as an object, but a model reads and writes the { key, value } list.
const forModel = (spec) => ({ ...spec, tuning: Object.entries(spec.tuning).map(([key, value]) => ({ key, value })) });

function meta(provider, startedAt, attempts) {
  return {
    source: provider.source,
    model: provider.model,
    ms: Date.now() - startedAt,
    attempts,
    promptVersions: PROMPT_VERSIONS,
  };
}

export async function clarifyIdea({ idea, clarification }, provider) {
  const startedAt = Date.now();
  const system = await loadPrompt("intent");
  const parts = [tag("idea", idea)];
  if (clarification) parts.push(tag("clarification_answer", clarification));

  const { data } = await provider.complete({
    stage: "intent",
    system,
    user: parts.join("\n\n"),
    schema: INTENT_SCHEMA,
    input: { idea, clarification },
  });

  // One question at most, whatever the model decides.
  const status = data.status === "clarify" && clarification ? "ready" : data.status;
  // The closest game has to be one we can really build, whatever the model named.
  const template = templateInfo(data.brief?.template) ?? TEMPLATES[0];
  const result = { status, brief: { ...data.brief, template: template.id }, ...meta(provider, startedAt, 1) };
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
  let attempts = 1;
  let check = validateSpec(first.data);
  const firstErrors = check.errors;

  if (!check.ok) {
    attempts = 2;
    const repaired = await provider.complete({
      stage: "generate",
      system,
      user: repairMessage(request, first.data, check.errors),
      schema: GAME_SPEC_SCHEMA,
      input: { ...input, repair: true },
    });
    check = validateSpec(repaired.data);
  }

  return { ok: check.ok, spec: check.spec, errors: check.errors, firstErrors, ...meta(provider, startedAt, attempts) };
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

  if (outcome.errors.length) {
    attempts = 2;
    const repaired = await provider.complete({
      stage: "revise",
      system,
      user: repairMessage(message, data, outcome.errors),
      schema: REVISION_SCHEMA,
      input: { ...input, repair: true },
    });
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
    ...meta(provider, startedAt, attempts),
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
