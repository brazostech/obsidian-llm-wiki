import { App } from "obsidian";
import { requestUrl } from "obsidian";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";
import { SessionManager } from "../sessions/manager";
import type { LanguageModelProvider } from "../ai/ai-provider";
import { parseFrontmatter, normalizeFrontmatter } from "../wiki/frontmatter";

export interface RecentFileInfo {
  path: string;
  title: string;
  filename: string;
  hasSession: boolean;
  messageCount: number;
  lastActive: number | null;
}

export interface SelectFileResult {
  path: string;
  content: string;
  hasSession: boolean;
  messageCount: number;
  lastActive: number | null;
}

export interface PasteResult {
  path: string;
  content: string;
}

export interface FetchResult {
  path: string;
  content: string;
}

function extractTitleFromRawFrontmatter(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return null;
  const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m);
  if (titleMatch) {
    let title = titleMatch[1].trim();
    if (
      (title.startsWith('"') && title.endsWith('"')) ||
      (title.startsWith("'") && title.endsWith("'"))
    ) {
      title = title.slice(1, -1);
    }
    return title;
  }
  return null;
}

export function extractTitle(content: string, basename: string): string {
  try {
    const { frontmatter, body } = parseFrontmatter(content);
    if (frontmatter.title && typeof frontmatter.title === "string") {
      return frontmatter.title;
    }
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
  } catch (e: any) {
    console.warn(
      "[LLM Wiki] Strict frontmatter parse failed, trying regex fallback:",
      e.message
    );
  }

  const rawTitle = extractTitleFromRawFrontmatter(content);
  if (rawTitle) {
    return rawTitle;
  }

  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return basename;
}

export class SourceIngestion {
  private app: App;
  private rawPath: string;
  private wikiPath: string;
  private provider: LanguageModelProvider;

  constructor(
    app: App,
    rawPath: string,
    wikiPath: string,
    provider: LanguageModelProvider
  ) {
    this.app = app;
    this.rawPath = rawPath;
    this.wikiPath = wikiPath;
    this.provider = provider;
  }

  async selectFile(path: string): Promise<SelectFileResult> {
    const reader = new WikiReader(this.app, this.rawPath, this.wikiPath);
    const sessionManager = new SessionManager(this.app);
    const content = (await reader.readFile(path)) || "";
    const session = await sessionManager.load(path);
    return {
      path,
      content,
      hasSession: !!session,
      messageCount: session?.messages?.length || 0,
      lastActive: session?.updatedAt || null,
    };
  }

  async pasteContent(content: string): Promise<PasteResult> {
    const slug = `pasted-${Date.now()}`;
    const path = `${this.rawPath}/${slug}.md`;
    const writer = new WikiWriter(this.app);
    await writer.createFile(path, content);
    return { path, content };
  }

  async fetchUrl(url: string): Promise<FetchResult> {
    const response = await requestUrl({ url: url.trim(), method: "GET" });
    const html = response.text;

    const markdown = await this.provider.processUrl(html, url.trim());
    const normalizedMarkdown = normalizeFrontmatter(markdown);

    const slug = `fetched-${Date.now()}`;
    const path = `${this.rawPath}/${slug}.md`;
    const writer = new WikiWriter(this.app);
    await writer.createFile(path, normalizedMarkdown);

    return { path, content: normalizedMarkdown };
  }

  async listRecentFiles(limit: number = 5): Promise<RecentFileInfo[]> {
    const reader = new WikiReader(this.app, this.rawPath, this.wikiPath);
    const sessionManager = new SessionManager(this.app);
    const recent = await reader.listRecentRawFiles(limit);

    const enriched = await Promise.all(
      recent.map(async (f) => {
        const content = (await reader.readFile(f.path)) || "";
        const title = extractTitle(content, f.basename);
        const session = await sessionManager.load(f.path);
        return {
          path: f.path,
          title,
          filename: f.basename,
          hasSession: !!session,
          messageCount: session?.messages?.length || 0,
          lastActive: session?.updatedAt || null,
        };
      })
    );

    return enriched;
  }
}