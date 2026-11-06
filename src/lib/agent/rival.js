// The 0G rival's brains, one per game that has one. 0G sees the match and plans the next shots. The
// game only plays what was planned, so every shot traces back to a request ID.
import { ZONES } from "../templates/keeper.js";

const text = { type: "string" };
const whole = (value, max) => (Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0);

const SIDES = ["left", "right", "high"];
const ZONE_IDS = ZONES.map((zone) => zone.id);

const RETURN = `Return JSON:
- plan: your next 3 shots, in order. Lean on what the player misses most, but mix in one other so they can't settle.
- taunt: one short line of trash talk, under 8 words, that fits what just happened. No slurs.
- read: under 12 words on the player's weakness, for the log.`;

// Each brain: the moves 0G may plan, its prompt, and the only fields of the browser's observation
// that reach the model, as clamped numbers and known moves. Anything else the browser sends is
// dropped, so the route can't be used to send free text to a paid model.
const BRAINS = {
  bout: {
    moves: SIDES,
    system: `You are the rival boxer in Counter Bout, a game the player plays with their body.
You throw three shots: "left" (a hook at the player's left, so they must step right), "right" (step left) and "high" (duck).
A shot the player reads opens you up to double damage, so pick shots they are failing to read.
You get the fight so far as JSON. lastShots lists your recent shots, oldest first, and whether the player dodged each.

${RETURN}`,
    clean: (raw) => ({
      secondsLeft: whole(raw.secondsLeft, 600),
      playerHealth: whole(raw.playerHealth, 100),
      rivalHealth: whole(raw.rivalHealth, 100),
      knockdowns: whole(raw.knockdowns, 3),
      queued: whole(raw.queued, 4),
      lastShots: raw.lastShots
        .filter((shot) => SIDES.includes(shot?.side))
        .slice(-8)
        .map((shot) => ({ side: shot.side, dodged: shot.dodged === true })),
    }),
  },
  keeper: {
    moves: ZONE_IDS,
    system: `You are the striker in Last Line, a game the player plays with their body as the goalkeeper.
The goal is cut into nine zones. Each zone takes a different move from the keeper to save:
${ZONES.map((zone) => `- "${zone.id}" ${zone.label.toLowerCase()}: ${zone.exercise.toLowerCase()}`).join("\n")}
Pick zones whose move the keeper is slow or wrong on. Never the same zone twice in a row.
You get the match so far as JSON. lastShots lists your recent shots, oldest first, and whether the keeper saved each.

${RETURN}`,
    clean: (raw) => ({
      shotsLeft: whole(raw.shotsLeft, 48),
      lives: whole(raw.lives, 6),
      saves: whole(raw.saves, 48),
      queued: whole(raw.queued, 4),
      lastShots: raw.lastShots
        .filter((shot) => ZONE_IDS.includes(shot?.zone))
        .slice(-8)
        .map((shot) => ({ zone: shot.zone, saved: shot.saved === true })),
    }),
  },
};

export const brainFor = (template) => (Object.hasOwn(BRAINS, template) ? BRAINS[template] : null);

export function cleanObservation(brain, raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.lastShots)) return null;
  return brain.clean(raw);
}

export const rivalSchema = (brain) => ({
  type: "object",
  properties: {
    plan: { type: "array", items: { type: "string", enum: brain.moves } },
    taunt: text,
    read: text,
  },
  required: ["plan", "taunt", "read"],
  additionalProperties: false,
});

export function rivalMessage(observation) {
  return `<match>\n${JSON.stringify(observation)}\n</match>`;
}
