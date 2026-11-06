// Checks a round sent by the browser and rebuilds the only object that gets stored. Moves and step
// times come from the browser, so the score is still the browser's word. The 0G decisions do not:
// each one must match what /api/rival/decide recorded, or the episode is refused.
import { issuedDecision, reserveDecisions } from "./ledger.js";

export const MAX_EPISODE_BYTES = 512 * 1024;
const MAX_STEPS = 30000; // 120 s at 250 fps
const MAX_LOG = 5000;
const MAX_DT_MS = 50; // PlayStage never steps further than this
const SIDES = ["left", "right", "high"];

const refuse = (message) => Object.assign(new Error(message), { status: 400, expose: true });

export function checkEpisode(raw, spec) {
  const { dts, log, decisions } = raw ?? {};
  if (!Array.isArray(dts) || dts.length > MAX_STEPS || !dts.every((dt) => Number.isFinite(dt) && dt > 0 && dt <= MAX_DT_MS)) throw refuse("The step times are not valid.");
  if (!Array.isArray(log) || log.length > MAX_LOG) throw refuse("The move log is not valid.");
  let lastStep = 0;
  for (const entry of log) {
    const [step, kind, value] = Array.isArray(entry) ? entry : [];
    const shaped = Number.isInteger(step) && step >= lastStep && step <= dts.length
      && ((kind === "act" && typeof value === "string" && value.length <= 32) || (kind === "plan" && Array.isArray(value) && value.length <= 4 && value.every((side) => SIDES.includes(side))));
    if (!shaped) throw refuse("The move log is not valid.");
    lastStep = step;
  }
  if (!Array.isArray(decisions) || decisions.length > MAX_LOG) throw refuse("The decisions are not valid.");

  // Every plan in the log, in order, has to be a decision 0G really made for this server.
  const verified = [];
  const plans = log.filter(([, kind]) => kind === "plan").map(([, , value]) => value);
  const claimed = decisions.filter((decision) => decision?.requestId);
  if (claimed.length !== plans.length) throw refuse("The plans and the 0G decisions do not line up.");
  if (new Set(claimed.map((decision) => decision.requestId)).size !== claimed.length) throw refuse("A 0G decision appears twice in this round.");
  claimed.forEach((decision, index) => {
    const issued = issuedDecision(decision.requestId);
    if (!issued || JSON.stringify(issued.plan) !== JSON.stringify(plans[index])) throw refuse("A 0G decision in this round was not issued by this server.");
    verified.push({ t: Number(decision.t) || 0, plan: issued.plan, read: issued.read, observation: issued.observation, ...issued.trace });
  });
  const safeStops = decisions.filter((decision) => decision?.safeStop).length;

  // No await between the checks above and this line, so nothing else can claim these decisions first.
  reserveDecisions(verified.map((decision) => decision.requestId));
  return { version: 1, spec, options: { rival: "0g" }, dts, log, decisions: verified, safeStops };
}
