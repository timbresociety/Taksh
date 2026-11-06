// The 0G rival's ledger on Arkiv, so every server instance sees the same rounds. Each decision 0G
// returned is an entity that expires after an hour: once a round can no longer be stored, its
// records have no use. A stored round gets a "spent" entity so it can't be stored twice.
// Server-only. Reads trust only entities the writer wallet owns, like the scores and games.
import { ExpirationTime } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { readSpecBytes } from "./schema.js";
import { connect } from "./store.js";

export const Decisions = defineSchema("taksh.rival.decisions.v1", {
  roundId: str().indexed(),
  requestId: str().indexed(),
  askedAt: u64(),
  issuedAt: u64(),
  record: bytes(), // plan, read, observation and 0G trace, as JSON
});

export const Spent = defineSchema("taksh.rival.spent.v1", {
  roundId: str().indexed(),
  rootHash: str(),
  storedAt: u64(),
});

const LIFETIME = () => ExpirationTime.fromHours(1);
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const valueOf = (field) => (field && typeof field === "object" && "value" in field ? field.value : field);

export async function writeDecision(requestId, { roundId, askedAt, issuedAt, ...rest }) {
  // Wrap times in u64(): a bare bigint is written as a u256 and the schema refuses it.
  const { writer } = connect();
  await writer.createEntity(Decisions, { roundId, requestId, askedAt: u64(BigInt(askedAt)), issuedAt: u64(BigInt(issuedAt)), record: encode(rest) }, { expiration: LIFETIME() });
}

export async function readRound(roundId) {
  const { reader, owner } = connect();
  // 100 is the node maximum. A 120 s round asks 0G about 30 times.
  const [decisions, spent] = await Promise.all([
    reader.select({ requestId: true, askedAt: true, issuedAt: true, record: true }).from(Decisions).ownedBy(owner).where(eq("roundId", roundId)).limit(100).fetch(),
    reader.count().from(Spent).ownedBy(owner).where(eq("roundId", roundId)).fetch(),
  ]);
  const records = decisions.entities.map((entity) => ({
    requestId: valueOf(entity.requestId),
    roundId,
    askedAt: Number(valueOf(entity.askedAt)),
    issuedAt: Number(valueOf(entity.issuedAt)),
    ...readSpecBytes(valueOf(entity.record)), // bytes come back as hex JSON
  }));
  return { records, spent: Number(spent) > 0 };
}

export async function writeSpent(roundId, rootHash) {
  const { writer } = connect();
  await writer.createEntity(Spent, { roundId, rootHash: rootHash ?? "", storedAt: u64(BigInt(Date.now())) }, { expiration: ExpirationTime.fromHours(2) });
}
