// The Counter Bout rival's brain. 0G sees the fight and plans the next shots. The game only throws
// what was planned, so every shot traces back to a request ID.
const text = { type: "string" };

export const RIVAL_SCHEMA = {
  type: "object",
  properties: {
    plan: { type: "array", items: { type: "string", enum: ["left", "right", "high"] } },
    taunt: text,
    read: text,
  },
  required: ["plan", "taunt", "read"],
  additionalProperties: false,
};

export const RIVAL_SYSTEM = `You are the rival boxer in Counter Bout, a game the player plays with their body.
You throw three shots: "left" (a hook at the player's left, so they must step right), "right" (step left) and "high" (duck).
A shot the player reads opens you up to double damage, so pick shots they are failing to read.
You get the fight so far as JSON. lastShots lists your recent shots, oldest first, and whether the player dodged each.

Return JSON:
- plan: your next 3 shots, in order. Lean on the side the player misses most, but mix in one other so they can't settle.
- taunt: one short line of trash talk, under 8 words, that fits what just happened. No slurs.
- read: under 12 words on the player's weakness, for the log.`;

const SIDES = ["left", "right", "high"];
const whole = (value, max) => (Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0);

// Only these fields, as numbers and known sides, reach the model. Anything else the browser sends is
// dropped, so the route can't be used to send free text to a paid model.
export function cleanObservation(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.lastShots)) return null;
  return {
    secondsLeft: whole(raw.secondsLeft, 600),
    playerHealth: whole(raw.playerHealth, 100),
    rivalHealth: whole(raw.rivalHealth, 100),
    knockdowns: whole(raw.knockdowns, 3),
    queued: whole(raw.queued, 4),
    lastShots: raw.lastShots
      .filter((shot) => SIDES.includes(shot?.side))
      .slice(-8)
      .map((shot) => ({ side: shot.side, dodged: shot.dodged === true })),
  };
}

export function rivalMessage(observation) {
  return `<fight>\n${JSON.stringify(observation)}\n</fight>`;
}
