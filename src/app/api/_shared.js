import { getProvider } from "@/lib/pipeline/provider";
import { createOgProvider } from "@/lib/pipeline/provider-0g";
import { readBytes, readText } from "@/lib/read-body";

export { readBytes, readText };

// Carries a signed-in player's 0G session token from the browser. See src/lib/og/account.js.
export const OG_SESSION_HEADER = "x-0g-session";

// Errors reach the creator, so they say what happened without leaking provider internals.
export function route(handler) {
  return async (request) => {
    try {
      let body;
      try {
        body = JSON.parse(await readText(request, MAX_JSON_BYTES));
      } catch (error) {
        throw error.status ? error : badRequest("The request body is not JSON.");
      }
      const provider = await providerFor(request);
      return Response.json(await handler(body, provider));
    } catch (error) {
      const status = error.status ?? 502;
      return Response.json({ error: error.expose ? error.message : "The game generator did not respond. Try again." }, { status });
    }
  };
}

// A player signed in with their 0G account pays from their own iAI credits; everyone else uses the app's provider.
export async function providerFor(request) {
  const session = request.headers.get(OG_SESSION_HEADER);
  return session ? createOgProvider({ apiKey: session, payer: "user" }) : (await getProvider()).provider;
}

export function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, expose: true });
}

export function requireText(value, name, max) {
  if (typeof value !== "string" || !value.trim()) throw badRequest(`Add ${name} first.`);
  if (value.length > max) throw badRequest(`Keep ${name} under ${max} characters.`);
  return value.trim();
}

// A brief, a spec and a few traces come to a few KB. Revise sends the game too.
const MAX_JSON_BYTES = 256 * 1024;
