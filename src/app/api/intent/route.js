import { clarifyIdea } from "@/lib/pipeline/pipeline";
import { requireText, route } from "../_shared";

export const POST = route(async (body, provider) => {
  const idea = requireText(body.idea, "an idea", 500);
  const clarification = body.clarification ? requireText(body.clarification, "an answer", 200) : undefined;
  return clarifyIdea({ idea, clarification }, provider);
});

// A thinking model can take minutes; give the call all the time a function has.
export const maxDuration = 300;
