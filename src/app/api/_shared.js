import { getProvider } from "@/lib/pipeline/provider";
import { readBytes, readText } from "@/lib/read-body";

export { readBytes, readText };

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
      const { provider } = await getProvider();
      return Response.json(await handler(body, provider));
    } catch (error) {
      const status = error.status ?? 502;
      return Response.json({ error: error.expose ? error.message : "The game generator did not respond. Try again." }, { status });
    }
  };
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
