import { z } from "zod";
import type { CoreMessage } from "ai";
import type { LanguageModelProvider } from "./ai-provider";

export const ProposalSchema = z.object({
  sourceSummary: z.object({
    slug: z.string(),
    title: z.string(),
    tags: z.array(z.string()),
  }),
  actions: z.array(
    z.object({
      type: z.enum(["CREATE", "UPDATE"]),
      path: z.string(),
      description: z.string(),
      content: z.string(),
    })
  ),
  indexUpdates: z.array(
    z.object({
      section: z.string(),
      entry: z.string(),
    })
  ),
  logEntry: z.string(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

export async function generateProposal(
  provider: LanguageModelProvider,
  messages: CoreMessage[]
): Promise<Proposal> {
  let text: string;
  try {
    text = await provider.propose(messages);
  } catch (e: any) {
    console.error("[LLM Wiki] provider.propose failed:", e);
    throw new Error(`Proposal generation failed: ${e.message}`);
  }

  text = text.trim();
  let jsonText = text;

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseErr: any) {
    console.error("[LLM Wiki] JSON parse failed. Raw text:\n", text);
    throw new Error(
      `The model returned text that could not be parsed as JSON.\n\n` +
        `Raw response (first 500 chars):\n${text.slice(0, 500)}\n\n` +
        `This usually means the model didn't follow the JSON-only instruction.`
    );
  }

  const validated = ProposalSchema.safeParse(parsed);
  if (!validated.success) {
    console.error("[LLM Wiki] Zod validation failed:", validated.error);
    throw new Error(
      `The model returned JSON but it didn't match the expected structure.\n\n` +
        `Issues: ${validated.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
    );
  }

  return validated.data;
}
