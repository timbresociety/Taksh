// What the studio remembers across a refresh, and which step the address bar shows. Each step is in the
// URL as ?step=, so back and forward move between steps instead of leaving the site, and the studio's
// state is kept in the tab's sessionStorage, one entry per page, so a shared game and the home page
// never mix. Storage can be missing or full (a private window, a blocked site), so every read and
// write is allowed to fail and the studio then simply starts fresh.
export const STEPS = ["idea", "brief", "calibrate", "practice", "play", "result"];
// The camera and a live round can't be picked up again after a reload, so these come back as the brief.
const LIVE_STEPS = new Set(["calibrate", "practice", "play"]);
const VERSION = 1;

export const memoryKey = (pathname = "/") => `taksh.studio:${pathname}`;

export function stepFromSearch(search = "") {
  const step = new URLSearchParams(search).get("step");
  return STEPS.includes(step) ? step : null;
}

// The address for a step, keeping any other query the page was opened with.
export function searchForStep(search = "", step) {
  const params = new URLSearchParams(search);
  if (step === "idea") params.delete("step");
  else params.set("step", step);
  const query = params.toString();
  return query ? `?${query}` : "";
}

// The step to show for what is remembered and what the address asks for. A step needs what it shows:
// the brief needs a game, the result needs a finished round. start is the step an address without one
// means: the idea on the home page, the brief on a page opened on a game.
export function resumeStep({ game = null, result = null } = {}, asked = null, start = "idea") {
  if (!game) return "idea";
  const step = asked ?? start;
  if (step === "idea") return "idea";
  if (LIVE_STEPS.has(step)) return "brief";
  if (step === "result" && !result) return "brief";
  return step;
}

export function loadStudio(storage, key) {
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    return saved?.version === VERSION ? saved.state : null;
  } catch {
    return null;
  }
}

// A round's full result can be large, so if the tab's storage is full it is the first thing let go.
export function saveStudio(storage, key, state) {
  for (const kept of [state, { ...state, result: null }]) {
    try {
      storage?.setItem(key, JSON.stringify({ version: VERSION, state: kept }));
      return true;
    } catch {
      // full or blocked: try again without the result, then give up quietly
    }
  }
  return false;
}
