import { generateGame } from "@/lib/pipeline/pipeline";
import { badRequest, requireText, route } from "../_shared";

export const POST = route(async (body, provider) => {
  const idea = requireText(body.idea, "an idea", 500);
  if (!body.brief || typeof body.brief !== "object") throw badRequest("The game brief is missing.");
  return generateGame({ idea, clarification: body.clarification, brief: body.brief }, provider);
});

// A thinking model can take minutes; give the call all the time a function has.
export const maxDuration = 300;
