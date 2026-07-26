import { listV48Events } from "@/lib/server/v48-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const encoder = new TextEncoder();

function eventFrame(event: { sequence: number; eventType: string; payloadJson: string }) {
  return `id: ${event.sequence}\nevent: ${event.eventType}\ndata: ${event.payloadJson}\n\n`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = url.searchParams.get("market")?.toLowerCase();
  const owner = url.searchParams.get("owner")?.toLowerCase();
  if (market && !ADDRESS.test(market)) return new Response("Invalid market address.", { status: 400 });
  if (owner && !ADDRESS.test(owner)) return new Response("Invalid owner address.", { status: 400 });
  let cursor = Math.max(0, Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0);
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`retry: 1000\nevent: ready\ndata: {"version":48,"cursor":${cursor}}\n\n`));
      const pump = async () => {
        while (!closed && !request.signal.aborted) {
          try {
            const events = listV48Events({ afterSequence: cursor, market, owner, limit: 200 }) as unknown as Array<{ sequence: number; eventType: string; payloadJson: string }>;
            if (events.length) {
              for (const event of events) { controller.enqueue(encoder.encode(eventFrame(event))); cursor = event.sequence; }
            } else controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch (error) {
            controller.enqueue(encoder.encode(`event: stream.error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "stream failed" })}\n\n`));
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
        try { controller.close(); } catch { /* already closed */ }
      };
      void pump();
    },
    cancel() { closed = true; },
  });
  request.signal.addEventListener("abort", () => { closed = true; }, { once: true });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
