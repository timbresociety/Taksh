// One play-through of any template: a countdown, the game, and the pause rules around it. Gestures
// and keys both arrive here as actions, so game logic can be tested without a camera.
import { gestureInfo } from "../spec/contract.js";
import { templateInfo } from "../templates/index.js";

const COUNTDOWN_MS = 3000;
const RESUME_COUNTDOWN_MS = 2000;
const RECOVERED_AFTER_MS = 700;
const SAME_ACTION_MS = 350; // a high-knee jump may trip two gestures bound to one action
const LOG_LENGTH = 6;

export class GameSession {
  constructor(spec, { usesCamera = false } = {}) {
    this.spec = spec;
    this.usesCamera = usesCamera;
    this.template = templateInfo(spec.template);
    this.state = this.template.create(spec);
    this.phase = "countdown"; // countdown | playing | paused | ended
    this.countdownMs = COUNTDOWN_MS;
    this.clock = 0;
    this.bindings = new Map(this.template.bindings.map(({ gesture, action }) => [gesture, action]));
    this.lastGesture = {};
    this.movements = [];
    this.goodSince = null;
    this.pending = [];
    this.actionCount = 0;
  }

  // Moves with no meaning in this game are ignored quietly, because the detector reads them all.
  handleGesture(event) {
    const action = this.bindings.get(event.gesture);
    if (!action) return;
    const accepted = this.phase === "playing";
    const info = gestureInfo(event.gesture);
    if (!info?.hidden) this.log(`${event.t}-${event.gesture}`, info?.label ?? event.gesture, event.confidence, accepted);
    if (!accepted) return;
    const last = this.lastGesture[action];
    if (last && last.gesture !== event.gesture && this.clock - last.at < SAME_ACTION_MS) return;
    this.lastGesture[action] = { gesture: event.gesture, at: this.clock };
    this.act(action);
  }

  handleKey(action) {
    if (this.phase !== "playing") return;
    this.log(`${this.clock}-${action}`, `Key: ${action.replace(/_/g, " ")}`, 1, true);
    this.act(action);
  }

  // Games with a hand on screen read positions rather than moves. x and y run from -1 to 1, y up.
  handleAim(aim) {
    if (this.phase === "playing") this.template.aim?.(this.state, aim);
  }

  // Speed and tilt are readings rather than moves: how fast the fast moves are going, and how far the
  // player is leaning, from -1 to 1.
  handleDrive(drive) {
    if (this.phase === "playing") this.template.drive?.(this.state, drive);
  }

  log(id, label, confidence, used) {
    this.movements = [{ id, label, confidence, used }, ...this.movements].slice(0, LOG_LENGTH);
  }

  act(action) {
    this.actionCount += 1;
    this.pending.push({ type: "action", action }, ...this.template.act(this.state, action));
  }

  // tracking is good, partial, lost or searching. Only a lost body pauses the game.
  setTracking(tracking) {
    if (!this.usesCamera || this.phase === "ended") return;
    if (tracking === "lost") {
      this.phase = "paused";
      this.goodSince = null;
      this.countdownMs = null;
      return;
    }
    if (this.phase === "paused" && this.countdownMs === null) {
      this.goodSince ??= this.clock;
      if (this.clock - this.goodSince >= RECOVERED_AFTER_MS) this.countdownMs = RESUME_COUNTDOWN_MS;
    }
  }

  // The game clock only advances while playing, so nothing can be hit during a pause.
  tick(dtMs) {
    this.clock += dtMs;
    const events = this.pending.splice(0);
    if (this.phase === "countdown" || (this.phase === "paused" && this.countdownMs !== null)) {
      this.countdownMs -= dtMs;
      if (this.countdownMs <= 0) {
        this.phase = "playing";
        this.countdownMs = null;
      }
    } else if (this.phase === "playing") {
      events.push(...this.template.step(this.state, dtMs));
      if (this.state.status === "ended") this.phase = "ended";
    }
    return events;
  }

  hud() {
    return this.template.hud(this.state);
  }

  result() {
    return { ...this.template.result(this.state), actions: this.actionCount };
  }
}
