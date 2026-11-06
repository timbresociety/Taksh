import { badRequest, readText } from "../_shared";

// viem wraps the HTTP error, so look down the cause chain for the 429.
const rateLimited = (error) => (error ? error.status === 429 || rateLimited(error.cause) : false);

// Arkiv failures come back as { available: false }, so the game keeps working and the UI says why.
export function arkivRoute(handler) {
  return async (request, context) => {
    try {
      return Response.json(await handler(request, context));
    } catch (error) {
      if (!error.expose) console.error("Arkiv request failed:", error.shortMessage ?? error.message);
      const message = error.expose
        ? error.message
        : rateLimited(error)
          ? "Arkiv's public endpoint is rate limiting this server. Set ARKIV_ACCESS_KEY to use a keyed endpoint."
          : "Arkiv did not respond, so this is unavailable right now.";
      return Response.json({ available: false, error: message }, { status: error.status ?? 503 });
    }
  };
}

// 512 KB covers a spec and a 200 KB cover as base64.
export async function readBody(request, max = 512 * 1024) {
  const text = await readText(request, max);
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("The request body is not JSON.");
  }
}

export { throttle } from "@/lib/arkiv/throttle";

export { badRequest };
