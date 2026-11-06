// One-time ENSv2 setup for the 0G rival's own name, rival.<parent>, run with the owner key after
// ens:setup. The name is the rival agent's identity:
//   1. Deploy a Permissioned Resolver for it. initialize() writes the ENSIP-26 agent-context and
//      agent-endpoint[web] records, and which model and 0G provider make its decisions.
//   2. Register "rival" in the game registry, owned by the owner key, with that resolver.
//   3. Grant the server's registrar wallet ROLE_SET_TEXT on one key, taksh.rival.last-episode, so
//      after each stored round the server can point the name at it. It can't touch any other record.
// Each step is skipped when the chain already shows it done. Set TAKSH_URL to the live app to
// update agent-endpoint[web] and url on a later run.
//
// Usage: npm run ens:rival   (reads .env.local)
import { encodeFunctionData, labelhash, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ABI, CREATOR_TOKEN_ROLES, LAST_EPISODE, RIVAL_LABEL, ROLES, STATUS, dnsEncode, ensConfig, proxyDeployed, publicClient,
  randomSalt, readParent, rivalName, textResource, walletClient,
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
taksh.rival.last-episode holds the root hash of the latest one. Replay it with
npm run replay-episode -- <rootHash> from ${"https://github.com/timbresociety/Taksh"}.

The Taksh server can write taksh.rival.last-episode on this name and no other record.`;

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
  for (const key of ["agent-endpoint[web]", "url"]) {
    if ((await client.getEnsText({ name, key })) !== web) await send(`set ${key}`, { address: resolver, abi: ABI.resolver, functionName: "setText", args: [dns, key, web] });
  }
}

const canWrite = (key) => client.readContract({ address: resolver, abi: ABI.resolver, functionName: "hasRoles", args: [textResource(key), ROLES.setText, registrar] });
if (!(await canWrite(LAST_EPISODE))) {
  // Only the selector and the key in the setter call matter. The name and value are ignored.
  const setter = encodeFunctionData({ abi: ABI.resolver, functionName: "setText", args: ["0x", LAST_EPISODE, ""] });
  await send(`grant ${LAST_EPISODE} to the server wallet`, { address: resolver, abi: ABI.resolver, functionName: "grantSetterRoles", args: [setter, registrar] });
}
console.log(`server wallet can set ${LAST_EPISODE}: ${await canWrite(LAST_EPISODE)}, agent-context: ${await canWrite("agent-context")}`);
console.log(`resolver ${resolver}`);
