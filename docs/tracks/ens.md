# ENS tracks

Source: ETHGlobal Mumbai prize page, copied verbatim into `prizes.md` on 2026-11-06. ENS has two tracks. Taksh enters one: **Best Use of ENSv2**.

For file:line evidence and a Sepolia link per feature, see `docs/ens-judging.md`.

---

## Track 1: Best Use of ENSv2 ($7,000). Entering

> ### 🧬 Best Use of ENSv2 - $7,000
>
> - 1st place: $3,000
> - 2nd place: $2,000
> - 3rd place: $1,000
> - 3rd place: $1,000
>
> ENSv2 is now live on Ethereum mainnet. Be among the first to build on it. Explore the new hierarchical registry structure: resolve subnames straight off a parent's resolver with wildcard resolution, or deploy your own subname registry to tokenize and manage subnames under your own rules. Use Enhanced Access Control, the shared, role-based permission system behind both registries and resolvers, to delegate specific rights, like letting an account edit only certain text records on a name. Give subnames their own Permissioned Resolver so they fully own their data, mix in record aliasing at the resolver level or namespace aliasing via a shared registry, and combine it all to build subname setups: expiring, revocable, non-transferable vs. transferable, even forever names with no parent control. Bonus points if you bring AI agents into the mix. Think agents as namespaces, each with their own identity and permissions.
>
> **Qualification Requirements**
>
> Project must be built on ENSv2 on Ethereum mainnet or Sepolia. ENSv2 features should be central to the product, not a cosmetic add-on. Your demo must be functional and not just include hard-coded values. Upon submission, your project showcase must have a link to a live demo and the code needs to be open source and accessible on Github or a similar platform.

### Where we stand

**Have it:**

1. **Hierarchical registry.** `.eth` → `taksh-games.eth` → each game. The rival's rounds sit one level deeper.
2. **Our own subname registries.** Two: one for games, one for the rival's rounds.
3. **Enhanced Access Control.** The server wallet can edit exactly 3 text records on the rival. It can't touch anything else.
4. **A Permissioned Resolver per game.** The creator owns the game's data. The server keeps no role on it.
5. **Subname setups.** Games can be transferred. Rounds expire after 30 days and can't be transferred. Nobody can take either back early.

**Bonus, have it:** the 0G rival is an AI agent with its own name (`rival.taksh-games.eth`), ENSIP-26 identity records, and limited permissions. Every round it fights becomes a name under it.

**Not used:**

- Wildcard resolution. It only appears as an explanation on `/name` for unregistered names.
- Record aliasing and namespace aliasing.
- Revocable names.
- Forever names: only partly. Nobody can revoke a game, but games expire with the parent on 2027-11-06.

**Qualification:**

| Rule | Status |
| --- | --- |
| ENSv2 on Sepolia | ✅ |
| Central, not cosmetic | ✅ A game exists only as its ENS records |
| No hard-coded values | ✅ `/play` and `/name` read the chain on every visit |
| Open source | ✅ Public repo, MIT license |
| Live demo link | ⏳ The CI/CD deploy after merge. Then run `TAKSH_URL=<live url> npm run ens:rival` |

---

## Track 2: Best Integration of ENSv2 into an Existing Project ($3,000). Not eligible

> ### 🔗 Best Integration of ENSv2 into an Existing Project - $3,000
>
> 🆕  This prize is only available to Continuity Track participants →
> - 1st place: $2,000
> - 2nd place: $1,000
>
> ENSv2 is now live on Ethereum mainnet. Explore how ENSv2's feature set, including the new registry hierarchy, Enhanced Access Control, Permissioned Resolvers, and record and namespace aliasing, can plug into an existing protocol or project to improve the user experience or unlock entirely new use cases. Take a project you already know, yours or an open one, and integrate it against ENSv2 on Ethereum mainnet.
>
> **Qualification Requirements**
>
> Integration must use ENSv2 on Ethereum mainnet and integrate it into an existing project. It should be clear how ENSv2 improves the project, not just a cosmetic add-on. Your demo must be functional and not just include hard-coded values. Upon submission, your project showcase must have a link to a live demo and the code needs to be open source and accessible on Github or a similar platform.

### Why we skip it

1. Only Continuity Track teams can enter. Taksh is a new project.
2. It needs Ethereum mainnet. We're on Sepolia.
