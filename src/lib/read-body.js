// Reads the body a chunk at a time and stops at max bytes. Content-Length can be left off (a chunked
// upload) or be a lie, so request.text() or arrayBuffer() would buffer whatever is sent first.
export async function readBytes(request, max) {
  if (Number(request.headers.get("content-length")) > max) throw tooLarge();
  const chunks = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > max) {
        await request.body.cancel?.().catch(() => {});
        throw tooLarge();
      }
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

export const readText = async (request, max) => new TextDecoder().decode(await readBytes(request, max));

const tooLarge = () => Object.assign(new Error("That request is too large."), { status: 413, expose: true });
