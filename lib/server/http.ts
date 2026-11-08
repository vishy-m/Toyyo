import { z } from "zod";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new HttpError(400, "Provide a valid JSON request body."); }
  return schema.parse(body);
}
export function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", issues: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  console.error("[api] Request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ error: "Unable to complete this request. Please try again." }, { status: 500 });
}
export const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
