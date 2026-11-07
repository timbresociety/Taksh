// Each hand as its own cursor. There is no click: games act when a cursor reaches something, because
// the tracker cannot see fingers. Positions run from -1 to 1 with y up, and a lost hand reads null. The
// engine's reach box already scales a comfortable reach to the screen's edge, so a cursor is its aim.
const MIN_CONFIDENCE = 0.55;
const STEADY = 0.012; // a hand that has stopped keeps its place, so tracker noise cannot shake the cursor

const clampUnit = (value) => Math.min(1, Math.max(-1, value));

export class HandCursors {
  constructor() {
    this.hands = { left: null, right: null };
  }

  // aim is where each wrist sits in its reach; seen is how sure the tracker is of each.
  push(aim, seen) {
    for (const side of ["left", "right"]) {
      if (seen[side] < MIN_CONFIDENCE) {
        this.hands[side] = null;
        continue;
      }
      const x = clampUnit(aim[side].x);
      const y = clampUnit(aim[side].y);
      const last = this.hands[side];
      if (!last || Math.hypot(x - last.x, y - last.y) >= STEADY) this.hands[side] = { x, y };
    }
    return { ...this.hands };
  }
}
