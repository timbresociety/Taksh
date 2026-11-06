// Drives the built app in a private headless Chrome, through the real UI, with keyboard input.
// Run against a server started with: npm run build && npx next start -p 3100
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.TAKSH_URL ?? "http://localhost:3100";
const shots = process.env.TAKSH_SHOTS ?? "e2e-shots";
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
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
const submitIdea = async (idea) => {
  await page.goto(base);
  await page.fill("#idea", idea);
  await page.click('button[type="submit"]');
};

// Installs a player in the page that presses real key events on the spec's schedule, starting
// from the moment the round clock starts.
async function playPerfectly(spec, skill = "perfect") {
  await page.waitForSelector('[data-phase="playing"]', { timeout: 10000 });
  await page.evaluate(
    ({ spec, skill }) => {
      const press = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      const keys = { strike_left: "a", strike_right: "d", up: "ArrowUp", down: "ArrowDown" };
      let lane = 1;
      for (const event of spec.events) {
        if (skill === "idle") break;
        if (event.requires === "position") {
          const goal = event.kind === "target" ? event.lane : lane === event.lane ? (event.lane === 0 ? 1 : event.lane - 1) : lane;
          const moves = goal - lane;
          for (let i = 0; i < Math.abs(moves); i += 1) {
            setTimeout(() => press(moves < 0 ? "ArrowLeft" : "ArrowRight"), event.atMs - 500 + i * 90);
          }
          lane = goal;
        } else {
          setTimeout(() => press(keys[event.requires]), event.atMs);
        }
      }
    },
    { spec, skill },
  );
}

async function currentSpec(idea, clarification) {
  const post = (path, body) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const reading = await post("/api/intent", { idea, clarification });
  return (await post("/api/generate", { idea, clarification, brief: reading.brief })).spec;
}

const CLEAR = "Pixel art goalkeeper saving penalties in a packed stadium";

// 1. Clear idea goes straight to a game.
await submitIdea(CLEAR);
await page.waitForSelector('[data-testid="game-title"]');
check("clear idea generates without a question", true, await page.textContent('[data-testid="game-title"]'));
check("controls are shown", (await page.textContent('[data-testid="controls"]')).includes("Step left"));
await shot("1-brief");

// 2. Keyboard round, played perfectly through real key events.
const spec = await currentSpec(CLEAR);
await page.click("text=Play with keyboard");
await page.waitForSelector('[data-testid="play"]');
await page.waitForTimeout(500);
await shot("2-countdown");
await playPerfectly(spec);
await page.waitForTimeout(6300);
await shot("3-playing");
const moves = await page.textContent('[data-testid="movements"]');
check("movements are displayed during play", moves.includes("Key"), moves.slice(0, 40));
await page.waitForSelector('[data-testid="result-score"]', { timeout: 95000 });
const perfect = Number(await page.textContent('[data-testid="result-score"]'));
const headline = await page.textContent('[data-testid="result-headline"]');
check("a perfect keyboard round wins", headline === "You did it", `${headline}, score ${perfect}`);
await shot("4-result");

// 3. Revise, and confirm the UI reports a measured gameplay change.
await page.fill("#revision", "Give me more time to dodge");
await page.click("text=Change it");
await page.waitForSelector('[data-testid="revision"]');
const revisionText = await page.textContent('[data-testid="revision"]');
check("revision reports a measured change", /warning/i.test(revisionText), revisionText.slice(0, 90));
await shot("5-revision");

// 4. Replay the revised game. An idle player must lose to the same rules.
await page.click("text=Play the new version");
await page.waitForSelector('[data-testid="play"]');
await page.waitForSelector('[data-testid="result-score"]', { timeout: 95000 });
const idleHeadline = await page.textContent('[data-testid="result-headline"]');
check("an idle player loses the revised round", idleHeadline === "Not this time", idleHeadline);

// 5. Ambiguous idea asks exactly one question, then builds.
await submitIdea("make me a cool workout game");
await page.waitForSelector('[data-testid="clarify"]');
check("ambiguous idea asks a question", true, await page.textContent('[data-testid="clarify"] h2'));
await shot("6-clarify");
await page.click("text=Dodging attacks");
await page.waitForSelector('[data-testid="game-title"]');
check("the answer leads to a game", true, await page.textContent('[data-testid="game-title"]'));

// 6. Unsupported idea is told politely, and can be accepted or changed.
await submitIdea("A game where I do handstands on a beach");
await page.waitForSelector('[data-testid="unsupported"]');
const polite = await page.textContent('[data-testid="unsupported"] h2');
check("unsupported idea gets the polite message", /working on complex interactions/.test(polite), polite);
await shot("7-unsupported");
await page.click("text=Change my idea");
check("creator can change the idea", await page.isVisible("#idea"));
await submitIdea("A game where I do handstands on a beach");
await page.waitForSelector('[data-testid="unsupported"]');
await page.click("text=Play this version");
await page.waitForSelector('[data-testid="game-title"]');
check("creator can accept the closest game", true, await page.textContent('[data-testid="game-title"]'));

check("no page or console errors", problems.length === 0, problems.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
