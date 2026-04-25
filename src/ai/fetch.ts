import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";

/**
 * A fetch-compatible wrapper around Obsidian's requestUrl API.
 * Bypasses CORS restrictions by routing through Electron's net module.
 */
export async function obsidianFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  // Convert headers to plain Record<string, string>
  const reqHeaders: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        reqHeaders[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([k, v]) => {
        reqHeaders[k] = v;
      });
    } else {
      Object.assign(reqHeaders, init.headers as Record<string, string>);
    }
  }

  // Handle body
  let body: string | undefined;
  if (init?.body) {
    if (typeof init.body === "string") {
      body = init.body;
    } else if (init.body instanceof ReadableStream) {
      // Read the stream into a string
      const reader = init.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      body = new TextDecoder().decode(combined);
    } else {
      body = JSON.stringify(init.body);
    }
  }

  // Log request details for debugging (never log the full API key)
  const safeHeaders = { ...reqHeaders };
  if (safeHeaders["Authorization"]) {
    safeHeaders["Authorization"] = safeHeaders["Authorization"].slice(0, 20) + "...";
  }
  console.log("[LLM Wiki fetch]", init?.method || "GET", url, "headers:", safeHeaders, "body length:", body?.length || 0);

  const result = await requestUrl({
    url,
    method: init?.method || "GET",
    headers: reqHeaders,
    body,
  });

  console.log("[LLM Wiki fetch] response status:", result.status, "body length:", result.text?.length || 0);

  // Build a Response-like object from requestUrl result
  // Note: requestUrl returns the full response text at once, so streaming
  // (token-by-token) is not possible. We simulate a single-chunk stream.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(result.text));
      controller.close();
    },
  });

  return new Response(stream, {
    status: result.status,
    statusText: String(result.status),
    headers: new Headers(result.headers),
  });
}
