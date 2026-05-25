const UUID_LIKE = /^[a-zA-Z0-9_-]{8,128}$/;

export function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${field}: expected non-empty string.`);
  }
  return value.trim();
}

export function assertThreadId(value: unknown): string {
  const id = assertNonEmptyString(value, "threadId");
  if (!UUID_LIKE.test(id)) {
    throw new Error("Invalid threadId format.");
  }
  return id;
}

export function assertStreamId(value: unknown): string {
  const id = assertNonEmptyString(value, "streamId");
  if (!UUID_LIKE.test(id)) {
    throw new Error("Invalid streamId format.");
  }
  return id;
}

export function assertSendMessageInput(value: unknown): {
  threadId: string;
  content: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid message input.");
  }
  const o = value as Record<string, unknown>;
  return {
    threadId: assertThreadId(o.threadId),
    content: assertNonEmptyString(o.content, "content"),
  };
}

export function assertContextPackBuildInput(value: unknown): {
  workspaceId: string;
  threadId: string;
  userRequest: string;
  targetPlatform?: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid context pack input.");
  }
  const o = value as Record<string, unknown>;
  return {
    workspaceId: assertNonEmptyString(o.workspaceId, "workspaceId"),
    threadId: assertThreadId(o.threadId),
    userRequest: assertNonEmptyString(o.userRequest, "userRequest"),
    targetPlatform: typeof o.targetPlatform === "string" ? o.targetPlatform.trim() : undefined,
  };
}

export function assertManualExchangeSaveInput(value: unknown): {
  workspaceId: string;
  threadId: string;
  userRequest: string;
  assistantResponse: string;
  targetPlatform?: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid manual exchange input.");
  }
  const o = value as Record<string, unknown>;
  return {
    workspaceId: assertNonEmptyString(o.workspaceId, "workspaceId"),
    threadId: assertThreadId(o.threadId),
    userRequest: assertNonEmptyString(o.userRequest, "userRequest"),
    assistantResponse: assertNonEmptyString(o.assistantResponse, "assistantResponse"),
    targetPlatform: typeof o.targetPlatform === "string" ? o.targetPlatform.trim() : undefined,
  };
}
