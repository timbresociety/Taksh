// Measures what a revision really changed, so a claim like "more time to dodge" can be checked.
import { templateInfo } from "../templates/index.js";

const SMALL = 0.0005;

export function compareSpecs(before, after) {
  const changes = [];
  if (before.template !== after.template) changes.push({ key: "template", label: "Game", before: templateInfo(before.template).name, after: templateInfo(after.template).name, unit: "" });
  const fields = templateInfo(after.template).tuning;
  if (before.template === after.template) {
    for (const [key, field] of Object.entries(fields)) {
      const from = before.tuning[key];
      const to = after.tuning[key];
      if (Math.abs(from - to) > SMALL) changes.push({ key, label: field.label, before: from, after: to, unit: field.unit });
    }
  }
  const lookChanged = JSON.stringify(before.skin) !== JSON.stringify(after.skin) || before.title !== after.title;
  return { changes, rulesChanged: changes.length > 0, lookChanged };
}
