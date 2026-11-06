// 0G Storage for rival episodes, on Galileo testnet. Server-side only: the writer key never leaves.
// An episode is small JSON, so it goes up as one MemData blob and comes back by its root hash.
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { MAX_EPISODE_BYTES } from "./episode.js";

export const OG_STORAGE_RPC = process.env.OG_STORAGE_RPC || "https://evmrpc-testnet.0g.ai";
export const OG_STORAGE_INDEXER = process.env.OG_STORAGE_INDEXER || "https://indexer-storage-testnet-turbo.0g.ai";
export const OG_STORAGE_EXPLORER = "https://chainscan-galileo.0g.ai";

export function encodeEpisode(episode) {
  const bytes = new TextEncoder().encode(JSON.stringify(episode));
  if (bytes.length > MAX_EPISODE_BYTES) throw Object.assign(new Error("That episode is too large to store."), { status: 400, expose: true });
  return bytes;
}

export async function rootHashOf(bytes) {
  const [tree, error] = await new MemData(bytes).merkleTree();
  if (error) throw error;
  return tree.rootHash();
}

export async function uploadEpisode(episode) {
  if (!process.env.OG_STORAGE_PRIVATE_KEY) throw Object.assign(new Error("0G Storage is not set up: OG_STORAGE_PRIVATE_KEY is missing."), { status: 503, expose: true });
  const bytes = encodeEpisode(episode);
  const rootHash = await rootHashOf(bytes);
  const signer = new Wallet(process.env.OG_STORAGE_PRIVATE_KEY, new JsonRpcProvider(OG_STORAGE_RPC));
  const [tx, error] = await new Indexer(OG_STORAGE_INDEXER).upload(new MemData(bytes), OG_STORAGE_RPC, signer);
  if (error) {
    const message = String(error.message ?? error);
    const broke = /insufficient funds|balance/i.test(message);
    throw Object.assign(new Error(broke ? "The 0G Storage wallet has no testnet 0G. Fund it at faucet.0g.ai." : `0G Storage upload failed: ${message.slice(0, 160)}`), { status: 503, expose: true, rootHash });
  }
  return { rootHash: tx.rootHash ?? rootHash, txHash: tx.txHash ?? null, bytes: bytes.length };
}

// Fetches an episode back by root hash, with Merkle proof checking.
export async function downloadEpisode(rootHash) {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const dir = await mkdtemp(path.join(tmpdir(), "taksh-episode-"));
  const file = path.join(dir, "episode.json");
  try {
    const error = await new Indexer(OG_STORAGE_INDEXER).download(rootHash, file, true);
    if (error) throw new Error(`0G Storage download failed: ${error.message ?? error}`);
    return JSON.parse(await readFile(file, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
