import { generateText } from "ai";
import { INGEST_CHAT_SYSTEM_PROMPT, GREETING_PROMPT } from "./prompts";
import type { CoreMessage } from "ai";
import type { LanguageModelProvider } from "./ai-provider";

export async function chatResponse(
  provider: LanguageModelProvider,
  messages: CoreMessage[]
): Promise<string> {
  console.log(
    "[LLM Wiki] generateText with",
    messages.length,
    "messages"
  );

  const result = await generateText({
    model: provider.model,
    system: INGEST_CHAT_SYSTEM_PROMPT,
    messages,
  });

  console.log(
    "[LLM Wiki] generateText returned",
    result.text.length,
    "chars"
  );
  return result.text;
}

export async function generateGreeting(
  provider: LanguageModelProvider,
  sourcePath: string,
  sourceContent: string
): Promise<string> {
  console.log("[LLM Wiki] Generating greeting for", sourcePath);

  const result = await generateText({
    model: provider.model,
    system: GREETING_PROMPT,
    prompt: `Source: ${sourcePath}\n\n${sourceContent.slice(0, 8000)}`,
  });

  console.log(
    "[LLM Wiki] Greeting returned",
    result.text.length,
    "chars"
  );
  return result.text;
}