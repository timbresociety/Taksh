import { GestureEngine } from "./gestures.js";
import { LandmarkSmoother, normalizeLandmarks } from "./landmarks.js";

// Replays a trace saved from the input lab through the gesture engine, from the moment it was calibrated.
export function replayTrace({ frames, aspect, calibration, calibratedAt = 0, framing, moves }) {
  const smoother = new LandmarkSmoother();
  const engine = new GestureEngine(calibration, { framing, moves });
  const events = [];
  const tracking = {};

  for (const { t, lm } of frames) {
    const raw = lm?.map(([x, y, visibility, z]) => ({ x, y, visibility, z }));
    const world = lm?.[0]?.[4] === undefined ? undefined : lm.map((point) => ({ z: point[4] }));
    const points = raw ? smoother.push(normalizeLandmarks(raw, aspect, world), t) : null;
    if (t < calibratedAt) continue;
    const result = engine.push(points, t);
    tracking[result.tracking] = (tracking[result.tracking] ?? 0) + 1;
    events.push(...result.events.map((event) => ({ ...event, at: event.t - calibratedAt })));
  }
  return { events, tracking };
}
