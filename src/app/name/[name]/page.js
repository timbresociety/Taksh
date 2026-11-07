import Link from "next/link";
import { LAST_EPISODE, ROUND_KEYS, ensConfig, inspectName, roundLabel } from "@/lib/ens/chain";
import { KEYS } from "@/lib/ens/records";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  return { title: `${decodeURIComponent((await params).name)} on ENS` };
}

const short = (hex) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
// Anyone can write these keys on a name they own, so a value is shown as a round only when it is a
// 0G Storage root hash, and the score only when it is a number.
const ROOT_HASH = /^0x[0-9a-f]{64}$/i;
const date = (expiry) => new Date(Number(expiry) * 1000).toISOString().slice(0, 10);

function Address({ explorer, value }) {
  if (!value) return "none";
  return explorer ? <a href={`${explorer}/address/${value}`} target="_blank" rel="noreferrer"><code>{short(value)}</code></a> : <code>{value}</code>;
}

// What ENSv2 says about a name, read live on every visit: where it sits in the registry hierarchy,
// who owns its token and what that token lets them do, its Permissioned Resolver, and exactly which
// text keys the Taksh server wallet can write there. Nothing on this page is stored by the app.
export default async function NamePage({ params }) {
  const config = ensConfig();
  const raw = decodeURIComponent((await params).name).trim();
  const name = raw.includes(".") || !config.parent ? raw : `${raw}.${config.parent}`;
  let view;
  try {
    view = await inspectName(config, name);
  } catch (error) {
    if (!error.status) console.error("ens inspect", error);
    view = { error: error.status ? error.message : "ENS could not be reached, so this name can't be read right now." };
  }
  if (view.error) {
    return (
      <main className="shelf-page">
        <header className="court__mark"><Link href="/">Taksh</Link></header>
        <section className="ens-name"><h1>{name}</h1><p className="error" role="alert" data-testid="ens-error">{view.error}</p></section>
      </main>
    );
  }

  const { explorer, entry, records } = view;
  const isGame = Boolean(records[KEYS.spec]);
  const isAgent = Boolean(records["agent-context"]);
  const parent = view.path.at(-2);
  const writable = view.serverKeys.filter((grant) => grant.canWrite);
  const allResolverRoles = view.ownerResolverRoles.length === 20;
  // The round blocks claim the Taksh server wrote them, so they show only on the rival's own names
  // (view.isRival), never on a name that copied its keys onto a resolver of its own.
  const lastEpisode = view.isRival && ROOT_HASH.test(records[LAST_EPISODE] ?? "") ? records[LAST_EPISODE] : null;
  const round = view.isRival && ROOT_HASH.test(records[ROUND_KEYS.episode] ?? "") ? records[ROUND_KEYS.episode] : null;
  const score = round && /^\d{1,9}$/.test(records[ROUND_KEYS.score] ?? "") ? records[ROUND_KEYS.score] : null;

  return (
    <main className="shelf-page">
      <header className="court__mark"><Link href="/">Taksh</Link></header>
      <section className="ens-name" data-testid="ens-name-view">
        <h1>{view.name}</h1>
        <p>
          Read live from ENSv2 on {view.chain} at block {view.block.toString()}.{" "}
          {isGame && <Link className="button" href={`/play/${view.name}`}>Play this game</Link>}
        </p>

        <h2>Where it lives</h2>
        <ol className="ens-name__path" data-testid="ens-path">
          <li>.eth registry <Address explorer={explorer} value={view.path[0].registry} /></li>
          {view.path.map((step) => (
            <li key={step.name}>
              <strong>{step.name}</strong>
              {step.status === "available" ? ", not registered" : <>, {step.status}, owned by <Address explorer={explorer} value={step.owner} />, expires {date(step.expiry)}</>}
              {step !== view.path[0] && <> · held in registry <Address explorer={explorer} value={step.registry} /></>}
            </li>
          ))}
        </ol>
        {!entry && view.resolver && <p>No registry holds this exact name. The Universal Resolver still answers for it through its closest ancestor&apos;s resolver (wildcard resolution).</p>}
        {!entry && !view.resolver && <p data-testid="ens-unregistered">Nobody has registered this name.</p>}

        {entry && (
          <>
            <h2>Its token</h2>
            <dl className="ens-name__facts">
              <div><dt>Owner</dt><dd><Address explorer={explorer} value={entry.owner} /></dd></div>
              <div><dt>Owner can</dt><dd data-testid="ens-token-roles">{view.tokenRoles.join(", ") || "nothing"}</dd></div>
              <div><dt>Transferable</dt><dd>{view.tokenRoles.includes("transfer") ? "yes" : "no"}</dd></div>
              <div><dt>Expires</dt><dd>{date(entry.expiry)}{parent?.expiry === entry.expiry ? `, with ${parent.name}` : ""}</dd></div>
              <div>
                <dt>Can it be taken back?</dt>
                <dd data-testid="ens-emancipated">
                  {view.emancipated
                    ? "No. The registry that holds it is emancipated: no account holds unregister, set resolver or set subregistry on its root."
                    : "Yes. An account holds a root role on its registry that could unregister it or change its resolver."}
                </dd>
              </div>
            </dl>
          </>
        )}

        <h2>Its resolver</h2>
        {view.resolver ? (
          <>
            <p>
              Permissioned Resolver <Address explorer={explorer} value={view.resolver} />.{" "}
              {entry && (allResolverRoles ? "The owner holds every resolver role and its admin." : `The owner holds: ${view.ownerResolverRoles.join(", ") || "no root roles"}.`)}
            </p>
            {view.server && (
              <p data-testid="ens-server-roles">
                The Taksh server wallet <Address explorer={explorer} value={view.server} />{" "}
                {writable.length
                  ? <>can set <strong>{writable.map((grant) => grant.key).join(", ")}</strong> and no other key below.</>
                  : "holds no role here, so it can't change any record below."}
              </p>
            )}
            <table className="ens-name__records" data-testid="ens-records">
              <thead><tr><th>Text record</th><th>Value</th><th>Server can set</th></tr></thead>
              <tbody>
                {Object.entries(records).map(([key, value]) => (
                  <tr key={key}>
                    <td><code>{key}</code></td>
                    <td>{value.length > 120 ? <details><summary>{value.slice(0, 80)}…</summary><pre>{value}</pre></details> : value}</td>
                    <td>{view.serverKeys.find((grant) => grant.key === key)?.canWrite ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p>No resolver, so this name has no records.</p>
        )}

        {isAgent && (
          <>
            <h2>The agent behind this name</h2>
            <p>ENSIP-26 records. An agent or a person can read what it is and where to reach it from the name alone.</p>
            <pre className="ens-name__context" data-testid="ens-agent-context">{records["agent-context"]}</pre>
            {lastEpisode && (
              <p data-testid="ens-last-episode">
                Its latest round on 0G Storage is <code>{short(lastEpisode)}</code>, named{" "}
                <Link href={`/name/${roundLabel(lastEpisode)}.${view.name}`}>{roundLabel(lastEpisode)}.{view.name}</Link>. Replay it with{" "}
                <code>npm run replay-episode -- {lastEpisode}</code>.
              </p>
            )}
          </>
        )}

        {round && (
          <>
            <h2>A round the rival fought</h2>
            <p data-testid="ens-round">
              {score && <>The server replayed it to a score of {score}. </>}
              The whole round is on 0G Storage at <code>{short(round)}</code>, with the 0G request ID of every
              decision the rival made. Replay it with <code>npm run replay-episode -- {round}</code>.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
