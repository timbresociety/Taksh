// One-time ENSv2 setup for the parent name games are published under, run with the owner key.
//   1. Deploy the owner's Permissioned Resolver. Its initialize() writes the parent's records,
//      including the ENSIP-26 agent-context record for the game generator agent.
//   2. Deploy a UserRegistry for the subnames. The owner gets only registrar and renew roles and
//      their admins, so no account holds a role that could take a game away (the registry is
//      emancipated from the start).
//   3. Register the parent through the ETH Registrar (commit, wait, register), paying in Sepolia
//      MockUSDC, which anyone can mint. The UserRegistry and resolver are set in the same call.
//   4. Grant the registrar wallet ROLE_REGISTRAR on the UserRegistry, and send it gas money.
// Each step is skipped when the chain already shows it done.
//
// Usage: npm run ens:setup   (reads .env.local)
import { encodeFunctionData, formatEther, parseEther, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ABI, ROLES, admin, dnsEncode, ensConfig, parentLabel, proxyDeployed, publicClient, randomSalt, readParent, walletClient } from "../src/lib/ens/chain.js";

const config = ensConfig();
if (config.reason) throw new Error(config.reason);
if (!process.env.ENS_OWNER_PRIVATE_KEY) throw new Error("ENS_OWNER_PRIVATE_KEY is not set.");
if (!config.registrarKey) throw new Error("ENS_REGISTRAR_PRIVATE_KEY is not set.");

const { deployment, parent } = config;
const client = publicClient(config);
const wallet = walletClient(config, process.env.ENS_OWNER_PRIVATE_KEY);
const owner = wallet.account.address;
const registrar = privateKeyToAccount(config.registrarKey).address;
const label = parentLabel(config);
const YEAR = 31_536_000n;
const REGISTRAR_GAS = parseEther(process.env.ENS_REGISTRAR_TOPUP_ETH || "0.01");

async function send(what, request) {
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what} failed: ${hash}`);
  console.log(`${what}: ${hash}`);
  return receipt;
}

const deploy = (what, implementation, salt, data) =>
  send(what, { address: deployment.verifiableFactory, abi: ABI.factory, functionName: "deployProxy", args: [implementation, salt, data] }).then(proxyDeployed);

console.log(`chain ${config.chainName}, parent ${parent}, owner ${owner}, registrar ${registrar}`);
console.log(`owner balance ${formatEther(await client.getBalance({ address: owner }))} ETH`);

let state = await readParent(config, client);
if (state.status === "registered" && state.owner.toLowerCase() !== owner.toLowerCase()) throw new Error(`${parent} belongs to ${state.owner}, not this owner key.`);
if (state.status === "registered" && !state.subregistry) throw new Error(`${parent} is registered without a subregistry. Pick a fresh ENS_PARENT_NAME.`);

if (state.status !== "registered") {
  const available = await client.readContract({ address: deployment.ethRegistrar, abi: ABI.registrar, functionName: "isAvailable", args: [label] });
  if (!available) throw new Error(`${parent} is not available.`);

  const agentContext = [
    `# Taksh game generator`,
    ``,
    `I turn a typed idea into a short fitness game you play with your body through a webcam.`,
    `Every game I publish is a subname of ${parent}. Its text record taksh.spec holds the game spec;`,
    `taksh.template, taksh.world, taksh.style and taksh.title repeat its main fields.`,
  ].join("\n");
  const dns = dnsEncode(parent);
  const records = [
    ["description", "Fitness games played with your body. Each subname is one game."],
    ["agent-context", agentContext],
  ];
  const calls = records.map(([key, value]) => encodeFunctionData({ abi: ABI.resolver, functionName: "setText", args: [dns, key, value] }));
  const resolver = await deploy("parent resolver", deployment.permissionedResolverImpl, randomSalt(),
    encodeFunctionData({ abi: ABI.resolver, functionName: "initialize", args: [[{ account: owner, roleBitmap: ROLES.allResolver }], calls] }));

  const operational = ROLES.registrar | admin(ROLES.registrar) | ROLES.renew | admin(ROLES.renew);
  const subregistry = await deploy("game registry", deployment.userRegistryImpl, randomSalt(),
    encodeFunctionData({ abi: ABI.userRegistry, functionName: "initialize", args: [[{ account: owner, roleBitmap: operational }]] }));

  const [base, premium] = await client.readContract({ address: deployment.ethRegistrar, abi: ABI.registrar, functionName: "getRegisterPrice", args: [label, YEAR, deployment.mockUsdc] });
  await send("mint MockUSDC", { address: deployment.mockUsdc, abi: ABI.mockUsdc, functionName: "mint", args: [owner, base + premium] });
  await send("approve MockUSDC", { address: deployment.mockUsdc, abi: ABI.mockUsdc, functionName: "approve", args: [deployment.ethRegistrar, base + premium] });

  const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const referrer = `0x${"0".repeat(64)}`;
  const params = [label, owner, secret, subregistry, resolver, YEAR];
  const commitment = await client.readContract({ address: deployment.ethRegistrar, abi: ABI.registrar, functionName: "makeCommitment", args: [...params, referrer] });
  const committed = await send("commit", { address: deployment.ethRegistrar, abi: ABI.registrar, functionName: "commit", args: [commitment] });

  const minAge = await client.readContract({ address: deployment.ethRegistrar, abi: ABI.registrar, functionName: "MIN_COMMITMENT_AGE" });
  const committedAt = (await client.getBlock({ blockNumber: committed.blockNumber })).timestamp;
  console.log(`waiting ${minAge}s for the commitment to age`);
  while ((await client.getBlock()).timestamp <= committedAt + minAge) await new Promise((done) => setTimeout(done, 3000));

  await send(`register ${parent}`, { address: deployment.ethRegistrar, abi: ABI.registrar, functionName: "register", args: [...params, deployment.mockUsdc, referrer] });
  state = await readParent(config, client);
}

const registry = state.subregistry;
const hasRole = await client.readContract({ address: registry, abi: ABI.registry, functionName: "hasRootRoles", args: [ROLES.registrar, registrar] });
if (!hasRole) await send("grant ROLE_REGISTRAR to registrar", { address: registry, abi: ABI.registry, functionName: "grantRootRoles", args: [ROLES.registrar, registrar] });

const registrarBalance = await client.getBalance({ address: registrar });
if (registrarBalance < REGISTRAR_GAS / 2n) {
  const hash = await wallet.sendTransaction({ to: registrar, value: REGISTRAR_GAS });
  await client.waitForTransactionReceipt({ hash });
  console.log(`send ${formatEther(REGISTRAR_GAS)} ETH to registrar: ${hash}`);
}

const emancipated = await client.readContract({ address: registry, abi: ABI.registry, functionName: "isEmancipated" });
console.log(`ready: ${parent} -> game registry ${registry} (emancipated: ${emancipated}), expires ${new Date(Number(state.expiry) * 1000).toISOString()}`);
