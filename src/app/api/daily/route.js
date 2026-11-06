import { addDays, dayKey, isDate, msUntilNextDay } from "@/lib/daily/daily";
import { dailyChallenge, inWindow } from "@/lib/daily/server";
import { arkivRoute, badRequest } from "../arkiv/_route";

export const dynamic = "force-dynamic";

// GET /api/daily[?date=YYYY-MM-DD]. Today's challenge, made on 0G and stored on Arkiv by the first
// request of the day. Past dates are read only. Yesterday's title comes along for the board link.
export const GET = arkivRoute(async (request) => {
  const now = Date.now();
  const today = dayKey(now);
  const date = request.nextUrl.searchParams.get("date") ?? today;
  if (!isDate(date) || !inWindow(date, now)) throw badRequest(`No challenge for "${date}".`);
  const yesterday = addDays(date, -1);
  const [challenge, before] = await Promise.all([dailyChallenge(date, now), dailyChallenge(yesterday, now)]);
  return {
    ...challenge,
    title: challenge.spec.title,
    template: challenge.spec.template,
    nextInMs: msUntilNextDay(now),
    yesterday: { date: yesterday, title: before.spec.title, source: before.source },
  };
});
