export interface MockFile {
  path: string;
  name: string;
  extension: string;
}

export interface MockFolder {
  path: string;
  name: string;
  children: (MockFile | MockFolder)[];
}

export class InMemoryVault implements VaultLike {
  private files = new Map<string, string>();
  private folderPaths = new Set<string>();
  private cache = new Map<string, MockFile | MockFolder>();

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
    const file: MockFile = { path, name, extension: ext };
    this.cache.set(path, file);
  }

  private ensurePath(path: string): void {
    const parts = path.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      if (current && !this.folderPaths.has(current)) {
        this.folderPaths.add(current);
        const name = parts[i];
        this.cache.set(current, { path: current, name, children: [] });
      }
    }
  }

  getAbstractFileByPath(path: string): MockFile | MockFolder | null {
    return (this.cache.get(path) ?? null) as MockFile | MockFolder | null;
  }

  getFiles(): MockFile[] {
    return Array.from(this.cache.values())
      .filter((f): f is MockFile => "extension" in f && f.extension !== "")
      .map(f => f as MockFile);
  }

  async read(file: MockFile): Promise<string> {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error("File not found");
    return content;
  }

  async create(path: string, content: string): Promise<MockFile> {
    if (this.cache.has(path)) {
      throw new Error(`File already exists: ${path}`);
    }
    this.ensurePath(path);
    this.putFile(path, content);
    return this.cache.get(path) as MockFile;
  }

  async modify(file: MockFile, content: string): Promise<void> {
    if (!this.files.has(file.path)) {
      throw new Error("File not found");
    }
    this.files.set(file.path, content);
  }

  async createFolder(path: string): Promise<MockFolder> {
    this.ensurePath(path);
    this.folderPaths.add(path);
    const name = path.split("/").pop()!;
    const folder: MockFolder = { path, name, children: [] };
    this.cache.set(path, folder);
    return folder;
  }

  async delete(file: MockFile | MockFolder): Promise<void> {
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
  getAbstractFileByPath(path: string): MockFile | MockFolder | null;
  getFiles(): MockFile[];
  read(file: MockFile): Promise<string>;
  create(path: string, content: string): Promise<MockFile>;
  modify(file: MockFile, content: string): Promise<void>;
  createFolder(path: string): Promise<MockFolder>;
  delete(file: MockFile | MockFolder): Promise<void>;
  simulateCacheMiss(path: string): void;
}

export function createMockApp(initial: Record<string, string> = {}): InMemoryVault {
  return new InMemoryVault(initial);
}