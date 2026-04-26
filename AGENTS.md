# LLM Wiki Obsidian Plugin

## Project Overview

Obsidian plugin that wraps the LLM Wiki ingestion workflow into an interactive sidebar experience. The user provides judgment and commentary; the LLM automates extraction, categorization, and page writing.

## Tech Stack

- TypeScript, React 19, esbuild
- Obsidian Plugin API
- Vercel AI SDK (`ai` v6, `@ai-sdk/anthropic` v3, `@ai-sdk/openai` v3, `@ai-sdk/openai-compatible` v2)
- Zod for validation
- No test runner yet (Vitest setup tracked in issue 006)

## Build Commands

```bash
npm run build       # production build → main.js
npm run dev         # watch mode
```

No `npm test` yet — Vitest infrastructure is issue 006.

## Architecture

```
main.ts → IngestView (ItemView) → WikiApp (React)
  → IngestApp: SELECT → CHAT → PROPOSE → APPLY → DONE
  → SessionManager: persists to .llm-wiki/sessions/
  → WikiReader / WikiWriter: vault I/O
  → AI layer: generateText (NOT streamText — CORS constraint)
```

## Key Source Files

| Path | Purpose |
|------|---------|
| `src/main.ts` | Plugin lifecycle |
| `src/types.ts` | Shared types (IngestPhase, etc.) |
| `src/ai/provider.ts` | LLM provider routing (Zen → ai-sdk packages) |
| `src/ai/fetch.ts` | CORS workaround (obsidianFetch via requestUrl) |
| `src/ai/chat.ts` | Chat + greeting generation |
| `src/ai/propose.ts` | Proposal generation + JSON parsing |
| `src/ai/wikiContext.ts` | Wiki context builder for LLM |
| `src/ai/url-process.ts` | URL → markdown via LLM |
| `src/ai/prompts.ts` | System prompts |
| `src/wiki/reader.ts` | Vault read operations |
| `src/wiki/writer.ts` | Vault write operations |
| `src/wiki/frontmatter.ts` | YAML frontmatter (parseYaml/stringifyYaml) |
| `src/sessions/manager.ts` | Session persistence |
| `src/settings.ts` | Plugin settings (model, API key) |
| `src/views/IngestView.ts` | Obsidian ItemView adapter |

## Critical Constraints

- **No streaming:** `requestUrl()` returns full response at once. Use `generateText`, never `streamText`.
- **Cross-provider compatibility:** Hardcoded prompts + manual JSON parsing for proposals (not `Output.object()` — breaks on non-OpenAI endpoints).
- **Obsidian CSS:** Use `var(--background-primary)`, `var(--text-normal)`, etc. No custom color palettes.
- **ai-sdk upgrades:** If you upgrade `ai`, you MUST also upgrade all `@ai-sdk/*` packages to matching versions.

## Code Conventions

- No comments unless explicitly requested
- React for interactive sidebar UI
- Obsidian CSS variables for theming
- Console logging with `[LLM Wiki]` prefix
- `parseYaml()`/`stringifyYaml()` from Obsidian API — never roll your own YAML parser

## Issue Tracking

Issues live in `issues/` as markdown files. Format: `NNN-short-name.md` with sections for What to Build, Acceptance Criteria, Blocked By, and User Stories Addressed.

Completed issues move to `issues/done/`.

The PRD is at `issues/prd.md`.
