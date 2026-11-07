// Cardio Circuit: the coach calls one exercise at a time from the whole library, and every rep thumps
// Aalsi Raja, the Couch King. A set that runs out of time lets him sink back into his cushions. Moves
// that aren't being called are ignored, because a body doing one exercise honestly trips others.
import { createRandom, moveCue } from "./shared.js";

export const BOSS_NAME = "Aalsi Raja";
const HEAL = 0.25; // of one set, when a set runs out
const WIN_SHARE = 0.85; // a player can drop a few sets and still knock him out
const FINALE_MS = 3000;
const FIRST_REST_MS = 1500;
const BODY_MS = 450; // a limb cannot finish a rep any sooner, so a held key should not either
const BEAT_MS = 150;
const SPEED_REPS = 4; // a fast move counts every beat, so a set of it takes more of them

// Each exercise is one action: its two sides share it, and a set counts both. level orders a round from
// warm-up to hardest, and hard moves take fewer reps for the same time.
export const EXERCISES = [
  { id: "step_side", label: "Side steps", moves: ["step_left", "step_right"], key: "e", level: 0 },
  { id: "reach", label: "Hand reaches", moves: ["reach_up_left", "reach_up_right"], key: "r", level: 0 },
  { id: "hands_up", label: "Both hands up", moves: ["hands_up"], key: "y", level: 0 },
  { id: "punch", label: "Punches", moves: ["punch_left", "punch_right"], key: "p", level: 0 },
  { id: "guard", label: "Guard up", moves: ["guard"], key: "g", level: 0 },
  { id: "curl", label: "Curls", moves: ["curl_left", "curl_right"], key: "c", level: 0 },
  { id: "twist", label: "Twists", moves: ["twist_left", "twist_right"], key: "w", level: 0 },
  { id: "run_step", label: "Run on the spot", moves: ["run_step"], key: "n", level: 0, beats: true },
  { id: "arm_pump", label: "Arm pumps", moves: ["arm_pump"], key: "a", level: 0, beats: true },
  { id: "bounce", label: "Rope skips", moves: ["bounce"], key: "b", level: 1, beats: true },
  { id: "lift", label: "Leg lifts", moves: ["lift_left", "lift_right"], key: "f", level: 1 },
  { id: "squat_down", label: "Squats", moves: ["squat_down"], key: "q", level: 1 },
  { id: "slash_side", label: "Side slashes", moves: ["slash_left", "slash_right"], key: "v", level: 1 },
  { id: "slash_high", label: "High and low slashes", moves: ["slash_up", "slash_down"], key: "d", level: 1 },
  { id: "step_jack", label: "Step jacks", moves: ["step_jack"], key: "k", level: 1 },
  { id: "butt_kick", label: "Butt kicks", moves: ["butt_kick_left", "butt_kick_right"], key: "h", level: 1 },
  { id: "toe_touch", label: "Toe touches", moves: ["toe_touch"], key: "t", level: 1 },
  { id: "wood_chop", label: "Wood chops", moves: ["wood_chop"], key: "o", level: 1 },
  { id: "jump", label: "Jumps", moves: ["jump"], key: " ", keyLabel: "Space", level: 2 },
  { id: "jumping_jack", label: "Jumping jacks", moves: ["jumping_jack"], key: "j", level: 2 },
  { id: "lunge", label: "Lunges", moves: ["lunge"], key: "l", level: 2, hard: true },
  { id: "side_lunge", label: "Side lunges", moves: ["side_lunge_left", "side_lunge_right"], key: "i", level: 2, hard: true },
  { id: "windmill", label: "Windmills", moves: ["windmill_left", "windmill_right"], key: "m", level: 2, hard: true },
  { id: "cross_crunch", label: "Cross crunches", moves: ["cross_crunch_left", "cross_crunch_right"], key: "x", level: 2, hard: true },
  { id: "skater", label: "Skaters", moves: ["skater_left", "skater_right"], key: "s", level: 2, hard: true },
  { id: "squat_jump", label: "Squat jumps", moves: ["squat_jump"], key: "u", level: 2, hard: true },
];

export const repsFor = (exercise, reps) => (exercise.beats ? reps * SPEED_REPS : exercise.hard ? Math.max(3, reps - 2) : reps);
const repGap = (exercise) => (exercise.beats ? BEAT_MS : BODY_MS);

// A round is a fair sample of the library, from gentle to hard, and a different one for each seed.
function dealRound(rng, sets) {
  const deck = [...EXERCISES];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, sets).sort((a, b) => a.level - b.level).map((exercise) => exercise.id);
}

export const exerciseInfo = (id) => EXERCISES.find((exercise) => exercise.id === id);
export const calledExercise = (state) => exerciseInfo(state.round[state.index]);

function startRest(state, ms) {
  state.phase = "rest";
  state.phaseMs = ms;
}

export default {
  id: "circuit",
  name: "Cardio Circuit",
  pitch: "Copy each exercise the coach calls, and every rep you count knocks the stuffing out of the Couch King.",
  kind: "Cardio",
  space: "Needs space",
  length: "4 min",
  framing: "full",
  score: "reps",
  teachesItsOwnMoves: true,
  actions: EXERCISES.map(({ id, label, key, keyLabel }) => ({ id, label, key, keyLabel: keyLabel ?? key.toUpperCase() })),
  bindings: EXERCISES.flatMap(({ id, label, moves }) => moves.map((gesture) => ({ gesture, action: id, exercise: label }))),
  tuning: {
    sets: { label: "Sets in the round", unit: "", min: 4, max: EXERCISES.length, default: 12, higherIsHarder: true, whole: true },
    reps: { label: "Reps in a set", unit: "", min: 3, max: 12, default: 6, higherIsHarder: true, whole: true },
    setMs: { label: "Time for a set", unit: "ms", min: 12000, max: 40000, default: 22000, higherIsHarder: false, whole: true },
    restMs: { label: "Rest and warning before a set", unit: "ms", min: 1800, max: 8000, default: 4000, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { sets, reps, setMs, restMs } = spec.tuning;
    const rng = createRandom(spec.seed);
    return {
      status: "playing", t: 0, rng, sets, reps, setMs, restMs, round: dealRound(rng, sets), index: 0, phase: "rest", phaseMs: FIRST_REST_MS + restMs,
      done: 0, repGapMs: 0, health: sets * WIN_SHARE, maxHealth: sets * WIN_SHARE, finaleMs: 0, won: false, totalReps: 0, setsDone: 0, setsMissed: 0, offCall: 0, streak: 0, best: 0, met: [], score: 0,
    };
  },

  act(state, action) {
    if (state.finaleMs > 0) return [];
    const exercise = calledExercise(state);
    if (!exercise || state.phase !== "set" || action !== exercise.id) {
      state.offCall += 1;
      return [];
    }
    if (state.repGapMs > 0) return [];
    state.repGapMs = repGap(exercise);
    const wanted = repsFor(exercise, state.reps);
    state.done += 1;
    state.totalReps += 1;
    state.streak += 1;
    state.best = Math.max(state.best, state.streak);
    state.score += exercise.beats ? 5 : 20;
    state.health = Math.max(0, state.health - 1 / wanted);
    const events = [{ type: "rep", exercise: exercise.id, done: state.done, wanted }];
    if (state.done >= wanted) {
      state.setsDone += 1;
      state.score += 100;
      state.index += 1;
      state.done = 0;
      events.push({ type: "set_done", exercise: exercise.id });
      startRest(state, state.restMs);
    }
    if (state.health <= 0.0001) {
      state.won = true;
      state.finaleMs = FINALE_MS;
      state.score += 1000;
      events.push({ type: "boss_down" });
    }
    return events;
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.repGapMs = Math.max(0, state.repGapMs - dtMs);

    if (state.finaleMs > 0) {
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (state.index >= state.round.length) {
      state.status = "ended";
      events.push({ type: "end" });
      return events;
    }

    state.phaseMs -= dtMs;
    if (state.phaseMs > 0) return events;
    if (state.phase === "rest") {
      const exercise = calledExercise(state);
      state.phase = "set";
      state.phaseMs = state.setMs;
      if (!state.met.includes(exercise.id)) state.met.push(exercise.id);
      events.push({ type: "call", exercise: exercise.id });
      return events;
    }
    state.setsMissed += 1;
    state.streak = 0;
    state.index += 1;
    state.done = 0;
    state.health = Math.min(state.maxHealth, state.health + HEAL);
    events.push({ type: "short" });
    startRest(state, state.restMs);
    return events;
  },

  hud(state) {
    const exercise = calledExercise(state);
    const wanted = exercise ? repsFor(exercise, state.reps) : 1;
    const left = Math.max(0, Math.ceil(state.phaseMs / 1000));
    return {
      score: state.score, label: "Score", clock: exercise ? `${left} s` : "Done", bars: [{ label: BOSS_NAME, value: state.health / state.maxHealth }],
      meter: state.phase === "set" ? state.done / wanted : 0, keys: exercise ? [exercise.id] : [],
      extra: state.won ? `${BOSS_NAME} is out` : !exercise ? "Round done" : state.phase === "rest" ? "Get ready" : `${state.done} of ${wanted}`,
      // The rest shows the next exercise early, so the player is in shape for it when the set starts.
      cue: exercise && !state.won && state.finaleMs <= 0 ? moveCue(exercise.moves, state.phase === "rest" ? 0 : 0.3, exercise.label) : null,
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : "complete",
    score: state.score,
    stats: [
      { label: "Reps", value: state.totalReps },
      { label: "Sets finished", value: `${state.setsDone} of ${state.sets}` },
      { label: "Moves met", value: state.met.length },
      { label: "Best run of reps", value: state.best },
    ],
  }),

  bot(state) {
    if (state.finaleMs > 0 || state.phase !== "set" || state.repGapMs > 0) return null;
    return calledExercise(state)?.id ?? null;
  },
};
