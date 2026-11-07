// Scores a practice step played with hand cursors. A slice is judged by the game's own aim(), so a rep
// in practice is a cut the round would count too: the same speed, the same stroke, the same tuning.
import { SCREEN_RATIO } from "../templates/chop.js";
import { onDot, onTray } from "./practice.js";

const REST_MS = 450; // a swipe that carries on into the next target does not count for it as well

// A tray already resting on its mark when the mark comes up has not slid there. Arms hanging at the
// sides put each tray about a shoulder out, so without this a lesson could finish with no slide at all.
const SLIDE_FROM = 0.2; // of the half width, more than twice the reach of a mark

const sidesFor = (dot) => (dot.hand ? [dot.hand] : ["left", "right"]);
const handsFor = (cursors, dot) => sidesFor(dot).map((side) => cursors[side]);

// A fresh round of the game holds the one fruit, still in the air, for its own aim() to cut or not.
function slicer(template, spec) {
  const state = template.create(spec);
  return (cursors, t, dot) => {
    state.t = t;
    state.items = dot ? [{ id: 0, kind: dot.kind, bomb: false, x: dot.x, y: dot.y, radius: dot.radius, vx: 0, vy: 0, spin: 0, turn: 0 }] : [];
    template.aim(state, cursors);
    if (!dot) return null;
    const cut = state.queue.splice(0).find((event) => event.type === "cut");
    if (cut) return !dot.hand || cut.side === dot.hand ? "hit" : "wrong";
    // In the fruit but too slow to cut it, which is the one thing to tell the player.
    const inside = handsFor(cursors, dot).some((hand) => hand && Math.hypot((hand.x - dot.x) * SCREEN_RATIO, hand.y - dot.y) <= dot.radius);
    return inside ? "slow" : null;
  };
}

// push gives "hit" when the target is done, "slow" or "wrong" when a hand got there without doing it.
export function cursorTrial(move, template, spec) {
  const slice = move.gesture === "slice" ? slicer(template, spec) : null;
  let restUntil = -Infinity;
  // For a slide, the hands that have been off this mark since it came up. A hand out of view counts as
  // off, so a hand raised into view on the mark has still come to it.
  let marked = null;
  let strayed = new Set();
  return {
    push(cursors, t, aspect, dot) {
      const target = dot && t >= restUntil ? dot : null;
      if (dot !== marked) [marked, strayed] = [dot, new Set()];
      if (dot) for (const side of sidesFor(dot)) if (!cursors[side] || Math.abs(cursors[side].x - dot.x) > SLIDE_FROM) strayed.add(side);
      let said = null;
      // The game keeps reading the hands while it rests, so the next stroke starts from a true speed.
      if (slice) said = slice(cursors, t, target);
      else if (target && move.gesture === "slide") said = sidesFor(target).some((side) => strayed.has(side) && onTray(cursors[side], target)) ? "hit" : null;
      else if (target) said = handsFor(cursors, target).some((hand) => onDot(hand, target, aspect)) ? "hit" : null;
      if (said === "hit") restUntil = t + REST_MS;
      return said;
    },
  };
}
