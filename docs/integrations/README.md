# Integration docs for ETHGlobal Mumbai

Source: https://ethglobal.com/events/mumbai/prizes (pulled 2026-11-06). Taksh plans 0G, Arkiv and ENS, so their docs are saved here. Other sponsors are listed at the bottom with links only.

| File | What it holds |
| --- | --- |
| `0g.md` | 0G concepts, Compute Network (Router API, models, auth, billing, errors) and Storage SDK |
| `arkiv.md` | Every page in the Arkiv docs: schemas, writes, queries, React guide, JSON-RPC, limits |
| `ens-v2.md` | 22 ENSv2 pages plus Building with AI, ENSIP-25 and ENSIP-26 |
| `*-llms.txt` | Each site's page index, for fetching anything not saved here |

Tracks marked (Continuity) are only for projects in the Continuity batch. Taksh is a new project, so those are skipped.

## 0G ($15,000)

Every 0G entry needs: public repo with README and setup steps, demo video under 3 minutes, live demo link, contract addresses, team Telegram/X. Payouts are at 0G's discretion.

### Build with 0G Private Computer: $5,000 (2,500 / 1,500 / 1,000)
- Inference on 0G Private Computer sits in the main user flow. Show request IDs.
- A working app judges can try, with a reason users come back.
- One sentence on what breaks if 0G is removed.
- iAI bonus: user signs in with their 0G account and watches credits drop as they play. Privy sign-in only works on localhost:3000, 3001 or 5173.
- They don't want chat wrappers, or apps where removing the AI changes nothing.
- Router API: `https://router-api.0g.ai/v1`, OpenAI-compatible. Trust mode per request with header `X-0G-Provider-Trust-Mode: verified|private`. Quick start: `npx @0gfoundation/0gpc@latest` (Node 22+).
- Links: https://pc.0g.ai, https://iai.finance/docs, https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview

### Physical AI, agents with a body: $5,000 (2,500 / 1,500 / 1,000 best real hardware)
- A 0G call inside the decision loop (vision, voice or decision model).
- Episode log on 0G Storage with a request ID per decision.
- Replayable simulation, or live hardware at the 0G booth.
- Safe-stop fallback when 0G is unreachable. A fallback that fakes the decision disqualifies you.
- Links: https://github.com/0gfoundation/zerobot, https://pc.0g.ai/models, https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk

### Agents that pay for themselves: $2,000 (2 x 1,000)
- Money comes in, lands in the agent's 0G compute account, pays for inference. Show tx hashes and request IDs.
- Runs on its own in the demo, no manual top-up. Spend cap, and sane behaviour when funds run low.
- Links: https://www.comfy.fun/docs, https://github.com/0g-axion/comfy-plugin

Resources: https://docs.0g.ai, https://build.0g.ai, https://faucet.0g.ai

## Arkiv ($15,000)

Testnet: chain ID 7794095, RPC https://rpc.rabdi.db-chain.testnet.arkiv.network, explorer https://rabdi.explorer.arkiv.network, faucet https://hub.arkiv.network/faucet, access keys https://hub.arkiv.network/access-keys.

Main tracks need:
- Writes to the current testnet with `@arkiv-network/sdk` or JSON-RPC, and a user-facing feature that reads the data back.
- README lists the writer wallet address(es) and one query judges can run.
- `/arkiv/schema.md`, `/arkiv/friction.md`, plus one file per judging criterion (25% each).
- Open-source license, and a note on how AI was used.
- One Arkiv track per team. The Swarm bonus stacks on top.

### Build on Arkiv (from scratch): $4,000 (3,000 / 1,000)
- Judging files: `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md`.
- An SDK that's installed but never read from doesn't count. Neither does Arkiv as a write-only log.

### Mirror something Ethereum depends on: $4,000 (3,000 / 1,000)
- Built at the event, data licensed for republishing, re-runnable import script, no Sourcify data.

### Node tooling: $2,000
- New repo that runs beside an Arkiv node. Needs `friction.md`, `real-use.md`, `whats-new.md`, `easy-to-run.md`.

### Arkiv + Swarm bonus: $500
- Use both. Add `/arkiv/swarm.md`: what lives where, which entity field holds the Swarm ref, one key plus ref, postage batch ID, buyer wallet, Bee node, upload/read files, demo timestamp, friction.
- Never store a raw encrypted Swarm reference in an entity, because it contains the key.
- Links: https://docs.ethswarm.org

Resources: https://docs.arkiv.network, https://hub.arkiv.network/ai-tools, https://discord.gg/arkiv

## ENS ($10,000)

### Best use of ENSv2: $7,000 (3,000 / 2,000 / 1,000 / 1,000)
- Built on ENSv2, mainnet or Sepolia. ENSv2 is central to the product, not cosmetic.
- Working demo with no hard-coded values, linked live from the showcase.
- Open-source code.
- Start with `ens-v2.md`: "For Contract Developers", "Permissioned Registry", "Permissioned Resolver", "Enhanced Access Control", "Issuing Subnames in ENSv2".
- ENSIP-26 (agent text records) and ENSIP-25 (AI agent registry verification) are in the same file.
- CLI: https://github.com/ensdomains/ens-cli

## Other sponsors (links only)

| Sponsor | Pool | Main tracks | Docs |
| --- | --- | --- | --- |
| World | $12,500 | World ID Agent Pass, IDKit | https://auth.world.org/docs, https://docs.world.org/world-id/idkit/integrate |
| 1inch | $7,000 | Aqua / SwapVM app | https://github.com/1inch/aqua |
| Uniswap | $15,000 | Build with Uniswap (needs FEEDBACK.md) | https://developers.uniswap.org/docs |
| Arc | $15,000 | Five Arc Studio tracks, $3,000 each | https://studio.arc.io |
| Hedera | $15,000 | x402 agents, tokenization, SDK-only | https://docs.hedera.com/solutions/ai/x402 |
| Whitechain | $15,000 | USDT payments on Whitechain Sepolia | https://docs.whitechain.io |
| Ethereum Foundation | $15,000 | Anon-RPC, alt mempool, CROPS app | https://ethereum.github.io/anon-rpc/ |
| Definitive | $5,000 | Flash advanced orders (Continuity only) | https://flash.definitive.fi/docs |
| Chainlink | $5,000 | CRE workflow, CCIP 2.0 | https://docs.chain.link/cre, https://docs.chain.link/ccip |

Finalists (top 10): 1,000 USDC per person plus 500 travel for teams of 3 to 5.
