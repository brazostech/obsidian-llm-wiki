# Tool Calling Design Notes

## Context

Current architecture uses `ai-sdk`'s `generateText` with hardcoded text prompts. The user wants the LLM to be able to fetch URLs and traverse links during the discussion phase — i.e., the LLM should act as an autonomous agent that can request web content mid-conversation.

## Current Limitation

`generateText` is text-in, text-out. The LLM APIs we use (via OpenCode Zen) do not have built-in web browsing. Even models that claim "web search" typically do it via a tool-calling loop where the host system executes the search and feeds results back.

## Proposed Path: ai-sdk Tool Calling

`ai-sdk` supports a `tools` parameter on `generateText` where the model can request function calls. The host (our plugin) executes them and returns results in a multi-turn loop.

### Architecture Sketch

```
User: "What does this page say about authentication?"
LLM: "Let me fetch that for you." → tool_call(fetchUrl, {url: "..."})
Plugin: executes requestUrl(), returns HTML/markdown
LLM: synthesizes answer from fetched content
LLM: "There's also a link to OAuth docs. Should I follow it?" → tool_call(fetchUrl, {url: "..."})
... and so on
```

### Tools We'd Need

| Tool | Purpose |
|---|---|
| `fetchUrl` | Fetch raw HTML from a URL, return truncated content |
| `listRawFiles` | List available sources in `raw/` |
| `readWikiPage` | Read a specific wiki page by path |
| `searchIndex` | Search `index.md` for relevant entries |

### Challenges & Open Questions

1. **Model compatibility**: Not all Zen models support tool-calling equally.
   - Claude (via `@ai-sdk/anthropic`) — excellent tool use
   - GPT (via `@ai-sdk/openai`) — native function calling
   - OpenAI-compatible (Qwen, Kimi, etc.) — unknown if Zen endpoint supports `tools` param. Could return HTTP 400 or silently ignore.
   - **Mitigation**: Detect model family and fall back to "plugin pre-fetches everything" mode for incompatible models.

2. **Context window bloat**: If the LLM follows 5 links, each page is ~50KB of markdown. That's 250KB of context before the conversation even starts.
   - **Mitigation**: Summarize each fetched page before adding to context. Or use a two-phase approach: LLM identifies links → plugin fetches → LLM reads summaries → LLM decides which to expand.

3. **Stopping criteria**: When does link traversal stop?
   - Option A: User explicitly approves each fetch ("Fetch this link? [Yes/No]")
   - Option B: LLM decides based on relevance score
   - Option C: Hard depth limit (1 hop from source)

4. **Recursive fetch vs. targeted fetch**:
   - **Recursive**: Fetch source + all linked pages to depth N. Store locally. LLM has everything.
   - **Targeted**: LLM asks for specific URLs during chat. Slower but more focused.
   - User's preference: **Targeted** — LLM should traverse links *as discussion progresses*, not preload everything.

5. **Implementation complexity**:
   - `generateText` with `tools` returns a `toolCalls` array instead of plain text
   - Plugin must parse tool calls, execute them, append results as `tool_results` messages, and re-call `generateText`
   - This is a multi-turn loop, not a single call
   - Need careful error handling: what if `fetchUrl` fails (404, timeout, CORS)?

6. **CORS still applies**: `fetchUrl` tool would execute `requestUrl()` in the plugin. The LLM never makes direct HTTP calls — it just asks the plugin to do it. This is the same CORS bypass we already have.

## Decision Log

- **Current approach**: Plugin pre-fetches URL, converts to markdown via LLM, saves to `raw/`, then user ingests normally. This works today without tool-calling.
- **Future approach**: Implement ai-sdk tool-calling loop with `fetchUrl` and `readWikiPage` tools. This enables the LLM to be an autonomous research agent during both Query and Ingest phases.
- **Blocker**: Need to verify which Zen models support tool-calling. If support is spotty, we may need a hybrid: tool-calling for Claude/GPT, fallback to plugin-driven fetching for openai-compatible models.

## Next Steps (when we pick this up)

1. Test if `generateText({ tools: [...] })` works with our current Zen provider setup across all three model families
2. If it works, define the tool schemas (Zod-based, since we already depend on Zod)
3. Implement a `ToolExecutor` class that handles the call → execute → result loop
4. Start with `fetchUrl` only, expand to `readWikiPage` and `searchIndex` later
5. Add user approval UI for expensive operations (fetching large pages, following links)
