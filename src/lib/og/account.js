"use client";
// Sign in with a 0G account (iAI bonus). The player logs in through 0G's Privy app, the router swaps that
// Privy token for a 0G session, and the session pays for generation from the player's daily iAI credits.
// This mirrors pc.0g.ai. The router only accepts it from localhost:3000, 3001 or 5173.
import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { OG_BASE_URL } from "@/lib/pipeline/provider-0g";
import { setOgSession } from "./session";

// ponytail: 0G's Privy app ID as pc.0g.ai uses it. Set NEXT_PUBLIC_OG_PRIVY_APP_ID if 0G hands out a different one.
export const OG_PRIVY_APP_ID = process.env.NEXT_PUBLIC_OG_PRIVY_APP_ID || "cmn5w697g01xp0bl80c8dskc8";

// Bearer only, never the router's cookie. The browser may hold a 0G cookie from pc.0g.ai or an earlier
// login, and that cookie names whoever logged in there, not the player signed in here.
async function router(path, init = {}, session) {
  const response = await fetch(`${OG_BASE_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: { "Content-Type": "application/json", ...(session && { Authorization: `Bearer ${session}` }), ...init.headers },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message ?? `0G answered ${response.status}`);
  return json;
}

export function useOgAccount() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (token = session) => {
    if (!token) return;
    try {
      setBalance(await router("/account/balance", {}, token));
    } catch (failure) {
      setError(`Balance: ${failure.message}`);
    }
  }, [session]);

  // Keyed on the Privy user, so switching accounts swaps the 0G session too.
  const privyUserId = authenticated ? user?.id : null;
  useEffect(() => {
    setSession(null);
    setBalance(null);
    if (!privyUserId) return;
    let live = true;
    (async () => {
      try {
        const { token } = await router("/auth/privy", { method: "POST", body: JSON.stringify({ token: await getAccessToken() }) });
        // The 0G session has to belong to the person Privy just signed in, or we'd bill someone else.
        const me = await router("/auth/me", {}, token);
        if (me.privy_user_id !== privyUserId) throw new Error("0G returned a session for a different account. Sign out and in again.");
        if (!live) return;
        setSession(token);
        setError(null);
        refresh(token);
      } catch (failure) {
        if (live) setError(`Sign-in: ${failure.message}`);
      }
    })();
    return () => {
      live = false;
    };
  }, [privyUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setOgSession(session), [session]);

  // ponytail: a 20 s poll keeps the badge honest when credits are spent elsewhere (pc.0g.ai, another tab).
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => refresh(session), 20000);
    return () => clearInterval(timer);
  }, [session, refresh]);

  const signOut = async () => {
    await router("/auth/signout", { method: "POST" }, session).catch(() => {});
    await logout();
  };

  return { ready, signedIn: Boolean(session), session, balance, error, signIn: login, signOut, refresh };
}
