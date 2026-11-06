// A player's request for a new world, style, character, boss or game, as a durable workflow.
//
// A request makes two or three model calls, and a busy private provider or a rate limit can stretch
// that to minutes. So the request never waits on an HTTP response: POST /api/requests starts this workflow and returns its id at once, and
// the player's browser polls GET /api/requests/:id. Each model call is its own step, so it gets its
// own function invocation and time limit, is retried on a timeout, a rate limit or a server error,
// and is never repeated once it has succeeded. Progress is written to the run's attributes.
import { FatalError, setAttributes } from "workflow";
import { checkStep, draftStep, repairStep, resultStep, triageStep } from "./request-steps.js";

const REPAIRS = 1; // one chance to fix what the checks found, as for generated games
const GIVE_UP = {
  setup: "Making new things is switched off right now. Try again later.",
  declined: "We can't make that one. Try asking for something else.",
  request: "We couldn't make this one. Try asking in other words.",
};

export async function handleRequest({ text, kind = null, startedAt }) {
  "use workflow";
  try {
    await setAttributes({ stage: "reading", ...(kind ? { kind } : {}) });
    const triage = await triageStep({ text, kind });
    if (triage.data.decision === "decline") {
      await setAttributes({ stage: "done", outcome: "declined" });
      return { status: "declined", kind: triage.data.kind ?? kind, message: triage.data.reason || "We can't make that one. Try asking for something else.", source: triage.source, model: triage.model };
    }
    const chosen = triage.data.kind;
    const brief = triage.data.brief || text;

    await setAttributes({ stage: "drafting", kind: chosen });
    let draft = await draftStep({ kind: chosen, text, brief });
    await setAttributes({ stage: "checking" });
    let check = await checkStep({ kind: chosen, draft: draft.data });
    let attempts = 1;
    while (check.problems.length && attempts <= REPAIRS) {
      await setAttributes({ stage: "fixing" });
      draft = await repairStep({ kind: chosen, text, brief, draft: draft.data, problems: check.problems });
      await setAttributes({ stage: "checking" });
      check = await checkStep({ kind: chosen, draft: draft.data, previous: check.item });
      attempts += 1;
    }

    const outcome = await resultStep({ kind: chosen, triage, draft, check, attempts, startedAt });
    // Boss and game designs are the build queue: `workflow inspect runs --attribute outcome=queued`.
    const title = outcome.item?.name ?? outcome.item?.label;
    await setAttributes({ stage: "done", outcome: outcome.status, ...(title ? { title: String(title).slice(0, 60) } : {}) });
    return outcome;
  } catch (error) {
    await setAttributes({ stage: "done", outcome: "failed" });
    // The reason stays in the run's log; the player gets what to do next, not provider internals.
    console.error("request failed:", error?.message);
    const fatal = FatalError.is(error) || error?.fatal;
    const reason = String(error?.message ?? "").split(":")[0];
    return { status: "failed", kind, message: fatal ? GIVE_UP[reason] ?? GIVE_UP.request : "The request could not be finished. Try again in a minute." };
  }
}
