// Rangoli Breaker: a brass ball breaks a rangoli laid out in tiles of coloured powder. Each hand slides
// its own tray along the bottom of the screen, and with one hand there is one tray. Tiles sit in rings
// rather than rows, so everything is a circle: a bounce leaves a tile the way a ball leaves a ball.
import { SCREEN_RATIO } from "./chop.js";
import { aimCursors, cursorGap, handsOnScreen, liveCursors, newCursors, placeCursor, settleCursors } from "./cursors.js";
import { REACTION_MS, clamp, createRandom } from "./shared.js";

export const WALL_X = 0.68; // the courtyard, narrower than the screen so the ball stays on the pattern
export const ROOF_Y = 0.78;
export const TRAY_Y = -0.7;
export const BALL_RADIUS = 0.05;
export const CENTRE = { x: 0, y: 0.2 };
const FLOOR_Y = -1.1;
const SERVE_MS = 1100;
const FINALE_MS = 2200;
const REST_MS = 1500;
const NUDGE = 0.24;
const MAX_TURN = 1.05; // the steepest a tray's edge can send the ball, in radians from straight up
const CARRY = 0.7;
const TRAY_SCATTER = 0.14;
const MIN_RISE = 0.34; // a ball never settles into crossing the screen flat
const STEP_REACH = 0.03; // the ball moves in slices no longer than this, so it can't skip a tile
const SPEED_UP = 0.1; // each new pattern is a little quicker
const CLEAR_SHARE = 0.8; // the last few tiles are a hunt, not a game, so they go with the rest
const GARLAND_MS = 9000;
const GARLAND_WIDTH = 1.5;
const GARLAND_FALL = 0.5;
const GARLAND_RADIUS = 0.08;
const HAND_RADIUS = 0.1;

// A ring is [radius, tiles, turn in tiles, tile radius, hits to break], and marigold tiles drop a garland
// that widens the trays. Tone picks a colour from the view's powder box.
export const PATTERNS = [
  { name: "Lotus", rings: [[0, 1, 0, 0.07, 1], [0.16, 6, 0, 0.065, 1], [0.31, 10, 0.5, 0.065, 1], [0.46, 14, 0, 0.06, 1]], marigold: [8, 14] },
  { name: "Star", rings: [[0, 1, 0, 0.08, 2], [0.15, 5, 0.25, 0.065, 1], [0.3, 5, 0.25, 0.07, 1], [0.3, 5, 0.75, 0.05, 1], [0.46, 5, 0.25, 0.075, 2], [0.42, 10, 0, 0.05, 1]], marigold: [3, 9, 18] },
  { name: "Peacock", rings: [[0.1, 4, 0.5, 0.06, 2], [0.22, 8, 0, 0.06, 1], [0.34, 12, 0.5, 0.06, 1], [0.47, 16, 0, 0.055, 1], [0.47, 8, 0.25, 0.04, 2]], marigold: [6, 20, 28] },
];

// The seed picks the first pattern, so two rounds don't start the same way.
export const patternOf = (state) => PATTERNS[(state.first + state.pattern) % PATTERNS.length];

function layPattern(state) {
  const { rings, marigold } = patternOf(state);
  state.tiles = [];
  rings.forEach(([radius, count, turn, size, hits], tone) => {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI / 2 + ((i + turn) / count) * Math.PI * 2;
      state.tiles.push({
        id: state.nextId++, tone, radius: size, hp: hits, maxHp: hits, marigold: marigold.includes(state.tiles.length),
        x: CENTRE.x + (Math.cos(angle) * radius) / SCREEN_RATIO, y: CENTRE.y + Math.sin(angle) * radius,
      });
    }
  });
  state.laid = state.tiles.length;
  state.speed = state.startSpeed + state.pattern * SPEED_UP;
  state.serveMs = SERVE_MS;
}

const halfWidth = (state) => state.trayWidth * (state.garlandMs > 0 ? GARLAND_WIDTH : 1);

// One tray for each hand in view. With none, the last one stays where it was left.
export function traysOf(state) {
  const sides = liveCursors(state);
  const half = halfWidth(state);
  return (sides.length ? sides : ["right"]).map((side) => ({ side, x: clamp(state.cursors[side].x, half - WALL_X, WALL_X - half), half }));
}

function serve(state) {
  const { rng } = state;
  const [tray] = traysOf(state);
  const turn = rng.range(0.35, 0.6) * (rng.next() < 0.5 ? -1 : 1);
  state.balls.push({ id: state.nextId++, x: tray.x, y: TRAY_Y + BALL_RADIUS, vx: Math.sin(turn) * state.speed, vy: Math.cos(turn) * state.speed });
}

function breakTile(state, tile, events) {
  tile.hp -= 1;
  state.combo += 1;
  state.best = Math.max(state.best, state.combo);
  state.score += Math.round(20 * (1 + Math.min(state.combo, 12) * 0.15));
  if (tile.hp > 0) {
    events.push({ type: "crack", id: tile.id, x: tile.x, y: tile.y, tone: tile.tone });
    return;
  }
  state.tiles = state.tiles.filter((item) => item !== tile);
  state.broken += 1;
  events.push({ type: "tile", id: tile.id, x: tile.x, y: tile.y, tone: tile.tone, count: state.combo });
  if (tile.marigold) state.garlands.push({ id: state.nextId++, x: tile.x, y: tile.y, kind: "garland" });
}

function bounceOffTiles(state, ball, events) {
  for (const tile of state.tiles) {
    const dx = (ball.x - tile.x) * SCREEN_RATIO;
    const dy = ball.y - tile.y;
    const gap = Math.hypot(dx, dy) || 0.001;
    if (gap > BALL_RADIUS + tile.radius) continue;
    const [nx, ny] = [dx / gap, dy / gap];
    const along = ball.vx * nx + ball.vy * ny;
    if (along >= 0) continue;
    ball.vx -= 2 * along * nx;
    ball.vy -= 2 * along * ny;
    breakTile(state, tile, events);
    return;
  }
}

function bounceOffTrays(state, ball, events) {
  if (ball.vy >= 0 || ball.y - BALL_RADIUS > TRAY_Y || ball.y < TRAY_Y - 0.08) return;
  const tray = traysOf(state).find((item) => Math.abs(ball.x - item.x) <= item.half + BALL_RADIUS / SCREEN_RATIO);
  if (!tray) return;
  // A ball keeps some of the way it was going, so a tray held dead under it doesn't send it back down the same gap.
  const turn = clamp((ball.x - tray.x) / tray.half, -1, 1) * MAX_TURN + Math.asin(clamp(ball.vx / state.speed, -1, 1)) * CARRY + state.rng.range(-TRAY_SCATTER, TRAY_SCATTER);
  ball.vx = Math.sin(clamp(turn, -MAX_TURN, MAX_TURN)) * state.speed;
  ball.vy = Math.cos(clamp(turn, -MAX_TURN, MAX_TURN)) * state.speed;
  ball.y = TRAY_Y + BALL_RADIUS;
  state.combo = 0;
  state.bounces += 1;
  events.push({ type: "bounce", side: tray.side, x: ball.x });
}

function moveBall(state, ball, dt, events) {
  const slices = Math.ceil((state.speed * dt) / STEP_REACH);
  for (let i = 0; i < slices; i += 1) {
    const slice = dt / slices;
    ball.x += (ball.vx * slice) / SCREEN_RATIO;
    ball.y += ball.vy * slice;
    if (Math.abs(ball.x) > WALL_X) {
      ball.x = Math.sign(ball.x) * WALL_X;
      ball.vx = -ball.vx;
      events.push({ type: "wall" });
    }
    if (ball.y > ROOF_Y) {
      ball.y = ROOF_Y;
      ball.vy = -Math.abs(ball.vy);
      events.push({ type: "wall" });
    }
    bounceOffTiles(state, ball, events);
    bounceOffTrays(state, ball, events);
  }
  // Keep the pace, and never let the ball run flat for long.
  const pace = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx *= state.speed / pace;
  ball.vy *= state.speed / pace;
  if (Math.abs(ball.vy) < state.speed * MIN_RISE) {
    ball.vy = (ball.vy < 0 ? -1 : 1) * state.speed * MIN_RISE;
    ball.vx = Math.sign(ball.vx || 1) * Math.sqrt(state.speed ** 2 - ball.vy ** 2);
  }
}

function moveGarlands(state, dt, events) {
  for (const garland of state.garlands) garland.y -= GARLAND_FALL * dt;
  const caught = (garland) => {
    const byTray = Math.abs(garland.y - TRAY_Y) < GARLAND_RADIUS && traysOf(state).some((tray) => Math.abs(garland.x - tray.x) <= tray.half);
    return byTray || liveCursors(state).some((side) => cursorGap(garland, state.cursors[side]) <= GARLAND_RADIUS + HAND_RADIUS);
  };
  for (const garland of state.garlands.filter(caught)) {
    garland.y = -9;
    state.garlandMs = GARLAND_MS;
    state.score += 50;
    events.push({ type: "garland", x: garland.x });
  }
  state.garlands = state.garlands.filter((garland) => garland.y > FLOOR_Y);
}

// Where the ball will reach the trays if nothing else touches it, folded back off the walls.
function landingX(ball) {
  const flight = (ball.y - TRAY_Y) / -ball.vy;
  const span = WALL_X * 2;
  const run = (((ball.x + (ball.vx / SCREEN_RATIO) * flight + WALL_X) % (span * 2)) + span * 2) % (span * 2);
  return (run > span ? span * 2 - run : run) - WALL_X;
}

export default {
  id: "rangoli",
  name: "Rangoli Breaker",
  pitch: "Slide a tray along the floor with each hand to keep the brass ball alive until it breaks the whole rangoli.",
  kind: "Arms",
  space: "Stand up",
  length: "2 min",
  framing: "upper",
  score: "tiles",
  actions: [
    { id: "left", label: "Tray left", key: "ArrowLeft", keyLabel: "←" },
    { id: "right", label: "Tray right", key: "ArrowRight", keyLabel: "→" },
  ],
  bindings: [
    { gesture: "slash_left", action: "left", exercise: "Hand swipe left" },
    { gesture: "slash_right", action: "right", exercise: "Hand swipe right" },
  ],
  tuning: {
    patterns: { label: "Patterns to break", unit: "", min: 1, max: 3, default: 2, higherIsHarder: true, whole: true },
    ballSpeed: { label: "Ball speed", unit: "", min: 0.8, max: 1.8, default: 1.1, higherIsHarder: true },
    trayWidth: { label: "Half a tray's width", unit: "", min: 0.1, max: 0.32, default: 0.19, higherIsHarder: false },
    lives: { label: "Lives", unit: "", min: 1, max: 6, default: 4, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { patterns, ballSpeed, trayWidth, lives } = spec.tuning;
    const rng = createRandom(spec.seed);
    const state = {
      status: "playing", t: 0, first: rng.int(PATTERNS.length), pattern: 0, patterns, startSpeed: ballSpeed, speed: ballSpeed, trayWidth, lives, startLives: lives, rng,
      tiles: [], balls: [], garlands: [], cursors: newCursors(), nextId: 1, laid: 0, serveMs: 0, restMs: 0, garlandMs: 0, finaleMs: 0, won: false,
      broken: 0, bounces: 0, dropped: 0, combo: 0, best: 0, score: 0,
    };
    layPattern(state);
    return state;
  },

  // The tray follows its hand's x and nothing else, so practice slides it to marks on the floor.
  handCursors: {
    lesson: {
      kind: "slide",
      label: "Slide the tray",
      cue: "Each hand has a tray on the floor. Slide it left and right to the mark of its colour.",
      mouseCue: "The tray follows the mouse. Slide it to each mark.",
      half: 0.19, // the default tray
      dots: [{ hand: "left", x: -0.4, y: TRAY_Y }, { hand: "right", x: 0.4, y: TRAY_Y }, { hand: null, x: 0, y: TRAY_Y }],
    },
    keys: { left: "← slides the tray left.", right: "→ slides the tray right." },
    controls: { left: "Slide a hand left", right: "Slide a hand right" },
  },
  aim: aimCursors,

  // A hand on screen already is the tray, so a swipe read from it needs nothing more.
  act(state, action) {
    if ((action !== "left" && action !== "right") || handsOnScreen(state).length) return [];
    const { x, y } = state.cursors.right;
    placeCursor(state, clamp(x + (action === "left" ? -NUDGE : NUDGE), -WALL_X, WALL_X), y);
    return [];
  },

  step(state, dtMs) {
    const events = [];
    const dt = dtMs / 1000;
    state.t += dtMs;
    state.garlandMs = Math.max(0, state.garlandMs - dtMs);

    if (state.finaleMs > 0) {
      state.finaleMs -= dtMs;
      settleCursors(state);
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (state.restMs > 0) {
      state.restMs -= dtMs;
      settleCursors(state);
      if (state.restMs <= 0) {
        state.pattern += 1;
        layPattern(state);
        events.push({ type: "pattern", pattern: state.pattern, name: patternOf(state).name });
      }
      return events;
    }

    if (!state.balls.length) {
      state.serveMs -= dtMs;
      if (state.serveMs <= 0) {
        serve(state);
        events.push({ type: "serve" });
      }
    }
    for (const ball of state.balls) moveBall(state, ball, dt, events);
    moveGarlands(state, dt, events);
    settleCursors(state);

    for (const ball of state.balls.filter((item) => item.y < FLOOR_Y)) {
      state.dropped += 1;
      events.push({ type: "fall", x: ball.x });
    }
    state.balls = state.balls.filter((ball) => ball.y >= FLOOR_Y);
    if (!state.balls.length && state.serveMs <= 0) {
      state.lives -= 1;
      state.combo = 0;
      state.serveMs = SERVE_MS;
      events.push({ type: "hurt", cause: "ball" });
    }

    if (state.tiles.length <= state.laid * (1 - CLEAR_SHARE)) {
      const rest = state.tiles.splice(0);
      state.broken += rest.length;
      state.score += rest.length * 20 + 300;
      state.balls = [];
      state.garlands = [];
      events.push({ type: "cleared", tiles: rest.map(({ x, y, tone }) => ({ x, y, tone })) });
      if (state.pattern + 1 < state.patterns) state.restMs = REST_MS;
      else {
        state.won = true;
        state.score += state.lives * 300;
        state.finaleMs = FINALE_MS;
      }
    }

    if (state.lives <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({
    score: state.score, label: "Score", lives: state.lives, maxLives: state.startLives,
    clock: `${patternOf(state).name} ${state.pattern + 1} of ${state.patterns}`,
    extra: state.garlandMs > 0 ? "Wide tray" : state.combo > 3 ? `${state.combo} in a row` : null,
  }),

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Tiles broken", value: state.broken },
      { label: "Patterns done", value: state.pattern + (state.won ? 1 : 0) },
      { label: "Best run", value: state.best },
      { label: "Balls lost", value: state.dropped },
    ],
  }),

  bot(state, skill) {
    const ball = [...state.balls].sort((a, b) => a.y - b.y)[0];
    if (!ball) return null;
    const falling = ball.vy < 0;
    // A quick player reads the bounce off the wall; a casual one follows the ball.
    const landing = falling && skill === "quick" && ball.y < CENTRE.y - 0.45 ? landingX(ball) : ball.x;
    const goal = skill === "quick" ? landing + Math.sign(landing) * state.trayWidth * 0.4 : landing; // caught off centre, it goes back at the pattern
    const { x } = state.cursors.right;
    if (Math.abs(goal - x) <= state.trayWidth * (REACTION_MS[skill] > 300 ? 0.8 : 0.6)) return null;
    return goal < x ? "left" : "right";
  },
};
