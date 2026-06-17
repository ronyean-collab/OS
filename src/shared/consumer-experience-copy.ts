/** Consumer-facing copy — no intelligence engine or memory jargon. */

export function buildChatWelcomeHeading(assistantName: string): string {
  const trimmed = assistantName.trim() || "Assistant";
  if (trimmed === "Assistant") {
    return "Hi, I'm your ContinuityOS assistant.";
  }
  return `Hi, I'm ${trimmed}.`;
}

export const CHAT_WELCOME_PROMPT = "What would you like to work on today?";

export const CHAT_EMPTY_THREAD_BODY =
  "Type a message below to get started. Your conversations stay on this device.";

export const CHAT_NO_THREAD_BODY = "Start a conversation to begin working with your assistant.";

export const THREAD_EMPTY_COPY = {
  none: "No conversations yet.",
  filtered: "No conversations in this view.",
  cta: "New conversation",
} as const;

export const SETTINGS_ACTIVITY_EMPTY =
  "Your recent activity will show up here as you chat.";

export const WORKSPACE_PROFILE_EMPTY = "Open your workspace to change how it appears.";

export const LOCAL_AI_STARTING_MESSAGE =
  "Local AI is still starting. You can continue setup later.";

export const LOCAL_AI_STARTING_DETAIL =
  "Your messages save on this device. Connect or adjust AI in Settings when you're ready.";

export const SETTINGS_AI_PROVIDERS_HEADING = "AI Providers";

export const DEFAULT_AI_DISPLAY_NAME = "ContinuityOS Default AI";

export const LOCAL_AI_NOT_READY = "Local AI isn't ready yet.";

export const AI_STARTING_MESSAGE = "AI is starting…";

export const AI_UNAVAILABLE_MESSAGE =
  "Local AI isn't ready yet. You can connect another provider or continue without AI for now.";

export const AI_CONNECT_MESSAGE =
  "Connect AI in Settings when you're ready — you can keep chatting manually until then.";

export const LOCAL_AI_TRY_AGAIN = "Try again";

export const LOCAL_AI_USE_ANOTHER_PROVIDER = "Use another AI provider";

export const LOCAL_AI_CONTINUE_WITHOUT = "Continue without AI for now";

export const LOCAL_AI_CONTINUE_TO_CHAT = "Continue to chat";

export const LOCAL_AI_SKIP_FOR_NOW = "Skip for now";

export const LOCAL_AI_READY_MESSAGE = "ContinuityOS AI is ready. You can start chatting.";

export const LOCAL_AI_ADVANCED_HEADING = "Advanced local AI details";

export const EMBEDDED_AI_PREPARING_BANNER = "Preparing your AI…";

export const AI_SAVED_NOT_READY_MESSAGE =
  "Your message is saved. I'm still preparing the AI, so I can't reply yet.";

export const AI_STATUS_READY_CONSUMER = "AI is ready";
export const AI_STATUS_PREPARING_CONSUMER = "AI is preparing";
export const AI_STATUS_UNAVAILABLE_CONSUMER = "AI is unavailable";
export const AI_STATUS_NEEDS_ATTENTION_CONSUMER = "AI needs attention";

export const EMBEDDED_AI_CHAT_PLACEHOLDER = AI_SAVED_NOT_READY_MESSAGE;
