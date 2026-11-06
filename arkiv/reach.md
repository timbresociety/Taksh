# Reach

Who sees the Arkiv data, and how far it can go.

## Players

Every round of every game ends on the result screen, and the leaderboard is on it. A player doesn't have to opt in to see Arkiv data. The board reads on every result, in all 13 games, and posting a score takes one name and one click. No wallet, no extension, no gas for the player, because the server's writer wallet pays. That matters for this audience: people who came to move, not to set up a wallet.

Today's challenge gives a player a reason to come back tomorrow. Each UTC day has one game, made on 0G from a theme in the rotation (Dahi Handi, a dabbawala's route, Diwali rooftops) and stored on Arkiv, so every player on every server instance gets the same game. Scores on it go on that day's board, and the home card counts down to the next game and links to yesterday's board, so you can see where you finished. A day's game is fixed once stored, which makes the board fair: everyone played the same spec.

Shared games spread by link. "Publish this game" returns `/games/<entity key>`, and anyone who opens it plays the exact spec, with its own leaderboard through `specHash`. A generated game ("a Diwali rooftop hop, slower and longer") becomes something a friend can play and try to beat. The gallery at `/games` lists every published game, newest first, with a filter per template.

## Developers and other apps

The data is public and the schemas are documented in `arkiv/schema.md`. Anyone can read `taksh.scores.v1`, `taksh.games.v1` and `taksh.daily.v1` from the RPC with the query in the README, filtered to our writer address. That's enough to build a different board, a weekly digest, or a bot that posts new games, without our server.

## Limits on reach today

- One writer wallet on testnet. Mainnet and a funded writer are needed before this goes public.
- Scores are self-reported, so a public board would need replay checks or signed sessions before it means much.
- Rate limiting is per server process.
- A day where 0G was down at first and came back later can have scores on the starter game and on the 0G game under one date. The starter is retried after two minutes, so the window is short.
- The camera needs `localhost` or HTTPS, so wider play needs a hosted HTTPS deployment.
