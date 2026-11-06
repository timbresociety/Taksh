import { transcribe0g } from "@/lib/pipeline/provider-0g";
import { createBudget } from "@/lib/agent/budget";

export const dynamic = "force-dynamic";

// The browser records at most 15 s. Opus at that length is well under 1 MB.
const MAX_AUDIO_BYTES = 1024 * 1024;
const spend = createBudget(20);

// Raw audio in, the idea as text out. The 0G key stays here.
export async function POST(request) {
  try {
    if (!process.env.OG_API_KEY) throw Object.assign(new Error("Voice needs 0G. Type your idea instead."), { status: 503, expose: true });
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("audio/")) throw Object.assign(new Error("Send the recording as audio."), { status: 400, expose: true });
    if (Number(request.headers.get("content-length")) > MAX_AUDIO_BYTES) throw tooBig();
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) throw Object.assign(new Error("That recording was empty."), { status: 400, expose: true });
    if (bytes.byteLength > MAX_AUDIO_BYTES) throw tooBig();
    spend();
    const { text, trace } = await transcribe0g(new Blob([bytes], { type }));
    if (!text) throw Object.assign(new Error("0G heard nothing. Try again a bit louder."), { status: 422, expose: true });
    return Response.json({ text: text.slice(0, 500), trace });
  } catch (error) {
    if (!error.expose) console.error("transcribe failed:", error.message);
    return Response.json({ error: error.expose ? error.message : "0G could not hear that. Try again, or type it." }, { status: error.status ?? 502 });
  }
}

const tooBig = () => Object.assign(new Error("Keep it under 15 seconds."), { status: 413, expose: true });
