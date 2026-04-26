import { App, TFile, normalizePath } from "obsidian";
import type { Proposal } from "../ai/propose";
import { normalizeFrontmatter } from "./frontmatter";

export class WikiWriter {
  constructor(private app: App) {}

  async createFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }
    const parts = normalized.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        try {
          await this.app.vault.createFolder(currentPath);
        } catch {
          // Folder may already exist but not be cached
        }
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
      await this.createFile(normalized, content);
    }
  }

  async applyProposal(
    proposal: Proposal,
    indexPath: string,
    logPath: string
  ): Promise<void> {
    for (const action of proposal.actions) {
      const normalizedContent = normalizeFrontmatter(action.content);
      if (action.type === "CREATE") {
        await this.createFile(action.path, normalizedContent);
      } else {
        await this.modifyFile(action.path, normalizedContent);
      }
    }

    if (proposal.indexUpdates.length > 0) {
      let newIndex = "";
      try {
        const indexFile = this.app.vault.getAbstractFileByPath(indexPath);
        if (indexFile instanceof TFile) {
          newIndex = await this.app.vault.read(indexFile);
        }
      } catch {}

      for (const update of proposal.indexUpdates) {
        const sectionHeader = `## ${update.section}`;
        const sectionIndex = newIndex.indexOf(sectionHeader);
        if (sectionIndex !== -1) {
          const afterHeader = sectionIndex + sectionHeader.length;
          newIndex =
            newIndex.slice(0, afterHeader) +
            "\n" +
            update.entry +
            newIndex.slice(afterHeader);
        }
      }
      if (newIndex) {
        await this.modifyFile(indexPath, newIndex);
      }
    }

    const logHeader = `## [${new Date().toISOString().split("T")[0]}] ingest | ${proposal.sourceSummary.slug}`;
    const logEntry = `${logHeader}\n${proposal.logEntry}\n`;
    await this.appendToFile(logPath, logEntry);
  }
}
