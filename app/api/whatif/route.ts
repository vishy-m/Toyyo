import { runWhatIf } from "@/lib/engines";
import { errorResponse, json, readBody } from "@/lib/server/http";
import { whatIfSchema } from "@/lib/server/schemas";
import { getState } from "@/lib/server/store";
export async function POST(request: Request) {
  try {
    const input = await readBody(request, whatIfSchema);
    return json(runWhatIf(input.personaId, input.moveType, input.overrides, getState(input.personaId)));
  } catch (error) { return errorResponse(error); }
}
