import { TFile, TFolder } from "obsidian";

export class InMemoryVault implements VaultLike {
  private files = new Map<string, string>();
  private folderPaths = new Set<string>();
  private cache = new Map<string, TFile | TFolder>();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.putFile(path, content);
    }
  }

  private putFile(path: string, content: string): void {
    this.files.set(path, content);
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const ext = name.includes(".") ? name.split(".").pop()! : "";
    const file = new TFile();
    file.path = path;
    file.name = name;
    file.extension = ext;
    file.stat = { mtime: Date.now() };
    file.basename = ext ? name.slice(0, -ext.length - 1) : name;
    this.cache.set(path, file);
  }

  private ensurePath(path: string): void {
    const parts = path.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      if (current && !this.folderPaths.has(current)) {
        this.folderPaths.add(current);
        const folder = new TFolder();
        folder.path = current;
        folder.name = parts[i];
        folder.children = [];
        this.cache.set(current, folder);
      }
    }
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return (this.cache.get(path) ?? null) as TFile | TFolder | null;
  }

  getFiles(): TFile[] {
    return Array.from(this.cache.values())
      .filter((f): f is TFile => f instanceof TFile)
      .map(f => f as TFile);
  }

  async read(file: TFile): Promise<string> {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error("File not found");
    return content;
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.cache.has(path)) {
      throw new Error(`File already exists: ${path}`);
    }
    this.ensurePath(path);
    this.putFile(path, content);
    return this.cache.get(path) as TFile;
  }

  async modify(file: TFile, content: string): Promise<void> {
    if (!this.files.has(file.path)) {
      throw new Error("File not found");
    }
    this.files.set(file.path, content);
  }

  async createFolder(path: string): Promise<TFolder> {
    this.ensurePath(path);
    this.folderPaths.add(path);
    const folder = new TFolder();
    folder.path = path;
    folder.name = path.split("/").pop()!;
    folder.children = [];
    this.cache.set(path, folder);
    return folder;
  }

  async delete(file: TFile | TFolder): Promise<void> {
    this.cache.delete(file.path);
    this.files.delete(file.path);
  }

  simulateCacheMiss(path: string): void {
    this.cache.delete(path);
  }

  addFile(path: string, content: string): void {
    this.putFile(path, content);
  }
}

export interface VaultLike {
  getAbstractFileByPath(path: string): TFile | TFolder | null;
  getFiles(): TFile[];
  read(file: TFile): Promise<string>;
  create(path: string, content: string): Promise<TFile>;
  modify(file: TFile, content: string): Promise<void>;
  createFolder(path: string): Promise<TFolder>;
  delete(file: TFile | TFolder): Promise<void>;
  simulateCacheMiss(path: string): void;
}

export function createMockApp(initial: Record<string, string> = {}): InMemoryVault {
  return new InMemoryVault(initial);
}
