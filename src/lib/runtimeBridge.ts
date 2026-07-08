type RuntimeListener = (message: any, sender: any, sendResponse: (response: any) => void) => void

function isRuntimeAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage
}

async function sendMessage<T = any>(message: any): Promise<T | undefined> {
  if (!isRuntimeAvailable()) return undefined
  return chrome.runtime.sendMessage(message)
}

function addListener(listener: RuntimeListener): void {
  if (!isRuntimeAvailable()) return
  chrome.runtime?.onMessage.addListener(listener)
}

function removeListener(listener: RuntimeListener): void {
  if (!isRuntimeAvailable()) return
  chrome.runtime?.onMessage.removeListener(listener)
}

export const runtimeBridge = {
  isRuntimeAvailable,
  sendMessage,
  addListener,
  removeListener
}
