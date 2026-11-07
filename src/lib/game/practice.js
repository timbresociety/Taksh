// What the practice screen teaches for a game, in order, with the key that stands in for each move.
import { gestureInfo } from "../spec/contract.js";

const DOT_REACH = 0.22; // of the screen's half height, as wide as the dots the hand cursor test uses
export const TRAY_REACH = 0.08; // of the half width: the middle of the tray sits on the mark

// One rule picks the lesson: a game with aim() is played with each hand as a cursor, so the cursor is
// what it teaches. Its swipes only stand in for a key, so no swipe is taught as a move, on camera or off.
export const playsWithCursors = (template) => typeof template.aim === "function";

// The plain cursor lesson, for a game that does not say how its hands are used. kind is the step's id.
const REACH = {
  kind: "aim",
  label: "Move your hands",
  cue: "Each hand moves its own ring. Reach each dot with the ring of the same colour.",
  mouseCue: "The mouse moves your ring. Reach each dot.",
  dots: [{ hand: "left", x: -0.5, y: 0.2 }, { hand: "right", x: 0.5, y: 0.2 }],
};

export const onDot = (cursor, dot, aspect) => Boolean(cursor) && Math.hypot((cursor.x - dot.x) * aspect, cursor.y - dot.y) <= DOT_REACH;

// A tray follows its hand from side to side only, so only x counts.
export const onTray = (cursor, dot) => Boolean(cursor) && Math.abs(cursor.x - dot.x) <= TRAY_REACH;

// dots are the targets, one rep each. A dot with a hand needs that hand; without one, either will do.
function cursorStep(template, usesCamera) {
  const { kind, mouseCue, ...step } = { ...REACH, ...template.handCursors?.lesson };
  if (usesCamera) return { ...step, gesture: kind };
  // The mouse is the one ring there is, so every target takes it.
  return { ...step, gesture: kind, label: "Move the mouse", cue: mouseCue, dots: step.dots.map((dot) => ({ ...dot, hand: null })) };
}

export function practiceMoves(template, usesCamera) {
  const cursors = playsWithCursors(template);
  const seen = new Set();
  const moves = template.bindings.flatMap(({ gesture, action, demo }) => {
    const info = gestureInfo(gesture);
    if (seen.has(gesture) || !info || info.hidden || (cursors && gesture.startsWith("slash_"))) return [];
    seen.add(gesture);
    // The game's own name for the move, as its key legend says it, when only this move does it: "Duck",
    // taught as a squat. Two moves sharing an action, like a hook from either hand, keep their own names.
    const only = template.bindings.filter((binding) => binding.action === action).length === 1;
    const found = template.actions.find((item) => item.id === action);
    return [{ gesture, label: only && found ? found.label : info.label, cue: info.cue, demo, action: found }];
  });
  if (!cursors) return moves;
  // An action only a swipe did is still a key on the keyboard, so there it is taught as a key, with
  // nothing to copy. On camera the hands do it.
  const swiped = (action) => {
    const own = template.bindings.filter((binding) => binding.action === action.id);
    return own.length > 0 && own.every((binding) => binding.gesture.startsWith("slash_"));
  };
  const keys = usesCamera ? [] : template.actions.filter(swiped).map((action) => ({
    gesture: `key_${action.id}`, label: action.label, cue: template.handCursors?.keys?.[action.id] ?? `${action.keyLabel} does it too.`, action, keyOnly: true,
  }));
  return [cursorStep(template, usesCamera), ...keys, ...moves];
}
