// Validates a GameSpec before it can load. Errors are written for the model's repair attempt
// as much as for developers, so each names the field and the rule that was broken.
import { maxScore } from "../runtime/engine.js";
import { simulate } from "../runtime/bot.js";
import {
  ACTIONS,
  ART_PRESETS,
  AVATARS,
  END_TYPES,
  EVENT_KINDS,
  EVENT_REQUIRES,
  GESTURES,
  HAZARD_SPRITES,
  PACING,
  PALETTE_KEYS,
  PLAYER_PROFILES,
  SETTINGS,
  SPEC_VERSION,
  TARGET_SPRITES,
  gestureInfo,
} from "./contract.js";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateSpec(input) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!input || typeof input !== "object") return { ok: false, errors: ["Spec must be an object."], spec: null };
  const spec = structuredClone(input);

  if (spec.specVersion !== SPEC_VERSION) fail(`specVersion must be ${SPEC_VERSION}.`);
  checkText(spec.title, "title", 48, fail);
  checkText(spec.objective, "objective", 160, fail);
  checkArt(spec.artStyle, fail);
  checkTheme(spec.theme, fail);
  checkEnd(spec.end, fail);
  checkScoring(spec.scoring, fail);

  if (Array.isArray(spec.events)) spec.events.sort((a, b) => a?.atMs - b?.atMs);
  checkEvents(spec, fail);
  checkBindings(spec, fail);

  // Reachability only means something once the spec is structurally sound.
  if (!errors.length) checkPlayable(spec, fail);
  return { ok: errors.length === 0, errors, spec: errors.length ? null : spec };
}

function checkText(value, field, max, fail) {
  if (typeof value !== "string" || !value.trim()) fail(`${field} must be a non-empty string.`);
  else if (value.length > max) fail(`${field} must be at most ${max} characters.`);
}

function checkEnum(value, allowed, field, fail) {
  if (!allowed.includes(value)) fail(`${field} must be one of: ${allowed.join(", ")}.`);
}

function checkArt(art, fail) {
  if (!art) return fail("artStyle is required.");
  checkEnum(art.preset, Object.keys(ART_PRESETS), "artStyle.preset", fail);
  checkText(art.direction, "artStyle.direction", 160, fail);
  for (const key of PALETTE_KEYS) {
    if (!HEX.test(art.palette?.[key] ?? "")) fail(`artStyle.palette.${key} must be a #rrggbb colour.`);
  }
}

function checkTheme(theme, fail) {
  if (!theme) return fail("theme is required.");
  checkEnum(theme.setting, SETTINGS, "theme.setting", fail);
  checkEnum(theme.avatar, AVATARS, "theme.avatar", fail);
  checkEnum(theme.targetSprite, TARGET_SPRITES, "theme.targetSprite", fail);
  checkEnum(theme.hazardSprite, HAZARD_SPRITES, "theme.hazardSprite", fail);
  for (const key of ["targetName", "hazardName"]) checkText(theme[key], `theme.${key}`, 24, fail);
  for (const key of ["hitText", "missText", "avoidText", "hurtText"]) checkText(theme[key], `theme.${key}`, 16, fail);
}

function checkEnd(end, fail) {
  if (!end) return fail("end is required.");
  checkEnum(end.type, END_TYPES, "end.type", fail);
  const { min, max } = PACING.durationMs;
  if (!Number.isInteger(end.durationMs) || end.durationMs < min || end.durationMs > max) {
    fail(`end.durationMs must be an integer from ${min} to ${max}.`);
  }
  if (end.type === "lives" && !(end.lives >= 1 && end.lives <= 9)) fail("end.lives must be 1-9 for a lives ending.");
}

function checkScoring(scoring, fail) {
  if (!scoring) return fail("scoring is required.");
  if (!(scoring.targetHit > 0 && scoring.targetHit <= 1000)) fail("scoring.targetHit must be 1-1000.");
  if (!(scoring.hazardAvoided >= 0 && scoring.hazardAvoided <= 1000)) fail("scoring.hazardAvoided must be 0-1000.");
  if (!(scoring.targetMiss <= 0 && scoring.targetMiss >= -1000)) fail("scoring.targetMiss must be 0 to -1000.");
  if (!(scoring.hazardHit <= 0 && scoring.hazardHit >= -1000)) fail("scoring.hazardHit must be 0 to -1000.");
  if (!(scoring.comboBonus >= 0 && scoring.comboBonus <= 100)) fail("scoring.comboBonus must be 0-100.");
  if (typeof scoring.targetMissCostsLife !== "boolean") fail("scoring.targetMissCostsLife must be a boolean.");
}

function checkEvents(spec, fail) {
  const { events, end } = spec;
  const { min, max } = PACING.eventCount;
  if (!Array.isArray(events) || events.length < min || events.length > max) {
    return fail(`events must hold ${min}-${max} events.`);
  }

  events.forEach((event, i) => {
    const at = `events[${i}]`;
    checkEnum(event.kind, EVENT_KINDS, `${at}.kind`, fail);
    checkEnum(event.requires, EVENT_REQUIRES, `${at}.requires`, fail);
    if (!Number.isInteger(event.atMs)) fail(`${at}.atMs must be an integer.`);

    const telegraph = PACING.telegraphMs;
    if (!(event.telegraphMs >= telegraph.min && event.telegraphMs <= telegraph.max)) {
      fail(`${at}.telegraphMs must be ${telegraph.min}-${telegraph.max}.`);
    }
    const window = event.requires === "down" ? PACING.downWindowMs : PACING.windowMs;
    if (!(event.windowMs >= window.min && event.windowMs <= window.max)) {
      fail(`${at}.windowMs must be ${window.min}-${window.max} for requires ${event.requires}.`);
    }

    const laneRule = { position: [0, 1, 2], strike_left: [0], strike_right: [2], up: [null], down: [null] }[event.requires];
    if (laneRule && !laneRule.includes(event.lane)) {
      fail(`${at}.lane must be ${laneRule.join(" or ")} for requires ${event.requires}.`);
    }

    if (event.atMs - event.telegraphMs < PACING.firstSpawnMs) {
      fail(`${at} appears before ${PACING.firstSpawnMs}ms. Raise atMs or lower telegraphMs.`);
    }
    if (end && event.atMs > end.durationMs - PACING.tailMs) {
      fail(`${at}.atMs must be at least ${PACING.tailMs}ms before end.durationMs.`);
    }

    const next = events[i + 1];
    const gap = PACING.gapAfterMs[event.requires];
    if (next && gap && next.atMs - event.atMs < gap) {
      fail(`${at} and events[${i + 1}] are ${next.atMs - event.atMs}ms apart; requires ${event.requires} needs at least ${gap}ms.`);
    }
  });

  if (end?.type === "score") {
    const best = maxScore(spec);
    if (!(end.winScore > 0 && end.winScore <= best)) fail(`end.winScore must be 1-${best}, the most this round can award.`);
  }
}

function checkBindings(spec, fail) {
  const bindings = spec.movementBindings;
  if (!Array.isArray(bindings) || !bindings.length) return fail("movementBindings needs at least one binding.");

  const seen = new Set();
  for (const { gesture, action } of bindings) {
    const info = gestureInfo(gesture);
    if (!info) {
      fail(`Unknown gesture "${gesture}". Use: ${GESTURES.map((g) => g.id).join(", ")}.`);
      continue;
    }
    if (!ACTIONS.some((a) => a.id === action)) fail(`Unknown action "${action}".`);
    else if (!info.actions.includes(action)) fail(`Gesture ${gesture} can only bind to: ${info.actions.join(", ")}.`);
    if (seen.has(gesture)) fail(`Gesture ${gesture} is bound twice.`);
    seen.add(gesture);
  }

  const bound = new Set(bindings.map((binding) => binding.action));
  const needed = new Set();
  for (const event of spec.events ?? []) {
    if (event.requires === "position") ["move_left", "move_right"].forEach((action) => needed.add(action));
    else needed.add(event.requires);
  }
  for (const action of needed) {
    if (!bound.has(action)) fail(`Events need the action ${action}, but no gesture is bound to it.`);
  }
}

function checkPlayable(spec, fail) {
  const { failures } = simulate(spec, PLAYER_PROFILES.quick);
  for (const failure of failures.slice(0, 5)) {
    const event = spec.events[failure.eventIndex];
    fail(
      `events[${failure.eventIndex}] (${event.kind} ${event.requires} at ${event.atMs}ms) cannot be cleared by a quick player. ` +
        "Give it a longer telegraphMs or more space from the event before it.",
    );
  }
}
