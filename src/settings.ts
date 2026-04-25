import { App, PluginSettingTab, Setting } from "obsidian";
import LlmWikiPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class LlmWikiSettingTab extends PluginSettingTab {
  plugin: LlmWikiPlugin;

  constructor(app: App, plugin: LlmWikiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Zen API Key")
      .setDesc("Your OpenCode Zen API key")
      .addText((text) =>
        text
          .setPlaceholder("Enter your API key")
          .setValue(this.plugin.settings.zenApiKey)
          .onChange(async (value) => {
            this.plugin.settings.zenApiKey = value;
            await this.plugin.saveSettings();
          })
      );

    const ZEN_MODELS: Record<string, string> = {
      // Claude — high quality reasoning
      "claude-sonnet-4-5": "Claude Sonnet 4.5 (balanced)",
      "claude-opus-4-5": "Claude Opus 4.5 (best quality)",
      "claude-sonnet-4": "Claude Sonnet 4 (slightly older)",
      "claude-haiku-4-5": "Claude Haiku 4.5 (fast, cheap)",
      // GPT — strong structured output
      "gpt-5.4": "GPT 5.4 (balanced)",
      "gpt-5.4-mini": "GPT 5.4 Mini (fast, cheap)",
      "gpt-5-nano": "GPT 5 Nano (free)",
      // OpenAI-compatible
      "kimi-k2.6": "Kimi K2.6 (openai-compatible)",
      "qwen3.6-plus": "Qwen 3.6 Plus (openai-compatible)",
      // Custom
      custom: "Custom model ID...",
    };

    new Setting(containerEl)
      .setName("Model")
      .setDesc("OpenCode Zen model to use")
      .addDropdown((dropdown) => {
        Object.entries(ZEN_MODELS).forEach(([value, label]) => {
          dropdown.addOption(value, label);
        });
        dropdown.setValue(
          Object.keys(ZEN_MODELS).includes(this.plugin.settings.model)
            ? this.plugin.settings.model
            : "custom"
        );
        dropdown.onChange(async (value) => {
          this.plugin.settings.model = value === "custom" ? "" : value;
          await this.plugin.saveSettings();
          this.display(); // re-render to show/hide custom field
        });
      });

    if (
      !Object.keys(ZEN_MODELS).includes(this.plugin.settings.model) ||
      this.plugin.settings.model === ""
    ) {
      new Setting(containerEl)
        .setName("Custom model ID")
        .setDesc(
          "Any Zen model ID, e.g. claude-opus-4-7, gpt-5.5, minimax-m2.7"
        )
        .addText((text) =>
          text
            .setPlaceholder("model-id")
            .setValue(this.plugin.settings.model)
            .onChange(async (value) => {
              this.plugin.settings.model = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Raw path")
      .setDesc("Vault path for raw sources")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.rawPath)
          .onChange(async (value) => {
            this.plugin.settings.rawPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Wiki path")
      .setDesc("Vault path for wiki pages")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.wikiPath)
          .onChange(async (value) => {
            this.plugin.settings.wikiPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Index path")
      .setDesc("Path to index.md")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.indexPath)
          .onChange(async (value) => {
            this.plugin.settings.indexPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Log path")
      .setDesc("Path to log.md")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.logPath)
          .onChange(async (value) => {
            this.plugin.settings.logPath = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
