// In-tab event bus for syncing ChatWidget ↔ Messages/Inbox page.
// Uses the browser's native BroadcastChannel so both components
// see every message regardless of which one sent it.

export type BusMsg = {
  event: 'new_message' | 'delete_message'
  payload: any
}

const CHANNEL_NAME = 'classbase_chat_bus'

let _bc: BroadcastChannel | null = null

function getBus(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (!_bc) _bc = new BroadcastChannel(CHANNEL_NAME)
  return _bc
}

export function emitChatBus(msg: BusMsg) {
  getBus()?.postMessage(msg)
}

export function onChatBus(handler: (msg: BusMsg) => void): () => void {
  const bc = getBus()
  if (!bc) return () => {}
  const listener = (e: MessageEvent) => handler(e.data as BusMsg)
  bc.addEventListener('message', listener)
  return () => bc.removeEventListener('message', listener)
}
