import { generateText } from "ai";
import { z } from "zod";
import { createProvider } from "./provider";
import type { CoreMessage } from "ai";

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

const PROPOSAL_SYSTEM_PROMPT = `You are a structured data generator. Your ONLY output must be a single valid JSON object.

CRITICAL RULES:
- Output ONLY raw JSON. No markdown code fences. No preamble. No explanation. No conversation.
- The JSON must be parseable by JSON.parse() without any modification.
- Do not wrap the output in triple backticks.
- Do not include any text before or after the JSON object.

You are producing a wiki proposal based on a conversation about a source document.

The JSON must have exactly this structure:

{
  "sourceSummary": {
    "slug": "kebab-case-slug-from-source-filename",
    "title": "Human-readable title",
    "tags": ["tag1", "tag2"]
  },
  "actions": [
    {
      "type": "CREATE",
      "path": "wiki/sources/the-slug.md",
      "description": "One-line summary for checklist",
      "content": "Full markdown content with YAML frontmatter"
    },
    {
      "type": "CREATE",
      "path": "wiki/concepts/some-concept.md",
      "description": "What this concept page covers",
      "content": "Full markdown with frontmatter"
    }
  ],
  "indexUpdates": [
    {
      "section": "Sources",
      "entry": "- [[sources/the-slug]] — one-line summary"
    }
  ],
  "logEntry": "Created [[sources/the-slug]], [[concepts/some-concept]]"
}

For frontmatter in created pages, use:
---
title: "Page Title"
tags: ["tag"]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources:
  - "[[sources/the-source-slug]]"
---

Use Obsidian wikilinks [[page-slug]] for cross-references.

Example logEntry format:
- Created [[sources/example-slug]]
- Created [[concepts/example-concept]]
- Notes: any gaps or contradictions flagged`;

export async function generateProposal(
  model: string,
  apiKey: string,
  messages: CoreMessage[]
): Promise<Proposal> {
  const provider = createProvider(model, apiKey);

  const history = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const prompt = `CONVERSATION HISTORY:\n${history}\n\n---\n\nINSTRUCTION: Based on the above conversation, produce the final wiki proposal.\n\nOutput ONLY a single JSON object matching the schema described in your system prompt.\n\nIf no wiki actions are needed, output empty arrays for actions and indexUpdates, but still include a sourceSummary and logEntry explaining why.`;

  let result;
  try {
    result = await generateText({
      model: provider,
      system: PROPOSAL_SYSTEM_PROMPT,
      prompt,
    });
  } catch (e: any) {
    console.error("[LLM Wiki] generateText failed:", e);
    throw new Error(`generateText failed: ${e.message}`);
  }

  const text = result.text.trim();
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
