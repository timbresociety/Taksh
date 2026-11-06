import { generateGame } from "@/lib/pipeline/pipeline";
import { badRequest, requireText, route } from "../_shared";

export const POST = route(async (body, provider) => {
  const idea = requireText(body.idea, "an idea", 500);
  if (!body.brief || typeof body.brief !== "object") throw badRequest("The game brief is missing.");
  return generateGame({ idea, clarification: body.clarification, brief: body.brief }, provider);
});
