// A published game lives in the text records of its ENS name. This file is the pure half: how a
// spec becomes records and back, and how a title becomes a label. No chain access here.

// `taksh.spec` holds the spec minus the fields that have a record of their own: template, title,
// objective (as `description`), world and style. Those read in any ENS app, and editing
// `taksh.world` in one moves the game to that world. Names published before this split carry the
// whole spec in `taksh.spec`; the single records still win there.
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

// Every byte of a text record costs about 3,600 gas on the ENSv2 Permissioned Resolver (measured on
// Sepolia, 2026-11-07), so the spec record doesn't repeat what the other records hold.
export function specToRecords(spec, url) {
  if (new TextEncoder().encode(JSON.stringify(spec)).length > MAX_SPEC_BYTES) throw invalid(`This spec is over ${MAX_SPEC_BYTES} bytes, too large to publish.`);
  const { template, title, objective, skin: { world, style, ...skin }, ...rest } = spec;
  const records = [
    [KEYS.spec, JSON.stringify({ ...rest, skin })],
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
    objective: pick(KEYS.description) ?? spec.objective,
    skin: { ...spec.skin, world: pick(KEYS.world) ?? spec.skin?.world, style: pick(KEYS.style) ?? spec.skin?.style },
  };
}
