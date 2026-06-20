export type SimMessage = {
  role: "user" | "assistant";
  content: string;
};

export function generateConversationMessages(count: number, label: string): SimMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${label} message ${index}: continuity runtime simulation payload`,
  }));
}

export function generateMultiWeekSimulation(weeks: number): SimMessage[] {
  const total = weeks * 7 * 24;
  return generateConversationMessages(total, `week-${weeks}`);
}

export function generateMultiMonthSimulation(months: number): SimMessage[] {
  const total = months * 30 * 24;
  return generateConversationMessages(total, `month-${months}`);
}

export function generateProviderSwitchSequence(): string[] {
  return ["openai", "ollama", "openai", "ollama", "provider-unavailable", "ollama"];
}

export function generateHugeSimulationInput(count: number): SimMessage[] {
  return generateConversationMessages(count, `huge-${count}`);
}
