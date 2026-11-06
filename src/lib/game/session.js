// One play-through: a countdown, the round, and the pause rules around it. Gestures and keys both
// arrive here as actions, so game logic can be tested without a camera.
import { applyAction, createRound, stepRound } from "../runtime/engine.js";
import { gestureInfo } from "../spec/contract.js";

const COUNTDOWN_MS = 3000;
const RESUME_COUNTDOWN_MS = 2000;
const RECOVERED_AFTER_MS = 700;
const SAME_ACTION_MS = 350; // a high-knee jump may trip two gestures bound to one action
const LOG_LENGTH = 6;

export class GameSession {
  constructor(spec, { usesCamera = false } = {}) {
    this.spec = spec;
    this.usesCamera = usesCamera;
    this.round = createRound(spec);
    this.phase = "countdown"; // countdown | playing | paused | ended
    this.countdownMs = COUNTDOWN_MS;
    this.clock = 0;
    this.bindings = new Map(spec.movementBindings.map(({ gesture, action }) => [gesture, action]));
    this.lastActionAt = {};
    this.movements = [];
    this.goodSince = null;
    this.pendingOutcomes = [];
    this.actionsTaken = [];
  }

  handleGesture(event) {
    const action = this.bindings.get(event.gesture);
    const accepted = Boolean(action) && this.phase === "playing";
    this.movements = [
      {
        id: `${event.t}-${event.gesture}`,
        label: gestureInfo(event.gesture)?.label ?? event.gesture,
        confidence: event.confidence,
        used: accepted,
      },
      ...this.movements,
    ].slice(0, LOG_LENGTH);
    if (accepted) this.act(action);
  }

  handleKey(action) {
    if (this.phase !== "playing") return;
    this.movements = [{ id: `${this.clock}-${action}`, label: `Key: ${action.replace("_", " ")}`, confidence: 1, used: true }, ...this.movements].slice(0, LOG_LENGTH);
    this.act(action);
  }

  act(action) {
    const last = this.lastActionAt[action];
    const isMove = action === "move_left" || action === "move_right";
    if (!isMove && last !== undefined && this.clock - last < SAME_ACTION_MS) return;
    this.lastActionAt[action] = this.clock;
    this.actionsTaken.push({ action, t: this.clock });
    this.pendingOutcomes.push(...applyAction(this.round, action));
  }

  // tracking is good, partial, lost or searching. Only a lost body pauses the round.
  setTracking(tracking) {
    if (!this.usesCamera || this.phase === "ended") return;
    if (tracking === "lost") {
      if (this.phase === "playing" || this.phase === "countdown") this.pausedFrom = this.phase;
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

  // The round clock only advances while playing, so nothing can be hit during a pause.
  tick(dtMs) {
    this.clock += dtMs;
    const outcomes = this.pendingOutcomes.splice(0);

    if (this.phase === "countdown" || (this.phase === "paused" && this.countdownMs !== null)) {
      this.countdownMs -= dtMs;
      if (this.countdownMs <= 0) {
        this.phase = "playing";
        this.countdownMs = null;
      }
    } else if (this.phase === "playing") {
      outcomes.push(...stepRound(this.round, dtMs));
      if (this.round.status === "ended") this.phase = "ended";
    }
    return outcomes;
  }
}
