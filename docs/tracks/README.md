# Track breakdowns: how to write one

Each sponsor Taksh enters gets a file here, `docs/tracks/<sponsor>.md`, so anyone can see in one minute which tracks we're going for and where we stand. `ens.md` is the finished example. Copy its shape.

## Where the prize text lives

`prizes.md` sits outside this repo, at `/Users/ketan/Work/hackathon/prizes.md`. It is a verbatim copy of https://ethglobal.com/events/mumbai/prizes. Sponsor sections, by line, as of 2026-11-07:

| Sponsor | Lines | Taksh status |
| --- | --- | --- |
| 0G | 220-396 | Entering. Inference is in the main flow, plus the rival's decisions |
| Arkiv | 719-939 | Entering Build on Arkiv (from scratch). Done: `arkiv.md` |
| ENS | 1280-1337 | Entering. Done: `ens.md` |

Line numbers drift if the file is re-pulled, so check that each `##` heading is where the table says before you copy. Without access to that file, copy the text from the ETHGlobal page itself. `docs/integrations/README.md` holds only summaries, so never quote from it.

## Steps

1. Read the sponsor's whole section in `prizes.md`, every track included.
2. Create `docs/tracks/<sponsor>.md` with one heading per track: `## Track N: <name> (<prize>). Entering` or `. Not eligible` or `. Skipping`.
3. Under each heading, paste the track's text **exactly**, as a `>` block quote: title, placement amounts, description, qualification requirements. Don't fix typos, trim lines, or reword anything.
4. Under the quote, write the breakdown in the format below.
5. Check every claim against the code or the chain before you write it. Run the feature, read the file, open the transaction.
6. Commit, push to the working branch, and add the file to the PR.

## Breakdown format (ADHD-friendly)

The reader has ADHD. Make it scannable in one pass.

- **Have it:** numbered list, at most 5 items. Each item starts with the judged feature in bold, then one or two short sentences on what Taksh does.
- **Bonus, have it:** one line, only if the track names a bonus.
- **Not used:** a bulleted list. Say it plainly. "Partly" is allowed when it's true, with the reason.
- **Qualification:** a table, `Rule | Status`, using ✅, ⏳ (pending, say what it waits on) or ❌, with a few words of proof.
- For a track we're not entering: `### Why we skip it`, numbered reasons, one line each.

Rules:

- Lead with the answer. No intro paragraph beyond the source line.
- Short sentences. Concrete numbers, names and dates. Nothing vague like "robust" or "seamless".
- Never claim something works without having checked it. If a qualification isn't met yet, mark it ⏳ or ❌ and name the missing piece.
- No em dashes.
- Keep file:line evidence and transaction links in a separate judging doc, as `docs/ens-judging.md` does. The track file stays short and points to it.

## Prompt to hand an agent

```
Write docs/tracks/<sponsor>.md for Taksh, following docs/tracks/README.md and using
docs/tracks/ens.md as the example. The prize text is in /Users/ketan/Work/hackathon/prizes.md,
lines <from>-<to>. Quote every track verbatim, then add the ADHD breakdown under each one.
Verify each "have it" claim against the code before writing it. Commit and push to the
current branch.
```
