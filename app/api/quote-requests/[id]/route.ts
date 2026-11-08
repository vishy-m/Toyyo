import { getQuoteRequest } from "@/lib/server/quote-requests";
import { json } from "@/lib/server/http";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = getQuoteRequest(id);
  return request ? json(request) : Response.json({ error: "Quote request not found." }, { status: 404 });
}
