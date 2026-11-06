// The three bosses that end Blade March and Twin Sights. A boss is pure logic like a template: it
// knows its parts, its moods and its attacks, and each game says how its own moves answer them.
// A slot is whatever a game calls one of its four directions, so a boss works in both games.
import { REACTION_MS } from "./shared.js";

export const MIN_WARN_MS = 900;
export const DEFEND_MS = 760; // how long one guard or one jump covers the player
const BLOW_MS = 380; // a body cannot swing faster than this, so a held key should not either
const WAKE_MS = 2400;
const DIVE_MS = 1900;
const PHASES = 3;

// Where each part sits on the figure, in a box from -1 to 1, in the order they are knocked out. The
// king's own head is last, so the fight ends looking him in the eye.
// Ravana's heads sit side by side either side of his own in a slight arch, dipping toward the shoulders,
// with one more crowned above the middle. The outer ones go first.
const ARCH = (x) => [x, -0.25 - 0.12 * x * x];
const HEADS = [ARCH(-1), ARCH(1), ARCH(-0.75), ARCH(0.75), ARCH(-0.5), ARCH(0.5), ARCH(-0.25), ARCH(0.25), [0.01, 0.25], [0.01, -0.3]];
const GIANT_MARKS = [[-0.9, 0.1, "hand_l"], [0.9, 0.1, "hand_r"], [-0.4, -0.8, "calf_l"], [0.4, -0.8, "calf_r"], [0.01, -0.15, "spine_02"], [-0.01, 0.85, "head"]];
const STORM_KNOTS = [[-0.8, -0.5], [0.8, -0.4], [-0.55, 0.4], [0.55, 0.5], [0.01, 0.85]];

const ATTACKS = {
  sweep: { answer: "defend", warn: 1 },
  slam: { answer: "defend", warn: 1.35 },
  wave: { answer: "defend", warn: 1.15 },
  volley: { answer: "strike", warn: 1 },
};

// Phases follow the parts lost, so a boss gets meaner as it comes apart.
export const BOSSES = [
  {
    id: "ravana", name: "Ravana", parts: HEADS, toughness: 1, opening: "enter", openingMs: 3000, exposed: ["idle", "windup"], stunMs: 0,
    restMs: [2300, 1800, 1300], patterns: [["sweep", "volley"], ["volley", "sweep", "volley"], ["volley", "volley", "sweep"]],
  },
  {
    id: "kumbhakarna", name: "Kumbhakarna", parts: GIANT_MARKS, toughness: 1.5, opening: "sleep", openingMs: 8000, exposed: ["sleep", "stun"], stunMs: 3200,
    restMs: [2400, 2000, 1700], patterns: [["slam"], ["slam", "slam", "volley"], ["slam", "volley"]],
  },
  {
    id: "serpent", name: "Monsoon Serpent", parts: STORM_KNOTS, toughness: 1.5, opening: "enter", openingMs: 2800, exposed: ["idle", "windup", "stun"], stunMs: 1200, dives: true,
    restMs: [2200, 1800, 1400], patterns: [["wave", "volley"], ["volley", "wave"], ["wave", "volley", "volley"]],
  },
];

export const BOSS_TUNING = {
  boss: { label: "Boss (1 Ravana, 2 Kumbhakarna, 3 Monsoon Serpent)", unit: "", min: 1, max: 3, default: 1, higherIsHarder: false, whole: true },
  bossHealth: { label: "Hits for each boss part", unit: "", min: 1, max: 4, default: 2, higherIsHarder: true, whole: true },
  bossWarnMs: { label: "Warning before a boss attack", unit: "ms", min: MIN_WARN_MS, max: 2400, default: 1400, higherIsHarder: false, whole: true },
};

const bossInfo = (boss) => BOSSES.find((item) => item.id === boss.id);
export const isExposed = (boss) => bossInfo(boss).exposed.includes(boss.mood);
export const openPart = (boss) => boss.parts[boss.open];
export const bossHealthLeft = (boss) => boss.parts.reduce((sum, part) => sum + part.hp, 0) / boss.parts.reduce((sum, part) => sum + part.maxHp, 0);

export function createBoss(number, { health, warnMs, slots, slotFor, rng }) {
  const info = BOSSES[number - 1];
  const hp = Math.ceil(health * info.toughness);
  return {
    id: info.id, name: info.name, mood: info.opening, moodMs: info.openingMs, ms: 0, phase: 0, turn: 0, restMs: 1200, blowMs: 0, defendMs: 0, warnMs, slots, rng, attack: null, open: 0,
    parts: info.parts.map(([x, y, bone], index) => ({ id: index, x, y, bone: bone ?? null, slot: slotFor(x, y), hp, maxHp: hp })),
  };
}

function startAttack(boss) {
  const info = bossInfo(boss);
  const pattern = info.patterns[boss.phase];
  const kind = pattern[boss.turn % pattern.length];
  boss.turn += 1;
  const { answer, warn } = ATTACKS[kind];
  boss.attack = { kind, answer, slot: boss.rng.pick(boss.slots), ms: 0, warnMs: Math.max(MIN_WARN_MS, Math.round(boss.warnMs * warn)) };
  boss.mood = "windup";
  return { type: "boss_windup", kind, answer, slot: boss.attack.slot, warnMs: boss.attack.warnMs };
}

function settle(boss, { stunned }) {
  const info = bossInfo(boss);
  boss.attack = null;
  boss.restMs = info.restMs[boss.phase];
  boss.mood = stunned && info.stunMs ? "stun" : "idle";
  boss.moodMs = stunned ? info.stunMs : Math.round(info.stunMs * 0.6);
  if (info.stunMs && !stunned) boss.mood = "stun"; // a giant is still slow to recover from a slam that lands
}

// Returns events. boss_strike means the attack landed on the player.
export function stepBoss(boss, dtMs) {
  const events = [];
  boss.ms += dtMs;
  boss.blowMs = Math.max(0, boss.blowMs - dtMs);
  boss.defendMs = Math.max(0, boss.defendMs - dtMs);
  if (boss.mood === "fallen") return events;
  if (["enter", "sleep", "wake", "stun", "dive"].includes(boss.mood)) {
    boss.moodMs -= dtMs;
    if (boss.moodMs > 0) return events;
    if (boss.mood === "sleep") {
      boss.mood = "wake";
      boss.moodMs = WAKE_MS;
      events.push({ type: "boss_wake" });
      return events;
    }
    boss.mood = "idle";
    events.push({ type: "boss_ready" });
    return events;
  }
  if (boss.attack) {
    const { attack } = boss;
    attack.ms += dtMs;
    if (attack.ms < attack.warnMs) return events;
    const covered = attack.answer === "defend" && boss.defendMs > 0;
    events.push({ type: covered ? "boss_blocked" : "boss_strike", kind: attack.kind, slot: attack.slot });
    settle(boss, { stunned: covered });
    return events;
  }
  boss.restMs -= dtMs;
  if (boss.restMs <= 0) events.push(startAttack(boss));
  return events;
}

export function defendBoss(boss) {
  boss.defendMs = DEFEND_MS;
}

// A strike at a slot: it knocks a volley out of the air first, or else lands on the open part.
export function hitBoss(boss, slot, { force = false, damage = 1 } = {}) {
  if (boss.mood === "fallen") return [];
  const { attack } = boss;
  if (attack?.answer === "strike" && (attack.slot === slot || force)) {
    const events = [{ type: "boss_parry", kind: attack.kind, slot: attack.slot }];
    settle(boss, { stunned: false });
    boss.mood = "idle"; // a parried volley leaves no recovery, only the next rest
    if (!force) return events;
  }
  if (!isExposed(boss)) return [{ type: "boss_shrug", slot }];
  const part = openPart(boss);
  if (!force && (boss.blowMs > 0 || part.slot !== slot)) return [];
  boss.blowMs = BLOW_MS;
  part.hp = Math.max(0, part.hp - damage);
  const events = [{ type: "boss_hit", part: part.id, slot: part.slot, left: part.hp }];
  if (boss.mood === "sleep") boss.moodMs = Math.min(boss.moodMs, 700);
  if (part.hp > 0) return events;
  events.push({ type: "boss_part", part: part.id });
  const next = boss.parts.findIndex((item) => item.hp > 0);
  if (next === -1) {
    boss.mood = "fallen";
    boss.attack = null;
    events.push({ type: "boss_down" });
    return events;
  }
  boss.open = next;
  const lost = boss.parts.length - boss.parts.filter((item) => item.hp > 0).length;
  boss.phase = Math.min(PHASES - 1, Math.floor((lost / boss.parts.length) * PHASES));
  if (bossInfo(boss).dives && !boss.attack && boss.mood !== "sleep") {
    boss.mood = "dive";
    boss.moodMs = DIVE_MS;
    events.push({ type: "boss_dive" });
  }
  return events;
}

// What a good player would do about this boss right now: "defend", a slot, or nothing.
export function bossWants(boss, skill) {
  const { attack } = boss;
  if (attack?.answer === "strike") return attack.slot;
  if (attack?.answer === "defend" && attack.warnMs - attack.ms <= REACTION_MS[skill] + DEFEND_MS * 0.5) return "defend";
  return isExposed(boss) && boss.blowMs <= 0 ? openPart(boss).slot : null;
}

// The words on the HUD, in terms of what the boss is doing rather than which key answers it.
export const bossCall = (boss, say) => {
  if (boss.attack?.answer === "defend") return say.defend;
  if (boss.attack) return say.strike(boss.attack.slot);
  if (boss.mood === "sleep") return say.sleeping(openPart(boss).slot);
  if (isExposed(boss)) return say.strike(openPart(boss).slot);
  return null;
};
