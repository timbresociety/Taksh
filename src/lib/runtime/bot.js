// A simulated player with human-like reaction and movement costs. It plays a spec through
// the real engine, so "playable" and "this revision changed the game" are measured, not assumed.
import { PLAYER_PROFILES } from "../spec/contract.js";
import { applyAction, createRound, eventTiming, stepRound } from "./engine.js";

const TICK_MS = 20;

export function simulate(spec, profile = PLAYER_PROFILES.quick) {
  // Bots play every event, so a lives or score ending cannot cut the measurement short.
  const round = createRound({ ...spec, end: { ...spec.end, type: "time" } });
  const pending = [];
  const failures = [];
  let busyUntil = 0;

  const startAction = (action, costMs) => {
    pending.push({ action, at: round.t + costMs });
    busyUntil = round.t + costMs;
  };

  while (round.status === "playing") {
    for (const item of pending.splice(0)) {
      if (item.at <= round.t) applyAction(round, item.action);
      else pending.push(item);
    }

    const seen = round.events.filter(
      (event) => event.state !== "done" && eventTiming(event).spawn + profile.reactionMs <= round.t,
    );
    const next = seen[0];
    if (next && round.t >= busyUntil && !pending.length) decide(next, seen, round, profile, startAction);

    for (const outcome of stepRound(round, TICK_MS)) {
      if (outcome.type === "miss" || outcome.type === "hurt") failures.push(outcome);
    }
  }

  return { ...round.result, failures };
}

function decide(event, seen, round, profile, startAction) {
  if (event.requires === "position") {
    const goal = event.kind === "target" ? event.lane : safeLane(event, seen, round.lane);
    if (goal === round.lane) return;
    startAction(goal < round.lane ? "move_left" : "move_right", profile.moveMs);
    return;
  }

  const costMs = event.requires === "up" ? profile.upMs : event.requires === "down" ? profile.downMs : profile.strikeMs;
  const { open } = eventTiming(event);
  // Holding the input until the window is reachable mirrors a player timing it, not spamming.
  if (round.t + costMs >= open) startAction(event.requires, costMs);
}

function safeLane(hazard, seen, lane) {
  if (lane !== hazard.lane) return lane;
  const nextTarget = seen.find((event) => event.kind === "target" && event.requires === "position");
  if (nextTarget && nextTarget.lane !== hazard.lane) {
    return lane + Math.sign(nextTarget.lane - lane);
  }
  return lane === 0 ? 1 : lane - 1;
}
