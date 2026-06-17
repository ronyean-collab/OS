const activeAbortControllers = new Map<string, AbortController>();

export function registerStreamAbort(streamId: string, controller: AbortController): void {
  activeAbortControllers.set(streamId, controller);
}

export function unregisterStreamAbort(streamId: string): void {
  activeAbortControllers.delete(streamId);
}

export function cancelStreamAbort(streamId: string): void {
  const controller = activeAbortControllers.get(streamId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(streamId);
  }
}
