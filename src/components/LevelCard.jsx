// A level the model designed from the player's earlier runs: what changed, by how much, and why.
// The numbers come from code comparing the two specs; only the reasons are the model's words.
import { formatValue } from "./ResultStage";

export default function LevelCard({ level }) {
  const where = level.source === "0g" ? "on 0G in a private TEE" : `with ${level.model}`;
  return (
    <aside className="level-card" data-testid="level-card">
      <p className="level-card__title">
        Level {level.number}, designed {where} from your {level.runs} {level.runs === 1 ? "run" : "runs"}
      </p>
      {level.headline && <p>{level.headline}</p>}
      <ul>
        {level.changes.map((change) => (
          <li key={change.key}>
            <strong>
              {change.label}: {formatValue(change.before, change.unit)} → {formatValue(change.after, change.unit)}.
            </strong>{" "}
            {change.why}
          </li>
        ))}
      </ul>
      {level.requestId && (
        <p className="level-card__id" title={level.requestId}>
          0G request <code>{level.requestId}</code>
        </p>
      )}
    </aside>
  );
}
