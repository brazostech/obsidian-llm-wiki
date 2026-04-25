import { generateText } from "ai";
import { createProvider } from "./provider";
import { INGEST_CHAT_SYSTEM_PROMPT } from "./prompts";
import type { CoreMessage } from "ai";

const GREETING_PROMPT = `You are a friendly research companion helping someone digest a source document for their personal knowledge base.

When you see a new source, your job is to:
1. Briefly identify what it is (one sentence, natural and conversational)
2. Ask one thoughtful, open-ended question that invites the user to share what matters to them about this source

Be warm and concise. Don't list entities or propose wiki actions — that comes later. Just spark a conversation.`;

export async function chatResponse(
  model: string,
  apiKey: string,
  messages: CoreMessage[]
): Promise<string> {
  const provider = createProvider(model, apiKey);

  console.log(
    "[LLM Wiki] generateText with",
    messages.length,
    "messages, model:",
    model
  );

  const result = await generateText({
    model: provider,
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
  model: string,
  apiKey: string,
  sourcePath: string,
  sourceContent: string
): Promise<string> {
  const provider = createProvider(model, apiKey);

  console.log("[LLM Wiki] Generating greeting for", sourcePath);

  const result = await generateText({
    model: provider,
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
