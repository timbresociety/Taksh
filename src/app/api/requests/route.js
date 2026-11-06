import { start } from "workflow/api";
import { KIND_IDS } from "@/lib/requests/kinds";
import { handleRequest } from "@/workflows/request";
import { badRequest, requireText } from "../_shared";

// Starts a request and answers at once with its id. The work happens in the workflow, which can take
// minutes when the model thinks hard; the client polls GET /api/requests/:id.
export async function POST(request) {
  try {
    const body = await request.json();
    const text = requireText(body.text, "what you want made", 600);
    const kind = body.kind ?? null;
    if (kind !== null && !KIND_IDS.includes(kind)) throw badRequest(`Ask for one of: ${KIND_IDS.join(", ")}.`);
    const run = await start(handleRequest, [{ text, kind, startedAt: Date.now() }]);
    return Response.json({ id: run.runId }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "The request could not be started. Try again." }, { status: error.status ?? 502 });
  }
}
