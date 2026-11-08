import { after } from "next/server";
import { getInitialPanel, warmInitialPanels } from "@/lib/agent/recommendations";
import { errorResponse, json } from "@/lib/server/http";
import { personaIdSchema } from "@/lib/server/schemas";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    const id = personaIdSchema.parse(new URL(request.url).searchParams.get("personaId"));
    after(warmInitialPanels);
    return json(await getInitialPanel(id));
  } catch (error) { return errorResponse(error); }
}
