# LLM Wiki — Obsidian Plugin

An Obsidian plugin that brings an interactive, AI-assisted ingestion workflow to the [LLM Wiki](https://github.com/jack/llm-wiki) second-brain system. Instead of running slash commands in a terminal, you select a source, have a guided conversation about it with an LLM, review the proposed wiki actions in a checklist, and apply them — all inside Obsidian's right sidebar.

## What It Does

The plugin implements the `/ingest` workflow from the original LLM Wiki CLI as a graphical, participatory experience:

1. **Select a source** — Pick from files in `raw/`, paste content, or fetch a URL. URLs are intelligently processed: raw HTML is sent to the LLM, which extracts the main content and converts it to clean markdown with YAML frontmatter.
2. **Discuss with the agent** — The assistant greets you with context about the source and invites your commentary. You chat back and forth about takeaways, entities, and how this source fits your knowledge graph.
3. **Commit & review proposals** — When ready, click "Commit & Propose". The LLM generates a structured JSON proposal (pages to create, pages to update, index entries, log entry). You review a checklist of actions, uncheck anything you don't want, and apply.
4. **Applied automatically** — The plugin writes wiki pages, updates `index.md`, and appends to `log.md` using Obsidian's vault API.

## Architecture

```
src/
├── main.ts                    # Plugin entry: commands, ribbon icon, settings
├── settings.ts                # Settings tab (API key, model selector, paths)
├── types.ts                   # Shared TypeScript types
├── views/
│   └── IngestView.ts          # ItemView hosting a React root in the sidebar
├── components/
│   ├── IngestApp.tsx          # Phase state machine (SELECT → CHAT → PROPOSE → APPLY → DONE)
│   ├── SourceSelector.tsx     # File picker + paste + URL fetch with progress steps
│   ├── ChatPanel.tsx          # Chat UI with Markdown rendering, animated "proposing" status
│   ├── MarkdownMessage.tsx    # Renders assistant messages via Obsidian's MarkdownRenderer
│   ├── ProposalChecklist.tsx  # Review/approve proposed wiki actions
│   └── ProgressSteps.tsx      # Step-by-step progress indicator with spinners
├── ai/
│   ├── provider.ts            # Zen-backed provider factory (OpenAI / Anthropic / openai-compatible)
│   ├── fetch.ts               # CORS-bypassing fetch wrapper via Obsidian's requestUrl()
│   ├── chat.ts                # Non-streaming generateText wrapper for chat + greeting generation
│   ├── propose.ts             # generateText with hardcoded JSON schema prompt + Zod validation
│   ├── prompts.ts             # System prompts for chat and proposal phases
│   └── url-process.ts         # LLM-based HTML-to-markdown conversion for URL fetching
└── wiki/
    ├── reader.ts              # Vault read utilities
    ├── writer.ts              # Vault create/modify/append utilities
    └── frontmatter.ts         # YAML frontmatter generation/parsing (Obsidian APIs)
```

### Key Technical Decisions

**React only for the sidebar view.** Vanilla DOM is used for settings and modals. React is justified because the chat UI needs streaming-state management, conditional phase rendering, and interactive checklists — all painful in raw DOM manipulation.

**No server — everything is client-side.** The plugin makes direct LLM API calls from Obsidian's Electron renderer. Each user brings their own OpenCode Zen API key. There is no centralized backend.

**CORS workaround via `requestUrl()`.** Obsidian's renderer enforces CORS on `fetch()`. The Zen API endpoints don't allow `app://obsidian.md`. We wrap Obsidian's `requestUrl()` (which routes through Electron's net module, bypassing CORS) into a fetch-compatible interface and inject it into `ai-sdk` providers.

**Non-streaming LLM calls.** `requestUrl()` returns the full response as a single string — it does not support Server-Sent Events (SSE). This means `streamText` is incompatible. We use `generateText` for everything. Responses arrive all at once after a delay, not token-by-token. The UI compensates with spinners and animated status text.

**Three provider packages for Zen.** The Zen gateway serves different model families through different endpoints:
- Claude models → `@ai-sdk/anthropic` → `/v1/messages`
- GPT models → `@ai-sdk/openai` → `/v1/responses`
- All others (Qwen, Kimi, MiniMax, GLM, etc.) → `@ai-sdk/openai-compatible` → `/v1/chat/completions`

**LLM-based URL processing.** When fetching a URL, raw HTML is sent to the LLM with a prompt instructing it to extract main content, convert to markdown, preserve links for traversability, and generate YAML frontmatter. The result is saved to `raw/` as clean markdown — never raw HTML.

**Hardcoded JSON schema in prompts.** `ai-sdk`'s `Output.object()` uses provider-native structured-output APIs that fail on non-OpenAI-compatible endpoints. Instead, we embed a complete JSON example directly in the system prompt and use `generateText` + manual `JSON.parse()` + Zod validation.

## Current State

### What Works

- ✅ Source selection from `raw/` with preview pane
- ✅ Paste content (auto-saved to `raw/`)
- ✅ Fetch URL with LLM-based HTML→markdown conversion and animated progress steps
- ✅ Chat phase with Obsidian-native markdown rendering for assistant messages
- ✅ LLM-generated greeting when entering chat
- ✅ Multi-turn conversation with source context prepended to every LLM call
- ✅ "Commit & Propose" with animated status (cycling phrases + dots)
- ✅ Structured proposal generation with checklist review
- ✅ Apply approved actions (create pages, update index, append to log)
- ✅ DONE phase with "Start another ingestion" reset
- ✅ Back navigation at every phase
- ✅ Settings: Zen API key, model selector (curated + custom), path configuration
- ✅ CORS bypass for all LLM calls via `requestUrl()`

### Known Limitations & Rough Edges

1. **No true streaming.** Token-by-token animation is impossible with `requestUrl()`. All LLM responses arrive as a single chunk. The UI uses spinners and status text to compensate.
2. **URL fetch truncates at ~150KB.** Very large HTML pages are truncated before sending to the LLM to avoid context limit errors.
3. **Index updates are naive.** The APPLY phase searches for `## Section` headers in `index.md` and inserts entries immediately after. It cannot create missing sections or handle complex index restructuring.
4. **UPDATE actions overwrite entire files.** The LLM generates the full file content for UPDATE actions, replacing the existing page. There's no "append" or "patch" semantics — the LLM must include all existing content it wants to preserve.
5. **No session persistence.** Closing the sidebar or restarting Obsidian loses the current ingestion session. There's no save/resume.
6. **No query or lint.** The plugin only implements `ingest`. The `/query` and `/lint` CLI commands are not yet exposed in the UI.
7. **Large source documents slow the initial greeting.** The first LLM call on entering CHAT includes the full source content. For very large files (>100KB), this can take 10-30 seconds before the greeting appears.

## Installation

### Development Setup

```bash
git clone <repo>
cd obsidian-llm-wiki
npm install
npm run build       # production bundle → main.js
npm run dev         # watch mode for development
```

### Install into Obsidian

1. Build the plugin (`npm run build`)
2. Copy or symlink three files into your vault:
   ```
   .obsidian/plugins/llm-wiki/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
3. Open Obsidian → Settings → Community Plugins → enable LLM Wiki
4. Configure: Settings → Community Plugins → LLM Wiki → Options
   - Paste your OpenCode Zen API key
   - Select a model (Claude Sonnet 4.5 is a good default)
5. Open the sidebar: Command Palette → "LLM Wiki: Open Ingest View"

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `ai` | `^6.0.0` | Core LLM orchestration (generateText, streamText) |
| `@ai-sdk/openai` | `^3.0.0` | GPT models via Zen Responses API |
| `@ai-sdk/anthropic` | `^3.0.0` | Claude models via Zen Messages API |
| `@ai-sdk/openai-compatible` | `^2.0.41` | Qwen, Kimi, etc. via Zen chat completions |
| `react` / `react-dom` | `^19.1.0` | Sidebar view UI |
| `zod` | `^3.24.0` | Proposal JSON validation |
| `obsidian` | `latest` | Obsidian plugin API |
| `esbuild` | `^0.25.2` | Bundler (JSX, TypeScript) |

## License

MIT
