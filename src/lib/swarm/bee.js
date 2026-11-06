// Swarm on Gnosis mainnet. Uploads go through our Bee node (BEE_URL) and pay with the postage batch
// in SWARM_BATCH_ID. Reads go through a public gateway, so a deploy with no Bee node still shows
// everything that was uploaded. Server only.
export const GATEWAY = (process.env.SWARM_GATEWAY || "https://api.gateway.ethswarm.org").replace(/\/$/, "");
export const SWARM_REF = /^[0-9a-f]{64}$/;
export const swarmOn = (env = process.env) => Boolean(env.BEE_URL && env.SWARM_BATCH_ID);
export const swarmUrl = (ref, path = "") => `${GATEWAY}/bzz/${ref}/${path}`;

// Bee takes a collection as a tar. Plain ustar: a 512-byte header per file, data padded to 512.
export function tar(files) {
  const encoder = new TextEncoder();
  const blocks = [];
  for (const { path, bytes } of files) {
    const header = new Uint8Array(512);
    const put = (text, at) => header.set(encoder.encode(text), at);
    put(path, 0);
    put("0000644\0", 100);
    put("0000000\0", 108);
    put("0000000\0", 116);
    put(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124);
    put("00000000000\0", 136);
    put("        ", 148); // the checksum counts its own field as spaces
    put("0", 156);
    put("ustar\0" + "00", 257);
    put(`${header.reduce((sum, b) => sum + b, 0).toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((sum, b) => sum + b.length, 0));
  let at = 0;
  for (const block of blocks) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

// files: [{ path, bytes, type }]. Returns the collection's Swarm reference.
export async function uploadCollection(files, index = "index.html", env = process.env) {
  const response = await fetch(`${env.BEE_URL.replace(/\/$/, "")}/bzz`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-tar",
      "Swarm-Postage-Batch-Id": env.SWARM_BATCH_ID,
      "Swarm-Collection": "true",
      "Swarm-Index-Document": index,
    },
    body: tar(files),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Bee refused the upload: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const { reference } = await response.json();
  if (!SWARM_REF.test(reference)) throw new Error("Bee returned no reference.");
  return reference;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// What a published game keeps on Swarm: its cover, its spec, and a page that shows both, so the
// gateway link opens on something a person can read.
export function gameFiles({ spec, cover, author, playUrl }) {
  const encoder = new TextEncoder();
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(spec.title)}</title>
<body style="font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem">
<img src="cover.webp" alt="" style="width:100%;border-radius:12px">
<h1>${escape(spec.title)}</h1>
<p>${escape(spec.objective)}</p>
<p>A Taksh game by ${escape(author)}, played with your body through a webcam. <a href="spec.json">The game spec</a>.</p>
${playUrl ? `<p><a href="${escape(playUrl)}">Play it on Taksh</a></p>` : ""}`;
  return [
    { path: "index.html", bytes: encoder.encode(page) },
    { path: "spec.json", bytes: encoder.encode(JSON.stringify(spec, null, 2)) },
    ...(cover ? [{ path: "cover.webp", bytes: cover }] : []),
  ];
}

// A cover from the browser: a webp data URL, checked by its magic bytes, at most 200 KB.
export const MAX_COVER_BYTES = 200 * 1024;

// Decoded and drawn again at 640x360, so only pixels reach Swarm, never bytes riding behind a
// valid header. Returns null if it doesn't decode.
export async function cleanCover(dataUrl) {
  const bytes = readCover(dataUrl);
  if (!bytes) return null;
  const { default: sharp } = await import("sharp");
  try {
    return new Uint8Array(await sharp(bytes, { limitInputPixels: 4096 * 4096 }).resize(640, 360, { fit: "cover" }).webp({ quality: 80 }).toBuffer());
  } catch {
    return null;
  }
}

export function readCover(dataUrl) {
  const prefix = "data:image/webp;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix) || dataUrl.length > MAX_COVER_BYTES * 1.4) return null;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(dataUrl.slice(prefix.length)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
  return bytes.length <= MAX_COVER_BYTES && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? bytes : null;
}
