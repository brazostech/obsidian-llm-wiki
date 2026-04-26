import { generateText } from "ai";
import type { CoreMessage, LanguageModel } from "ai";
import { createProvider } from "./provider";
import { INGEST_CHAT_SYSTEM_PROMPT, GREETING_PROMPT, PROPOSAL_SYSTEM_PROMPT } from "./prompts";
import { URL_PROCESSING_PROMPT } from "./url-process";

export interface LanguageModelProvider {
  model: LanguageModel;

  chat(messages: CoreMessage[]): Promise<string>;
  greet(sourcePath: string, sourceContent: string): Promise<string>;
  propose(messages: CoreMessage[]): Promise<string>;
  processUrl(html: string, url: string): Promise<string>;
}

export class AiLanguageModelProvider implements LanguageModelProvider {
  model: LanguageModel;

  constructor(model: string, apiKey: string) {
    this.model = createProvider(model, apiKey);
  }

  async chat(messages: CoreMessage[]): Promise<string> {
    console.log(
      "[LLM Wiki] chat with",
      messages.length,
      "messages"
    );
    const result = await generateText({
      model: this.model,
      system: INGEST_CHAT_SYSTEM_PROMPT,
      messages,
    });
    return result.text;
  }

  async greet(sourcePath: string, sourceContent: string): Promise<string> {
    console.log("[LLM Wiki] greet for", sourcePath);
    const result = await generateText({
      model: this.model,
      system: GREETING_PROMPT,
      prompt: `Source: ${sourcePath}\n\n${sourceContent.slice(0, 8000)}`,
    });
    return result.text;
  }

  async propose(messages: CoreMessage[]): Promise<string> {
    console.log("[LLM Wiki] propose with", messages.length, "messages");
    const result = await generateText({
      model: this.model,
      system: PROPOSAL_SYSTEM_PROMPT,
      messages,
    });
    return result.text;
  }

  async processUrl(html: string, url: string): Promise<string> {
    console.log("[LLM Wiki] processUrl", url);
    const truncatedHtml =
      html.length > 150000 ? html.slice(0, 150000) + "\n...[truncated]" : html;
    const result = await generateText({
      model: this.model,
      system: URL_PROCESSING_PROMPT,
      prompt: `URL: ${url}\n\nHTML:\n${truncatedHtml}`,
    });
    return result.text;
  }
}

export class StubLanguageModelProvider implements LanguageModelProvider {
  model: LanguageModel;
  private responses: Map<string, string>;

  constructor(responses: Record<string, string> = {}) {
    this.model = null as any;
    this.responses = new Map(Object.entries(responses));
  }

  async chat(messages: CoreMessage[]): Promise<string> {
    return this.responses.get("chat") ?? "Stub chat response";
  }

  async greet(sourcePath: string, sourceContent: string): Promise<string> {
    return this.responses.get("greet") ?? "Stub greeting";
  }

  async propose(messages: CoreMessage[]): Promise<string> {
    return this.responses.get("propose") ?? "Stub proposal";
  }

  async processUrl(html: string, url: string): Promise<string> {
    return this.responses.get("processUrl") ?? "Stub URL response";
  }
}

export function createLanguageModelProvider(settings: {
  model: string;
  apiKey: string;
}): LanguageModelProvider {
  return new AiLanguageModelProvider(settings.model, settings.apiKey);
}

export function createStubProvider(responses: Record<string, string> = {}): LanguageModelProvider {
  return new StubLanguageModelProvider(responses);
}