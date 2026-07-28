"use client";

import { useEffect, useRef, useState } from "react";
import type { V85LiveEvent, V85StreamSnapshot } from "@/lib/v85-live-data";

export function useV85LiveEvents(maxEvents = 250) {
  const [events, setEvents] = useState<V85LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);

  useEffect(() => {
    const source = new EventSource(cursor.current ? `/api/live/events?cursor=${encodeURIComponent(cursor.current)}` : "/api/live/events");
    source.onopen = () => { setConnected(true); setLastError(null); };
    source.addEventListener("snapshot", (message) => {
      const snapshot = JSON.parse((message as MessageEvent<string>).data) as V85StreamSnapshot;
      cursor.current = snapshot.cursor;
      setEvents(snapshot.events.slice(-maxEvents));
    });
    source.addEventListener("live", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as V85LiveEvent;
      cursor.current = event.id;
      setEvents((current) => [...current.filter((item) => item.id !== event.id), event].slice(-maxEvents));
    });
    source.onerror = () => { setConnected(false); setLastError("Live stream reconnecting…"); };
    return () => source.close();
  }, [maxEvents]);

  return { events, connected, lastError, latest: events.at(-1) ?? null };
}
