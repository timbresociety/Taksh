# 0G in Taksh, for judges

Taksh turns a typed or spoken idea into a game you play with your body. On 0G, the idea becomes a game through `glm-5.3` on 0G Private Computer's `private` tier, so only TEE providers serve it. In Counter Bout and Last Line, the rival's next shots also come from `glm-5.3`, and each finished round goes to 0G Storage, where anyone can download it and replay it.

Everything below was checked live on 2026-11-07 between 04:50 and 05:40 IST, against the 0G Router (`https://router-api.0g.ai/v1`) and 0G Storage on Galileo testnet. Line numbers are for commit `acb4107`. The track text is quoted in `docs/tracks/0g.md`.

## Which tracks Taksh qualifies for

| Track | Prize | Verdict |
| --- | --- | --- |
| Build with 0G Private Computer | $5,000 | **Qualifies.** The iAI bonus is built but has not been shown live with a real 0G account |
| Physical AI: Agents with a Body | $5,000 | **Meets all four must-haves.** The fit is the risk: the rival is a simulated boxer and striker, not a robot or a device |
| Keep Building on 0G | $3,000 | **Does not qualify.** Taksh started at this hackathon. The first commit, `fefde02`, is dated 2026-11-06 00:37 IST |
| Agents That Pay for Themselves | $2,000 | **Does not qualify.** Nothing earns money, and nothing tops up a 0G compute balance. Phase 3 of `docs/plans/0g.md` was never built |

## Proof you can open

Two rounds played in Chrome on 2026-11-07, keyboard only, through the whole product: idea, game, round, storage.

| | Round 1 | Round 2 |
| --- | --- | --- |
| Idea | "Box a rival robot in a neon ring on Marine Drive" | "Box a rival robot under Diwali lights, comic style" |
| Game | Neon Robot Rumble, 18.2 s from click to brief | Diwali Knockout, 13.1 s |
| 0G calls for the game | intent `8da44b91-ff04-4469-be63-ee03b55919f6`, generate `411fc489-a1f1-453f-a7ae-c2e69b8df9ee`, $0.0134 | intent `cea6631a-a0c1-4fa1-9d60-10cee8016c5c`, generate `46fa690c-6020-476c-a2e5-3f41eb0e773d`, $0.0045 |
| Rival decisions on 0G | `3127c5f9-7c29-48dd-a559-1f2d4fec2be6`, plus 2 safe stops | `083ae714-b574-41e0-8a93-919460cf0345`, `c1284aae-b119-41ad-a86e-6faac6c43b3c`, no safe stops |
| 0G Storage root | `0x22ff35a52b9fd39653b298c24039432d99fc4ed630d568645f2b1667735541f1` | `0xfd99b42ff173b4b708509ce97ec4d4e409d787c034cb7864726119896adda8b7` |
| Upload tx | [`0xa0d3ebcc…7a0b`](https://chainscan-galileo.0g.ai/tx/0xa0d3ebccd7f502d6107c3293ca2ce33990702e22cbf56f6a54461eaec8987a0b) | [`0x822865f6…9387`](https://chainscan-galileo.0g.ai/tx/0x822865f6b2fd781292a91ca329b7b5618fda87987fe788c65687957daebd9387) |
| Replay | 2063 steps, win, 2850, matches | 3123 steps, win, 3320, matches |

Today's challenge for 2026-11-06 was made on 0G as request `df9f68a1-05f9-4b82-9569-509c1e178412`. `/daily` shows that ID.

Who served the calls: provider `0xD179F4526064846dE9a9E9D93683AF75CB72E503`, named in every reply's `x_0g_trace.provider` and the `x-provider` header. Replies also carry `x-0g-e2ee: sealed`. The router's model list (`GET /v1/models`) gives `glm-5.3` as `verifiability: TeeML`, `tee_attested: true`, `tee_verifier: dstack`.

Run a replay yourself:

```text
$ npm run replay-episode -- 0xfd99b42ff173b4b708509ce97ec4d4e409d787c034cb7864726119896adda8b7
Diwali Knockout: 3123 steps, 25 moves and plans
0G decisions: 2, safe stops: 0
  t=4.3s  left,left,right  083ae714-b574-41e0-8a93-919460cf0345  "No data yet. Watch reactions, then punish their blind side."
  t=15.0s  right,high,right c1284aae-b119-41ad-a86e-6faac6c43b3c  "Two rights missed — third timed after recovery... wait, no rights missed yet."
Replayed: win, score 3320
Matches the stored result.
```

The result screen shows the same command under "Check this score yourself", with the full root.

## How fast, how often it fails

Measured on 2026-11-07 against the dev server.

| Call | Runs | Failed | Time |
| --- | --- | --- | --- |
| Intent | 3 scripted, 2 in Chrome | 0 | 3.5 to 6.2 s |
| Generate | 3 scripted, 2 in Chrome | 0, and every game passed validation first time | 6.0 to 7.7 s |
| Rival decision, through the app | 26 | 0 errors. 1 reply had no usable move | median 3.4 to 3.6 s, max 6.4 s |
| Rival decision, straight to the router | 6 | 0 | 4.7 to 9.0 s, a slow spell |
| 0G Storage upload | 3 | 0 | 20.2 to 21.4 s |
| 0G Storage download with proof | 3 | 0 | about 2 s |

In round 1 the rival safe-stopped twice. The first was the dev server compiling the route on its first request. The second was a decision that took 6.0 s, when the browser gave up at 6 s. The browser now waits 9 s, and a reply with no usable move counts as a safe stop.

## Build with 0G Private Computer

| Requirement | Status | Proof |
| --- | --- | --- |
| Inference on 0G Private Computer in your main user flow, with request IDs | ✅ | The idea box calls `/api/intent` then `/api/generate` (`src/components/Studio.jsx:84`, `:74`). Both reach `createOgProvider` (`src/lib/pipeline/provider-0g.js:16`), which posts to the router with `X-0G-Provider-Trust-Mode: private` (`:50`). Each reply's `x_0g_trace` becomes a trace (`:93`), returned as `traces` (`src/lib/pipeline/pipeline.js:16`). The brief shows model, tier, call count, cost and request ID (`Studio.jsx:236`), and the result screen shows the receipt (`src/components/CreditReceipt.jsx:32`). Request IDs above |
| A working app a judge can try, with a clear reason to come back tomorrow | ✅ in code, ⏳ live link | A new 0G-made challenge every UTC day, with its own board (`src/lib/daily/server.js:52`), and iAI credits that expire at 00:00 UTC (`src/lib/og/session.js`, `msUntilReset`). A public demo URL isn't recorded in this repo |
| One sentence on what breaks if 0G is removed | ✅ | No idea can become a game, and the rival can't throw a single shot. README, "Model and prompts" |
| iAI bonus: sign in with a 0G account, credit balance goes down | ⏳ built, not shown live | Privy login with 0G's app ID, then `/auth/privy` and `/auth/me`, with a check that the 0G session belongs to that Privy user (`src/lib/og/account.js:50`, `:53`). Calls then carry the session in `x-0g-session` and bill the player (`src/app/api/_shared.js:31`). The chip polls `/account/balance` every 20 s and shows what was spent (`src/components/OgAccount.jsx:20`). Not verified here: it needs a real 0G account on `localhost:3000`, and the app key gets `403 insufficient_scope` on the balance endpoint |
| Not a generic chat wrapper, and the AI can't be removed unnoticed | ✅ | The model's output is the game: template, world, style and tuning, validated in code (`src/lib/spec/validate.js`) |
| Submission: repo, README, video, live link, team | ⏳ | Repo `timbresociety/Taksh` is public. Video, live link and team contacts belong in the submission form |

Also on the private tier: speech to text with `whisper-large-v3` (`provider-0g.js:126`, `src/app/api/transcribe/route.js:24`) and changing a game (`src/app/api/revise/route.js:9`).

## Physical AI: Agents with a Body

| Requirement | Status | Proof |
| --- | --- | --- |
| A 0G call inside the decision loop | ✅ | While a round runs, the browser asks `/api/rival/decide` whenever the plan runs low (`src/lib/templates/bout.js:191`, `src/lib/agent/rival-brain.js:36`). The route asks `glm-5.3` on the private tier (`src/app/api/rival/decide/route.js:30`). The rival throws only planned shots: `state.plan.shift()` (`bout.js:143`, `src/lib/templates/keeper.js:40`) |
| An episode log on 0G Storage with a request ID per decision | ✅ | The route checks the round, replays it, and uploads it (`src/app/api/rival/episode/route.js:42`, `:46`) through the 0G Storage SDK (`src/lib/agent/storage.js:28`). Each stored decision keeps its request ID, provider and cost. Roots above |
| A replayable simulation | ✅ | `npm run replay-episode -- <root>` downloads with Merkle proof checking (`storage.js:45`), replays from the seed, and exits 1 on a mismatch (`scripts/replay-episode.mjs:24`). Both rounds above match |
| A safe stop if 0G is unreachable, with no faked decision | ✅ | An error, a reply over 9 s or a plan with no usable move logs a safe stop and no plan (`rival-brain.js:42`, `decide/route.js:33`). The HUD says "0G signal lost" (`src/components/PlayStage.jsx:171`). Without 0G the route answers 503 (`decide/route.js:17`). No code picks a shot for the 0G rival. Round 1 shows 2 safe stops in its stored log |
| Contract deployment addresses | ⏳ none of ours | Taksh deploys no contract on 0G. It writes through 0G Storage's Flow contract `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` from writer `0x07996A4De073dD64219fb84e05FA048145802aa2` (Galileo) |
| Not wanted: chatbot with a robot avatar, pre-recorded motion, 0G only for logs | ✅ | 0G picks every shot, motion runs at frame rate in the browser, and storage holds the replayable round |

The risk is fit, not rules. The track asks for "a robot, drone, wearable or pocket device". Taksh's agent has a simulated body in a game, and the body in the loop is the player's. `docs/physical-ai.md` makes that case.

## Keep Building on 0G

❌ Only for Continuity Track teams with a 0G project from an earlier event. Taksh's first commit, `fefde02`, is from 2026-11-06 at this hackathon, and `docs/plans/0g.md` targets the non-Continuity tracks.

## Agents That Pay for Themselves

❌ Every requirement is missing:

1. No money comes in. Nothing charges players or other agents.
2. No credit lands in an agent's 0G compute account. The app's key is topped up by hand at pc.0g.ai.
3. No comfy agent ID or token.
4. The price ceiling per call (`provider-0g.js:13`) and the request budgets (`src/lib/agent/budget.js`) cap spending. But the app never reads its own balance and changes how it behaves.

## What breaks without 0G

Taksh can't turn an idea into a game, so only the 13 starter games remain, and the rival can't throw a shot. If the 0G check fails at startup, the app runs on Claude or labelled fixtures, `/api/status` says why in `fallbackReason`, and it tries 0G again a minute later (`src/lib/pipeline/provider.js:26`).
