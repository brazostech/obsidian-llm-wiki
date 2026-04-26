import { App, TFile, TFolder, normalizePath } from "obsidian";
import { IngestSession } from "../types";

const SESSION_DIR = ".llm-wiki/sessions";

function hashPath(path: string): string {
  // Simple hash for filename-safe identifier
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function sessionFilePath(path: string): string {
  return normalizePath(`${SESSION_DIR}/${hashPath(path)}.json`);
}

export class SessionManager {
  constructor(private app: App) {}

  async ensureDir(): Promise<void> {
    const dir = this.app.vault.getAbstractFileByPath(SESSION_DIR);
    if (dir instanceof TFolder) return;
    try {
      await this.app.vault.createFolder(SESSION_DIR);
    } catch (e: any) {
      // Obsidian throws "Folder already exists" if it exists but wasn't in cache
      if (e.message?.includes("already exists")) return;
      throw e;
    }
  }

  async save(session: IngestSession): Promise<void> {
    await this.ensureDir();
    const path = sessionFilePath(session.sourcePath);
    const data = JSON.stringify(
      { ...session, updatedAt: Date.now() },
      null,
      2
    );
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, data);
    } else {
      try {
        await this.app.vault.create(path, data);
      } catch (e: any) {
        // File exists on disk but wasn't in vault cache - obtain TFile and modify instead
        if (e.message?.includes("already exists")) {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            await this.app.vault.modify(file, data);
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
    }
    console.log("[LLM Wiki] Session saved:", session.sourcePath, "messages:", session.messages.length, "phase:", session.phase);
  }

  async load(sourcePath: string): Promise<IngestSession | null> {
    const path = sessionFilePath(sourcePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      try {
        const text = await this.app.vault.read(file);
        const session = JSON.parse(text) as IngestSession;
        console.log("[LLM Wiki] Session loaded:", sourcePath, "messages:", session.messages.length, "phase:", session.phase);
        return session;
      } catch (e) {
        console.error("[LLM Wiki] Failed to load session:", e);
        return null;
      }
    }
    console.log("[LLM Wiki] No session file found for:", sourcePath);
    return null;
  }

  exists(sourcePath: string): boolean {
    const path = sessionFilePath(sourcePath);
    return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
  }

  async list(): Promise<{ sourcePath: string; updatedAt: number }[]> {
    const dir = this.app.vault.getAbstractFileByPath(SESSION_DIR);
    if (!(dir instanceof TFolder)) return [];
    const sessions: { sourcePath: string; updatedAt: number }[] = [];
    for (const child of dir.children) {
      if (child instanceof TFile && child.extension === "json") {
        try {
          const text = await this.app.vault.read(child);
          const data = JSON.parse(text);
          if (data.sourcePath && data.updatedAt) {
            sessions.push({
              sourcePath: data.sourcePath,
              updatedAt: data.updatedAt,
            });
          }
        } catch (e) {
          // Skip malformed session files
        }
      }
    }
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async cleanup(limit: number = 5): Promise<void> {
    const sessions = await this.list();
    const toDelete = sessions.slice(limit);
    for (const s of toDelete) {
      const path = sessionFilePath(s.sourcePath);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await this.app.vault.delete(file);
      }
    }
  }
}
