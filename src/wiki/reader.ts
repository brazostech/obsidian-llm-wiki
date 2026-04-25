import { App, TFile } from "obsidian";

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
}
