"use client";

import { useEffect, useState } from "react";
import { templateInfo } from "@/lib/templates";
import styles from "./DailyCard.module.css";

function untilNext(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

// The first visit of a UTC day asks 0G for the game, so this can take a few seconds.
export default function DailyCard() {
  const [daily, setDaily] = useState(null);
  const [failed, setFailed] = useState(null);
  const [left, setLeft] = useState(null);

  useEffect(() => {
    const loadedAt = Date.now();
    let timer;
    fetch("/api/daily")
      .then((response) => response.json().then((data) => (response.ok ? data : Promise.reject(new Error(data.error)))))
      .then((data) => {
        setDaily(data);
        const tick = () => setLeft(data.nextInMs - (Date.now() - loadedAt));
        tick();
        timer = setInterval(tick, 30_000);
      })
      .catch((error) => setFailed(error.message || "Today's challenge is unavailable right now."));
    return () => clearInterval(timer);
  }, []);

  return (
    <section className={styles.card} aria-labelledby="daily-card-title" data-testid="daily-card">
      <div>
        <p className={styles.label}>Today&apos;s challenge{daily && `, ${daily.date}`}</p>
        <h2 id="daily-card-title" className={styles.title}>{daily ? daily.title : failed ? "Unavailable" : "Making today's game on 0G"}</h2>
        {failed && <p className="error" role="alert">{failed}</p>}
        {daily && (
          <p className={styles.facts}>
            {templateInfo(daily.template)?.name !== daily.title && <>{templateInfo(daily.template)?.name}. </>}
            {daily.source === "0g" ? <>Made on 0G from &ldquo;{daily.theme}&rdquo;, request <code data-testid="daily-request">{daily.requestId}</code>.</> : <strong>{daily.reason}</strong>}{" "}
            Next challenge in {untilNext(left ?? daily.nextInMs)}.
          </p>
        )}
        <div className={styles.actions}>
          <a className="button button--go" href="/daily" aria-disabled={!daily}>Play today&apos;s challenge</a>
          {daily && <a className="text-button" href={`/daily/${daily.date}`}>Today&apos;s board</a>}
          {daily && <a className="text-button" href={`/daily/${daily.yesterday.date}`}>Yesterday&apos;s board ({daily.yesterday.title})</a>}
        </div>
      </div>
      {daily && <img src={`/previews/game-${daily.template}.webp`} alt="" width="640" height="360" />}
    </section>
  );
}
