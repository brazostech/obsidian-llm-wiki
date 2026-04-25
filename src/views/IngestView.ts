import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import LlmWikiPlugin from "../main";
import { WikiApp } from "../components/WikiApp";

export const VIEW_TYPE_INGEST = "llm-wiki";

export class IngestView extends ItemView {
  private root: Root | null = null;
  private plugin: LlmWikiPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: LlmWikiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_INGEST;
  }

  getDisplayText(): string {
    return "LLM Wiki";
  }

  async onOpen() {
    this.root = createRoot(this.contentEl);
    this.root.render(
      React.createElement(WikiApp, { plugin: this.plugin })
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}
