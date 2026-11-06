import Link from "next/link";
import { topScores } from "@/lib/arkiv/store";
import { dayKey, isDate } from "@/lib/daily/daily";
import { dailyChallenge } from "@/lib/daily/server";
import styles from "@/components/DailyCard.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily board" };

// One day's board, read live from Arkiv: every score posted with daily = this date.
export default async function Page({ params }) {
  const { date } = await params;
  const valid = isDate(date) && date <= dayKey();
  let board = null;
  let challenge = null;
  if (valid) {
    [board, challenge] = await Promise.all([
      topScores({ daily: date }).catch((error) => {
        console.error("Arkiv daily board read failed:", error.shortMessage ?? error.message);
        return null;
      }),
      dailyChallenge(date),
    ]);
  }

  return (
    <main className="shelf-page">
      <header className="court__mark">
        <Link href="/">Taksh</Link>
      </header>
      <section className={styles.page} aria-labelledby="daily-title">
        <h2 id="daily-title">{valid ? `${challenge.spec.title}, ${date}` : "No challenge for that date"}</h2>
        {challenge && (
          <p>
            {challenge.source === "0g" ? <>Made on 0G, request <code>{challenge.requestId}</code>.</> : challenge.reason}
          </p>
        )}
        {valid && !board && <p className="error" role="alert">Arkiv did not respond, so this board is unavailable right now.</p>}
        {board?.rows.length === 0 && <p>No scores on this day&apos;s challenge.</p>}
        {board?.rows.length > 0 && (
          <table className="controls" data-testid="daily-board">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Score</th>
                <th scope="col">Played with</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row, index) => (
                <tr key={row.key}>
                  <td>{index + 1}</td>
                  <td>{row.player}</td>
                  <td>{row.score}</td>
                  <td>{row.mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {board && (
          <details className="spec-json">
            <summary>{board.count} scores, read at block {board.block}. Query sent to Arkiv</summary>
            <pre>{board.query}</pre>
          </details>
        )}
        <p className={styles.actions}>
          {date === dayKey() && <Link className="button button--go" href="/daily">Play today&apos;s challenge</Link>}
          <Link className="text-button" href="/">All games</Link>
        </p>
      </section>
    </main>
  );
}
