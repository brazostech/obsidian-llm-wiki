import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LanguageModel } from "ai";
import { obsidianFetch } from "./fetch";

const CLAUDE_MODELS = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-opus-4-1",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-sonnet-4",
  "claude-haiku-4-5",
  "claude-3-5-haiku",
];

function isClaudeModel(model: string): boolean {
  return CLAUDE_MODELS.some((id) => model === id || model.startsWith(id));
}

export function createProvider(model: string, apiKey: string): LanguageModel {
  if (!apiKey) {
    throw new Error(
      "API key is not configured. Please set it in LLM Wiki settings."
    );
  }
  if (!model) {
    throw new Error(
      "No model selected. Please choose a model in LLM Wiki settings."
    );
  }

  if (isClaudeModel(model)) {
    const anthropic = createAnthropic({
      baseURL: "https://opencode.ai/zen",
      apiKey,
      fetch: obsidianFetch,
    });
    return anthropic(model);
  }

  // GPT models use the native OpenAI Responses API via @ai-sdk/openai
  if (model.startsWith("gpt")) {
    const openai = createOpenAI({
      baseURL: "https://opencode.ai/zen/v1",
      apiKey,
      fetch: obsidianFetch,
    });
    return openai(model);
  }

  // All other Zen models (Qwen, Kimi, MiniMax, GLM, etc.) use the
  // OpenAI-compatible chat completions endpoint via @ai-sdk/openai-compatible.
  const compatible = createOpenAICompatible({
    name: "zen",
    baseURL: "https://opencode.ai/zen/v1",
    apiKey,
    fetch: obsidianFetch,
  });
  return compatible(model);
}
