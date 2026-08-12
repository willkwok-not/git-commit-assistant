import * as http from "node:http";
import * as https from "node:https";
import { StringDecoder } from "node:string_decoder";
import type { CancellationToken } from "vscode";

export interface CompletionOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  cancellationToken?: CancellationToken;
  onUpdate?: (content: string) => void;
}

export class RequestCancelledError extends Error {
  constructor() {
    super("Model request cancelled.");
    this.name = "RequestCancelledError";
  }
}

export class MissingSettingError extends Error {
  constructor(public readonly settingId: string) {
    super(`Configure ${settingId}.`);
    this.name = "MissingSettingError";
  }
}

export type ModelRequestErrorCode =
  | "empty-response"
  | "invalid-response"
  | "api-error"
  | "invalid-stream"
  | "http-error"
  | "timeout";

export interface ModelRequestErrorDetails {
  detail?: string;
  status?: number;
  seconds?: number;
}

export class ModelRequestError extends Error {
  constructor(
    public readonly code: ModelRequestErrorCode,
    public readonly details: ModelRequestErrorDetails = {},
  ) {
    super(defaultModelRequestErrorMessage(code, details));
    this.name = "ModelRequestError";
  }
}

function defaultModelRequestErrorMessage(code: ModelRequestErrorCode, details: ModelRequestErrorDetails): string {
  switch (code) {
    case "empty-response":
      return "The model returned an empty commit message.";
    case "invalid-response":
      return "The model API returned an invalid response.";
    case "api-error":
      return `Model API error: ${details.detail ?? ""}`;
    case "invalid-stream":
      return "The model API returned an invalid streaming response.";
    case "http-error":
      return `Model request failed (HTTP ${details.status ?? 0}): ${details.detail ?? ""}`;
    case "timeout":
      return `Model request timed out after ${details.seconds ?? 0} seconds.`;
  }
}

type ChatContent = string | Array<{ type?: string; text?: string }>;
type ApiFormat = "chat-completions" | "responses";

interface CompletionTarget {
  url: URL;
  format: ApiFormat;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: ChatContent };
  }>;
  error?: { message?: string };
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: ChatContent };
  }>;
  error?: { message?: string };
}

interface ResponsesResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
}

interface ResponsesChunk {
  type?: string;
  delta?: string;
  error?: { message?: string };
}

function completionTarget(baseUrl: string): CompletionTarget {
  const normalized = baseUrl.trim();
  if (!normalized) {
    throw new MissingSettingError("gitCommitAssistant.baseUrl");
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.pathname = pathname;

  if (/\/responses$/i.test(pathname)) {
    return { url, format: "responses" };
  }
  if (/\/chat\/completions$/i.test(pathname)) {
    return { url, format: "chat-completions" };
  }

  // Keep the common OpenAI-compatible base URL behavior. Any other path is
  // considered an explicit third-party endpoint and is requested unchanged.
  if (pathname === "/" || /\/v1$/i.test(pathname)) {
    url.pathname = `${pathname === "/" ? "" : pathname}/chat/completions`;
  }
  return { url, format: "chat-completions" };
}

function contentToText(content: ChatContent | undefined): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("");
  }
  return "";
}

export async function createCommitMessage(options: CompletionOptions): Promise<string> {
  const target = completionTarget(options.baseUrl);
  const payload = JSON.stringify(
    target.format === "responses"
      ? {
          model: options.model,
          instructions: options.systemPrompt,
          input: options.userPrompt,
          stream: true,
        }
      : {
          model: options.model,
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
          temperature: 0.2,
          stream: true,
        },
  );

  const result = await requestCompletion(target.url, target.format, payload, options.apiKey, options.timeoutMs, options.cancellationToken, options.onUpdate);
  const trimmed = result.trim();
  if (!trimmed) {
    throw new ModelRequestError("empty-response");
  }
  return trimmed;
}

function parseNonStreamingResponse(text: string, format: ApiFormat): string {
  let parsed: ChatCompletionResponse | ResponsesResponse;
  try {
    parsed = JSON.parse(text) as ChatCompletionResponse | ResponsesResponse;
  } catch {
    throw new ModelRequestError("invalid-response");
  }
  if (parsed.error?.message) {
    throw new ModelRequestError("api-error", { detail: parsed.error.message });
  }
  if (format === "chat-completions") {
    return contentToText((parsed as ChatCompletionResponse).choices?.[0]?.message?.content);
  }
  const response = parsed as ResponsesResponse;
  if (response.output_text) {
    return response.output_text;
  }
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text" || part.type === undefined)
      .map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

function requestCompletion(
  url: URL,
  format: ApiFormat,
  body: string,
  apiKey: string | undefined,
  timeoutMs: number,
  cancellationToken?: CancellationToken,
  onUpdate?: (content: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (cancellationToken?.isCancellationRequested) {
      reject(new RequestCancelledError());
      return;
    }

    const transport = url.protocol === "https:" ? https : http;
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    let settled = false;
    let cancellationSubscription: { dispose(): void } | undefined;
    const finishResolve = (value: string): void => {
      if (!settled) {
        settled = true;
        cancellationSubscription?.dispose();
        resolve(value);
      }
    };
    const finishReject = (error: Error): void => {
      if (!settled) {
        settled = true;
        cancellationSubscription?.dispose();
        reject(error);
      }
    };

    const req = transport.request(url, { method: "POST", headers }, (res) => {
      const decoder = new StringDecoder("utf8");
      const status = res.statusCode ?? 0;
      const successful = status >= 200 && status < 300;
      let rawResponse = "";
      let lineBuffer = "";
      let streamedContent = "";

      const consumeLine = (line: string): void => {
        const normalized = line.replace(/\r$/, "");
        if (!normalized.startsWith("data:")) {
          return;
        }
        const data = normalized.slice(5).trim();
        if (!data || data === "[DONE]") {
          return;
        }

        let chunk: ChatCompletionChunk | ResponsesChunk;
        try {
          chunk = JSON.parse(data) as ChatCompletionChunk | ResponsesChunk;
        } catch {
          finishReject(new ModelRequestError("invalid-stream"));
          req.destroy();
          return;
        }
        if (chunk.error?.message) {
          finishReject(new ModelRequestError("api-error", { detail: chunk.error.message }));
          req.destroy();
          return;
        }

        const delta =
          format === "responses"
            ? (chunk as ResponsesChunk).type === "response.output_text.delta"
              ? ((chunk as ResponsesChunk).delta ?? "")
              : ""
            : contentToText((chunk as ChatCompletionChunk).choices?.[0]?.delta?.content);
        if (delta) {
          streamedContent += delta;
          try {
            onUpdate?.(streamedContent);
          } catch (error) {
            finishReject(error instanceof Error ? error : new Error(String(error)));
            req.destroy();
          }
        }
      };

      const consumeCompleteLines = (): void => {
        let newline = lineBuffer.indexOf("\n");
        while (newline >= 0 && !settled) {
          consumeLine(lineBuffer.slice(0, newline));
          lineBuffer = lineBuffer.slice(newline + 1);
          newline = lineBuffer.indexOf("\n");
        }
      };

      res.on("data", (chunk: Buffer) => {
        const text = decoder.write(chunk);
        rawResponse += text;
        if (successful) {
          lineBuffer += text;
          consumeCompleteLines();
        }
      });
      res.on("end", () => {
        const finalText = decoder.end();
        rawResponse += finalText;
        if (successful) {
          lineBuffer += finalText;
          if (lineBuffer && !settled) {
            consumeLine(lineBuffer);
          }
        }
        if (settled) {
          return;
        }
        if (!successful) {
          let detail = rawResponse.slice(0, 500);
          try {
            const data = JSON.parse(rawResponse) as ChatCompletionResponse;
            detail = data.error?.message ?? detail;
          } catch {
            // Keep the response excerpt for non-JSON errors.
          }
          finishReject(new ModelRequestError("http-error", { status, detail }));
          return;
        }
        if (streamedContent) {
          finishResolve(streamedContent);
          return;
        }
        try {
          const content = parseNonStreamingResponse(rawResponse, format);
          if (content) {
            onUpdate?.(content);
          }
          finishResolve(content);
        } catch (error) {
          finishReject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new ModelRequestError("timeout", { seconds: Math.round(timeoutMs / 1000) }));
    });
    req.on("error", finishReject);
    cancellationSubscription = cancellationToken?.onCancellationRequested(() => {
      req.destroy();
      finishReject(new RequestCancelledError());
    });
    req.write(body);
    req.end();
  });
}
