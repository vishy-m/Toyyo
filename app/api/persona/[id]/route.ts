import { after } from "next/server";
import { warmInitialPanels } from "@/lib/agent/recommendations";
import { getDashboard } from "@/lib/server/dashboard";
import { errorResponse, json } from "@/lib/server/http";
import { personaIdSchema } from "@/lib/server/schemas";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dashboard = getDashboard(personaIdSchema.parse((await context.params).id));
    after(warmInitialPanels);
    return json(dashboard);
  }
  catch (error) { return errorResponse(error); }
}
