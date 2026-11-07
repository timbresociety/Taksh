// One-time ENSv2 setup for the 0G rival's own name, rival.<parent>, run with the owner key after
// ens:setup. The name is the rival agent's identity:
//   1. Deploy a Permissioned Resolver for it. initialize() writes the ENSIP-26 agent-context and
//      agent-endpoint[web] records, and which model and 0G provider make its decisions.
//   2. Register "rival" in the game registry, owned by the owner key, with that resolver.
//   3. Give the name its own UserRegistry, so the rival is a namespace: each stored round becomes
//      round-<hash>.rival.<parent>. The owner key keeps only registrar and renew roles there and the
//      server wallet gets ROLE_REGISTRAR, so the registry is emancipated and no round can be revoked.
//   4. Grant the server wallet ROLE_SET_TEXT on three keys: taksh.rival.last-episode, so after each
//      stored round it can point the name at it, and taksh.round.episode and taksh.round.score for
//      the round's own name. It can't touch any other record.
// Each step is skipped when the chain already shows it done, and any record that differs from the
// list below is rewritten. Set TAKSH_URL to the live app to update agent-endpoint[web] and url.
//
// Usage: npm run ens:rival   (reads .env.local)
import { encodeFunctionData, labelhash, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ABI, CREATOR_TOKEN_ROLES, LAST_EPISODE, RIVAL_LABEL, RIVAL_SERVER_KEYS, ROLES, ROUND_DAYS, STATUS, admin, dnsEncode, ensConfig,
  proxyDeployed, publicClient, randomSalt, readParent, rivalName, textResource, walletClient,
} from "../src/lib/ens/chain.js";

const config = ensConfig();
if (config.reason) throw new Error(config.reason);
if (!process.env.ENS_OWNER_PRIVATE_KEY) throw new Error("ENS_OWNER_PRIVATE_KEY is not set.");
if (!config.registrarKey) throw new Error("ENS_REGISTRAR_PRIVATE_KEY is not set.");

const client = publicClient(config);
const wallet = walletClient(config, process.env.ENS_OWNER_PRIVATE_KEY);
const owner = wallet.account.address;
const registrar = privateKeyToAccount(config.registrarKey).address;
const name = rivalName(config);
const dns = dnsEncode(name);
const web = process.env.TAKSH_URL || "https://github.com/timbresociety/Taksh";

async function send(what, request) {
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what} failed: ${hash}`);
  console.log(`${what}: ${hash}`);
  return receipt;
}

const agentContext = `# Taksh rival

I am the boxer you fight in Counter Bout, a Taksh game you play with your body through a webcam.
Every few seconds the game sends me the fight so far: both health bars, time left, and which of my
shots you dodged and which way. I plan my next three shots with glm-5.3 on 0G Private Computer, on
the private tier, so the model runs in a TEE. I only throw shots I planned. If 0G doesn't answer in
6 seconds I hold my guard and throw nothing.

A round I fight can be stored on 0G Storage, with the 0G request ID of every decision in it.
taksh.rival.last-episode holds the root hash of the latest one. Each stored round also gets its own
name under mine, round-<first 10 hex of its root hash>.${name}, which I own. It expires after
${ROUND_DAYS} days and can't be transferred. Its taksh.round.episode record is the root hash and
taksh.round.score the score the server replayed. Replay a round with
npm run replay-episode -- <rootHash> from ${"https://github.com/timbresociety/Taksh"}.

The Taksh server can register round names under mine, and can write taksh.rival.last-episode,
taksh.round.episode and taksh.round.score. It can't change any other record.`;

const records = [
  ["description", "The 0G rival in Taksh's Counter Bout. Its shots are planned on 0G Private Computer."],
  ["agent-context", agentContext],
  ["agent-endpoint[web]", web],
  ["url", web],
  ["taksh.rival.model", "glm-5.3"],
  ["taksh.rival.trust", "private"],
  ["taksh.rival.provider", "0xD179F4526064846dE9a9E9D93683AF75CB72E503"],
];

const parent = await readParent(config, client);
if (parent.status !== "registered" || !parent.subregistry) throw new Error(`${config.parent} is not set up. Run npm run ens:setup first.`);
console.log(`${name}, owner ${owner}, server wallet ${registrar}`);

const state = await client.readContract({ address: parent.subregistry, abi: ABI.registry, functionName: "getState", args: [BigInt(labelhash(RIVAL_LABEL))] });
let resolver;
if (STATUS[state.status] === "available") {
  const calls = records.map(([key, value]) => encodeFunctionData({ abi: ABI.resolver, functionName: "setText", args: [dns, key, value] }));
  const init = encodeFunctionData({ abi: ABI.resolver, functionName: "initialize", args: [[{ account: owner, roleBitmap: ROLES.allResolver }], calls] });
  resolver = proxyDeployed(await send("rival resolver", {
    address: config.deployment.verifiableFactory, abi: ABI.factory, functionName: "deployProxy",
    args: [config.deployment.permissionedResolverImpl, randomSalt(), init],
  }));
  await send(`register ${name}`, {
    address: parent.subregistry, abi: ABI.registry, functionName: "register",
    args: [RIVAL_LABEL, owner, zeroAddress, resolver, CREATOR_TOKEN_ROLES, parent.expiry],
  });
} else {
  if (state.latestOwner.toLowerCase() !== owner.toLowerCase()) throw new Error(`${name} belongs to ${state.latestOwner}.`);
  resolver = await client.getEnsResolver({ name });
  console.log(`${name} is registered, resolver ${resolver}`);
  for (const [key, value] of records) {
    if ((await client.getEnsText({ name, key })) !== value) await send(`set ${key}`, { address: resolver, abi: ABI.resolver, functionName: "setText", args: [dns, key, value] });
  }
}

let rounds = await client.readContract({ address: parent.subregistry, abi: ABI.registry, functionName: "getSubregistry", args: [RIVAL_LABEL] });
if (rounds === zeroAddress) {
  const operational = ROLES.registrar | admin(ROLES.registrar) | ROLES.renew | admin(ROLES.renew);
  rounds = proxyDeployed(await send("round registry", {
    address: config.deployment.verifiableFactory, abi: ABI.factory, functionName: "deployProxy",
    args: [config.deployment.userRegistryImpl, randomSalt(), encodeFunctionData({ abi: ABI.userRegistry, functionName: "initialize", args: [[{ account: owner, roleBitmap: operational }]] })],
  }));
  await send(`attach it under ${name}`, { address: parent.subregistry, abi: ABI.registry, functionName: "setSubregistry", args: [BigInt(labelhash(RIVAL_LABEL)), rounds] });
}
if (!(await client.readContract({ address: rounds, abi: ABI.registry, functionName: "hasRootRoles", args: [ROLES.registrar, registrar] }))) {
  await send("grant ROLE_REGISTRAR on the round registry to the server wallet", { address: rounds, abi: ABI.registry, functionName: "grantRootRoles", args: [ROLES.registrar, registrar] });
}

const canWrite = (key) => client.readContract({ address: resolver, abi: ABI.resolver, functionName: "hasRoles", args: [textResource(key), ROLES.setText, registrar] });
for (const key of RIVAL_SERVER_KEYS) {
  if (await canWrite(key)) continue;
  // Only the selector and the key in the setter call matter. The name and value are ignored.
  const setter = encodeFunctionData({ abi: ABI.resolver, functionName: "setText", args: ["0x", key, ""] });
  await send(`grant ${key} to the server wallet`, { address: resolver, abi: ABI.resolver, functionName: "grantSetterRoles", args: [setter, registrar] });
}
for (const key of [...RIVAL_SERVER_KEYS, "agent-context"]) console.log(`server wallet can set ${key}: ${await canWrite(key)}`);
const emancipated = await client.readContract({ address: rounds, abi: ABI.registry, functionName: "isEmancipated" });
console.log(`resolver ${resolver}, round registry ${rounds} (emancipated: ${emancipated})`);
