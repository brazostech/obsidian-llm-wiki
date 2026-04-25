import { generateText } from "ai";
import { createProvider } from "./provider";

const URL_PROCESSING_PROMPT = `You are a content extraction assistant. I will give you raw HTML from a web page.

Your task:
1. Extract the main article/content text (ignore navigation, ads, sidebars, footers, scripts, styles)
2. Convert it to clean, well-structured Markdown
3. Preserve links as markdown links [text](url) so they remain traversable
4. Preserve code blocks, lists, headings, and tables
5. Add YAML frontmatter at the top with these fields:
   - source_type: url
   - url: the original URL
   - fetched_at: today's date in YYYY-MM-DD format
   - title: the page title
   - description: a 1-2 sentence summary of what this page contains

Return ONLY the markdown file content. No preamble, no markdown fences around the output.`;

export async function processUrlWithLlm(
  html: string,
  url: string,
  model: string,
  apiKey: string
): Promise<string> {
  const provider = createProvider(model, apiKey);

  // Truncate HTML if it's enormous — LLMs have context limits
  const truncatedHtml =
    html.length > 150000 ? html.slice(0, 150000) + "\n...[truncated]" : html;

  const result = await generateText({
    model: provider,
    system: URL_PROCESSING_PROMPT,
    prompt: `URL: ${url}\n\nHTML:\n${truncatedHtml}`,
  });

  return result.text;
}
