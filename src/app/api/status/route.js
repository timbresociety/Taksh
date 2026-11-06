import { getProvider } from "@/lib/pipeline/provider";
import { PROMPT_VERSIONS } from "@/lib/pipeline/prompts";

export const dynamic = "force-dynamic";

export async function GET() {
  const { provider, reason } = await getProvider();
  return Response.json({ source: provider.source, model: provider.model, trustMode: provider.trustMode ?? null, promptVersions: PROMPT_VERSIONS, fixtureReason: reason });
}
