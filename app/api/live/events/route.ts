import { NextRequest } from "next/server";
import { readV85LiveEvents, subscribeV85LiveEvents } from "@/lib/server/v85-live-event-hub";
import type { V85LiveEvent } from "@/lib/v85-live-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const encodeEvent = (event: string, data: unknown, id?: string) => encoder.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function GET(request: NextRequest) {
  const cursor = request.headers.get("last-event-id") || request.nextUrl.searchParams.get("cursor");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const initial = readV85LiveEvents(cursor, 250);
      controller.enqueue(encodeEvent("snapshot", initial));
      const unsubscribe = subscribeV85LiveEvents((event: V85LiveEvent) => {
        if (!closed) controller.enqueue(encodeEvent("live", event, event.id));
      });
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encodeEvent("heartbeat", { at: new Date().toISOString() }));
      }, 15_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
