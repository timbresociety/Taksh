// The steps of a request workflow. Each runs with full Node.js, in its own function invocation, and is
// recorded once it succeeds, so a replay never calls the model twice for the same answer.
import { FatalError, RetryableError } from "workflow";
import { getProvider } from "../lib/pipeline/provider.js";
import { KINDS, TRIAGE_SCHEMA, kindInfo } from "../lib/requests/kinds.js";
import { draftMessage, draftPrompt, repairMessage, triagePrompt, triageMessage } from "../lib/requests/prompt.js";

// Every provider already knows the stages "intent" (short, quick) and "generate" (long, careful), with
// their token limits and effort, so a request borrows them. `task` tells the fixtures which answer to give.
const STAGE = { triage: "intent", draft: "generate", repair: "generate" };

// Whether trying again could help, from what the provider says went wrong. A key or balance problem
// and a refused request will not change on a retry; a rate limit, a busy provider, a timeout or a
// broken reply might. The reason goes in front of the message, for the workflow to word for the player.
export function classify(error) {
  const status = error?.status;
  if (status === 401 || status === 402 || status === 403) return { retry: false, reason: "setup" };
  if (/declined|refus/i.test(error?.message ?? "") && !status) return { retry: false, reason: "declined" };
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) return { retry: false, reason: "request" };
  return { retry: true, reason: null };
}

async function ask(task, request) {
  const { provider } = await getProvider();
  try {
    const { data, ms } = await provider.complete({ stage: STAGE[task], task, ...request, input: { ...request.input, task } });
    return { data, ms, source: provider.source, model: provider.model };
  } catch (error) {
    const { retry, reason } = classify(error);
    if (!retry) throw new FatalError(`${reason}: ${error.message}`);
    const after = Number(error.headers?.get?.("retry-after"));
    throw new RetryableError(error.message, { retryAfter: Number.isFinite(after) && after > 0 ? after * 1000 : 10000 });
  }
}

export async function triageStep({ text, kind }) {
  "use step";
  const answer = await ask("triage", { system: await triagePrompt(), user: triageMessage({ text, kind }), schema: TRIAGE_SCHEMA, input: { text, kind } });
  // A kind the model invents is not one we can make.
  if (answer.data?.decision !== "decline" && !kindInfo(answer.data?.kind)) answer.data = { ...answer.data, kind: kind ?? "world" };
  return answer;
}
triageStep.maxRetries = 3;

export async function draftStep({ kind, text, brief }) {
  "use step";
  return ask("draft", { system: await draftPrompt(kind), user: draftMessage({ text, brief }), schema: KINDS[kind].schema, input: { kind, text, brief } });
}
draftStep.maxRetries = 3;

export async function repairStep({ kind, text, brief, draft, problems }) {
  "use step";
  const user = repairMessage(draftMessage({ text, brief }), draft, problems);
  return ask("repair", { system: await draftPrompt(kind), user, schema: KINDS[kind].schema, input: { kind, text, brief, repair: true } });
}
repairStep.maxRetries = 3;

// Pure code, but a step all the same: it names what it makes, and that name has to stay put on replay.
export async function checkStep({ kind, draft, previous }) {
  "use step";
  if (!draft || typeof draft !== "object" || !draft.item || typeof draft.item !== "object") return { item: null, problems: ["The answer has no item."] };
  return KINDS[kind].finish(draft, previous);
}

export async function resultStep({ kind, triage, draft, check, attempts, startedAt }) {
  "use step";
  const info = KINDS[kind];
  const ok = check.problems.length === 0;
  return {
    status: !ok ? "failed" : info.playable ? "ready" : "queued",
    kind,
    playable: ok && info.playable,
    decision: draft.data.decision === "reuse" ? "reuse" : "make",
    reuse: draft.data.reuse || null,
    note: typeof draft.data.note === "string" ? draft.data.note : "",
    needs: Array.isArray(draft.data.needs) ? draft.data.needs.filter((need) => typeof need === "string") : [],
    item: ok ? check.item : null,
    standIn: ok && info.standIn ? info.standIn(check.item) : null,
    problems: check.problems,
    message: ok ? null : "The design did not pass its checks. Try asking in other words.",
    brief: triage.data.brief,
    source: draft.source,
    model: draft.model,
    attempts,
    ms: Date.now() - startedAt,
  };
}
