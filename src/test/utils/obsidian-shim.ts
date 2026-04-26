export function parseYaml(yaml: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const match = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      let val: unknown = value.trim();
      if (val === "true" || val === "false") {
        val = val === "true";
      } else if (val === "null" || val === "") {
        val = null;
      } else if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/\\"/g, '"');
      } else if (typeof val === "string" && val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      result[key.trim()] = val;
    }
  }
  
  return Object.keys(result).length > 0 ? result : null;
}

export function stringifyYaml(data: Record<string, unknown>): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: null`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === "string") {
      const needsQuotes = value.includes(":") || value.includes("#") || value.includes("|") || value.includes(">") || value.startsWith(" ") || value.endsWith(" ");
      if (needsQuotes || value.includes('"')) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  
  return lines.join("\n");
}

export class TFile {
  path!: string;
  name!: string;
  extension!: string;
  stat!: { mtime: number };
  basename!: string;
}

export class TFolder {
  path!: string;
  name!: string;
  children!: TAbstractFile[];
}

export class TAbstractFile {
  path!: string;
  name!: string;
}

export interface Vault {
  getFiles(): TAbstractFile[];
  getAbstractFileByPath(path: string): TAbstractFile | null;
  read(file: TFile): Promise<string>;
  create(path: string, content: string): Promise<TFile>;
  modify(file: TFile, content: string): Promise<void>;
  createFolder(path: string): Promise<TFolder>;
  delete(file: TAbstractFile): Promise<void>;
}

export interface App {
  vault: Vault;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export class DataAdapter {}
export class Editor {}
export class MarkdownRenderer {}
export class MarkdownView {}
export class View {}
export class ItemView extends View {}
export class KeymapEvent {}
export class EditorSuggest {}
export class EditorSuggestor {}

export function requestUrl(_request: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ text: string; json: unknown; status: number }> {
  throw new Error("requestUrl not implemented in test shim");
}
