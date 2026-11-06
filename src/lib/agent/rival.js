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
You throw three shots: "left" (the player must lean right), "right" (lean left) and "high" (duck).
A shot the player reads opens you up to double damage, so pick shots they are failing to read.
You get the fight so far as JSON. lastShots lists your recent shots, oldest first, and whether the player dodged each.

Return JSON:
- plan: your next 3 shots, in order. Lean on the side the player misses most, but mix in one other so they can't settle.
- taunt: one short line of trash talk, under 8 words, that fits what just happened. No slurs.
- read: under 12 words on the player's weakness, for the log.`;

export function rivalMessage(observation) {
  return `<fight>\n${JSON.stringify(observation)}\n</fight>`;
}
