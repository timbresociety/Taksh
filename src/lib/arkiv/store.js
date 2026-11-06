// Server-only reads and writes against Arkiv's Rabdi testnet. Writes sign with the writer wallet in
// ARKIV_PRIVATE_KEY, which never leaves the server. Reads trust only entities that wallet owns.
import { createPublicClient, createWalletClient, ExpirationTime, NoEntityFoundError, SchemaMismatchError } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc, eq, gt } from "@arkiv-network/sdk/query";
import { i32 } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_WRITER, ENTITY_KEY, Games, Scores, gameValues, plainRow, readSpecBytes, scoreValues } from "./schema.js";

export const BOARD_SIZE = 10;
const SCORE_LIFETIME = () => ExpirationTime.fromDays(30); // a rolling monthly board
const GAME_LIFETIME = () => ExpirationTime.max(); // about 182 days, extendable

let clients;

// One RPC failure shouldn't hang a request for half a minute, so keep timeouts short.
export function connect() {
  if (clients) return clients;
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
  const transport = http(undefined, { timeout: 8000, retryCount: 1 });
  let account = null;
  try {
    if (process.env.ARKIV_PRIVATE_KEY) account = privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY);
  } catch {
    console.error("ARKIV_PRIVATE_KEY is not a valid private key, so Arkiv writes are off.");
  }
  clients = {
    reader: createPublicClient({ chain, transport }),
    writer: account ? createWalletClient({ chain, transport, account }) : null,
    owner: account?.address ?? process.env.ARKIV_WRITER_ADDRESS ?? DEFAULT_WRITER,
  };
  return clients;
}

// scope: { template, world?, style?, hash?, mode? }. Every condition is an indexed column.
export function scoreQuery(reader, owner, scope) {
  let query = reader
    .select({ $key: true, player: true, score: true, world: true, style: true, mode: true, outcome: true, actions: true, durationMs: true })
    .from(Scores)
    .ownedBy(owner)
    .where(eq("template", scope.template));
  if (scope.world) query = query.where(eq("world", scope.world));
  if (scope.style) query = query.where(eq("style", scope.style));
  if (scope.hash) query = query.where(eq("specHash", scope.hash));
  if (scope.mode) query = query.where(eq("mode", scope.mode));
  return query.orderBy(desc("score")).limit(BOARD_SIZE).withCount();
}

export function gamesQuery(reader, owner, { template, limit = 30 } = {}) {
  let query = reader
    .select({ $key: true, title: true, template: true, world: true, style: true, author: true, source: true, specHash: true, publishedAt: true, swarmRef: true })
    .from(Games)
    .ownedBy(owner);
  if (template) query = query.where(eq("template", template));
  return query.orderBy(desc("publishedAt")).limit(limit).withCount();
}

export async function topScores(scope) {
  const { reader, owner } = connect();
  const query = scoreQuery(reader, owner, scope);
  const page = await query.fetch();
  return { rows: page.entities.map(plainRow), count: Number(page.count), block: Number(page.blockNumber), query: query.toString(), owner };
}

const unavailable = (message) => Object.assign(new Error(message), { status: 503, expose: true });

function requireWriter() {
  const { writer } = connect();
  if (!writer) throw unavailable("Arkiv writes are off: no writer key is set on this server.");
  return writer;
}

// An unfunded wallet fails with "Execution error without revert data", which says nothing. Name the cause.
async function create(schema, values, expiration) {
  const writer = requireWriter();
  try {
    return await writer.createEntity(schema, values, { expiration });
  } catch (error) {
    const balance = await connect().reader.getBalance({ address: writer.account.address }).catch(() => null);
    if (balance === 0n) throw unavailable(`The writer wallet ${writer.account.address} has no tGLM. Fund it at https://hub.arkiv.network/faucet.`);
    throw error;
  }
}

// Rank is one more than the scores on the same template that beat it.
export async function postScore(input) {
  const { reader, owner } = connect();
  const values = scoreValues(input);
  const { entityKey, txHash } = await create(Scores, values, SCORE_LIFETIME());
  const [better, total] = await Promise.all([
    reader.count().from(Scores).ownedBy(owner).where(eq("template", values.template)).where(gt("score", i32(values.score))).fetch(),
    reader.count().from(Scores).ownedBy(owner).where(eq("template", values.template)).fetch(),
  ]);
  return { key: entityKey, txHash, rank: Number(better) + 1, total: Number(total) };
}

export async function listGames(options) {
  const { reader, owner } = connect();
  const page = await gamesQuery(reader, owner, options).fetch();
  return { games: page.entities.map(plainRow), count: Number(page.count) };
}

// The same spec published twice points at the first entity instead of paying for a second.
// upload, if given, runs only for a new game and returns its Swarm reference, or null.
export async function publishGame({ upload, ...input }) {
  requireWriter();
  const { reader, owner } = connect();
  const { entities } = await reader.select({ $key: true }).from(Games).ownedBy(owner).where(eq("specHash", input.hash)).limit(1).fetch();
  if (entities[0]) return { key: entities[0].$key, existing: true };
  const swarmRef = (await upload?.()) ?? null;
  const { entityKey, txHash } = await create(Games, gameValues({ ...input, swarmRef }), GAME_LIFETIME());
  return { key: entityKey, txHash, existing: false, swarmRef };
}

// Returns null for a key that isn't a live game from our writer.
export async function readGame(key) {
  if (!ENTITY_KEY.test(key ?? "")) return null;
  const { reader, owner } = connect();
  try {
    const entity = await reader.getEntity(key, Games);
    if (entity.$owner.toLowerCase() !== owner.toLowerCase()) return null;
    return { key, title: entity.title.value, author: entity.author.value, specHash: entity.specHash.value, swarmRef: entity.swarmRef?.value ?? null, spec: readSpecBytes(entity.spec.value) };
  } catch (error) {
    if (error instanceof NoEntityFoundError || error instanceof SchemaMismatchError) return null;
    throw error;
  }
}
