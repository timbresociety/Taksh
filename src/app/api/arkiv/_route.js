import { badRequest } from "../_shared";

// Arkiv failures come back as { available: false }, so the game keeps working and the UI says why.
export function arkivRoute(handler) {
  return async (request, context) => {
    try {
      return Response.json(await handler(request, context));
    } catch (error) {
      if (!error.expose) console.error("Arkiv request failed:", error.shortMessage ?? error.message);
      const message = error.expose ? error.message : "Arkiv did not respond, so this is unavailable right now.";
      return Response.json({ available: false, error: message }, { status: error.status ?? 503 });
    }
  };
}

export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw badRequest("The request body is not JSON.");
  }
}

// Every write costs the writer wallet gas, so one client gets one write every few seconds.
// ponytail: in-memory and per server process, swap for a shared store if this runs on more than one.
const lastWrite = new Map();
export function throttle(request, ms = 4000) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  if (now - (lastWrite.get(client) ?? 0) < ms) throw Object.assign(badRequest("Slow down: one post every few seconds."), { status: 429 });
  lastWrite.set(client, now);
}

export { badRequest };
