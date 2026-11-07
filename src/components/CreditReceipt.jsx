// What this game cost on 0G, and who paid: the build (intent, generate, revise) plus this round's rival
// decisions. Every line is backed by 0G request IDs, listed on hover.
import { costOf } from "@/lib/og/session";

export default function CreditReceipt({ traces = [], decisions = [], paidByYou }) {
  const played = decisions.filter((decision) => decision.requestId);
  const calls = [...traces, ...played];
  if (!calls.length) return null;
  const usd = (value) => `$${value.toFixed(4)}`;
  return (
    <aside className="receipt" data-testid="credit-receipt" title={calls.map((call) => call.requestId).join("\n")}>
      <p className="receipt__title">{paidByYou ? "Paid from your iAI credits" : "Paid by Taksh"}</p>
      <dl>
        {traces.length > 0 && (
          <div>
            <dt>Building the game · {traces.length} 0G {traces.length === 1 ? "call" : "calls"}</dt>
            <dd>{usd(costOf(traces))}</dd>
          </div>
        )}
        {played.length > 0 && (
          <div>
            <dt>Rival this round · {played.length} {played.length === 1 ? "decision" : "decisions"}</dt>
            <dd>{usd(costOf(played))}</dd>
          </div>
        )}
        <div className="receipt__total">
          <dt>Total</dt>
          <dd>{usd(costOf(calls))}</dd>
        </div>
      </dl>
      <p className="receipt__ids">
        Private TEE on 0G · last request <code>{calls.at(-1).requestId.slice(0, 8)}</code>
      </p>
    </aside>
  );
}
