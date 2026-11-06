import { reviseGame } from "@/lib/pipeline/pipeline";
import { validateSpec } from "@/lib/spec/validate";
import { badRequest, requireText, route } from "../_shared";

export const POST = route(async (body, provider) => {
  const request = requireText(body.request, "a change", 300);
  const check = validateSpec(body.spec);
  if (!check.ok) throw badRequest("This game can't be revised because its spec is invalid.");
  return reviseGame({ spec: check.spec, request }, provider);
});

// A thinking model can take minutes; give the call all the time a function has.
export const maxDuration = 300;
