import { applyAction } from "@/lib/server/actions";
import { errorResponse, json, readBody } from "@/lib/server/http";
import { actionSchema } from "@/lib/server/schemas";
export async function POST(request: Request) {
  try { return json(applyAction(await readBody(request, actionSchema))); }
  catch (error) { return errorResponse(error); }
}
