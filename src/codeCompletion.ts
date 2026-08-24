import * as vscode from "vscode";
import { createTextCompletion, RequestCancelledError } from "./client";
import {
  buildCodeCompletionPrompt,
  createBracePairCompletion,
  createMarkupPairCompletion,
  inspectCodeCompletion,
} from "./completionPrompt";

const DEFAULT_MAX_CONTEXT_CHARACTERS = 6000;
const DEFAULT_MAX_LINES = 16;
const DEFAULT_MAX_CHARACTERS = 2000;
const DEFAULT_DEBOUNCE_MS = 200;

export function registerCodeCompletionProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const automaticCache = new Map<string, string>();
  const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
  const output = isDevelopment ? vscode.window.createOutputChannel("Git Commit Assistant") : undefined;
  output?.appendLine("Code completion provider registered.");
  const provider = vscode.languages.registerInlineCompletionItemProvider(
    [{ scheme: "file" }, { scheme: "untitled" }],
    {
      provideInlineCompletionItems: async (document, position, completionContext, token) => {
        const config = vscode.workspace.getConfiguration("gitCommitAssistant", document.uri);
        if (!config.get<boolean>("codeCompletion.enabled", false)) {
          return [];
        }
        const excludedLanguages = config.get<string[]>("codeCompletion.excludedLanguages", []);
        if (excludedLanguages.includes(document.languageId)) {
          return [];
        }

        const cacheKey = `${document.uri.toString()}|${document.version}|${document.offsetAt(position)}`;
        if (completionContext.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
          const cached = automaticCache.get(cacheKey);
          if (cached !== undefined) {
            return cached ? [createInlineCompletionItem(cached, document, position)] : [];
          }
        }

        const delay = config.get<number>("codeCompletion.debounceMilliseconds", DEFAULT_DEBOUNCE_MS);
        if (completionContext.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
          const elapsed = await waitForDebounce(delay, token);
          if (!elapsed) {
            return [];
          }
        }

        const baseUrl = config.get<string>("baseUrl")?.trim();
        const model = config.get<string>("model")?.trim();
        const requireApiKey = config.get<boolean>("requireApiKey", true);
        const apiKey = await context.secrets.get("gitCommitAssistant.apiKey");
        if (!baseUrl || !model || (requireApiKey && !apiKey) || token.isCancellationRequested) {
          if (!token.isCancellationRequested) {
            output?.appendLine("Code completion skipped: model settings or API key are missing.");
          }
          return [];
        }

        const version = document.version;
        const maxContextCharacters = config.get<number>(
          "codeCompletion.maxContextCharacters",
          DEFAULT_MAX_CONTEXT_CHARACTERS,
        );
        const maxLines = config.get<number>("codeCompletion.maxLines", DEFAULT_MAX_LINES);
        const indentation = resolveIndentation(document);
        const prompt = buildCodeCompletionPrompt(document.getText(), document.offsetAt(position), {
          fileName: vscode.workspace.asRelativePath(document.uri, false),
          languageId: document.languageId,
          maxContextCharacters,
          customInstructions: config.get<string>("codeCompletion.customInstructions", ""),
          indentationStyle: indentation.description,
          maxLines,
          maxCharacters: DEFAULT_MAX_CHARACTERS,
        });

        const requestStartedAt = Date.now();
        try {
          output?.appendLine(
            `Requesting ${completionContext.triggerKind === vscode.InlineCompletionTriggerKind.Automatic ? "automatic" : "manual"} completion for ${vscode.workspace.asRelativePath(document.uri, false)} (${document.languageId}).`,
          );
          if (isDevelopment) {
            void vscode.window.showInformationMessage(
              `Git Commit Assistant: ${vscode.l10n.t("Requesting code completion")}`,
            );
          }
          output?.appendLine("----- Code completion system prompt -----");
          output?.appendLine(prompt.system);
          output?.appendLine("----- Code completion user prompt -----");
          output?.appendLine(prompt.user);
          output?.appendLine("----- End code completion prompt -----");
          const raw = await createTextCompletion({
            baseUrl,
            apiKey,
            model,
            systemPrompt: prompt.system,
            userPrompt: prompt.user,
            timeoutMs: config.get<number>("requestTimeoutSeconds", 60) * 1000,
            cancellationToken: token,
            disableThinking: config.get<boolean>("disableThinking", true),
            modelProvider: config.get("modelProvider", "auto"),
            onRawResponse: isDevelopment
              ? (response) => {
                  output?.appendLine("----- Model raw HTTP response -----");
                  output?.appendLine(response || "<empty response body>");
                  output?.appendLine("----- End model raw HTTP response -----");
                }
              : undefined,
          });
          if (token.isCancellationRequested || document.version !== version) {
            return [];
          }

          const cursorOffset = document.offsetAt(position);
          const documentText = document.getText();
          const prefix = documentText.slice(0, cursorOffset);
          const suffix = documentText.slice(cursorOffset);
          const inspected = inspectCodeCompletion(raw, suffix, maxLines, DEFAULT_MAX_CHARACTERS, prefix);
          const completion = inspected.text;
          output?.appendLine("----- Parsed model completion -----");
          output?.appendLine(raw || "<empty parsed completion>");
          output?.appendLine("----- End parsed model completion -----");
          output?.appendLine(
            completion
              ? `Code completion ready: ${completion.length} characters, ${completion.split(/\r?\n/).length} lines (raw: ${inspected.rawCharacters} characters, ${inspected.rawLines} lines).`
              : `Code completion rejected: ${inspected.rejectionReason ?? "unknown"} (raw: ${inspected.rawCharacters} characters, ${inspected.rawLines} lines).`,
          );
          output?.appendLine(`Code completion request finished in ${Date.now() - requestStartedAt} ms.`);
          if (completionContext.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            automaticCache.set(cacheKey, completion);
            while (automaticCache.size > 20) {
              automaticCache.delete(automaticCache.keys().next().value as string);
            }
          }
          if (!completion) {
            return [];
          }
          return [createInlineCompletionItem(completion, document, position)];
        } catch (error) {
          if (error instanceof RequestCancelledError || token.isCancellationRequested) {
            output?.appendLine(
              `Code completion request cancelled after ${Date.now() - requestStartedAt} ms because the editor state changed.`,
            );
          } else {
            if (isDevelopment) {
              console.warn("Git Commit Assistant code completion failed:", error);
            }
            output?.appendLine(`Code completion failed: ${error instanceof Error ? error.message : String(error)}`);
            if (completionContext.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
              const message = error instanceof Error ? error.message : String(error);
              void vscode.window.showErrorMessage(`Git Commit Assistant: ${message}`);
            }
          }
          return [];
        }
      },
    },
  );
  const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("gitCommitAssistant.codeCompletion")) {
      automaticCache.clear();
    }
  });
  return output
    ? vscode.Disposable.from(provider, configurationListener, output)
    : vscode.Disposable.from(provider, configurationListener);
}

function createInlineCompletionItem(
  completion: string,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.InlineCompletionItem {
  const cursorOffset = document.offsetAt(position);
  const documentText = document.getText();
  const markupPair = createMarkupPairCompletion(
    completion,
    documentText.slice(0, cursorOffset),
    documentText.slice(cursorOffset),
    document.languageId,
  );
  const indentUnit = resolveIndentation(document).unit;
  const pairedCompletion = markupPair ?? createBracePairCompletion(
    completion,
    documentText.slice(0, cursorOffset),
    documentText.slice(cursorOffset),
    indentUnit,
  );
  if (!pairedCompletion) {
    return new vscode.InlineCompletionItem(completion, new vscode.Range(position, position));
  }
  const lineStart = new vscode.Position(position.line, 0);
  const linePrefix = document.getText(new vscode.Range(lineStart, position));
  const baseIndent = linePrefix.match(/^\s*/)?.[0] ?? "";
  const snippet = new vscode.SnippetString();
  snippet.appendText(linePrefix);
  snippet.appendText(addBaseIndent(pairedCompletion.beforeCursor, baseIndent));
  snippet.appendTabstop(0);
  snippet.appendText(addBaseIndent(pairedCompletion.afterCursor, baseIndent));
  return new vscode.InlineCompletionItem(snippet, new vscode.Range(lineStart, position));
}

function addBaseIndent(value: string, baseIndent: string): string {
  return baseIndent ? value.replace(/\n/g, `\n${baseIndent}`) : value;
}

function resolveIndentation(document: vscode.TextDocument): { unit: string; description: string } {
  const editor = vscode.window.visibleTextEditors.find((candidate) => candidate.document === document);
  const editorConfig = vscode.workspace.getConfiguration("editor", document.uri);
  const configuredTabSize = editorConfig.get<number>("tabSize", 4);
  const tabSize = typeof editor?.options.tabSize === "number" ? editor.options.tabSize : configuredTabSize;
  const configuredInsertSpaces = editorConfig.get<boolean>("insertSpaces", true);
  const insertSpaces =
    typeof editor?.options.insertSpaces === "boolean" ? editor.options.insertSpaces : configuredInsertSpaces;
  return insertSpaces
    ? { unit: " ".repeat(Math.max(1, tabSize)), description: `${Math.max(1, tabSize)} spaces` }
    : { unit: "\t", description: "tabs" };
}

function waitForDebounce(milliseconds: number, token: vscode.CancellationToken): Promise<boolean> {
  if (token.isCancellationRequested) {
    return Promise.resolve(false);
  }
  if (milliseconds <= 0) {
    return Promise.resolve(!token.isCancellationRequested);
  }
  return new Promise((resolve) => {
    let subscription: vscode.Disposable | undefined;
    const timeout = setTimeout(() => {
      subscription?.dispose();
      resolve(true);
    }, milliseconds);
    subscription = token.onCancellationRequested(() => {
      clearTimeout(timeout);
      subscription?.dispose();
      resolve(false);
    });
  });
}
