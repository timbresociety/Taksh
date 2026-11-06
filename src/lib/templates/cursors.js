// Pieces the cursor games share. Each hand is its own cursor on the field, and reaching something is
// what acts on it: there is no click. Hand positions arrive between steps, so aim only records them,
// and each game's step works out what they touched and reports it.
import { SCREEN_RATIO, strokeGap } from "./chop.js";

export const SIDES = ["left", "right"];
const LEAP = 1; // a stroke this long in one step is the tracker finding a hand again, not a sweep

const newCursor = () => ({ x: 0, y: 0, fromX: 0, fromY: 0, live: false, keyed: false });
export const newCursors = () => ({ left: newCursor(), right: newCursor() });

// A pointer at rest sends nothing, so a cursor stays where it is until a hand is reported lost.
export function aimCursors(state, hands) {
  if (state.status !== "playing") return;
  for (const side of SIDES) {
    const at = hands[side];
    const cursor = state.cursors[side];
    if (!at) {
      if (!cursor.keyed) cursor.live = false;
      continue;
    }
    if (!cursor.live) Object.assign(cursor, { fromX: at.x, fromY: at.y });
    Object.assign(cursor, { x: at.x, y: at.y, live: true, keyed: false });
  }
}

// Keys stand in for a hand, for a player with no hand on screen: the right one, unless a game that
// splits the screen between the hands says which.
export function placeCursor(state, x, y, side = "right") {
  const cursor = state.cursors[side];
  if (!cursor.live) Object.assign(cursor, { fromX: x, fromY: y });
  Object.assign(cursor, { x, y, live: true, keyed: true });
}

export const liveCursors = (state) => SIDES.filter((side) => state.cursors[side].live);
export const handsOnScreen = (state) => SIDES.map((side) => state.cursors[side]).filter((cursor) => cursor.live && !cursor.keyed);

// Distances are taken as the eye sees them, since the field is wider than it is tall.
export const screenGap = (a, b) => Math.hypot((a.x - b.x) * SCREEN_RATIO, a.y - b.y);

// How close an item came to a cursor since the last step, so a fast hand can't pass through it.
export function cursorGap(item, cursor) {
  const from = { x: cursor.fromX, y: cursor.fromY };
  return screenGap(from, cursor) > LEAP ? screenGap(item, cursor) : strokeGap(item, from, cursor);
}

export function settleCursors(state) {
  for (const cursor of Object.values(state.cursors)) Object.assign(cursor, { fromX: cursor.x, fromY: cursor.y });
}
