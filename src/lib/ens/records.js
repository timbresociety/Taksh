// A published game lives in the text records of its ENS name. This file is the pure half: how a
// spec becomes records and back, and how a title becomes a label. No chain access here.

// `taksh.spec` holds the whole spec. The other keys repeat single fields so the game reads in any
// ENS app, and they win over the spec when they differ, so editing `taksh.world` in the ENS app
// moves the game to that world.
export const KEYS = {
  spec: "taksh.spec",
  template: "taksh.template",
  world: "taksh.world",
  style: "taksh.style",
  title: "taksh.title",
  description: "description",
  url: "url",
};

// ponytail: a bound on gas per publish, not a protocol limit. A starter spec is about 600 bytes.
export const MAX_SPEC_BYTES = 4096;
export const MAX_LABEL = 40;

// Errors here are about the input, so they carry a 400 and are safe to show.
const invalid = (message) => Object.assign(new Error(message), { status: 400 });

// Lowercase ASCII letters, digits and single hyphens. That subset is already normalised under
// ENSIP-15, so a label made here needs no further checks.
export function slugLabel(text) {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL)
    .replace(/-+$/, "");
  if (!slug) throw invalid("Give the game a name with at least one letter or digit.");
  return slug;
}

export function specToRecords(spec, url) {
  const json = JSON.stringify(spec);
  if (new TextEncoder().encode(json).length > MAX_SPEC_BYTES) throw invalid(`This spec is over ${MAX_SPEC_BYTES} bytes, too large to publish.`);
  const records = [
    [KEYS.spec, json],
    [KEYS.template, spec.template],
    [KEYS.world, spec.skin.world],
    [KEYS.style, spec.skin.style],
    [KEYS.title, spec.title],
    [KEYS.description, spec.objective],
  ];
  if (url) records.push([KEYS.url, url]);
  return records;
}

// `texts` maps record key to value (null or "" when unset). Returns the spec before validation.
export function recordsToSpec(texts) {
  const raw = texts[KEYS.spec];
  if (!raw) throw invalid("No Taksh game is published at this name.");
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch {
    throw invalid("The game record on this name is not valid JSON.");
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw invalid("The game record on this name is not a spec.");
  const pick = (key) => texts[key] || undefined;
  return {
    ...spec,
    template: pick(KEYS.template) ?? spec.template,
    title: pick(KEYS.title) ?? spec.title,
    skin: { ...spec.skin, world: pick(KEYS.world) ?? spec.skin?.world, style: pick(KEYS.style) ?? spec.skin?.style },
  };
}
