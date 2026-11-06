# Physical AI: a sparring rival whose brain runs on 0G

Taksh turns a typed or spoken idea into a body-controlled game you play in front of a webcam. In Counter Bout you box a rival. Your body is the controller: pose tracking reads your guard, your jabs and your leans, 30 times a second, on your machine. The rival's decisions come from `glm-5.3` on 0G Private Computer, inside a TEE.

This is the "build without hardware" lane with a simulator we wrote: the game engine in `src/lib/game/`, which is deterministic and replays from a seed. The body in the loop is a real person's, seen through a camera.

## Brain, not spinal cord

Motion stays on the device. The game loop, the rival's animation, hit detection and the dodge timing all run in the browser at frame rate. 0G makes the decisions at checkpoints:

1. Every few seconds the browser sends the fight so far to `POST /api/rival/decide`: both health bars, time left, and which recent shots the player dodged and which way.
2. The server asks `glm-5.3` on the `private` trust tier for the next three shots, a read on the player and a taunt. Strict JSON schema, 6 s timeout.
3. The rival throws exactly those shots, in that order. It asks again while one shot is still queued, so the next plan lands before the queue runs dry.

The rival adapts to the person. In the round below, its second read was "Can't read the right hand at all, keep hammering it", and it threw right twice.

A decision costs about $0.0004 and takes 3 to 5 s.

## The four must-haves

| Requirement | Where it is |
| --- | --- |
| A 0G call inside the decision loop | `src/app/api/rival/decide/route.js` calls the 0G Router. The rival can't throw a shot 0G didn't plan: `src/lib/agent/rival-brain.js` feeds the plans into the game, and nothing else queues shots. |
| An episode log on 0G Storage with a request ID per decision | `src/app/api/rival/episode/route.js` uploads each round to 0G Storage on Galileo testnet. Every decision in it carries its 0G request ID, the provider address and the cost from `x_0g_trace`. |
| A replayable simulation | `npm run replay-episode -- <rootHash>` downloads the round with Merkle proof checking, replays every step from the seed and exits 1 if the score differs. |
| A safe stop if 0G is unreachable | If 0G errors or takes over 6 s, no plan arrives. The rival holds its guard and throws nothing, the HUD says "0G signal lost", and the episode logs the stop with its reason. It never makes up a shot. Punches don't land on a guarding rival, so a player gains nothing by cutting 0G off. |

## A stored round

Stored on 2026-11-06 through the production path, with the ledger on Arkiv:

| | |
| --- | --- |
| Root hash | `0x9ef7bb084ecb1aa3ea0f41953143a99c15884df23439c37407ceadfe7c60b32c` |
| Round | `01ab032c-8c52-4989-8c1a-cfbf33ba0fea`, 873 steps, 177 moves and plans |
| 0G decisions | `afdf3436-543d-45aa-a22e-37807db32fb9` at 0.0 s, `0bfb74e9-acc7-400c-a02a-8375ab8daf8a` at 13.3 s |
| Replay | win, score 3000, matches the stored result |

```text
$ npm run replay-episode -- 0x9ef7bb084ecb1aa3ea0f41953143a99c15884df23439c37407ceadfe7c60b32c
Counter Bout: 873 steps, 177 moves and plans
0G decisions: 2, safe stops: 0
  t=0.0s   left,left,right   afdf3436-…  "No data yet, so I start with my dominant side and watch their reactions."
  t=13.3s  right,right,left  0bfb74e9-…  "Can't read the right hand at all - keep hammering it."
Replayed: win, score 3000
Matches the stored result.
```

The first round we stored, `0xd17bfb19…dcc7b`, is in the README with its upload transaction.

## Why the log can be trusted

The player's moves come from a browser, so the server takes nothing on trust before it stores a round:

- Every plan in the episode must be one 0G really returned to this server for this round, each used once. The server keeps that record on Arkiv, so whichever server instance gets the upload can check it.
- Every plan 0G served in time to be played must be in the episode, so a plan that went badly for the player can't be cut out.
- The round can't run faster than real time on the server's clock, can't stop before the round ended, and must arrive within 5 minutes.
- More than 2 dodges under 120 ms after the windup shows is a script, not a person.
- The score stored is the server's own replay, never the number the browser sent.

A bot that plays live at human speed still gets through. Closing that needs inputs signed on the server as they happen.

## Its identity on ENS

The rival has its own ENSv2 name on Sepolia, `rival.taksh-games.eth`. Its ENSIP-26 `agent-context` record says what it is and how it decides, and `taksh.rival.provider` names the 0G TEE provider. After each stored round the server writes the root hash to `taksh.rival.last-episode`. That's the only record the server's wallet can write on the name, a one-key grant from ENSv2 Enhanced Access Control. So anyone can go from the name to the latest round and replay it. The README's ENS section has the transactions.

## What breaks without 0G

The rival can't move. With no 0G, Counter Bout's rival has no plans, so it guards for the whole round. Nothing in the code picks a shot for it. Game generation goes too: without 0G an idea can't become a game, and you're left with the 13 starter games.

## Run it

1. Put `OG_API_KEY` and `OG_STORAGE_PRIVATE_KEY` in `.env.local`. Add `ARKIV_PRIVATE_KEY` to keep the ledger on Arkiv. Without it the ledger stays in memory, which works on one server.
2. `npm install && npm run dev`, open `localhost:3000`.
3. Pick Counter Bout, play a round with the camera or the keyboard, and press "Store on 0G" on the result screen.
4. `npm run replay-episode -- <rootHash>` with the root hash it shows.
