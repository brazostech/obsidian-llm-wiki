export interface LlmWikiSettings {
  zenApiKey: string;
  model: string;
  rawPath: string;
  wikiPath: string;
  indexPath: string;
  logPath: string;
}

export const DEFAULT_SETTINGS: LlmWikiSettings = {
  zenApiKey: "",
  model: "claude-sonnet-4-5",
  rawPath: "raw",
  wikiPath: "wiki",
  indexPath: "index.md",
  logPath: "log.md",
};

export type IngestPhase = "SELECT" | "CHAT" | "PROPOSE" | "APPLY" | "DONE";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProposalAction {
  type: "CREATE" | "UPDATE";
  path: string;
  description: string;
  content: string;
}

export interface Proposal {
  sourceSummary: {
    slug: string;
    title: string;
    tags: string[];
  };
  actions: ProposalAction[];
  indexUpdates: { section: string; entry: string }[];
  logEntry: string;
}
