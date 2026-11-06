"use client";

import { useSearchParams } from "next/navigation";
import { DEFAULT_HERO } from "@/lib/spec/contract";
import MoveCoach from "./MoveCoach";

// One move on a loop at /debug/moves?move=uppercut_right, for checking poses by eye.
export default function MoveReview() {
  const move = useSearchParams().get("move") ?? "punch_left";
  return (
    <main style={{ height: "100dvh", background: "#1538d6" }}>
      <MoveCoach gesture={move} look={DEFAULT_HERO} />
    </main>
  );
}
