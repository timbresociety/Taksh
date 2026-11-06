// Chop Shop: fruit flies up off a street stall and fast hands cut it. Firecrackers must be left alone.
// The field runs from -1 to 1 each way with y up, the same as a hand's aim, so the view can place a
// fruit exactly where a hand sees it.
import { clamp, createRandom } from "./shared.js";

export const FRUIT = {
  mango: { radius: 0.1, points: 10 },
  coconut: { radius: 0.1, points: 15 },
  watermelon: { radius: 0.15, points: 10 },
  pineapple: { radius: 0.12, points: 20 },
};
const KINDS = Object.keys(FRUIT);
const BOMB_RADIUS = 0.09;
const GRAVITY = 2.1;
const STALL_Y = -0.3;
const SCREEN_RATIO = 16 / 9; // the field is wider than it is tall, and a cut should feel round
const HAND_RADIUS = 0.05;
const SPEED_WINDOW_MS = 110; // long enough that one jittery camera frame is not a slice
const HAND_LOST_MS = 300;
const SLASH_REACH = 0.42; // a slash read from the body forgives a hand that only came close
const SWIPE_MS = 350;
const VISIBLE_Y = -0.2;

const newHand = () => ({ x: 0, y: 0, speed: 0, live: false, seenAt: -Infinity, samples: [] });

function toss(state) {
  const { rng } = state;
  const bomb = rng.next() * 100 < state.bombChance;
  const kind = bomb ? "bomb" : rng.pick(KINDS);
  const x = rng.range(-0.72, 0.72);
  const apex = rng.range(0.35, 0.85);
  state.items.push({
    id: state.nextId++, kind, bomb, x, y: STALL_Y, radius: bomb ? BOMB_RADIUS : FRUIT[kind].radius,
    vx: rng.range(0.05, 0.3) * -Math.sign(x), vy: Math.sqrt(2 * GRAVITY * (apex - STALL_Y)), spin: rng.range(-5, 5), turn: rng.range(0, 6.28),
  });
  if (bomb) state.bombs += 1;
  else state.tossed += 1;
}

// How far an item sits from a stroke of the hand, measured as the eye would see it.
function strokeGap(item, from, to) {
  const ax = from.x * SCREEN_RATIO;
  const bx = to.x * SCREEN_RATIO;
  const px = item.x * SCREEN_RATIO;
  const dx = bx - ax;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const along = length ? clamp(((px - ax) * dx + (item.y - from.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * along), item.y - (from.y + dy * along));
}

function cut(state, item, angle, side) {
  state.items = state.items.filter((other) => other !== item);
  if (item.bomb) {
    state.lives -= 1;
    state.blasts += 1;
    state.combo = 0;
    state.invincibleMs = 500;
    state.queue.push({ type: "blast", x: item.x, y: item.y });
    state.queue.push({ type: "hurt" });
    return;
  }
  state.cut += 1;
  state.combo += 1;
  state.best = Math.max(state.best, state.combo);
  state.swipeCount = state.swipeMs > 0 ? state.swipeCount + 1 : 1;
  state.swipeMs = SWIPE_MS;
  state.score += FRUIT[item.kind].points * (1 + Math.min(state.combo, 10) * 0.2) * state.swipeCount;
  state.score = Math.round(state.score);
  state.queue.push({ type: "cut", kind: item.kind, x: item.x, y: item.y, vx: item.vx, vy: item.vy, angle, side, count: state.swipeCount });
}

export default {
  id: "chop",
  name: "Chop Shop",
  pitch: "Swipe your hands through the fruit flying off the stall, and leave the firecrackers alone.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "upper",
  score: "fruit",
  actions: [{ id: "slice", label: "Slice", key: " ", keyLabel: "Space" }],
  bindings: [
    { gesture: "slash_left", action: "slice", exercise: "Slash" },
    { gesture: "slash_right", action: "slice", exercise: "Slash" },
    { gesture: "slash_up", action: "slice", exercise: "Slash" },
    { gesture: "slash_down", action: "slice", exercise: "Slash" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    tossMs: { label: "Time between tosses", unit: "ms", min: 500, max: 2200, default: 1200, higherIsHarder: false, whole: true },
    bombChance: { label: "Share of firecrackers", unit: "%", min: 0, max: 40, default: 15, higherIsHarder: true, whole: true },
    handSpeed: { label: "Hand speed needed to cut", unit: "", min: 1, max: 4, default: 1.8, higherIsHarder: true },
    lives: { label: "Lives", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, tossMs, bombChance, handSpeed, lives } = spec.tuning;
    return {
      status: "playing", t: 0, durationMs: durationS * 1000, tossMs, bombChance, handSpeed, lives, startLives: lives, rng: createRandom(spec.seed),
      nextTossMs: 900, items: [], nextId: 1, hands: { left: newHand(), right: newHand() }, queue: [], invincibleMs: 0, swipeMs: 0, swipeCount: 0,
      tossed: 0, bombs: 0, cut: 0, dropped: 0, blasts: 0, swings: 0, combo: 0, best: 0, score: 0,
    };
  },

  // Hand positions arrive between steps, so anything they cause is queued for the next step to report.
  // Speed is taken over a short path rather than one frame, and only a moving hand ever cuts.
  aim(state, hands) {
    if (state.status !== "playing") return;
    for (const side of ["left", "right"]) {
      const at = hands[side];
      const hand = state.hands[side];
      if (!at) {
        hand.live = false;
        hand.speed = 0;
        hand.samples = [];
        continue;
      }
      const last = hand.samples.at(-1);
      if (last?.t === state.t) hand.samples.pop();
      hand.samples.push({ x: at.x, y: at.y, t: state.t });
      hand.samples = hand.samples.filter((sample) => state.t - sample.t <= SPEED_WINDOW_MS);
      const path = hand.samples.reduce((sum, sample, index) => (index ? sum + Math.hypot((sample.x - hand.samples[index - 1].x) * SCREEN_RATIO, sample.y - hand.samples[index - 1].y) : 0), 0);
      const seconds = (hand.samples.at(-1).t - hand.samples[0].t) / 1000;
      hand.speed = seconds > 0 ? path / seconds : 0;
      hand.x = at.x;
      hand.y = at.y;
      hand.live = true;
      hand.seenAt = state.t;
      if (!last || hand.speed < state.handSpeed) continue;
      const angle = Math.atan2(at.y - last.y, (at.x - last.x) * SCREEN_RATIO);
      for (const item of [...state.items]) {
        if (strokeGap(item, last, at) <= item.radius + HAND_RADIUS && (!item.bomb || state.invincibleMs <= 0)) cut(state, item, angle, side);
      }
    }
  },

  act(state, action) {
    if (action !== "slice") return [];
    state.swings += 1;
    const hands = Object.values(state.hands).filter((hand) => hand.live);
    const fruit = state.items.filter((item) => !item.bomb && item.y > VISIBLE_Y);
    // With no hand on screen the nearest fruit goes. With one, a slash only reaches what is near it,
    // or a move read from the body would cut across the whole stall.
    const from = hands.length ? hands : [{ x: 0, y: -0.2 }];
    const gap = (item) => Math.min(...from.map((hand) => strokeGap(item, hand, hand)));
    const target = fruit.sort((a, b) => gap(a) - gap(b))[0];
    if (!target || (hands.length && gap(target) > SLASH_REACH)) return [{ type: "swing" }];
    cut(state, target, Math.PI / 4, hands.length ? null : "key");
    return state.queue.splice(0);
  },

  step(state, dtMs) {
    const events = state.queue.splice(0);
    const dt = dtMs / 1000;
    state.t += dtMs;
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);
    state.swipeMs = Math.max(0, state.swipeMs - dtMs);
    for (const hand of Object.values(state.hands)) if (hand.live && state.t - hand.seenAt > HAND_LOST_MS) hand.live = false;
    state.nextTossMs -= dtMs;
    if (state.nextTossMs <= 0 && state.t < state.durationMs - 1500) {
      state.nextTossMs = state.tossMs * state.rng.range(0.8, 1.2);
      const salvo = 1 + (state.rng.next() < Math.min(0.6, state.t / state.durationMs) ? 1 + state.rng.int(2) : 0);
      for (let i = 0; i < salvo; i += 1) toss(state);
      events.push({ type: "toss", count: salvo });
    }
    for (const item of state.items) {
      item.vy -= GRAVITY * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.turn += item.spin * dt;
    }
    for (const item of state.items.filter((entry) => entry.y < STALL_Y && entry.vy < 0)) {
      if (item.bomb) continue;
      state.dropped += 1;
      state.combo = 0;
      events.push({ type: "drop", kind: item.kind });
    }
    state.items = state.items.filter((item) => item.y >= STALL_Y || item.vy > 0);
    if (state.lives <= 0 || state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, lives: state.lives, maxLives: state.startLives, extra: state.combo > 1 ? `${state.combo} in a row` : null }),

  result: (state) => ({
    outcome: state.lives <= 0 ? "lose" : state.cut >= state.tossed * 0.6 ? "win" : "complete",
    score: state.score,
    stats: [
      { label: "Fruit cut", value: state.cut },
      { label: "Dropped", value: state.dropped },
      { label: "Best run", value: state.best },
      { label: "Firecrackers hit", value: state.blasts },
    ],
  }),

  bot: (state) => (state.items.some((item) => !item.bomb && item.y > VISIBLE_Y) ? "slice" : null),
};
