// Fixture provider: canned stand-ins for the model, used when no credentials are configured.
// It exists to exercise the runtime and the UI. Keyword matching here says nothing about how well
// a real model reads intent, and every response is labelled source: "fixture" all the way to the UI.
import { SPEC_VERSION } from "../spec/contract.js";

export const FIXTURE_MODEL = "fixture-v1";

const PALETTES = {
  neon: { sky: "#0a0524", ground: "#160b3f", ink: "#f2eaff", player: "#39f3ff", target: "#fff04d", hazard: "#ff2e88", accent: "#8a5cff" },
  pixel: { sky: "#29366f", ground: "#38b764", ink: "#f4f4f4", player: "#ffcd75", target: "#ffffff", hazard: "#b13e53", accent: "#41a6f6" },
  comic: { sky: "#ffd93b", ground: "#3dc1d3", ink: "#141414", player: "#ffffff", target: "#ff9f1a", hazard: "#e8233f", accent: "#2d5bff" },
  papercut: { sky: "#bfe3d0", ground: "#5f9e7a", ink: "#23372c", player: "#f7efe2", target: "#f6c344", hazard: "#d9513c", accent: "#3f7f93" },
  chalk: { sky: "#1f3a33", ground: "#2a4a41", ink: "#f2f0e6", player: "#fdfbf0", target: "#ffe066", hazard: "#ff8f8f", accent: "#9ad7ff" },
  watercolor: { sky: "#f4efe6", ground: "#b9d4c4", ink: "#30424f", player: "#3f6e8c", target: "#e8a33d", hazard: "#c8504b", accent: "#7d6fb0" },
};

const STYLE_WORDS = [
  ["pixel", /pixel|8.?bit|16.?bit|retro|arcade cabinet/i],
  ["comic", /comic|cartoon|manga|ink|pop art/i],
  ["papercut", /paper|storybook|craft|origami|felt/i],
  ["chalk", /chalk|sketch|hand.?drawn|blackboard/i],
  ["watercolor", /water.?colou?r|painted|painterly|soft/i],
  ["neon", /neon|synth|cyber|glow|tron/i],
];

const GAMES = {
  keeper: {
    match: /goal.?keep|keeper|penalt|soccer|football|hockey|save/i,
    title: "Last Line",
    objective: "Move into each shot's lane and keep the ball out of your net.",
    theme: { setting: "stadium", avatar: "keeper", targetSprite: "ball", hazardSprite: "fireball", targetName: "shot", hazardName: "fireball", hitText: "SAVE!", missText: "GOAL!", avoidText: "CLEAR", hurtText: "BURNED" },
    bindings: [["step_left", "move_left"], ["step_right", "move_right"], ["jump", "up"]],
    pattern: ["t0", "t2", "t1", "t0", "up", "t2", "t0", "t1", "t2", "up", "t0", "t2", "t1", "t0"],
    end: { type: "lives", lives: 3, winScore: 0 },
    targetMissCostsLife: true,
  },
  robot: {
    match: /robot|escape|dodge|chase|run away|mech|laser/i,
    title: "Unit Nine Is Awake",
    objective: "Step out of each marked lane before the robot strikes.",
    theme: { setting: "factory", avatar: "runner", targetSprite: "gem", hazardSprite: "fist", targetName: "power cell", hazardName: "robot fist", hitText: "GRABBED", missText: "LOST IT", avoidText: "DODGED", hurtText: "CRUSHED" },
    bindings: [["step_left", "move_left"], ["step_right", "move_right"], ["jump", "up"], ["high_knee", "up"], ["burpee", "down"]],
    pattern: ["h1", "h0", "h2", "up", "h1", "t0", "h0", "h2", "down", "h1", "up", "h0", "t2", "h2", "h1"],
    end: { type: "lives", lives: 3, winScore: 0 },
    targetMissCostsLife: false,
  },
  boxing: {
    match: /box|punch|fight|karate|kick|ninja|martial|combat/i,
    title: "Twelve Second Rounds",
    objective: "Punch the pads on your left and right as they light up.",
    theme: { setting: "dojo", avatar: "fighter", targetSprite: "pad", hazardSprite: "saw", targetName: "pad", hazardName: "low sweep", hitText: "POW!", missText: "TOO SLOW", avoidText: "HOPPED", hurtText: "SWEPT" },
    bindings: [["hand_left", "strike_left"], ["hand_right", "strike_right"], ["jump", "up"], ["high_knee", "up"]],
    pattern: ["sl", "sr", "sl", "sr", "up", "sl", "sl", "sr", "up", "sr", "sl", "sr", "up", "sl", "sr", "sl"],
    end: { type: "time", lives: 0, winScore: 0 },
    targetMissCostsLife: false,
  },
  hurdles: {
    match: /jump|hurdle|sprint|run|race|knee|skip|rope|swim|climb|surf/i,
    title: "Long Way Home",
    objective: "Clear the obstacles and collect what you can along the way.",
    theme: { setting: "desert", avatar: "runner", targetSprite: "coin", hazardSprite: "boulder", targetName: "coin", hazardName: "boulder", hitText: "GOT IT", missText: "PASSED", avoidText: "CLEARED", hurtText: "OOF" },
    bindings: [["step_left", "move_left"], ["step_right", "move_right"], ["high_knee", "up"], ["jump", "up"]],
    pattern: ["up", "t1", "up", "t0", "up", "t2", "up", "t1", "up", "t0", "up", "t2", "up"],
    end: { type: "time", lives: 0, winScore: 0 },
    targetMissCostsLife: false,
  },
};

const UNSUPPORTED = [
  [/swim|butterfly stroke/i, "swimming strokes"],
  [/handstand|backflip|cartwheel|somersault/i, "inverted moves"],
  [/push.?up|plank|sit.?up|crunch|yoga/i, "floor exercises"],
  [/two.?player|multiplayer|with a friend|versus my/i, "playing with a second person"],
  [/juggl|dumbbell|kettlebell|racket|hold(ing)? a/i, "tracking objects you hold"],
];

const pickGame = (idea) => Object.values(GAMES).find((game) => game.match.test(idea));
const pickStyle = (text, fallback = "neon") => STYLE_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? fallback;

function brief(idea, game) {
  const style = pickStyle(idea);
  return {
    artStyle: style,
    coreAction: game ? game.bindings.map(([gesture]) => gesture).join(", ") : "not yet known",
    goal: game?.objective ?? "not yet known",
    feedback: game ? `${game.theme.hitText} / ${game.theme.hurtText}` : "not yet known",
  };
}

function fixtureIntent({ idea, clarification }) {
  const text = [idea, clarification].filter(Boolean).join(" ");
  const blocked = UNSUPPORTED.find(([pattern]) => pattern.test(text));
  const game = pickGame(text);
  if (blocked) {
    const closest = game ?? GAMES.hurdles;
    return {
      status: "unsupported",
      brief: brief(text, closest),
      question: "",
      options: [],
      unsupported: { requested: blocked[1], closest: `${closest.title}: ${closest.objective}` },
    };
  }
  if (!game) {
    return {
      status: "clarify",
      brief: brief(text, null),
      question: "What should your body be doing in this game?",
      options: ["Dodging attacks", "Punching targets", "Saving shots", "Jumping obstacles"],
      unsupported: { requested: "", closest: "" },
    };
  }
  return { status: "ready", brief: brief(text, game), question: "", options: [], unsupported: { requested: "", closest: "" } };
}

function buildEvents(pattern) {
  let at = 4200;
  return pattern.map((code, index) => {
    const ramp = index / pattern.length;
    const telegraphMs = Math.round(2300 - ramp * 700);
    const event = code === "up" || code === "down"
      ? { kind: "hazard", requires: code, lane: null, windowMs: code === "down" ? 1800 : 900 }
      : code === "sl" || code === "sr"
        ? { kind: "target", requires: code === "sl" ? "strike_left" : "strike_right", lane: code === "sl" ? 0 : 2, windowMs: 1000 }
        : { kind: code[0] === "t" ? "target" : "hazard", requires: "position", lane: Number(code[1]), windowMs: 900 };
    const result = { atMs: at, ...event, telegraphMs };
    at += code === "down" ? 3600 : code === "up" ? 2000 - Math.round(ramp * 500) : 2100 - Math.round(ramp * 500);
    return result;
  });
}

function fixtureSpec({ idea, clarification, brief: gameBrief }) {
  const text = [idea, clarification].filter(Boolean).join(" ");
  const game = pickGame(text) ?? GAMES.hurdles;
  const preset = pickStyle(`${text} ${gameBrief?.artStyle ?? ""}`);
  const events = buildEvents(game.pattern);
  return {
    specVersion: SPEC_VERSION,
    title: game.title,
    objective: game.objective,
    artStyle: { preset, palette: PALETTES[preset], direction: `Fixture look using the ${preset} preset.` },
    theme: game.theme,
    movementBindings: game.bindings.map(([gesture, action]) => ({ gesture, action })),
    events,
    scoring: { targetHit: 100, targetMiss: 0, targetMissCostsLife: game.targetMissCostsLife, hazardAvoided: 50, hazardHit: -25, comboBonus: 10 },
    end: { ...game.end, durationMs: Math.min(90000, Math.max(20000, events.at(-1).atMs + 2000)) },
  };
}

function scaleWarnings(spec, factor) {
  const next = structuredClone(spec);
  for (const event of next.events) {
    event.telegraphMs = Math.min(4000, Math.max(700, Math.round(event.telegraphMs * factor)));
  }
  const firstSpawn = Math.min(...next.events.map((event) => event.atMs - event.telegraphMs));
  const shift = Math.max(0, 1500 - firstSpawn);
  for (const event of next.events) event.atMs += shift;
  next.end.durationMs = Math.min(90000, Math.max(next.end.durationMs, next.events.at(-1).atMs + 1500));
  return next;
}

function fixtureRevision({ spec, request }) {
  const style = STYLE_WORDS.find(([, pattern]) => pattern.test(request))?.[0];
  if (style) {
    const next = structuredClone(spec);
    next.artStyle = { ...next.artStyle, preset: style, palette: PALETTES[style] };
    return { changeKind: "look", changeSummary: `Switched the look to ${style}.`, spec: next };
  }
  if (/time|slow|easier|longer|more warning/i.test(request)) {
    return { changeKind: "gameplay", changeSummary: "Gave you 40% more warning before each event.", spec: scaleWarnings(spec, 1.4) };
  }
  if (/hard|fast|quick|less time|tough/i.test(request)) {
    return { changeKind: "gameplay", changeSummary: "Cut the warning before each event by 25%.", spec: scaleWarnings(spec, 0.75) };
  }
  if (/li(fe|ves)/i.test(request) && spec.end.type === "lives") {
    const next = structuredClone(spec);
    next.end.lives = Math.min(9, spec.end.lives + 2);
    return { changeKind: "gameplay", changeSummary: "Added two lives.", spec: next };
  }
  return { changeKind: "gameplay", changeSummary: "The fixture does not understand that request.", spec };
}

export function createFixtureProvider() {
  return {
    source: "fixture",
    model: FIXTURE_MODEL,
    async complete({ stage, input }) {
      const data = { intent: fixtureIntent, generate: fixtureSpec, revise: fixtureRevision }[stage](input);
      return { data: structuredClone(data), ms: 0, usage: null };
    },
  };
}
