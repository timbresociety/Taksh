import { ensConfig, publishGame } from "@/lib/ens/chain";
import { validateSpec } from "@/lib/spec/validate";

export const dynamic = "force-dynamic";

function status(config) {
  const reason = config.reason ?? (config.registrarKey ? null : "ENS_REGISTRAR_PRIVATE_KEY is not set.");
  return { available: !reason, parent: config.parent, chain: config.chainName, reason };
}

export async function GET() {
  return Response.json(status(ensConfig()));
}

// Publishing signs with the registrar key, so it only ever runs here on the server.
export async function POST(request) {
  const config = ensConfig();
  const state = status(config);
  if (!state.available) return Response.json({ error: `Publishing to ENS is unavailable: ${state.reason}` }, { status: 503 });
  try {
    const body = await request.json();
    const check = validateSpec(body?.spec);
    if (!check.ok) return Response.json({ error: `This game can't be published: ${check.errors[0]}` }, { status: 400 });
    const label = typeof body.label === "string" && body.label.trim() ? body.label : check.spec.title;
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    return Response.json(await publishGame(config, { spec: check.spec, label, owner, origin: new URL(request.url).origin }));
  } catch (error) {
    if (!error.status) console.error("ens publish", error);
    return Response.json({ error: error.status ? error.message : "ENS did not respond. The game still plays here; try publishing again." }, { status: error.status ?? 502 });
  }
}
