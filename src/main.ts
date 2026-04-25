import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { LlmWikiSettingTab } from "./settings";
import { IngestView, VIEW_TYPE_INGEST } from "./views/IngestView";
import { DEFAULT_SETTINGS, LlmWikiSettings } from "./types";

export default class LlmWikiPlugin extends Plugin {
  settings: LlmWikiSettings;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_INGEST, (leaf) => new IngestView(leaf, this));

    this.addCommand({
      id: "open-ingest-view",
      name: "Open LLM Wiki",
      callback: () => {
        this.activateIngestView();
      },
    });

    this.addRibbonIcon("brain-circuit", "LLM Wiki", () => {
      this.activateIngestView();
    });

    this.addSettingTab(new LlmWikiSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_INGEST);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateIngestView() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_INGEST);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_INGEST, active: true });
    workspace.revealLeaf(leaf);
  }
}
