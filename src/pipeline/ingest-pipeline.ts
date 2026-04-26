import { App } from "obsidian";
import type { CoreMessage } from "ai";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";
import { SessionManager } from "../sessions/manager";
import type { LanguageModelProvider } from "../ai/ai-provider";
import { generateProposal } from "../ai/propose";
import { buildWikiContext } from "../ai/wikiContext";
import type {
  IngestPhase,
  ChatMessage,
  Proposal,
  ProposalAction,
  IngestSession,
  LlmWikiSettings,
} from "../types";

type EventMap = {
  phaseChange: IngestPhase;
  message: ChatMessage;
  proposal: Proposal;
  error: Error;
  loadingChange: boolean;
};

export class IngestPipeline {
  private _phase: IngestPhase = "SELECT";
  private _sourcePath: string | null = null;
  private _sourceContent: string = "";
  private _messages: ChatMessage[] = [];
  private _proposal: Proposal | null = null;
  private _isLoading: boolean = false;

  private app: App;
  private rawPath: string;
  private wikiPath: string;
  private indexPath: string;
  private logPath: string;
  private provider: LanguageModelProvider;
  private reader: WikiReader;
  private writer: WikiWriter;
  private sessionManager: SessionManager;

  private listeners: {
    [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void>;
  } = {};

  constructor(app: App, provider: LanguageModelProvider, settings: LlmWikiSettings) {
    this.app = app;
    this.provider = provider;
    this.rawPath = settings.rawPath;
    this.wikiPath = settings.wikiPath;
    this.indexPath = settings.indexPath;
    this.logPath = settings.logPath;
    this.reader = new WikiReader(app, this.rawPath, this.wikiPath);
    this.writer = new WikiWriter(app);
    this.sessionManager = new SessionManager(app);
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void
  ): () => void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(handler);
    return () => {
      this.listeners[event] = this.listeners[event]!.filter((h) => h !== handler);
    };
  }

  private emit<K extends keyof EventMap>(
    event: K,
    payload: EventMap[K]
  ): void {
    this.listeners[event]?.forEach((h) => h(payload));
  }

  private setPhase(phase: IngestPhase): void {
    this._phase = phase;
    this.emit("phaseChange", phase);
  }

  private setLoading(isLoading: boolean): void {
    this._isLoading = isLoading;
    this.emit("loadingChange", isLoading);
  }

  private addMessage(message: ChatMessage): void {
    this._messages.push(message);
    this.emit("message", message);
  }

  private async saveSession(): Promise<void> {
    if (!this._sourcePath || this._phase === "SELECT") return;
    const existing = await this.sessionManager.load(this._sourcePath);
    const session: IngestSession = {
      sourcePath: this._sourcePath,
      sourceContent: this._sourceContent,
      phase: this._phase,
      messages: this._messages,
      proposal: this._proposal,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await this.sessionManager.save(session);
    } catch (e: any) {
      console.error("[LLM Wiki] Failed to save session:", e);
    }
  }

  private async addMessageAndSave(message: ChatMessage): Promise<void> {
    this.addMessage(message);
    await this.saveSession();
  }

  async selectSource(path: string, content?: string): Promise<void> {
    this._sourcePath = path;
    this._sourceContent = content || (await this.reader.readFile(path)) || "";

    const existingSession = await this.sessionManager.load(path);
    if (existingSession) {
      this._messages = [...existingSession.messages];
      this._proposal = existingSession.proposal;

      if (existingSession.phase === "DONE") {
        this.setPhase("CHAT");
        const wikiCtx = await buildWikiContext(this.reader, path, {
          includeFullContent: true,
        });
        const resumeMsg: ChatMessage = {
          role: "assistant",
          content: `You've previously ingested this source. ${wikiCtx}\n\nWhat would you like to change or add?`,
        };
        this._messages.push(resumeMsg);
        this.emit("message", resumeMsg);
        await this.saveSession();
      } else {
        this.setPhase("CHAT");
        for (const msg of this._messages) {
          this.emit("message", msg);
        }
      }

      return;
    }

    this.setPhase("CHAT");
    this.setLoading(true);
    try {
      const greeting = await this.provider.greet(path, this._sourceContent);
      await this.addMessageAndSave({ role: "assistant", content: greeting });
    } catch (e: any) {
      await this.addMessageAndSave({
        role: "assistant",
        content: `I see you've selected **${path}**. What would you like to capture from this source?`,
      });
    } finally {
      this.setLoading(false);
    }
  }

  private async buildLlmMessages(): Promise<CoreMessage[]> {
    if (!this._sourcePath) throw new Error("No source selected");
    const wikiCtx = await buildWikiContext(this.reader, this._sourcePath);
    return [
      {
        role: "user",
        content: `Source: ${this._sourcePath}\n\n${this._sourceContent}`,
      },
      {
        role: "assistant",
        content: wikiCtx,
      },
      ...this._messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];
  }

  async sendMessage(text: string): Promise<void> {
    await this.addMessageAndSave({ role: "user", content: text });
    this.setLoading(true);

    try {
      const llmMessages = await this.buildLlmMessages();
      const response = await this.provider.chat(llmMessages);
      await this.addMessageAndSave({
        role: "assistant",
        content: response,
      });
    } catch (e: any) {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `Error: ${e.message}`,
      };
      await this.addMessageAndSave(errMsg);
      this.emit("error", e);
    } finally {
      this.setLoading(false);
    }
  }

  async commitAndPropose(): Promise<void> {
    this.setLoading(true);
    try {
      const llmMessages = await this.buildLlmMessages();
      const result = await generateProposal(this.provider, llmMessages);
      this._proposal = result;
      this.emit("proposal", result);
      this.setPhase("PROPOSE");
      this.saveSession();
    } catch (e: any) {
      this.emit("error", e);
      throw e;
    } finally {
      this.setLoading(false);
    }
  }

  async applyProposal(approvedActions: ProposalAction[]): Promise<void> {
    if (!this._proposal) {
      throw new Error("No proposal to apply");
    }
    const filteredProposal: Proposal = {
      ...this._proposal,
      actions: approvedActions,
    };
    this.setPhase("APPLY");
    this.setLoading(true);
    try {
      await this.writer.applyProposal(
        filteredProposal,
        this.indexPath,
        this.logPath
      );
      this.setPhase("DONE");
      this.saveSession();
      await this.sessionManager.cleanup(5);
    } catch (e: any) {
      this.emit("error", e);
      throw e;
    } finally {
      this.setLoading(false);
    }
  }

  backToChat(): void {
    this.setPhase("CHAT");
  }

  reset(): void {
    this._sourcePath = null;
    this._sourceContent = "";
    this._messages = [];
    this._proposal = null;
    this.setPhase("SELECT");
  }

  get currentPhase(): IngestPhase {
    return this._phase;
  }

  get currentMessages(): ChatMessage[] {
    return [...this._messages];
  }

  get currentProposal(): Proposal | null {
    return this._proposal;
  }

  get currentSourcePath(): string | null {
    return this._sourcePath;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }
}
