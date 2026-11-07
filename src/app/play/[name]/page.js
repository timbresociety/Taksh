import Link from "next/link";
import { redirect } from "next/navigation";
import { normalize } from "viem/ens";
import Studio from "@/components/Studio";
import { ensConfig, readGame } from "@/lib/ens/chain";
import { KEYS, recordsToSpec } from "@/lib/ens/records";
import { validateSpec } from "@/lib/spec/validate";

// The name is the game's address: every visit resolves it live through the ENS Universal Resolver,
// rebuilds the spec from its text records and validates it before anything loads.
async function load(param) {
  const config = ensConfig();
  if (!config.deployment) return { error: config.reason };
  const raw = decodeURIComponent(param).trim();
  // A bare label is short for a game under this app's parent name.
  let name = raw.includes(".") || !config.parent ? raw : `${raw}.${config.parent}`;
  try {
    name = normalize(name);
  } catch {
    return { name: raw, error: "That is not a valid ENS name." };
  }
  let found;
  try {
    found = await readGame(config, name);
  } catch (error) {
    console.error("ens resolve", error);
    return { name, error: "ENS could not be reached, so this game can't load right now." };
  }
  if (!found.resolver) return { name, error: "This name does not exist on ENS." };
  // A name with records but no game, such as the rival's, gets the ENS view instead of an error.
  if (!found.texts[KEYS.spec]) return { name, other: true };
  try {
    const check = validateSpec(recordsToSpec(found.texts));
    if (!check.ok) return { name, error: `The game on this name is invalid: ${check.errors[0]}` };
    return { name: found.name, resolver: found.resolver, chain: config.chainName, spec: check.spec };
  } catch (error) {
    return { name, error: error.message };
  }
}

export async function generateMetadata({ params }) {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} on Taksh` };
}

export default async function PlayByName({ params }) {
  const game = await load((await params).name);
  if (game.other) redirect(`/name/${game.name}`);
  if (game.error) {
    return (
      <main className="result">
        <h1>{game.name ?? "No game"}</h1>
        <p className="error" role="alert" data-testid="ens-error">{game.error}</p>
        <Link className="button" href="/">Back to all games</Link>
      </main>
    );
  }
  return (
    <>
      <p className="source-note" style={{ top: "auto", bottom: 14 }} data-testid="ens-source">
        {game.name}, resolved on {game.chain} through the ENS Universal Resolver. Resolver {game.resolver}.{" "}
        <Link href={`/name/${game.name}`}>Owner, roles and records</Link>
      </p>
      <Studio initialGame={{ spec: game.spec, source: "ens", ensName: game.name }} />
    </>
  );
}
