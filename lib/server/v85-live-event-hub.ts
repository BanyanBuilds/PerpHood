import { V85LiveEventBuffer, type V85LiveEvent } from "@/lib/v85-live-data";

type Listener = (event: V85LiveEvent) => void;

type GlobalV85State = {
  buffer: V85LiveEventBuffer;
  listeners: Set<Listener>;
};

const globalState = globalThis as typeof globalThis & { __leverageXV85LiveState?: GlobalV85State };

function state(): GlobalV85State {
  if (!globalState.__leverageXV85LiveState) {
    globalState.__leverageXV85LiveState = {
      buffer: new V85LiveEventBuffer(Number(process.env.LIVE_EVENT_BUFFER_CAPACITY ?? "2000")),
      listeners: new Set(),
    };
  }
  return globalState.__leverageXV85LiveState;
}

export function publishV85LiveEvent(input: unknown) {
  const current = state();
  const event = current.buffer.publish(input);
  for (const listener of current.listeners) listener(event);
  return event;
}

export function subscribeV85LiveEvents(listener: Listener) {
  const current = state();
  current.listeners.add(listener);
  return () => current.listeners.delete(listener);
}

export function readV85LiveEvents(afterId?: string | null, limit?: number) {
  return state().buffer.snapshot(afterId, limit);
}

export function getV85LiveHealth() {
  return { ...state().buffer.health(), subscribers: state().listeners.size };
}
