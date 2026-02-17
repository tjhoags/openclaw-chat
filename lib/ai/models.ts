// OpenClaw Mission Control — available models
export const DEFAULT_CHAT_MODEL = "anthropic/claude-haiku-4-5-20251001";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  // Anthropic
  {
    id: "anthropic/claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and affordable, great for everyday tasks",
  },
  {
    id: "anthropic/claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Best balance of speed, intelligence, and cost",
  },
  {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    description: "Most capable Anthropic model",
  },
  // OpenAI
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast and cost-effective for simple tasks",
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    description: "Capable OpenAI model",
  },
  // Reasoning models (extended thinking)
  {
    id: "anthropic/claude-sonnet-4-5-20250929-thinking",
    name: "Claude Sonnet 4.5 (Thinking)",
    provider: "reasoning",
    description: "Extended thinking for complex problems",
  },
  // OpenClaw engine
  {
    id: "openclaw/multi-agent",
    name: "OpenClaw Agents",
    provider: "openclaw",
    description: "Multi-agent system (Researcher, Coder, Reviewer, Writer)",
  },
];

// Group models by provider for UI
export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
