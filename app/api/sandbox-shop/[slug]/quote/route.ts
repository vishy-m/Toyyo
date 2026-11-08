import { z } from "zod";
import { sandboxShop, type SandboxSlug } from "@/lib/cinematic/sandbox-shops";
import { errorResponse, HttpError, json } from "@/lib/server/http";
import { receiveSandboxQuote } from "@/lib/server/quote-requests";

const schema = z.object({
  name: z.string().trim().min(1).max(100), email: z.email(), phone: z.string().trim().min(1).max(40),
  vehicleYear: z.coerce.number().int().min(1980).max(2035), vehicleMake: z.string().trim().min(1).max(60),
  vehicleModel: z.string().trim().min(1).max(80), mileage: z.coerce.number().int().min(0).max(1_000_000),
  serviceType: z.string().min(1).max(50), issue: z.string().trim().min(3).max(1000), preferredDate: z.string().max(30),
});
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (slug !== "lone-star-auto" || !sandboxShop(slug)) throw new HttpError(404, "Demo quote form not found.");
    const type = request.headers.get("content-type") ?? "";
    let input: unknown;
    if (type.includes("application/x-www-form-urlencoded")) input = Object.fromEntries(new URLSearchParams(await request.text()));
    else if (type.includes("application/json")) input = await request.json();
    else throw new HttpError(415, "Send a form or JSON body.");
    const parsed = schema.parse(input);
    receiveSandboxQuote(slug as SandboxSlug, parsed);
    if (type.includes("application/x-www-form-urlencoded")) return new Response('<!doctype html><html><body><main><h1>Thank you</h1><p>Demo shop, not a real business. Your quote request is in our demo inbox.</p></main></body></html>', { headers: { "content-type": "text/html; charset=utf-8" } });
    return json({ received: true, shop: slug });
  } catch (error) { return errorResponse(error); }
}
