import { runAgent } from "@/lib/agent/loop";
import { errorResponse, readBody } from "@/lib/server/http";
import { chatSchema } from "@/lib/server/schemas";
import type { AgentStreamEvent } from "@/lib/types";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const input = await readBody(request, chatSchema);
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    const encoder = new TextEncoder();
    let closed = false;
    let done = false;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: AgentStreamEvent) => {
          if (closed || done) return;
          if (event.type === "done") done = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        const heartbeat = setInterval(() => { if (!closed && !done) controller.enqueue(encoder.encode(": keep-alive\n\n")); }, 10000);
        try { await runAgent(input, emit, abort.signal); }
        catch { emit({ type: "error", message: "Unable to complete this request. Please try again." }); }
        finally {
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", onAbort);
          emit({ type: "done" });
          if (!closed) { closed = true; controller.close(); }
        }
      },
      cancel() { closed = true; abort.abort(); },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) { return errorResponse(error); }
}
