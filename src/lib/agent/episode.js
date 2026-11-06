// Checks a round sent by the browser and rebuilds the only object that gets stored. The score stored
// is the server's own replay, never the browser's number. To get stored, a round must also:
//   - use only plans 0G really returned to this server, all from one round, each once
//   - use every plan 0G returned in time to be played, so a plan that hurt can't be left out
//   - have run no faster than real time, and be sent within 5 minutes of ending
// There's no floor on game time: the countdown and every pause for a lost body stop the game clock
// but not the server's. A plan held back to work out the dodges is caught by the reaction check instead.
//   - have human dodges: a correct dodge faster than a person can react is a script
// A bot that plays live with human timing still gets through. Nothing in a browser game stops that.
import { replayEpisode } from "../game/session.js";
import { templateInfo } from "../templates/index.js";
import { issuedDecision, openRoundInfo, reserveRound } from "./ledger.js";

export const MAX_EPISODE_BYTES = 512 * 1024;
const MAX_STEPS = 30000; // 120 s at 250 fps
const MAX_LOG = 5000;
const MAX_DT_MS = 50; // PlayStage never steps further than this
const SIDES = ["left", "right", "high"];
const CLOCK_SLACK_MS = 1500; // network and frame jitter between the server clock and the game clock
const UPLOAD_WINDOW_MS = 5 * 60 * 1000; // a failed upload can be retried, for a while
const IN_TIME_MS = 5000; // the browser gives up on a decision after 6 s; one served faster was played
const HUMAN_REACTION_MS = 120; // simple visual reaction is about 200 ms; under 120 is not a person
const FAST_DODGES_ALLOWED = 2; // a lucky early lean happens, a run of them doesn't

const refuse = (message) => Object.assign(new Error(message), { status: 400, expose: true });

export function checkEpisode(raw, spec, now = Date.now()) {
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
  const plans = log.filter(([, kind]) => kind === "plan");
  const claimed = decisions.filter((decision) => decision?.requestId);
  if (claimed.length === 0) throw refuse("A round needs at least one 0G decision.");
  if (claimed.length !== plans.length) throw refuse("The plans and the 0G decisions do not line up.");
  if (new Set(claimed.map((decision) => decision.requestId)).size !== claimed.length) throw refuse("A 0G decision appears twice in this round.");
  const issued = claimed.map((decision, index) => {
    const record = issuedDecision(decision.requestId);
    if (!record || JSON.stringify(record.plan) !== JSON.stringify(plans[index][2])) throw refuse("A 0G decision in this round was not issued by this server.");
    return record;
  });

  // All from one round, and that round not stored before.
  const roundId = issued[0].roundId;
  const round = openRoundInfo(roundId);
  if (!round || issued.some((record) => record.roundId !== roundId)) throw refuse("These 0G decisions are not from one round.");

  // Real time. Game time at each plan is the sum of the steps before it, which the browser can't
  // shrink without also changing the score. It can't be more than the server time since the round opened.
  const gameMsAt = (step) => dts.slice(0, step).reduce((sum, dt) => sum + dt, 0);
  const endMs = gameMsAt(dts.length);
  plans.forEach(([step], index) => {
    const served = issued[index].issuedAt - round.startedAt;
    if (gameMsAt(step) > served + CLOCK_SLACK_MS) throw refuse("This round ran faster than real time.");
    if (index > 0 && served < issued[index - 1].issuedAt - round.startedAt) throw refuse("The 0G decisions are out of order.");
  });
  if (endMs > now - round.startedAt + CLOCK_SLACK_MS) throw refuse("This round ran faster than real time.");
  if (now - round.startedAt > endMs + UPLOAD_WINDOW_MS) throw refuse("This round is too old to store.");

  // Every plan 0G served in time to be played has to be in the round. Late ones (the browser gave up)
  // and ones that arrived as the round ended are the only ones allowed missing.
  const sent = new Set(claimed.map((decision) => decision.requestId));
  const missing = round.requestIds.filter((id) => {
    const record = issuedDecision(id);
    return record && !sent.has(id) && record.issuedAt - record.askedAt <= IN_TIME_MS && record.issuedAt - round.startedAt < endMs - CLOCK_SLACK_MS;
  });
  if (missing.length) throw refuse("This round leaves out a 0G decision that was played.");

  // Human dodges, and the server's own score.
  const template = templateInfo(spec.template);
  let fast = 0;
  const replayed = replayEpisode({ spec, options: { rival: "0g" }, dts, log }, {
    onAct: (state, action) => {
      const reaction = template.reactionMs?.(state, action);
      if (reaction !== null && reaction !== undefined && reaction < HUMAN_REACTION_MS) fast += 1;
    },
  });
  if (fast > FAST_DODGES_ALLOWED) throw refuse(`${fast} dodges came faster than a person can react.`);

  const verified = issued.map((record, index) => ({ t: gameMsAt(plans[index][0]), plan: record.plan, read: record.read, observation: record.observation, ...record.trace }));
  const safeStops = decisions.filter((decision) => decision?.safeStop).length;

  // No await between the checks above and this line, so nothing else can claim this round first.
  reserveRound(roundId, verified.map((decision) => decision.requestId));
  return { version: 1, roundId, spec, options: { rival: "0g" }, dts, log, decisions: verified, safeStops, replayed };
}
