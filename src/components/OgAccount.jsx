"use client";

import { useEffect, useRef, useState } from "react";
import { msUntilReset, signInAvailable } from "@/lib/og/session";

// The player's 0G account, top right. Judges watch the credit balance drop after each generation, so the
// amount re-animates on every change and the session's spend sits beside it.
// gameCost is what the last game cost on 0G (build plus round), used to say how many more today's credits cover.
export default function OgAccount({ account, gameCost = 0 }) {
  const { ready, signedIn, balance, error, signIn, signOut } = account;
  const start = useRef(null);
  // 0G's login only opens on localhost, so elsewhere (the deployed demo) there's nothing to offer. Read after
  // mount, since the server can't know the host the browser sees.
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(signInAvailable()), []);
  if (!signedIn) start.current = null;
  else if (balance && start.current == null) start.current = balance;
  if (!ready || !available) return null;

  const spent = signedIn && balance && start.current ? Number(start.current.credit_balance) - Number(balance.credit_balance) : 0;

  return (
    <div className="og-account" data-testid="og-account">
      {signedIn ? (
        <div className="og-chip">
          <Mark />
          <span className="og-chip__body">
            <span className="og-chip__label">iAI credits</span>
            <strong key={balance?.credit_balance} className="og-chip__amount" data-testid="og-credits">
              {formatCredits(balance?.credit_balance, balance?.currency)}
            </strong>
          </span>
          {spent > 0 && (
            <span className="og-chip__spent" title="Spent from your 0G credits since you signed in">
              −{formatCredits(spent, balance.currency)}
            </span>
          )}
          <span className="og-chip__divider" aria-hidden="true" />
          {balance?.address && (
            <span className="og-chip__who" title={balance.address}>
              {balance.address.slice(0, 6)}…{balance.address.slice(-4)}
            </span>
          )}
          <button type="button" className="og-chip__out" onClick={signOut} aria-label="Sign out of 0G" title="Sign out">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12 6l4 4-4 4M16 10H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <button type="button" className="og-signin" onClick={signIn}>
          <Mark />
          <span>
            Sign in with 0G
            <small>Play on your iAI credits</small>
          </span>
        </button>
      )}
      {signedIn && balance?.currency === "usd" && <Today credits={Number(balance.credit_balance) / 1e6} gameCost={gameCost} />}
      {error && <p className="og-account__error" role="alert">{error}</p>}
    </div>
  );
}

// Today's credits expire at 00:00 UTC, so the chip says how long is left and roughly how many games that is.
function Today({ credits, gameCost }) {
  const minutes = Math.floor(msUntilReset() / 60000);
  const left = gameCost > 0 ? Math.floor(credits / gameCost) : null;
  return (
    <p className="og-account__today" data-testid="og-today">
      Expires in {Math.floor(minutes / 60)}h {minutes % 60}m{left != null && <> · about <strong>{left.toLocaleString()}</strong> more games like your last</>}
    </p>
  );
}

const Mark = () => <span className="og-mark" aria-hidden="true">0G</span>;

// /account/balance reports USD in micro-units ("10160886" with currency "usd" is $10.16), the same unit
// as a call's billing in x_0g_trace. Any other currency is shown raw rather than guessed at.
const formatCredits = (value, currency) => {
  if (value == null) return "…";
  return currency === "usd" ? `$${(Number(value) / 1e6).toFixed(4)}` : `${value} ${currency ?? ""}`.trim();
};
