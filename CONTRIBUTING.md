# Contributing to LLM Wiki Plugin

This document captures the full technical context so that a new development session can pick up exactly where the previous one left off — without rediscovering CORS quirks, provider incompatibilities, or prompt fragility.

## Project Context

This is an Obsidian plugin wrapping the [LLM Wiki](https://github.com/jack/llm-wiki) ingestion workflow. The original system is a directory of markdown files (`raw/` for sources, `wiki/` for compiled knowledge) operated via CLI slash commands (`/ingest`, `/query`, `/lint`). This plugin turns `/ingest` into an interactive sidebar experience.

**The user's philosophy:** The human should participate meaningfully in ingestion (supplying commentary, making judgment calls) while the LLM automates the bookkeeping (extraction, categorization, page writing). The "sweet spot" is the chat phase where the user supplies their learning-oriented commentary and the LLM guides the synthesis.

## Architecture

### Plugin Lifecycle

```
main.ts (onload)
  → registers IngestView (VIEW_TYPE_INGEST = "llm-wiki")
  → adds command palette entry + ribbon icon
  → opens sidebar via workspace.getRightLeaf(false)

IngestView (ItemView)
  → mounts React root on this.contentEl
  → unmounts on close

WikiApp (React) — root sidebar layout
  → Query section (compact placeholder)
  → Ingest section (flex: 1, embeds IngestApp)
  → Lint section (compact placeholder)

IngestApp (React)
  → phase state machine: SELECT → CHAT → PROPOSE → APPLY → DONE
  → session persistence via SessionManager
```

### Phase Details

**SELECT** (`SourceSelector.tsx`)
- Three tabs: "From raw/" (file list + preview pane), "Paste", "Fetch URL"
- File list shows last 5 recently ingested files with titles extracted from frontmatter/H1/filename
- Files with saved sessions show a badge: "· N msgs"
- File selection is two-step: click to select (highlight + preview), then "Ingest this source" or "Discuss & Update" button
- Preview pane shows session metadata (message count, last active) when a session exists, or raw content preview otherwise
- URL fetch: `requestUrl()` → raw HTML → `processUrlWithLlm()` → markdown with frontmatter → `WikiWriter.createFile()` → `onSelect()` callback
- Progress shown via `ProgressSteps` component with per-step spinners and detail text (char counts)

**CHAT** (`ChatPanel.tsx`)
- Generic reusable component parameterized via `ChatPanelProps` (used by both Ingest and Query)
- Header with configurable back label + phase label
- Markdown-rendered assistant messages via `MarkdownMessage.tsx` (uses Obsidian's `MarkdownRenderer`)
- User messages are plain text
- Animated "Thinking..." spinner during LLM calls
- Optional `statusOverlay` replaces input entirely (used for "Generating proposal" animation)
- Optional `actions` React node for extra buttons (used for "Commit & Propose")
- Input: textarea with Enter-to-send, Shift+Enter for newline
- "Commit & Propose" disabled until at least 2 messages exist (greeting + 1 exchange minimum)

**PROPOSE** (`ProposalChecklist.tsx`)
- Lists actions as checkboxes with type badge (CREATE/UPDATE), path, description
- User can uncheck individual items
- "Back to Chat" returns to CHAT, preserving conversation
- "Apply Approved" triggers APPLY phase

**APPLY** (inline in `IngestApp.tsx`)
- Iterates approved actions, calls `WikiWriter.createFile()` or `modifyFile()`
- Updates `index.md` via naive section-header insertion
- Appends to `log.md` in standard format
- Saves final session state and triggers cleanup (keeps only 5 most recent sessions)

**DONE** (inline in `IngestApp.tsx`)
- Shows "Ingest complete!" + "Start another ingestion" button that resets state to SELECT
- On back, returns to the three-section overview

### Session Persistence

**Storage** (`sessions/manager.ts`)
- Sessions stored as individual JSON files in vault folder `.llm-wiki/sessions/`
- File naming: hash of source path (filesystem-safe)
- Schema: `{ sourcePath, sourceContent, phase, messages, proposal, createdAt, updatedAt }`
- `cleanup(limit=5)` evicts oldest sessions beyond the N most recent by `updatedAt`

**Auto-save** (`IngestApp.tsx`)
- A `useEffect` watches `messages`, `phase`, and `proposal` — saves after every state change
- Saves after: greeting generated, each message exchange, proposal generated, apply complete

**Resume flow**
- When a source with a saved session is selected, `handleSourceSelected` loads the session and jumps directly to `CHAT` phase with restored messages
- Skips greeting generation entirely
- The LLM has full conversation history, so re-proposing naturally generates UPDATE actions rather than duplicate CREATEs

**Known issue:** `SourceSelector` only checks for sessions on initial mount. After completing an ingestion and returning to SELECT, the file list may still show "Ingest this source" instead of "Discuss & Update" until the sidebar is reopened. Session was saved — the UI just hasn't refreshed.

### LLM Layer

**Provider routing** (`ai/provider.ts`)

Zen serves different model families through different endpoints with different `ai-sdk` packages:

| Model prefix | Package | Zen endpoint | Notes |
|---|---|---|---|
| `claude-*` | `@ai-sdk/anthropic` | `https://opencode.ai/zen` | Messages API |
| `gpt-*` | `@ai-sdk/openai` | `https://opencode.ai/zen/v1` | Responses API |
| everything else | `@ai-sdk/openai-compatible` | `https://opencode.ai/zen/v1` | Chat completions API |

All providers are injected with `fetch: obsidianFetch`.

**CORS workaround** (`ai/fetch.ts`)

Obsidian's Electron renderer blocks `fetch()` to `opencode.ai` (no `Access-Control-Allow-Origin: app://obsidian.md`). The fix is `obsidianFetch()`, a `fetch`-compatible wrapper around `requestUrl()`:

- `requestUrl()` routes through Electron's `net` module, bypassing CORS entirely
- Converts `fetch` options (Headers, body types) to `requestUrl` format
- Converts `requestUrl` response back to a Web `Response` with a simulated `ReadableStream`
- Logs requests/responses to console for debugging (truncates API key)

**Critical constraint:** `requestUrl()` returns the FULL response body as a single string. It does NOT support Server-Sent Events (SSE). This means `streamText` from `ai-sdk` is fundamentally incompatible — the `textStream` async iterable never yields chunks because there's no streaming transport.

**Solution:** Use `generateText` for everything. Accept that responses arrive all at once. The UI compensates with spinners and animated status text.

**Chat** (`ai/chat.ts`)

- `chatResponse()`: non-streaming `generateText` with `INGEST_CHAT_SYSTEM_PROMPT`
- `generateGreeting()`: dedicated prompt for the initial assistant message when entering CHAT. Source content truncated to ~8KB to keep it fast.
- Every chat LLM call includes the source context as the first message: `Source: ${path}\n\n${content}`

**Proposals** (`ai/propose.ts`)

- `generateProposal()`: non-streaming `generateText` with a hardcoded JSON example in the system prompt
- The prompt contains a complete, copy-pasteable JSON structure the model should emulate
- Post-processing: strip markdown fences (` ```json ... ``` `) if present, then `JSON.parse()`, then `Zod.safeParse()`
- Error messages show the first 500 chars of raw model output so you can debug prompt compliance

**Why not `Output.object()`?** `ai-sdk`'s `Output.object()` uses provider-native structured output (OpenAI JSON mode, Anthropic tool use). Non-OpenAI models through `openai-compatible` return HTTP 401 or "Failed to fetch" because the endpoint doesn't support those APIs. Hardcoded prompts + manual parsing is the only reliable cross-provider approach.

**URL processing** (`ai/url-process.ts`)

- `processUrlWithLlm()`: sends raw HTML + URL to the LLM with a system prompt instructing extraction + markdown conversion + frontmatter generation
- HTML truncated to ~150KB before sending
- The LLM decides what's content vs noise (nav, ads, sidebars, scripts)

### Wiki I/O Layer

**Reader** (`wiki/reader.ts`)
- `listRawFiles()`: glob via `app.vault.getFiles()` filtered by `rawPath` prefix
- `readFile()`: `app.vault.read()` via `TFile`

**Writer** (`wiki/writer.ts`)
- `createFile()`: `app.vault.create()` with recursive directory creation (splits path, creates parent folders)
- `modifyFile()`: `app.vault.modify()` — full replacement, not append
- `appendToFile()`: reads existing, concatenates, writes back

**Frontmatter** (`wiki/frontmatter.ts`)
- Uses Obsidian's built-in `parseYaml()` / `stringifyYaml()` — don't roll your own YAML parser

## Testing & Debugging

### Console is your friend

All LLM operations log to the browser console:
- `[LLM Wiki] Starting streamChat with N messages`
- `[LLM Wiki fetch] POST <url> headers: {...} body length: N`
- `[LLM Wiki fetch] response status: 200 body length: N`
- `[LLM Wiki] generateText returned N chars`
- `[LLM Wiki] JSON parse failed. Raw text: ...`

Open Developer Console (`Cmd+Opt+I` in Obsidian) to see these.

### Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `TypeError: Failed to fetch` + CORS error | Not using `obsidianFetch` | Ensure all providers pass `fetch: obsidianFetch` |
| `Unsupported model version v1` | `@ai-sdk/openai` v1 with `ai` v6 | Upgrade provider packages to v2+ (we use v3) |
| `Request failed, status 401` | Wrong endpoint/package combo | Check provider routing table above |
| JSON parse error on propose | Model returned prose instead of JSON | Review system prompt clarity; model may need stronger instruction |
| Spinner not animating | CSS animation class missing | Check `llm-wiki-spinner` class has `@keyframes llm-wiki-spin` |

### Build

```bash
npm run build    # production, writes main.js
npm run dev      # watch mode, rebuilds on change
```

The esbuild config bundles React, ai-sdk, and Zod into a single `main.js`. External modules (`obsidian`, `electron`, `node:*`) are excluded via `external` array.

## What Needs Work Next

### High Priority

1. **Index update robustness.** Currently uses string matching on `## Section` headers. Should handle:
   - Creating missing sections
   - Alphabetizing entries within sections
   - Duplicate detection (don't add same entry twice)

2. **UPDATE semantics.** Currently overwrites the entire file. Should support:
   - Reading existing content, prepending/appending
   - Bumping `updated:` frontmatter date
   - Appending to `sources:` frontmatter list without losing existing entries
   - Using `> [!contradiction]` callouts when new info conflicts

3. **Session-aware re-ingestion.** When resuming a session, the LLM should know what wiki pages already exist and what was previously created. Currently it only sees the source + chat history, so it may propose duplicate CREATEs. Need to enrich the prompt with:
   - Existing wiki pages that cite this source (from frontmatter `sources:`)
   - Prior log entries for this source
   - Current content of related pages (or at least titles + summaries)

4. **Source size limits.** Very large files (>200KB) should be chunked or summarized before being sent to the LLM. The greeting already truncates to 8KB, but subsequent chat turns send the FULL source every time. This is expensive and slow.

### Medium Priority

5. **Query phase implementation.** The UI placeholder exists (textarea + "Ask Wiki" button that opens a fullscreen chat panel). Need to implement the actual `/query` workflow: read `index.md`, identify relevant pages, read them, synthesize an answer with citations, offer to file as a new wiki page.

6. **Lint phase implementation.** The UI placeholder exists ("Lint Wiki" button). Need to implement the `/lint` workflow: inventory `index.md` vs `wiki/**/*.md`, check contradictions, orphans, missing pages, stale info, frontmatter issues, and index hygiene.

7. **Better URL fetching.** Support recursive fetching (follow links to a depth), fetch GitHub READMEs via API (not raw HTML), extract code repositories as structured data.

8. **Model-specific optimization.** Different models have different strengths. Claude excels at reasoning and following complex prompts; GPT is better at structured JSON; smaller models are faster. The prompt engineering should be model-aware, or at least tested across the supported models.

9. **Tool-calling architecture.** See `TOOLS.md` for design notes on using `ai-sdk` tool calls to let the LLM fetch URLs and read wiki pages autonomously during discussion. Blocked on verifying Zen model support for tool-calling.

### Polish

9. **Error recovery.** If proposal generation fails, the user is stuck in CHAT with an alert. Should show the error inline in the chat and allow retry.

10. **Keyboard shortcuts.** Cmd+Enter to send in chat. Escape to cancel proposing.

11. **Mobile support.** `requestUrl()` works on mobile, but the sidebar UI may need responsive tweaks.

## Adding a New Feature

### Pattern: Add a new phase

If you need a new step in the ingestion flow (e.g., "TAG" between CHAT and PROPOSE):

1. Add phase to `IngestPhase` in `src/types.ts`
2. Add rendering branch in `IngestApp.tsx` switch
3. Create the new component in `src/components/`
4. Add transition handler in `IngestApp.tsx`
5. Update CSS in `styles.css` for any new UI patterns

### Pattern: Add a new top-level section

If you need a new major mode alongside Query/Ingest/Lint:

1. Add section rendering in `WikiApp.tsx`
2. Follow the Query/Lint pattern: compact card in overview, fullscreen view on activation
3. Use `onEnterChat`-style callbacks to expand the section and hide others
4. Ensure the section has a "Back" button that returns to overview

### Pattern: Add a new LLM operation

1. Create function in `src/ai/<new>.ts`
2. Use `createProvider()` from `provider.ts` — it handles model routing and CORS
3. Use `generateText`, NOT `streamText` — remember the streaming constraint
4. If you need structured output, embed a complete JSON example in the system prompt, then parse + validate manually
5. Log to console with `[LLM Wiki]` prefix for debugging

### Pattern: Add a new UI component

1. Use React for anything interactive in the sidebar
2. Use Obsidian CSS variables for theming:
   - `var(--background-primary)`, `var(--background-secondary)`
   - `var(--text-normal)`, `var(--text-muted)`, `var(--text-on-accent)`
   - `var(--interactive-accent)` for buttons/highlights
   - `var(--background-modifier-border)` for borders
3. Mount/unmount properly in `ItemView` lifecycle

## Dependencies — Updating

Be very careful updating `ai-sdk` packages. The v5→v6 migration broke provider compatibility. Current working versions:
- `ai`: `^6.0.168`
- `@ai-sdk/openai`: `^3.0.53`
- `@ai-sdk/anthropic`: `^3.0.71`
- `@ai-sdk/openai-compatible`: `^2.0.41`

If you upgrade `ai`, you MUST also upgrade all `@ai-sdk/*` packages to matching v2+ or v3+ versions. Check the `ai` troubleshooting docs for "Unsupported model version" errors.

## Philosophy Reminders

- **User brings their own API key.** No centralized server, no shared tenancy.
- **The LLM does bookkeeping, the human does judgment.** Automate extraction, categorization, and cross-linking. Reserve human input for commentary, contradiction resolution, and deciding what matters.
- **Obsidian-native look.** Use Obsidian CSS variables, not custom color palettes. The plugin should feel like part of Obsidian, not a web app bolted on.
- **Minimal changes.** This is a plugin, not a framework. Keep the dependency surface small. Avoid UI kits that bring their own CSS systems.
