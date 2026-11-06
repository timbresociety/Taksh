import { getRun } from "workflow/api";
import { getWorld } from "workflow/runtime";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{8,80}$/;

// Where a request has got to. Cheap to call: it reads the run's status and progress, and only loads
// the result once the run has finished.
export async function GET(_request, { params }) {
  const { id } = await params;
  if (!ID.test(id)) return Response.json({ error: "That is not a request id." }, { status: 400 });
  try {
    const world = await getWorld();
    const run = await world.runs.get(id, { resolveData: "none" });
    const attributes = run.attributes ?? {};
    const progress = { id, status: run.status, stage: attributes.stage ?? "queued", kind: attributes.kind ?? null };
    if (run.status === "completed") return Response.json({ ...progress, result: await getRun(id).returnValue });
    if (run.status === "failed" || run.status === "cancelled") {
      return Response.json({ ...progress, result: { status: "failed", message: "The request stopped before it finished. Try again." } });
    }
    return Response.json(progress, { headers: { "Retry-After": "3" } });
  } catch {
    return Response.json({ error: "No request with that id." }, { status: 404 });
  }
}
