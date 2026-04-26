import type { CoreMessage } from "ai";
import type { LanguageModelProvider } from "./ai-provider";

export async function chatResponse(
  provider: LanguageModelProvider,
  messages: CoreMessage[]
): Promise<string> {
  console.log(
    "[LLM Wiki] chatResponse with",
    messages.length,
    "messages"
  );

  const text = await provider.chat(messages);

  console.log(
    "[LLM Wiki] chatResponse returned",
    text.length,
    "chars"
  );
  return text;
}

export async function generateGreeting(
  provider: LanguageModelProvider,
  sourcePath: string,
  sourceContent: string
): Promise<string> {
  console.log("[LLM Wiki] generateGreeting for", sourcePath);

  const text = await provider.greet(sourcePath, sourceContent);

  console.log(
    "[LLM Wiki] generateGreeting returned",
    text.length,
    "chars"
  );
  return text;
}
