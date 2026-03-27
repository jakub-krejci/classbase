// In-tab event bus: syncs ChatWidget ↔ Messages/Inbox page.
// Plain event emitter — no BroadcastChannel needed since both
// components live in the same JS context (same tab, AppShell tree).

export type BusMsg = {
  event: 'new_message' | 'delete_message'
  payload: any
}

type Handler = (msg: BusMsg) => void
const handlers = new Set<Handler>()

export function emitChatBus(msg: BusMsg) {
  // Notify all listeners asynchronously so state updates don't conflict
  setTimeout(() => handlers.forEach(h => h(msg)), 0)
}

export function onChatBus(handler: Handler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}
