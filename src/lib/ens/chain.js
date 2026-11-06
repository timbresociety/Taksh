// ENSv2 on chain: publish a game as a subname, and read a game back from a name. Server only,
// because publishing signs with the registrar key.
import {
  createPublicClient, createWalletClient, encodeFunctionData, fallback, http, isAddress, keccak256, labelhash, parseAbi, parseEventLogs,
  toHex, zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize, packetToBytes } from "viem/ens";
import { KEYS, slugLabel, specToRecords } from "./records.js";

// ENSv2 contracts from the Sepolia (ENSv2) table at https://docs.ens.domains/learn/deployments#sepolia-ensv2.
// The Universal Resolver is not listed here: viem ships its address per chain, and the ENS docs say not to pin it.
export const DEPLOYMENTS = {
  sepolia: {
    chain: sepolia,
    ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
    ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
    verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
    permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
    userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
    mockUsdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
  },
};

// Role bits from the Permissioned Registry and Permissioned Resolver pages. An admin role is the role << 128.
export const admin = (role) => role << 128n;
export const ROLES = {
  registrar: 1n << 0n,
  renew: 1n << 16n,
  setSubregistry: 1n << 20n,
  setResolver: 1n << 24n,
  canTransferAdmin: admin(1n << 28n),
  // Every resolver role and its admin, as in the Verifiable Factory examples.
  allResolver: 0x1111111111111111111111111111111111111111111111111111111111111111n,
  setText: 1n << 4n,
};

// A resolver role scoped to one text key is held on the resource keccak256(key). It's granted with
// grantSetterRoles, not grantRoles, which refuses argument-scoped resources.
export const textResource = (key) => BigInt(keccak256(toHex(key)));

// What a game's creator holds on their subname token: the same set the .eth registrar gives a
// registrant. They can point the name at another resolver, add sub-subnames and transfer it.
export const CREATOR_TOKEN_ROLES =
  ROLES.setSubregistry | admin(ROLES.setSubregistry) | ROLES.setResolver | admin(ROLES.setResolver) | ROLES.canTransferAdmin;

export const ABI = {
  registry: parseAbi([
    "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
    "function getState(uint256 anyId) view returns (State)",
    "function getSubregistry(string label) view returns (address)",
    "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
    "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
    "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
    "function isEmancipated() view returns (bool)",
    "function roles(uint256 resource, address account) view returns (uint256)",
  ]),
  registrar: parseAbi([
    "function isAvailable(string label) view returns (bool)",
    "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
    "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)",
    "function commit(bytes32 commitment)",
    "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
    "function MIN_COMMITMENT_AGE() view returns (uint64)",
  ]),
  factory: parseAbi([
    "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
    "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
  ]),
  resolver: parseAbi([
    "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
    "function setText(bytes name, string key, string value)",
    "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
    "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
    "function grantSetterRoles(bytes setter, address account) returns (bool)",
    "function roles(uint256 resource, address account) view returns (uint256)",
  ]),
  userRegistry: parseAbi(["function initialize((address account, uint256 roleBitmap)[] grants)"]),
  mockUsdc: parseAbi(["function mint(address to, uint256 amount)", "function approve(address spender, uint256 amount) returns (bool)"]),
};

export const STATUS = ["available", "reserved", "registered"];

export function ensConfig(env = process.env) {
  const chainName = env.ENS_CHAIN || "sepolia";
  const deployment = DEPLOYMENTS[chainName];
  const parent = env.ENS_PARENT_NAME ? normalize(env.ENS_PARENT_NAME) : null;
  const config = { chainName, deployment, parent, rpcUrl: env.ENS_RPC_URL || undefined, registrarKey: env.ENS_REGISTRAR_PRIVATE_KEY || null };
  if (!deployment) return { ...config, reason: `ENSv2 has no deployment configured for chain "${chainName}".` };
  if (!parent) return { ...config, reason: "ENS_PARENT_NAME is not set." };
  if (!/^[^.]+\.eth$/.test(parent)) return { ...config, reason: "ENS_PARENT_NAME must be a second-level .eth name." };
  return config;
}

// viem's built-in Sepolia RPC (thirdweb) answers 429 once its free quota is used, and viem then
// waits out Retry-After, so on 2026-11-07 /play/<name> hung 90 s and a publish never finished.
// ENS_RPC_URL goes first, then two keyless public endpoints, then viem's own. Each gets 8 s and no
// retry of its own, so a dead one costs seconds and the next takes over.
export const PUBLIC_RPCS = {
  sepolia: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"],
};

// undefined at the end is viem's own RPC for the chain.
export const rpcUrls = (config) => [...new Set([config.rpcUrl, ...(PUBLIC_RPCS[config.chainName] ?? [])].filter(Boolean)), undefined];

export function rpcTransport(config, { batch = false } = {}) {
  return fallback(rpcUrls(config).map((url) => http(url, { batch, timeout: 8000, retryCount: 0 })), { retryCount: 1 });
}

export function publicClient(config) {
  return createPublicClient({ chain: config.deployment.chain, transport: rpcTransport(config, { batch: true }) });
}

export function walletClient(config, key) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: config.deployment.chain, transport: rpcTransport(config) });
}

export const dnsEncode = (name) => toHex(packetToBytes(name));
export const parentLabel = (config) => config.parent.split(".")[0];

// The parent's state in the .eth registry, and the UserRegistry that holds its subnames.
export async function readParent(config, client = publicClient(config)) {
  const label = parentLabel(config);
  const [state, subregistry] = await Promise.all([
    client.readContract({ address: config.deployment.ethRegistry, abi: ABI.registry, functionName: "getState", args: [BigInt(labelhash(label))] }),
    client.readContract({ address: config.deployment.ethRegistry, abi: ABI.registry, functionName: "getSubregistry", args: [label] }),
  ]);
  return { status: STATUS[state.status], expiry: state.expiry, owner: state.latestOwner, subregistry: subregistry === zeroAddress ? null : subregistry };
}

export function proxyDeployed(receipt) {
  const [log] = parseEventLogs({ abi: ABI.factory, eventName: "ProxyDeployed", logs: receipt.logs });
  if (!log) throw new Error("The factory did not report a deployed proxy.");
  return log.args.proxyAddress;
}

// Random, so a retry never collides with a proxy left by a half-finished attempt.
export const randomSalt = () => BigInt(toHex(crypto.getRandomValues(new Uint8Array(32))));

// Two transactions from the registrar wallet:
// 1. Deploy a Permissioned Resolver for this one game through the Verifiable Factory. Its only role
//    holder is the creator, and the game's text records are written by initialize(), which runs its
//    calls without role checks. The registrar ends up with no role on it.
// 2. Register the label in the parent's UserRegistry with the creator as owner and that resolver.
//    The registrar holds ROLE_REGISTRAR there and nothing else.
export async function publishGame(config, { spec, label, owner, origin }) {
  if (config.reason) throw unavailable(config.reason);
  if (!config.registrarKey) throw unavailable("ENS_REGISTRAR_PRIVATE_KEY is not set.");
  const client = publicClient(config);
  const wallet = walletClient(config, config.registrarKey);

  const parent = await readParent(config, client);
  if (parent.status !== "registered" || !parent.subregistry) throw unavailable(`${config.parent} is not set up for games yet. Run npm run ens:setup.`);

  const name = `${slugLabel(label)}.${config.parent}`;
  const sub = name.split(".")[0];
  if (sub === RIVAL_LABEL) throw Object.assign(new Error(`${name} is reserved for the 0G rival. Pick another name.`), { status: 409 });
  const taken = await client.readContract({ address: parent.subregistry, abi: ABI.registry, functionName: "getState", args: [BigInt(labelhash(sub))] });
  if (STATUS[taken.status] !== "available") throw Object.assign(new Error(`${name} is taken. Pick another name.`), { status: 409 });

  const creator = owner || parent.owner;
  if (!isAddress(creator)) throw Object.assign(new Error("The owner must be an 0x address."), { status: 400 });

  const records = specToRecords(spec, origin && `${origin}/play/${name}`);
  const dns = dnsEncode(name);
  const calls = records.map(([key, value]) => encodeFunctionData({ abi: ABI.resolver, functionName: "setText", args: [dns, key, value] }));
  const init = encodeFunctionData({ abi: ABI.resolver, functionName: "initialize", args: [[{ account: creator, roleBitmap: ROLES.allResolver }], calls] });

  const resolverTx = await wallet.writeContract({
    address: config.deployment.verifiableFactory, abi: ABI.factory, functionName: "deployProxy",
    args: [config.deployment.permissionedResolverImpl, randomSalt(), init],
  });
  const resolver = proxyDeployed(await client.waitForTransactionReceipt({ hash: resolverTx }));

  // ponytail: a subname lives as long as its parent. Renewal is left to the parent owner.
  const registerTx = await wallet.writeContract({
    address: parent.subregistry, abi: ABI.registry, functionName: "register",
    args: [sub, creator, zeroAddress, resolver, CREATOR_TOKEN_ROLES, parent.expiry],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: registerTx });
  if (receipt.status !== "success") throw new Error(`Registering ${name} failed in transaction ${registerTx}.`);

  return { name, owner: creator, resolver, registry: parent.subregistry, chain: config.chainName, explorer: config.deployment.chain.blockExplorers?.default.url, txs: { resolver: resolverTx, register: registerTx } };
}

// Resolution goes through the Universal Resolver, the same path any ENS client takes.
export async function readGame(config, rawName) {
  const name = normalize(rawName);
  const client = publicClient(config);
  const keys = Object.values(KEYS);
  const [resolver, ...values] = await Promise.all([client.getEnsResolver({ name }), ...keys.map((key) => client.getEnsText({ name, key }))]);
  return { name, resolver, texts: Object.fromEntries(keys.map((key, i) => [key, values[i]])) };
}

// The 0G rival's own name, rival.<parent>. Its owner holds every resolver role. The server's
// registrar wallet holds ROLE_SET_TEXT on one key, LAST_EPISODE, and nothing else on it.
export const RIVAL_LABEL = "rival";
export const LAST_EPISODE = "taksh.rival.last-episode";
export const rivalName = (config) => `${RIVAL_LABEL}.${config.parent}`;

// After a round is on 0G Storage: point the rival's name at it. One setText, about 60k gas. Only
// while the parent's owner owns the name, so the server never signs for a resolver someone else set.
export async function writeRivalEpisode(config, rootHash) {
  if (config.reason || !config.registrarKey) return null;
  const client = publicClient(config);
  const name = rivalName(config);
  const parent = await readParent(config, client);
  const state = await client.readContract({ address: parent.subregistry, abi: ABI.registry, functionName: "getState", args: [BigInt(labelhash(RIVAL_LABEL))] });
  if (STATUS[state.status] !== "registered" || state.latestOwner.toLowerCase() !== parent.owner.toLowerCase()) throw new Error(`${name} is not set up. Run npm run ens:rival.`);
  const resolver = await client.getEnsResolver({ name });
  const hash = await walletClient(config, config.registrarKey).writeContract({
    address: resolver, abi: ABI.resolver, functionName: "setText", args: [dnsEncode(name), LAST_EPISODE, rootHash],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Setting ${LAST_EPISODE} on ${name} failed in ${hash}.`);
  return hash;
}

// Role bit names from the Permissioned Registry and Permissioned Resolver role tables.
export const REGISTRY_ROLE_NAMES = {
  0n: "register", 4n: "register reserved", 8n: "set parent", 12n: "unregister", 16n: "renew", 20n: "set subregistry",
  24n: "set resolver", 36n: "set URI", 124n: "upgrade",
};
export const RESOLVER_ROLE_NAMES = {
  0n: "set address", 4n: "set text", 8n: "set contenthash", 12n: "set ABI", 16n: "set interface", 20n: "set name",
  24n: "set data", 28n: "link records", 120n: "name this contract", 124n: "upgrade",
};

// A role bitmap as readable names. Bit b + 128 is the admin of bit b, which lets its holder grant
// and revoke it. The registry's transfer permission exists only as an admin bit (28 + 128).
export function roleNames(bitmap, names) {
  const out = [];
  for (const [bit, name] of Object.entries(names)) {
    const b = BigInt(bit);
    if (bitmap & (1n << b)) out.push(name);
    if (bitmap & (1n << (b + 128n))) out.push(`${name} (admin)`);
  }
  if (names === REGISTRY_ROLE_NAMES && bitmap & ROLES.canTransferAdmin) out.push("transfer");
  return out;
}

// The text keys the name view reads: the game's own, plus ENSIP-26 agent records and the rival's.
export const NAME_KEYS = [
  ...Object.values(KEYS), "agent-context", "agent-endpoint[web]", "taksh.rival.model", "taksh.rival.trust", "taksh.rival.provider", LAST_EPISODE,
];

// Everything ENSv2 says about one name under .eth, read live. Walks the registry hierarchy down
// from the .eth registry, label by label, then reads the token's state and its owner's roles in
// the registry that holds it, the resolver the Universal Resolver finds, and which text keys the
// server wallet may write on that resolver.
export async function inspectName(config, rawName) {
  const name = normalize(rawName);
  const labels = name.split(".");
  if (labels.length < 2 || labels.at(-1) !== "eth") throw Object.assign(new Error("Only names under .eth can be read here."), { status: 400 });
  const client = publicClient(config);
  const read = (address, abi, functionName, args) => client.readContract({ address, abi, functionName, args });

  const path = [];
  let registry = config.deployment.ethRegistry;
  for (let i = labels.length - 2; i >= 0; i -= 1) {
    const label = labels[i];
    const [state, subregistry] = await Promise.all([
      read(registry, ABI.registry, "getState", [BigInt(labelhash(label))]),
      read(registry, ABI.registry, "getSubregistry", [label]),
    ]);
    path.push({ name: labels.slice(i).join("."), registry, status: STATUS[state.status], owner: state.latestOwner, expiry: state.expiry, resource: state.resource });
    if (i === 0 || subregistry === zeroAddress) break;
    registry = subregistry;
  }
  const last = path.at(-1);
  const entry = last.name === name && last.status !== "available" ? last : null;

  const server = config.registrarKey ? privateKeyToAccount(config.registrarKey).address : null;
  const [resolver, emancipated, tokenRoles, ...texts] = await Promise.all([
    client.getEnsResolver({ name }),
    entry ? read(entry.registry, ABI.registry, "isEmancipated") : null,
    entry && entry.status === "registered" ? read(entry.registry, ABI.registry, "roles", [entry.resource, entry.owner]) : 0n,
    ...NAME_KEYS.map((key) => client.getEnsText({ name, key }).catch(() => null)),
  ]);
  const records = Object.fromEntries(NAME_KEYS.map((key, i) => [key, texts[i]]).filter(([, value]) => value));

  let ownerResolverRoles = 0n;
  let serverKeys = [];
  if (resolver && resolver !== zeroAddress) {
    const keys = [...new Set([...Object.keys(records), LAST_EPISODE, KEYS.spec])];
    const [ownerRoles, ...grants] = await Promise.all([
      entry ? read(resolver, ABI.resolver, "roles", [0n, entry.owner]).catch(() => 0n) : 0n,
      ...(server ? keys.map((key) => read(resolver, ABI.resolver, "hasRoles", [textResource(key), ROLES.setText, server]).catch(() => false)) : []),
    ]);
    ownerResolverRoles = ownerRoles;
    serverKeys = server ? keys.map((key, i) => ({ key, canWrite: grants[i] })) : [];
  }

  return {
    name, chain: config.chainName, explorer: config.deployment.chain.blockExplorers?.default.url,
    path, entry, emancipated, resolver: resolver && resolver !== zeroAddress ? resolver : null, records,
    tokenRoles: roleNames(tokenRoles, REGISTRY_ROLE_NAMES), ownerResolverRoles: roleNames(ownerResolverRoles, RESOLVER_ROLE_NAMES),
    server, serverKeys, block: await client.getBlockNumber(),
  };
}

function unavailable(message) {
  return Object.assign(new Error(message), { status: 503, unavailable: true });
}
