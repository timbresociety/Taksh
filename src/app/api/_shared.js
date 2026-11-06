import { getProvider } from "@/lib/pipeline/provider";

// Errors reach the creator, so they say what happened without leaking provider internals.
export function route(handler) {
  return async (request) => {
    try {
      const body = await request.json();
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
