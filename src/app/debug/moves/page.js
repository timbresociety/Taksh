import { Suspense } from "react";
import MoveReview from "@/components/MoveReview";

export default function Page() {
  return (
    <Suspense>
      <MoveReview />
    </Suspense>
  );
}
