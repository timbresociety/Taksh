"use client";

import { useEffect, useRef, useState } from "react";
import { createCoach } from "@/lib/stage/coach";
import { DEFAULT_HERO } from "@/lib/spec/contract";

// A rigged character showing one move on a loop. replay is any value that changes to restart it.
// coachRef hands the coach to a parent that draws its ghost over a camera picture.
export default function MoveCoach({ gesture, look = DEFAULT_HERO, replay = 0, coachRef }) {
  const host = useRef(null);
  const own = useRef(null);
  const coach = coachRef ?? own;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const onResize = () => coach.current?.resize();
    createCoach(host.current, look).then((made) => {
      if (!alive) {
        made.dispose();
        return;
      }
      coach.current = made;
      setReady(true);
    });
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.removeEventListener("resize", onResize);
      coach.current?.dispose();
      coach.current = null;
      setReady(false);
    };
  }, [look, coach]);

  useEffect(() => {
    if (ready) coach.current.show(gesture);
  }, [ready, gesture, replay, coach]);

  return <div ref={host} className="coach" data-testid="coach" data-ready={ready} data-gesture={gesture} />;
}
