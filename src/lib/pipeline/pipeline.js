// The idea-to-game pipeline. Each stage asks a provider for structured data, then validates it in
// code. A provider is anything with complete(); see provider-claude.js and provider-fixture.js.
import { compareSpecs } from "../spec/compare.js";
import { validateSpec } from "../spec/validate.js";
import { GAME_SPEC_SCHEMA } from "../spec/contract.js";
import { INTENT_SCHEMA, PROMPT_VERSIONS, REVISION_SCHEMA, loadPrompt } from "./prompts.js";

const tag = (name, value) => `<${name}>\n${value}\n</${name}>`;

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
  const result = { status, brief: data.brief, ...meta(provider, startedAt, 1) };
  if (status === "clarify") {
    result.question = data.question;
    result.options = data.options.slice(0, 4);
  }
  if (status === "unsupported") {
    result.unsupported = data.unsupported;
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
  const message = [tag("spec", JSON.stringify(spec)), tag("request", request)].join("\n\n");
  const input = { spec, request };

  const review = (data) => {
    const check = validateSpec(data.spec);
    if (!check.ok) return { check, comparison: null, errors: check.errors };
    const comparison = compareSpecs(spec, check.spec);
    const errors = [];
    if (!comparison.rulesChanged && !comparison.lookChanged) errors.push("The revised spec is identical to the original.");
    if (data.changeKind !== "look" && !comparison.rulesChanged) {
      errors.push("changeKind says gameplay changed, but events, scoring, bindings and the ending are all unchanged.");
    }
    return { check, comparison, errors };
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

function repairMessage(original, output, errors) {
  return [
    original,
    tag("previous_output", JSON.stringify(output)),
    tag("validation_errors", errors.map((error) => `- ${error}`).join("\n")),
    "Your previous output failed validation. Return a corrected version that fixes every error above and keeps the idea.",
  ].join("\n\n");
}
