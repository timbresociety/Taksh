import { ensConfig, publishGame } from "@/lib/ens/chain";
import { validateSpec } from "@/lib/spec/validate";
import { createBudget } from "@/lib/agent/budget";

export const dynamic = "force-dynamic";

// Every publish is a Sepolia transaction from the registrar wallet, and a name nobody can take back.
const spend = createBudget(10);
const MAX_SPEC_BYTES = 4096; // a starter spec is about 600 bytes; the spec becomes a text record

// The url record outlives this server, so it must point somewhere anyone can open. A publish from a
// local dev server writes no url record unless TAKSH_URL names the live app.
function publicOrigin(request, env = process.env) {
  if (env.TAKSH_URL) return env.TAKSH_URL.replace(/\/+$/, "");
  const { origin, hostname } = new URL(request.url);
  return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hostname) ? null : origin;
}

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
    if (new TextEncoder().encode(JSON.stringify(check.spec)).length > MAX_SPEC_BYTES) return Response.json({ error: "That game is too large to publish." }, { status: 400 });
    spend();
    const label = typeof body.label === "string" && body.label.trim() ? body.label : check.spec.title;
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    return Response.json(await publishGame(config, { spec: check.spec, label, owner, origin: publicOrigin(request) }));
  } catch (error) {
    if (!error.status) console.error("ens publish", error);
    return Response.json({ error: error.status ? error.message : "ENS did not respond. The game still plays here; try publishing again." }, { status: error.status ?? 502 });
  }
}
