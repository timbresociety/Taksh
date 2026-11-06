// Measures what a revision actually changed, so "it's easier now" is checked against the
// spec and against a simulated player rather than taken from the model's summary.
import { simulate } from "../runtime/bot.js";
import { PLAYER_PROFILES } from "./contract.js";

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export function gameplayMetrics(spec) {
  const hazards = spec.events.filter((event) => event.kind === "hazard");
  const targets = spec.events.filter((event) => event.kind === "target");
  const gaps = spec.events.slice(1).map((event, i) => event.atMs - spec.events[i].atMs);
  return {
    durationMs: spec.end.durationMs,
    eventCount: spec.events.length,
    hazardCount: hazards.length,
    targetCount: targets.length,
    hazardWarningMs: Math.round(average(hazards.map((event) => event.telegraphMs))),
    targetWarningMs: Math.round(average(targets.map((event) => event.telegraphMs))),
    windowMs: Math.round(average(spec.events.map((event) => event.windowMs))),
    gapMs: Math.round(average(gaps)),
    lives: spec.end.type === "lives" ? spec.end.lives : 0,
    casualClearRate: Math.round(simulate(spec, PLAYER_PROFILES.casual).clearRate * 100),
  };
}

const LABELS = {
  durationMs: ["Round length", "ms"],
  eventCount: ["Events", ""],
  hazardCount: ["Hazards", ""],
  targetCount: ["Targets", ""],
  hazardWarningMs: ["Hazard warning", "ms"],
  targetWarningMs: ["Target warning", "ms"],
  windowMs: ["Timing window", "ms"],
  gapMs: ["Time between events", "ms"],
  lives: ["Lives", ""],
  casualClearRate: ["Casual player clears", "%"],
};

export function compareSpecs(before, after) {
  const a = gameplayMetrics(before);
  const b = gameplayMetrics(after);
  const changes = Object.keys(LABELS)
    .filter((key) => (LABELS[key][1] === "ms" ? Math.abs(a[key] - b[key]) >= 100 : a[key] !== b[key]))
    .map((key) => ({ key, label: LABELS[key][0], unit: LABELS[key][1], before: a[key], after: b[key] }));

  const rulesChanged =
    JSON.stringify(before.events) !== JSON.stringify(after.events) ||
    JSON.stringify(before.scoring) !== JSON.stringify(after.scoring) ||
    JSON.stringify(before.end) !== JSON.stringify(after.end) ||
    JSON.stringify(before.movementBindings) !== JSON.stringify(after.movementBindings);
  const lookChanged =
    JSON.stringify(before.artStyle) !== JSON.stringify(after.artStyle) ||
    JSON.stringify(before.theme) !== JSON.stringify(after.theme);

  return { changes, rulesChanged, lookChanged };
}
