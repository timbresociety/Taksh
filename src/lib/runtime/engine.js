// The round runtime: one small, deterministic state machine for timed targets and hazards.
// It knows nothing about cameras or canvases. Inputs are actions, outputs are outcome events.
import { LANE_COUNT } from "../spec/contract.js";

const MAX_COMBO = 10;

export function createRound(spec) {
  return {
    spec,
    t: 0,
    lane: 1,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lives: spec.end.type === "lives" ? spec.end.lives : null,
    status: "playing",
    result: null,
    events: spec.events.map((event, index) => ({ ...event, index, state: "waiting" })),
    lastAction: {},
    tally: { hit: 0, miss: 0, avoid: 0, hurt: 0 },
  };
}

export function eventTiming(event) {
  return {
    spawn: event.atMs - event.telegraphMs,
    open: event.atMs - event.windowMs / 2,
    close: event.atMs + event.windowMs / 2,
  };
}

export function applyAction(round, action) {
  if (round.status !== "playing") return [];
  round.lastAction[action] = round.t;
  if (action === "move_left") round.lane = Math.max(0, round.lane - 1);
  if (action === "move_right") round.lane = Math.min(LANE_COUNT - 1, round.lane + 1);
  return resolve(round);
}

export function stepRound(round, dtMs) {
  if (round.status !== "playing") return [];
  round.t += dtMs;
  const outcomes = resolve(round);
  const end = checkEnd(round);
  if (end) outcomes.push(end);
  return outcomes;
}

function resolve(round) {
  const outcomes = [];
  for (const event of round.events) {
    if (event.state === "done") continue;
    const { spawn, open, close } = eventTiming(event);
    if (round.t < spawn) continue;
    event.state = "live";
    if (round.t < open) continue;

    if (event.requires === "position") {
      if (event.kind === "target") {
        if (round.lane === event.lane) outcomes.push(settle(round, event, true));
        else if (round.t >= close) outcomes.push(settle(round, event, false));
      } else if (round.t >= event.atMs) {
        outcomes.push(settle(round, event, round.lane !== event.lane));
      }
      continue;
    }

    const acted = round.lastAction[event.requires];
    if (acted !== undefined && acted >= open && acted <= close) outcomes.push(settle(round, event, true));
    else if (round.t >= close) outcomes.push(settle(round, event, false));
  }
  return outcomes;
}

function settle(round, event, success) {
  const { scoring } = round.spec;
  event.state = "done";
  event.success = success;

  let type;
  let points;
  if (success) {
    type = event.kind === "target" ? "hit" : "avoid";
    points = (event.kind === "target" ? scoring.targetHit : scoring.hazardAvoided) + round.combo * scoring.comboBonus;
    round.combo = Math.min(MAX_COMBO, round.combo + 1);
    round.bestCombo = Math.max(round.bestCombo, round.combo);
  } else {
    type = event.kind === "target" ? "miss" : "hurt";
    points = event.kind === "target" ? scoring.targetMiss : scoring.hazardHit;
    round.combo = 0;
    const costsLife = event.kind === "hazard" || scoring.targetMissCostsLife;
    if (round.lives !== null && costsLife) round.lives = Math.max(0, round.lives - 1);
  }

  round.score = Math.max(0, round.score + points);
  round.tally[type] += 1;
  return { type, points, eventIndex: event.index, lane: event.lane, t: round.t };
}

function checkEnd(round) {
  const { end } = round.spec;
  if (end.type === "lives" && round.lives === 0) return finish(round, "lose");
  if (end.type === "score" && round.score >= end.winScore) return finish(round, "win");
  if (round.t < end.durationMs) return null;
  if (end.type === "score") return finish(round, "lose");
  return finish(round, end.type === "lives" ? "win" : "complete");
}

function finish(round, outcome) {
  const { hit, avoid, miss, hurt } = round.tally;
  const played = hit + avoid + miss + hurt;
  round.status = "ended";
  round.result = {
    outcome,
    score: round.score,
    bestCombo: round.bestCombo,
    tally: { ...round.tally },
    clearRate: played ? (hit + avoid) / played : 0,
  };
  return { type: "end", result: round.result, t: round.t };
}

export function maxScore(spec) {
  let score = 0;
  let combo = 0;
  for (const event of spec.events) {
    const base = event.kind === "target" ? spec.scoring.targetHit : spec.scoring.hazardAvoided;
    score += base + combo * spec.scoring.comboBonus;
    combo = Math.min(MAX_COMBO, combo + 1);
  }
  return score;
}
