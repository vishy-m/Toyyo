import { z } from "zod";
import { errorResponse, json, readBody } from "@/lib/server/http";
import { startQuoteRequest } from "@/lib/server/quote-requests";
import { isSandboxShop } from "@/lib/cinematic/sandbox-shops";

const schema = z.object({ personaId: z.enum(["maya", "garcia", "jordan", "raj", "nora", "eli", "ava", "theo", "ryan", "devon", "priya"]), shopId: z.string().min(1).max(100), issue: z.string().trim().min(3).max(240) });
export async function POST(request: Request) {
  try {
    const input = await readBody(request, schema);
    if (!isSandboxShop(input.shopId)) return Response.json({ error: "Automatic quotes work with demo shops only." }, { status: 403 });
    const result = await startQuoteRequest({ ...input, origin: new URL(request.url).origin });
    return json(result);
  } catch (error) { return errorResponse(error); }
}
