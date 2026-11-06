// Draws one round to a canvas: a three-lane track running at the player, with every event
// travelling down its lane during its telegraph. Screen left is the player's left.
import { eventTiming } from "../runtime/engine.js";
import { gestureInfo } from "../spec/contract.js";
import { alpha, gamePalette, mix } from "./color.js";
import { createPen, finishFrame, quantize } from "./pen.js";
import { drawBackdrop } from "./scenes.js";
import { HAZARDS, NEUTRAL_BODY, TARGETS, bodyFromActions, drawAvatar } from "./sprites.js";

const PIXEL_HEIGHT = 200;
const LANE_EASE_MS = 80;
const FEEDBACK_OUTLINE = "#14121c";

function cueWords(spec) {
  const words = {};
  for (const action of ["up", "down", "strike_left", "strike_right"]) {
    const binding = spec.movementBindings.find((item) => item.action === action);
    if (binding) words[action] = gestureInfo(binding.gesture).label.replace(" out", "");
  }
  return words;
}

export function createRenderer(canvas, spec, { fontFamily = "sans-serif" } = {}) {
  const preset = spec.artStyle.preset;
  const palette = gamePalette(spec.artStyle.palette);
  const target = canvas.getContext("2d");
  const cues = cueWords(spec);
  const pixelColors = [...new Set([...Object.values(palette), mix(palette.sky, palette.ground, 0.5), mix(palette.ground, palette.ink, 0.3), "#000000"])];

  const state = { width: 0, height: 0, dpr: 1, displayLane: 1, floats: [], particles: [], shake: 0, flash: 0, runPhase: 0, sinceAction: {}, calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
  let frame = null;
  let ctx = null;
  let pen = null;
  let backdrop = null;
  let geometry = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * state.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * state.dpr));

    const pixel = preset === "pixel";
    state.height = pixel ? PIXEL_HEIGHT : rect.height;
    state.width = pixel ? Math.round((PIXEL_HEIGHT * rect.width) / Math.max(1, rect.height)) : rect.width;

    if (pixel) {
      frame = document.createElement("canvas");
      frame.width = state.width;
      frame.height = state.height;
      ctx = frame.getContext("2d", { willReadFrequently: true });
    } else {
      frame = null;
      ctx = target;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    const { width, height } = state;
    const unit = Math.min(width, height * 1.6);
    geometry = {
      horizon: height * 0.36,
      footY: height * 0.93,
      vanishX: width / 2,
      laneWidth: Math.min(width * 0.3, height * 0.56),
      unit,
    };
    pen = createPen(ctx, preset, palette, unit);
    pen.fontFamily = fontFamily;

    backdrop = document.createElement("canvas");
    const scale = pixel ? 1 : state.dpr;
    backdrop.width = Math.round(width * scale);
    backdrop.height = Math.round(height * scale);
    const backCtx = backdrop.getContext("2d");
    backCtx.scale(scale, scale);
    const backPen = createPen(backCtx, preset, palette, unit);
    if (preset === "watercolor") {
      backCtx.fillStyle = "#fbf7ef";
      backCtx.fillRect(0, 0, width, height);
    }
    drawBackdrop(backPen, spec.theme.setting, width, height, geometry.horizon);
    drawTrackBase(backPen, backCtx);
  }

  function perspective(depth) {
    const d = Math.max(0.0001, depth);
    return d * d * (0.45 + 0.55 * d);
  }

  function project(lane, depth) {
    const { horizon, footY, vanishX, laneWidth } = geometry;
    const p = perspective(depth);
    return { x: vanishX + (lane - 1) * laneWidth * p, y: horizon + (footY - horizon) * p, scale: p };
  }

  function laneEdges(lane, depth) {
    const { x, y, scale } = project(lane, depth);
    const half = (geometry.laneWidth / 2) * scale;
    return { left: x - half, right: x + half, y };
  }

  function drawTrackBase(basePen, baseCtx) {
    const { horizon } = geometry;
    const { width, height } = state;
    const near = 1.14;
    const ground = baseCtx.createLinearGradient(0, horizon, 0, height);
    ground.addColorStop(0, mix(palette.ground, palette.sky, 0.35));
    ground.addColorStop(1, palette.ground);
    if (preset === "watercolor") baseCtx.globalCompositeOperation = "multiply";
    baseCtx.fillStyle = ground;
    baseCtx.fillRect(0, horizon, width, height - horizon);
    baseCtx.globalCompositeOperation = "source-over";

    const far = laneEdges(1, 0.02);
    const left = laneEdges(0, near);
    const right = laneEdges(2, near);
    basePen.polygon([[far.left, far.y], [far.right, far.y], [right.right, right.y], [left.left, left.y]], { fill: mix(palette.ground, palette.ink, 0.1), seed: 70, flat: true });

    for (let lane = 0; lane <= 3; lane += 1) {
      const edge = lane - 0.5;
      const a = project(edge, 0.03);
      const b = project(edge, near);
      basePen.line(a.x, a.y, b.x, b.y, { stroke: palette.ink, seed: 71 + lane, lineWidth: basePen.unit * 0.005 });
    }
  }

  function drawMotionLines(round) {
    const speed = 0.0004;
    const offset = (round.t * speed) % 0.2;
    for (let i = 0; i < 5; i += 1) {
      const depth = 0.15 + i * 0.2 + offset;
      const a = laneEdges(0, depth);
      const b = laneEdges(2, depth);
      pen.line(a.left, a.y, b.right, b.y, { stroke: mix(palette.ground, palette.ink, 0.22), seed: 80 + i, lineWidth: pen.unit * 0.0025 * (0.5 + depth) });
    }
  }

  function drawLaneWarnings(round) {
    const { t } = round;
    for (const event of round.events) {
      if (event.state === "done" || event.requires !== "position") continue;
      const { spawn } = eventTiming(event);
      if (t < spawn) continue;
      const progress = Math.min(1, (t - spawn) / event.telegraphMs);
      const color = event.kind === "hazard" ? palette.hazard : palette.target;
      const fromDepth = 1.08;
      const toDepth = 1.08 - 0.96 * progress;
      const near = laneEdges(event.lane, fromDepth);
      const far = laneEdges(event.lane, Math.max(0.1, toDepth));
      const pulse = event.kind === "hazard" ? 0.34 + 0.2 * Math.sin(t * 0.018) : 0.26;
      ctx.save();
      ctx.fillStyle = alpha(color, pulse);
      ctx.beginPath();
      ctx.moveTo(far.left, far.y);
      ctx.lineTo(far.right, far.y);
      ctx.lineTo(near.right, near.y);
      ctx.lineTo(near.left, near.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const mark = project(event.lane, 1);
      const r = geometry.laneWidth * 0.42;
      pen.shape((c) => c.ellipse(mark.x, mark.y, r, r * 0.2, 0, 0, Math.PI * 2 * progress), { stroke: color, seed: 90 + event.index, lineWidth: pen.unit * 0.008 });
      if (event.kind === "hazard") {
        pen.text("!", mark.x, mark.y - geometry.laneWidth * 0.1, { size: pen.unit * 0.05, color, outline: palette.ground });
      }
    }
  }

  function drawEvent(event, t, layer) {
    const { spawn } = eventTiming(event);
    if (t < spawn) return;
    const depth = (t - spawn) / event.telegraphMs;
    if (depth > 1.2) return;
    if ((layer === "behind") !== depth <= 1) return;

    const color = event.kind === "hazard" ? palette.hazard : palette.target;
    const base = geometry.laneWidth * 0.26;

    if (event.requires === "up" || event.requires === "down") {
      const edgeL = laneEdges(0, depth);
      const edgeR = laneEdges(2, depth);
      const { scale } = project(1, depth);
      const heightUp = event.requires === "down" ? geometry.laneWidth * 1.02 * scale : geometry.laneWidth * 0.14 * scale;
      const thickness = geometry.laneWidth * 0.2 * scale;
      const y = edgeL.y - heightUp;
      pen.shape((c) => c.roundRect(edgeL.left, y - thickness / 2, edgeR.right - edgeL.left, thickness, thickness / 3), { fill: color, seed: 100 + event.index });
      if (event.requires === "down") {
        for (const px of [edgeL.left, edgeR.right]) pen.line(px, y, px, edgeL.y, { stroke: color, seed: 120, lineWidth: pen.unit * 0.012 * scale });
      }
      return;
    }

    const { x, y, scale } = project(event.lane, depth);
    const r = Math.max(2, base * scale);
    if (event.requires !== "position") {
      const side = event.requires === "strike_left" ? -1 : 1;
      const px = x + side * geometry.laneWidth * 0.1 * scale;
      pen.sized(r * 0.09, () => TARGETS[event.kind === "target" ? spec.theme.targetSprite : "pad"](pen, px, y - geometry.laneWidth * 0.62 * scale, r * 1.15, color, t, 200 + event.index));
      return;
    }
    const lift = event.kind === "target" ? 0.5 : 0.34;
    const drawSprite = event.kind === "target" ? TARGETS[spec.theme.targetSprite] : HAZARDS[spec.theme.hazardSprite];
    pen.shape((c) => c.ellipse(x, y, r * 0.8, r * 0.18, 0, 0, Math.PI * 2), { fill: mix(palette.ground, palette.ink, 0.5), seed: 300, flat: true });
    pen.sized(r * 0.09, () => drawSprite(pen, x, y - geometry.laneWidth * lift * scale, r, color, t, 310 + event.index));
  }

  function nextCue(round) {
    let best = null;
    for (const event of round.events) {
      if (event.state === "done" || event.requires === "position") continue;
      const { spawn } = eventTiming(event);
      if (round.t >= spawn && (!best || event.atMs < best.atMs)) best = event;
    }
    return best;
  }

  function drawCue(round) {
    const event = nextCue(round);
    if (!event) return;
    const { open, spawn } = eventTiming(event);
    const ready = round.t >= open;
    const word = cues[event.requires];
    if (!word) return;
    const { width, height } = state;
    const size = pen.unit * (ready ? 0.1 : 0.074);
    const x = event.requires === "strike_left" ? width * 0.3 : event.requires === "strike_right" ? width * 0.7 : width / 2;
    const y = height * 0.25;
    const color = event.kind === "hazard" ? palette.hazard : palette.target;
    pen.text(word, x, y, { size, color: ready ? color : mix(color, palette.ink, 0.25), outline: preset === "neon" ? null : palette.sky });
    const progress = Math.min(1, (round.t - spawn) / event.telegraphMs);
    const barWidth = pen.unit * 0.26;
    ctx.fillStyle = alpha(palette.ink, 0.3);
    ctx.fillRect(x - barWidth / 2, y + size * 0.72, barWidth, pen.unit * 0.008);
    ctx.fillStyle = color;
    ctx.fillRect(x - barWidth / 2, y + size * 0.72, barWidth * progress, pen.unit * 0.008);
  }

  function drawEffects(dt) {
    state.particles = state.particles.filter((particle) => (particle.life -= dt) > 0);
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += pen.unit * 0.0000012 * dt;
      const size = particle.size * (particle.life / particle.total);
      if (preset === "pixel") {
        ctx.fillStyle = particle.color;
        ctx.fillRect(Math.round(particle.x), Math.round(particle.y), Math.max(1, size), Math.max(1, size));
      } else {
        pen.circle(particle.x, particle.y, size, { fill: particle.color, seed: 400, flat: true });
      }
    }

    state.floats = state.floats.filter((float) => (float.life -= dt) > 0);
    for (const float of state.floats) {
      const age = 1 - float.life / float.total;
      const size = pen.unit * 0.085 * (age < 0.15 ? 0.6 + age * 2.6 : 1);
      const y = float.y - age * pen.unit * 0.09;
      if (preset === "comic") {
        const points = Array.from({ length: 22 }, (_, i) => {
          const a = (i / 22) * Math.PI * 2;
          const radius = (i % 2 ? 0.62 : 1) * size * 2.2;
          return [float.x + Math.cos(a) * radius * 1.5, y + Math.sin(a) * radius];
        });
        pen.polygon(points, { fill: float.good ? palette.target : palette.hazard, seed: 410, flat: true });
      }
      pen.text(float.text, float.x, y, { size, color: float.color, outline: float.outline });
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + i;
      const speed = pen.unit * (0.0004 + ((i * 53) % 10) * 0.00006);
      const life = 420 + ((i * 31) % 10) * 28;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - pen.unit * 0.0002, size: pen.unit * 0.012, color, life, total: life });
    }
  }

  return {
    resize,

    // outcome comes from the engine. Feedback words are the spec's own, so they fit the theme.
    onOutcome(outcome, round) {
      const { theme } = spec;
      const good = outcome.type === "hit" || outcome.type === "avoid";
      const text = { hit: theme.hitText, miss: theme.missText, avoid: theme.avoidText, hurt: theme.hurtText }[outcome.type];
      if (!text) return;
      const lane = outcome.lane ?? round.lane;
      const { x, y } = project(lane, 1);
      const anchorY = y - geometry.laneWidth * 0.95;
      const color = good ? (outcome.type === "hit" ? palette.target : "#ffffff") : palette.hazard;
      state.floats.push({ text, x, y: anchorY, color: preset === "comic" ? palette.ink : color, outline: preset === "comic" ? "#ffffff" : FEEDBACK_OUTLINE, good, life: 760, total: 760 });
      burst(x, anchorY, good ? palette.target : palette.hazard, good ? 18 : 10);
      if (outcome.type === "hurt") {
        state.shake = state.calm ? 0 : 1;
        state.flash = state.calm ? 0.5 : 1;
      }
    },

    onAction(action) {
      state.sinceAction[action] = 0;
    },

    // view: { round, dt, pose: { body, rise, drop } | null }
    draw({ round, dt, pose }) {
      if (!geometry) resize();
      const ease = 1 - Math.exp(-dt / LANE_EASE_MS);
      state.displayLane += (round.lane - state.displayLane) * ease;
      state.runPhase += dt * 0.012;
      for (const key of Object.keys(state.sinceAction)) state.sinceAction[key] += dt;
      pen.boil = Math.floor(round.t / 170);

      const { width, height } = state;
      ctx.save();
      state.shake = Math.max(0, state.shake - dt / 300);
      if (state.shake > 0) {
        const amount = pen.unit * 0.012 * state.shake;
        ctx.translate(Math.sin(round.t * 0.09) * amount, Math.cos(round.t * 0.11) * amount);
      }
      ctx.drawImage(backdrop, 0, 0, width, height);
      drawMotionLines(round);
      drawLaneWarnings(round);

      const live = round.events.filter((event) => event.state !== "done" || round.t - event.atMs < 300);
      const farFirst = [...live].reverse();
      for (const event of farFirst) drawEvent(event, round.t, "behind");

      const { x, y, scale } = project(state.displayLane, 1);
      const size = geometry.laneWidth * 0.25 * scale;
      const acted = pose ?? bodyFromActions(state.sinceAction, state.runPhase);
      pen.sized(size * 0.05, () => drawAvatar(pen, spec.theme.avatar, acted.body ?? NEUTRAL_BODY, x, y, size, acted.rise ?? 0, acted.drop ?? 0));

      for (const event of farFirst) drawEvent(event, round.t, "front");
      drawCue(round);
      drawEffects(dt);
      ctx.restore();

      state.flash = Math.max(0, state.flash - dt / 240);
      if (state.flash > 0) {
        ctx.fillStyle = alpha(palette.hazard, 0.32 * state.flash);
        ctx.fillRect(0, 0, width, height);
      }
      finishFrame(ctx, preset, palette, width, height);

      if (frame) {
        quantize(ctx, frame.width, frame.height, pixelColors);
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.imageSmoothingEnabled = false;
        target.drawImage(frame, 0, 0, canvas.width, canvas.height);
      }
    },
  };
}
