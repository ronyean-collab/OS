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
  visibleContent?: string;
  ollama?: { model: string; baseUrl: string };
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid message input.");
  }
  const o = value as Record<string, unknown>;
    const visibleContent =
    typeof o.visibleContent === "string" && o.visibleContent.trim().length > 0
      ? o.visibleContent.trim()
      : undefined;
  let ollama: { model: string; baseUrl: string } | undefined;
  if (o.ollama != null) {
    if (typeof o.ollama !== "object") {
      throw new Error("Invalid Ollama override.");
    }
    const override = o.ollama as Record<string, unknown>;
    const model = typeof override.model === "string" ? override.model.trim() : "";
    const baseUrl = typeof override.baseUrl === "string" ? override.baseUrl.trim() : "";
    if (model && baseUrl) {
      ollama = { model, baseUrl };
    }
  }
  return {
    threadId: assertThreadId(o.threadId),
    content: assertNonEmptyString(o.content, "content"),
    visibleContent,
    ollama,
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

export function assertContinuityImportPreviewInput(value: unknown): string {
  return assertNonEmptyString(value, "text");
}

export function assertContinuityImportApplyInput(value: unknown): {
  text: string;
  mode: "update-current" | "create-workspace" | "checkpoint-only";
  workspaceId?: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid continuity import input.");
  }
  const o = value as Record<string, unknown>;
  const mode =
    typeof o.mode === "string" ? o.mode.trim() : "";
  if (
    mode !== "update-current" &&
    mode !== "create-workspace" &&
    mode !== "checkpoint-only"
  ) {
    throw new Error("Invalid continuity import mode.");
  }
  return {
    text: assertNonEmptyString(o.text, "text"),
    mode,
    workspaceId:
      typeof o.workspaceId === "string" && o.workspaceId.trim()
        ? o.workspaceId.trim()
        : undefined,
  };
}

export function assertMarkdownMemoryExportInput(value: unknown): {
  workspaceId: string;
  threadId?: string;
  fileType:
    | "continuity-import"
    | "continuity-export"
    | "ai-handoff"
    | "thread-summary"
    | "project-state";
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid markdown memory export input.");
  }
  const o = value as Record<string, unknown>;
  const fileType = typeof o.fileType === "string" ? o.fileType.trim() : "";
  if (
    fileType !== "continuity-import" &&
    fileType !== "continuity-export" &&
    fileType !== "ai-handoff" &&
    fileType !== "thread-summary" &&
    fileType !== "project-state"
  ) {
    throw new Error("Invalid markdown memory file type.");
  }
  return {
    workspaceId: assertNonEmptyString(o.workspaceId, "workspaceId"),
    threadId:
      typeof o.threadId === "string" && o.threadId.trim()
        ? assertThreadId(o.threadId)
        : undefined,
    fileType,
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

export function assertManualAssistantResponseSaveInput(value: unknown): {
  workspaceId: string;
  threadId: string;
  assistantResponse: string;
  targetPlatform?: string;
  sourceUserMessageId?: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid manual assistant response input.");
  }
  const o = value as Record<string, unknown>;
  const sourceUserMessageId =
    typeof o.sourceUserMessageId === "string" && o.sourceUserMessageId.trim()
      ? o.sourceUserMessageId.trim()
      : undefined;
  if (sourceUserMessageId && !UUID_LIKE.test(sourceUserMessageId)) {
    throw new Error("Invalid sourceUserMessageId format.");
  }
  return {
    workspaceId: assertNonEmptyString(o.workspaceId, "workspaceId"),
    threadId: assertThreadId(o.threadId),
    assistantResponse: assertNonEmptyString(o.assistantResponse, "assistantResponse"),
    targetPlatform: typeof o.targetPlatform === "string" ? o.targetPlatform.trim() : undefined,
    sourceUserMessageId,
  };
}

export function assertContinuityInspectorInput(value: unknown): {
  workspaceId: string;
  threadId: string;
  query?: string;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid continuity inspector input.");
  }
  const o = value as Record<string, unknown>;
  return {
    workspaceId: assertNonEmptyString(o.workspaceId, "workspaceId"),
    threadId: assertThreadId(o.threadId),
    query: typeof o.query === "string" ? o.query.trim() : undefined,
  };
}
