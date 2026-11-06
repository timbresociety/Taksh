// Drives the built app in a private headless Chrome through the real UI. All nine games are played
// with real key presses, chosen by each template's own bot, across every world and art style. The
// picture itself is measured, so a blank canvas fails even when the page reports no errors.
// Run against a server started with: npm run build && npx next start -p 3100
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { STYLES, WORLDS } from "../src/lib/spec/contract.js";
import { TEMPLATES } from "../src/lib/templates/index.js";

const base = process.env.TAKSH_URL ?? "http://localhost:3100";
const shots = process.env.TAKSH_SHOTS ?? "e2e-shots";
const PLAY_MS = 14000;
const MIN_DETAIL = 12; // the spread of brightness across a picture; a blank canvas is near zero
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("console", (message) => message.type() === "error" && problems.push(`console: ${message.text()}`));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const shot = (name) => page.screenshot({ path: `${shots}/${name}.png` });

async function detail(selector) {
  const picture = await page.locator(selector).screenshot({ timeout: 60000 });
  const { channels } = await sharp(picture).stats();
  return Math.round(channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3);
}

const readState = () => page.evaluate(() => JSON.stringify(window.__takshSession.state)).then(JSON.parse);

// Reads the game, asks the bot what a player would do, and presses that key for real.
async function play(template, ms) {
  const keys = new Map(template.actions.map((action) => [action.id, action.key === " " ? "Space" : action.key]));
  const held = template.actions.find((action) => action.hold);
  const until = Date.now() + ms;
  let presses = 0;
  while (Date.now() < until) {
    const state = await readState();
    if (state.status !== "playing") break;
    const wanted = template.bot(state, "quick");
    if (wanted === `${held?.id}_release`) await page.keyboard.up(keys.get(held.id));
    else if (wanted === held?.id) await page.keyboard.down(keys.get(held.id));
    else if (wanted) await page.keyboard.press(keys.get(wanted));
    if (wanted) presses += 1;
    await page.waitForTimeout(45);
  }
  return presses;
}

const openGame = async (template) => {
  await page.goto(`${base}/?e2e`);
  await page.click(`[data-template="${template.id}"]`);
  await page.waitForSelector('[data-testid="preview"][data-ready="true"]', { timeout: 60000 });
};

// 1. Every game, each in a different world and style.
for (const [index, template] of TEMPLATES.entries()) {
  const world = WORLDS[index % WORLDS.length].id;
  const style = STYLES[(index * 5 + 1) % STYLES.length].id;
  const label = `${template.name} in ${world}, ${style}`;
  await openGame(template);
  await page.check(`input[name="World"][value="${world}"]`, { force: true });
  await page.check(`input[name="Art style"][value="${style}"]`, { force: true });
  await page.waitForTimeout(400);
  await page.waitForSelector('[data-testid="preview"][data-ready="true"]', { timeout: 60000 });
  await page.waitForTimeout(700);
  const preview = await detail('[data-testid="preview"]');
  check(`${label}: preview draws`, preview > MIN_DETAIL, `detail ${preview}`);

  await page.click("text=Play with keyboard");
  await page.waitForSelector('[data-testid="play"][data-phase="playing"]', { timeout: 60000 });
  const presses = await play(template, PLAY_MS);
  const state = await readState();
  const canvas = await detail(".play__canvas");
  await shot(`game-${template.id}`);
  const scored = state.score > 0 || state.hits > 0 || state.distance > 0;
  check(`${label}: plays and scores`, scored && presses > 0 && canvas > MIN_DETAIL, `${presses} presses, score ${state.score ?? 0}, detail ${canvas}`);
}

// 2. A round to its end, then a revision the UI can prove.
const reps = TEMPLATES.find((template) => template.id === "reps");
await openGame(reps);
await page.click("text=Play with keyboard");
await page.waitForSelector('[data-testid="play"][data-phase="playing"]', { timeout: 60000 });
await play(reps, 20000);
await page.waitForSelector('[data-testid="result-score"]', { timeout: 20000 });
const headline = await page.textContent('[data-testid="result-headline"]');
check("a full round reaches the result", headline === "You did it", `${headline}, ${await page.textContent('[data-testid="result-score"]')} reps`);
await shot("result");
await page.fill("#revision", "Give me more time");
await page.click("text=Change it");
await page.waitForSelector('[data-testid="revision"]');
const revision = await page.textContent('[data-testid="revision"]');
check("a revision reports a measured change", /Round length/.test(revision), revision.slice(0, 90));
await page.click("text=Play the new version");
await page.waitForSelector('[data-testid="play"][data-phase="playing"]', { timeout: 60000 });
check("the revised game plays", true);

// 3. What the player does shows up on screen as they do it.
const guard = TEMPLATES.find((template) => template.id === "guard");
await openGame(guard);
await page.click("text=Play with keyboard");
await page.waitForSelector('[data-testid="play"][data-phase="playing"]', { timeout: 60000 });
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(600);
const movements = await page.textContent('[data-testid="movements"]');
check("key presses show in the movement log", movements.includes("Key"), movements.slice(0, 40));

// 4. A typed idea picks its game, world and style.
const submitIdea = async (idea) => {
  await page.goto(`${base}/?e2e`);
  await page.fill("#idea", idea);
  await page.click('button[type="submit"]');
};
await submitIdea("A pixel goalkeeper saving shots in the forest");
await page.waitForSelector('[data-testid="game-title"]');
const chosen = await page.$eval('input[name="World"]:checked', (input) => input.value);
const look = await page.$eval('input[name="Art style"]:checked', (input) => input.value);
check("an idea sets the world and style", chosen === "forest" && look === "pixel", `${chosen}, ${look}`);
check("controls name the exercise", (await page.textContent('[data-testid="controls"]')).includes("Side step"));

// 5. An unclear idea asks exactly one question.
await submitIdea("make me a cool workout game");
await page.waitForSelector('[data-testid="clarify"]');
check("an unclear idea asks a question", true, await page.textContent('[data-testid="clarify"] h2'));
await page.click('[data-testid="clarify"] .answers button');
await page.waitForSelector('[data-testid="game-title"]');
check("the answer leads to a game", true, await page.textContent('[data-testid="game-title"]'));

// 6. An unsupported idea is told politely, and can be accepted or changed.
await submitIdea("A game where I do handstands on a beach");
await page.waitForSelector('[data-testid="unsupported"]');
const polite = await page.textContent('[data-testid="unsupported"] h2');
check("an unsupported idea gets the polite message", /working on complex interactions/.test(polite), polite);
await page.click("text=Change my idea");
check("the creator can change the idea", await page.isVisible("#idea"));
await submitIdea("A game where I do handstands on a beach");
await page.waitForSelector('[data-testid="unsupported"]');
await page.click("text=Play this version");
await page.waitForSelector('[data-testid="game-title"]');
check("the creator can accept the closest game", true, await page.textContent('[data-testid="game-title"]'));

check("no page or console errors", problems.length === 0, problems.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
