import { App, TFile } from "obsidian";
import { parseFrontmatter } from "./frontmatter";

export interface WikiPageInfo {
  path: string;
  title: string;
  sources: string[];
  summary: string;
}

export class WikiReader {
  constructor(
    private app: App,
    private rawPath: string,
    private wikiPath: string
  ) {}

  async listRawFiles(): Promise<string[]> {
    return this.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.rawPath + "/"))
      .map((f) => f.path);
  }

  async listRecentRawFiles(
    limit: number = 5
  ): Promise<{ path: string; mtime: number; basename: string }[]> {
    return this.app.vault
      .getFiles()
      .filter(
        (f) =>
          f.path.startsWith(this.rawPath + "/") && f.extension === "md"
      )
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit)
      .map((f) => ({ path: f.path, mtime: f.stat.mtime, basename: f.basename }));
  }

  async readFile(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }

  async readIndex(indexPath: string): Promise<string | null> {
    return this.readFile(indexPath);
  }

  async listWikiPages(): Promise<WikiPageInfo[]> {
    const files = this.app.vault
      .getFiles()
      .filter(
        (f) =>
          f.path.startsWith(this.wikiPath + "/") && f.extension === "md"
      );

    const pages: WikiPageInfo[] = [];
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const { frontmatter, body } = parseFrontmatter(content);
        const title =
          (frontmatter.title as string) || file.basename;
        const sources = Array.isArray(frontmatter.sources)
          ? frontmatter.sources.map(String)
          : [];
        const summary = body.slice(0, 200).trim();
        pages.push({ path: file.path, title, sources, summary });
      } catch {
        pages.push({
          path: file.path,
          title: file.basename,
          sources: [],
          summary: "",
        });
      }
    }
    return pages;
  }

  async findPagesCitingSource(sourceSlug: string): Promise<WikiPageInfo[]> {
    const allPages = await this.listWikiPages();
    const wikilink = `[[sources/${sourceSlug}]]`;
    return allPages.filter(
      (p) =>
        p.sources.some((s) => s.includes(sourceSlug)) ||
        p.sources.some((s) => s === wikilink)
    );
  }
}
