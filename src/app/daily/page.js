import Studio from "@/components/Studio";
import { dayKey } from "@/lib/daily/daily";
import { dailyChallenge } from "@/lib/daily/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today's challenge" };

// Opens today's game like a shared one. The daily tag rides on the game, so the result screen shows today's board.
export default async function Page() {
  const challenge = await dailyChallenge(dayKey());
  const { spec, hash, date, source, reason, requestId } = challenge;
  return <Studio initialGame={{ spec, source: source === "0g" ? "0g" : "template", daily: { date, hash, source, reason, requestId } }} />;
}
