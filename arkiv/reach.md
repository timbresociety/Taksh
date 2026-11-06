# Reach

Who the Arkiv data is for, whether they'd use it, whether they can try it today, and what we build next.

## Who it's for

People who want to move for a few minutes and have a webcam. Taksh turns an idea ("hop across Diwali rooftops") into a short game you play with your body, in 21 game templates and nine worlds, four of them Indian: a Mumbai street, Marine Drive, Diwali night and an old village. They came to play. Most of them don't have a crypto wallet, and they shouldn't need one.

So every Arkiv feature is on a screen they reach anyway, and none asks for a wallet, an extension or gas. The server's writer wallet pays: 230,660 gas for a score, about 0.00023 tGLM.

## Would they use it

The Arkiv parts are the reasons to play a second time:

- **The leaderboard is on every result screen**, in all 21 games, read live from Arkiv. A player doesn't opt in to see it. Posting takes one name and one click, then the board reads again with your row in bold and "You are #2 of 2". The chips narrow it to your world and style, to the exact game you played, or to camera play, since keyboard scores are easier.
- **Today's challenge gives a reason to come back tomorrow.** Each UTC day has one game, made on 0G from a theme in the rotation (Dahi Handi, a dabbawala's lunch route, mangoes at a fruit stall) and stored on Arkiv, so everyone plays the same game and posts to the same board. The home card counts down to the next game and links to yesterday's board.
- **A shared game is a link.** "Publish this game" returns `/games/<entity key>`. A friend who opens it plays the exact spec and gets its own board through `specHash`. The gallery at `/games` lists every published game, newest first, filtered by game and by world, and each card says how many days its link has left.

What we haven't got is players. At 22:40 UTC on 2026-11-06 the data is ours: 6 live scores, 7 published games and 1 daily challenge, all from testing (`npm run arkiv:probe`). The README says plainly that no person has played it on a real webcam yet.

## Can they try it today

- **Read the data, no install:** the README has a `curl` query for the top ten scores and one for today's daily board, against the public Rabdi RPC. Any app can read `taksh.scores.v1`, `taksh.games.v1` and `taksh.daily.v1` the same way, filtered to our writer `0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30`, and build its own board or gallery without our server.
- **Play it:** clone, `npm install`, `npm run setup`, `npm run dev`, open `http://localhost:3000`. With no keys at all the board and gallery still read from Arkiv through the default writer, and the game plays on fixtures. Posting and publishing need `ARKIV_PRIVATE_KEY`.
- **Not yet:** a public URL. The camera needs `localhost` or HTTPS, so wider play needs a hosted HTTPS deployment, and that deployment needs an `ARKIV_ACCESS_KEY`. Without one, the public endpoint's query budget (about 1,000 queries per client address, then `429` for about ten minutes) runs out within an hour of normal use, and on shared hosting the budget is shared with strangers. A judge running the README query from a busy conference network can hit the same 429. If they do, the response body says `ANON_COST_LIMITED`, and waiting the `Retry-After` clears it.

## What we build next

The Arkiv integration has had commits on every day of the hackathon (`git log -- src/lib/arkiv arkiv`). In order, the next pieces, each because something real is missing:

1. **A public HTTPS deployment with an access key**, so people can play without cloning.
2. **Scores the server can believe.** Today a score is what the browser reports. A signed session issued when a round starts, plus the server replay the 0G rival rounds already get, would make the board mean something in public.
3. **Keep popular games alive.** Nothing extends a game, so a shared link stops working after 182.5 days. `extendEntity` when a game is opened would keep the ones people play.
4. **Mainnet and a funded writer**, once Arkiv's mainnet is open, with a per-player cap on writes.
5. **Write limits shared across instances.** The one-post-per-4-seconds limit is in memory on each server process.

## Limits on reach today

- One writer wallet on testnet. Every entity is ours, so a player can't take a score or a game with them.
- Scores are self-reported.
- A day where 0G was down at first and came back later can have scores on the starter game and on the 0G game under one date. The starter is retried after two minutes, so the window is short.
