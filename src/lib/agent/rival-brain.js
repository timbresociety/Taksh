// The browser half of the 0G rival. While a round runs it keeps the rival's plan topped up from
// /api/rival/decide, and logs every decision with its 0G request ID. A call that fails or runs past
// the timeout is logged as a safe stop: no plan arrives, so the rival holds its guard.
const TIMEOUT_MS = 6000;
const RETRY_MS = 1500;

export function startRivalBrain(session, { onChange = () => {}, fetch = globalThis.fetch } = {}) {
  const decisions = [];
  let busy = false;
  let waitUntil = 0;
  let status = "thinking";
  let taunt = null;
  let stopped = false;

  async function decide() {
    busy = true;
    const observation = session.template.observe(session.state);
    const askedAt = session.state.t;
    try {
      const response = await fetch("/api/rival/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(observation),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const reply = await response.json();
      if (!response.ok) throw new Error(reply.error ?? `HTTP ${response.status}`);
      if (stopped) return;
      session.plan(reply.plan);
      decisions.push({ t: askedAt, appliedAt: session.state.t, observation, plan: reply.plan, read: reply.read, taunt: reply.taunt, ms: reply.ms, ...reply.trace });
      status = "planned";
      taunt = reply.taunt;
    } catch (error) {
      if (stopped) return;
      decisions.push({ t: askedAt, observation, safeStop: error.name === "TimeoutError" ? "0G took too long" : error.message });
      status = "lost";
      waitUntil = Date.now() + RETRY_MS;
    } finally {
      busy = false;
      onChange({ status, taunt, decisions: decisions.length });
    }
  }

  return {
    decisions,
    // Called every frame. Asks again while one planned shot is still left, so the next plan lands in time.
    tick() {
      if (stopped || busy || session.phase === "ended" || Date.now() < waitUntil) return;
      if (session.state.plan.length <= 1 && !session.state.attack) decide();
    },
    stop() {
      stopped = true;
    },
  };
}
