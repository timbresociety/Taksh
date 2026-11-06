// What the practice screen teaches for a game, in order, with the key that stands in for each move.
import { gestureInfo } from "../spec/contract.js";

const DOT_REACH = 0.22; // of the screen's half height, as wide as the dots the hand cursor test uses

const AIM_STEP = {
  gesture: "aim",
  label: "Move your hands",
  cue: "Each hand moves its own ring. Reach each dot with the ring of the same colour.",
  dots: [{ hand: "left", x: -0.5, y: 0.2 }, { hand: "right", x: 0.5, y: 0.2 }],
};

export const onDot = (cursor, dot, aspect) => Boolean(cursor) && Math.hypot((cursor.x - dot.x) * aspect, cursor.y - dot.y) <= DOT_REACH;

export function practiceMoves(template, usesCamera) {
  // In a game played by reaching, a swipe on camera only stands in for a key, so the reach is taught instead.
  const reaching = usesCamera && template.aimsByReaching;
  const seen = new Set();
  const moves = template.bindings.flatMap(({ gesture, action, demo }) => {
    const info = gestureInfo(gesture);
    if (seen.has(gesture) || !info || info.hidden || (reaching && gesture.startsWith("slash_"))) return [];
    seen.add(gesture);
    // The game's own name for the move, as its key legend says it, when only this move does it: "Duck",
    // taught as a squat. Two moves sharing an action, like a hook from either hand, keep their own names.
    const only = template.bindings.filter((binding) => binding.action === action).length === 1;
    const found = template.actions.find((item) => item.id === action);
    return [{ gesture, label: only && found ? found.label : info.label, cue: info.cue, demo, action: found }];
  });
  // A game that gives each hand its own half says so here, since that is the rule to learn first.
  return reaching ? [{ ...AIM_STEP, cue: template.aimCue ?? AIM_STEP.cue }, ...moves] : moves;
}
