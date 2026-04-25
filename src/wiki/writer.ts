import { App, TFile, normalizePath } from "obsidian";

export class WikiWriter {
  constructor(private app: App) {}

  async createFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      throw new Error(`File already exists: ${normalized}`);
    }
    // Ensure all parent directories exist (createFolder only creates leaf)
    const parts = normalized.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
    await this.app.vault.create(normalized, content);
  }

  async modifyFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      throw new Error(`File not found: ${normalized}`);
    }
  }

  async appendToFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile) {
      const existing = await this.app.vault.read(file);
      await this.app.vault.modify(file, existing + "\n" + content);
    } else {
      throw new Error(`File not found: ${normalized}`);
    }
  }
}
