// Server-only reads and writes against Arkiv's Rabdi testnet. Writes sign with the writer wallet in
// ARKIV_PRIVATE_KEY, which never leaves the server. Reads trust only entities that wallet owns.
import { createPublicClient, createWalletClient, ExpirationTime, NoEntityFoundError, SchemaMismatchError } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc, eq, gt } from "@arkiv-network/sdk/query";
import { i32 } from "@arkiv-network/sdk/schema";
import { http, nonceManager } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pickEarliest } from "../daily/daily.js";
import { DEFAULT_WRITER, isTestRow, shownName, Daily, ENTITY_KEY, Games, SCORE_DAYS, Scores, dailyValues, daysLeft, gameValues, plainRow, readSpecBytes, scoreValues } from "./schema.js";

export const BOARD_SIZE = 10;
const SCORE_LIFETIME = () => ExpirationTime.fromDays(SCORE_DAYS); // a rolling monthly board
const GAME_LIFETIME = () => ExpirationTime.max(); // about 182 days, extendable
// Today's and yesterday's games are the ones the app reads. Eight days keeps a week of past
// challenges readable from the RPC, plus a day of slack.
const DAILY_LIFETIME = () => ExpirationTime.fromDays(8);

let clients;

// Every read and write gets a hard deadline, so a route answers { available: false } instead of
// hanging. Writes wait for the receipt, which took about 8 s, so they get longer.
export const READ_MS = 10_000;
export const WRITE_MS = 25_000;

const unavailable = (message, reason) => Object.assign(new Error(message), { status: 503, expose: true, reason });

// Rejects with an exposed 503 carrying message once ms pass. The call it wraps keeps running.
export function withDeadline(promise, ms, message, reason) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(unavailable(message, reason)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export function arkiv(promise, what, ms = READ_MS) {
  const reason = `Arkiv took longer than ${ms / 1000} s to ${what}`;
  return withDeadline(promise, ms, `${reason}, so this is unavailable right now.`, reason);
}
export const read = (query, what = "answer") => arkiv(query.fetch(), what);

const accessKey = () => process.env.ARKIV_ACCESS_KEY?.trim() ?? "";

// viem wraps the HTTP error, so its status is somewhere down the cause chain.
const httpStatus = (error) => (error ? (error.name === "HttpRequestError" ? error.status : httpStatus(error.cause)) : undefined);

// Why an Arkiv call failed, as a clause the caller finishes with what the player loses.
// Never the error's own message: viem prints the RPC URL, and the access key is in its path.
export function arkivCause(error) {
  if (error?.reason) return error.reason;
  const status = httpStatus(error);
  if (status === 429) return accessKey() ? "Arkiv is rate limiting this server's access key" : "Arkiv's public endpoint is rate limiting this server, which has no ARKIV_ACCESS_KEY";
  if (status === 401 || status === 403) return "Arkiv refused this server's ARKIV_ACCESS_KEY";
  return "Arkiv did not respond";
}

export const arkivMessage = (error, outcome = "this is unavailable right now") =>
  error?.expose && !error.reason ? error.message : `${arkivCause(error)}, so ${outcome}.`;

// The public endpoint answers 429 with Retry-After in minutes (761 s on 2026-11-06) once its quota
// is used. viem sleeps that long before a retry, past its own timeout, so the transport doesn't retry.
export function connect() {
  if (clients) return clients;
  const chain = rabdi({ accessKey: accessKey() });
  const transport = http(undefined, { timeout: 8000, retryCount: 0 });
  let account = null;
  try {
    // Rival decisions arrive every 4 to 6 s and each write takes about 8 s, so writes overlap. Without
    // the nonce manager two of them read the same nonce and one fails ("Execution error without
    // revert data"). viem hands out nonces in order within this process.
    if (process.env.ARKIV_PRIVATE_KEY) account = privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY, { nonceManager });
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

// scope: { template, world?, style?, hash?, mode? } or { daily, mode? }. Every condition is an indexed column.
export function scoreQuery(reader, owner, scope) {
  let query = reader
    .select({ $key: true, $expiresAt: true, player: true, score: true, world: true, style: true, mode: true, outcome: true, actions: true, durationMs: true })
    .from(Scores)
    .ownedBy(owner)
    .where(scope.daily ? eq("daily", scope.daily) : eq("template", scope.template));
  if (scope.world) query = query.where(eq("world", scope.world));
  if (scope.style) query = query.where(eq("style", scope.style));
  if (scope.hash) query = query.where(eq("specHash", scope.hash));
  if (scope.mode) query = query.where(eq("mode", scope.mode));
  return query.orderBy(desc("score")).limit(BOARD_SIZE).withCount();
}

export function gamesQuery(reader, owner, { template, world, limit = 30 } = {}) {
  let query = reader
    .select({ $key: true, $expiresAt: true, title: true, template: true, world: true, style: true, author: true, source: true, specHash: true, publishedAt: true, swarmRef: true })
    .from(Games)
    .ownedBy(owner);
  if (template) query = query.where(eq("template", template));
  if (world) query = query.where(eq("world", world));
  return query.orderBy(desc("publishedAt")).limit(limit).withCount();
}

const withDaysLeft = (entity, block) => {
  const { expiresAt, ...row } = plainRow(entity);
  return { ...row, daysLeft: daysLeft(expiresAt, block) };
};

export async function topScores(scope) {
  const { reader, owner } = connect();
  const query = scoreQuery(reader, owner, scope);
  const page = await read(query, "read the board");
  const all = page.entities.map((entity) => withDaysLeft(entity, page.blockNumber));
  const rows = all.filter((row) => !isTestRow(row)).map((row) => ({ ...row, player: shownName(row.player) }));
  // ponytail: count drops only the test rows on this page. Test rows past the top 10 still count.
  return { rows, count: Number(page.count) - (all.length - rows.length), block: Number(page.blockNumber), query: query.toString(), owner };
}

function requireWriter() {
  const { writer } = connect();
  if (!writer) throw unavailable("Arkiv writes are off: no writer key is set on this server.");
  return writer;
}

// An unfunded wallet fails with "Execution error without revert data", which says nothing. Name the cause.
async function create(schema, values, expiration) {
  const writer = requireWriter();
  try {
    return await arkiv(writer.createEntity(schema, values, { expiration }), "write", WRITE_MS);
  } catch (error) {
    if (error.status === 503) throw error;
    const balance = await arkiv(connect().reader.getBalance({ address: writer.account.address }), "read the balance").catch(() => null);
    if (balance === 0n) throw unavailable(`The writer wallet ${writer.account.address} has no tGLM. Fund it at https://hub.arkiv.network/faucet.`);
    throw error;
  }
}

// Rank is one more than the scores that beat it: on the same template, or on the same day's challenge.
// The score is on chain once create returns. If the count then fails (a 429 hits queries, not
// transactions), say so instead of failing the post, or a retry would post it twice.
export async function postScore(input) {
  const { reader, owner } = connect();
  const values = scoreValues(input);
  const { entityKey, txHash } = await create(Scores, values, SCORE_LIFETIME());
  const posted = { key: entityKey, txHash, daily: values.daily ?? null };
  const scope = values.daily ? eq("daily", values.daily) : eq("template", values.template);
  try {
    const [better, total] = await Promise.all([
      read(reader.count().from(Scores).ownedBy(owner).where(scope).where(gt("score", i32(values.score))), "count the board"),
      read(reader.count().from(Scores).ownedBy(owner).where(scope), "count the board"),
    ]);
    return { ...posted, rank: Number(better) + 1, total: Number(total) };
  } catch (error) {
    return { ...posted, rank: null, total: null, rankError: arkivMessage(error, "your rank can't be counted right now") };
  }
}

// Every challenge our writer stored for a date. Usually one; two if instances raced.
export function dailyQuery(reader, owner, date) {
  return reader.select({ $key: true, $createdAt: true, theme: true, requestId: true, spec: true }).from(Daily).ownedBy(owner).where(eq("date", date)).limit(10);
}

// The earliest challenge for a date, or null if none is stored.
export async function readDaily(date) {
  const { reader, owner } = connect();
  const { entities } = await read(dailyQuery(reader, owner, date), "read today's challenge");
  const first = pickEarliest(entities);
  if (!first) return null;
  return { key: first.$key, date, theme: first.theme.value, requestId: first.requestId.value || null, spec: readSpecBytes(first.spec.value) };
}

export async function writeDaily(input) {
  const { entityKey, txHash } = await create(Daily, dailyValues(input), DAILY_LIFETIME());
  return { key: entityKey, txHash };
}

export const canWrite = () => Boolean(connect().writer);

export async function listGames(options) {
  const { reader, owner } = connect();
  const page = await read(gamesQuery(reader, owner, options), "list games");
  const all = page.entities.map((entity) => withDaysLeft(entity, page.blockNumber));
  const games = all.filter((game) => !isTestRow(game)).map((game) => ({ ...game, author: shownName(game.author) }));
  return { games, count: Number(page.count) - (all.length - games.length) };
}

// The same spec published twice points at the first entity instead of paying for a second.
// upload, if given, runs only for a new game and returns its Swarm reference, or null.
export async function publishGame({ upload, ...input }) {
  requireWriter();
  const { reader, owner } = connect();
  const { entities } = await read(reader.select({ $key: true }).from(Games).ownedBy(owner).where(eq("specHash", input.hash)).limit(1), "look the game up");
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
    const entity = await arkiv(reader.getEntity(key, Games), "read the game");
    if (entity.$owner.toLowerCase() !== owner.toLowerCase()) return null;
    return { key, title: entity.title.value, author: shownName(entity.author.value), specHash: entity.specHash.value, swarmRef: entity.swarmRef?.value ?? null, spec: readSpecBytes(entity.spec.value) };
  } catch (error) {
    if (error instanceof NoEntityFoundError || error instanceof SchemaMismatchError) return null;
    throw error;
  }
}
