import * as vscode from "vscode";
import { createCommitMessage, MissingSettingError, ModelRequestError, RequestCancelledError } from "./client";
import { getRepository, getStagedDiff } from "./git";
import { buildPrompt, cleanCommitMessage } from "./prompt";

const API_KEY_SECRET = "aiGitCommit.apiKey";
let activeGeneration: vscode.CancellationTokenSource | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("aiGitCommit.generate", () => generate(context)),
    vscode.commands.registerCommand("aiGitCommit.cancel", cancelGeneration),
    vscode.commands.registerCommand("aiGitCommit.setApiKey", () => setApiKey(context)),
    vscode.commands.registerCommand("aiGitCommit.clearApiKey", () => clearApiKey(context)),
  );
  void vscode.commands.executeCommand("setContext", "aiGitCommit.generating", false);
}

async function generate(context: vscode.ExtensionContext): Promise<void> {
  if (activeGeneration) {
    void vscode.window.showInformationMessage(`AI Git Commit: ${vscode.l10n.t("A generation task is already running.")}`);
    return;
  }

  const cancellationSource = new vscode.CancellationTokenSource();
  let restoreStreamedInput: (() => void) | undefined;
  let completed = false;
  activeGeneration = cancellationSource;
  await vscode.commands.executeCommand("setContext", "aiGitCommit.generating", true);
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Git Commit",
        cancellable: true,
      },
      async (progress, progressToken) => {
        const progressCancellation = progressToken.onCancellationRequested(() => {
          cancellationSource.cancel();
        });
        try {
          const config = vscode.workspace.getConfiguration("aiGitCommit");
          const baseUrl = requiredSetting(config.get<string>("baseUrl"), "aiGitCommit.baseUrl");
          const model = requiredSetting(config.get<string>("model"), "aiGitCommit.model");
          const repository = await getRepository();
          const originalInput = repository.inputBox.value;
          let latestStreamedInput: string | undefined;
          restoreStreamedInput = () => {
            if (latestStreamedInput !== undefined && repository.inputBox.value === latestStreamedInput) {
              repository.inputBox.value = originalInput;
            }
          };
          const diff = await getStagedDiff(repository);
          const maxDiffCharacters = config.get<number>("maxDiffCharacters", 30000);
          const prompt = buildPrompt(diff, {
            language: config.get<string>("language", "简体中文"),
            conventional: config.get<boolean>("useConventionalCommits", true),
            customInstructions: config.get<string>("customInstructions", ""),
            maxDiffCharacters,
          });

          const requireApiKey = config.get<boolean>("requireApiKey", true);
          let apiKey = await context.secrets.get(API_KEY_SECRET);
          if (requireApiKey && !apiKey) {
            apiKey = await promptForApiKey(context);
            if (!apiKey) {
              throw new vscode.CancellationError();
            }
          }

          progress.report({
            message: prompt.truncated
              ? vscode.l10n.t("Requesting model (diff truncated automatically)")
              : vscode.l10n.t("Requesting model"),
          });
          const rawMessage = await createCommitMessage({
            baseUrl,
            apiKey,
            model,
            systemPrompt: prompt.system,
            userPrompt: prompt.user,
            timeoutMs: config.get<number>("requestTimeoutSeconds", 60) * 1000,
            cancellationToken: cancellationSource.token,
            onUpdate: (partialMessage) => {
              const visibleMessage = cleanCommitMessage(partialMessage);
              if (visibleMessage) {
                latestStreamedInput = visibleMessage;
                repository.inputBox.value = visibleMessage;
              }
            },
          });
          const message = cleanCommitMessage(rawMessage);
          if (!message) {
            throw new ModelRequestError("empty-response");
          }
          repository.inputBox.value = message;
          completed = true;
        } finally {
          progressCancellation.dispose();
        }
      },
    );
  } catch (error) {
    if (error instanceof MissingSettingError) {
      const openSettings = vscode.l10n.t("Open Settings");
      const selection = await vscode.window.showErrorMessage(
        `AI Git Commit: ${vscode.l10n.t("Configure {0}.", error.settingId)}`,
        openSettings,
      );
      if (selection === openSettings) {
        await vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${context.extension.id}`);
      }
    } else if (!(error instanceof vscode.CancellationError) && !(error instanceof RequestCancelledError)) {
      const message = localizeError(error);
      void vscode.window.showErrorMessage(`AI Git Commit: ${message}`);
    }
  } finally {
    if (!completed) {
      restoreStreamedInput?.();
    }
    if (activeGeneration === cancellationSource) {
      activeGeneration = undefined;
      await vscode.commands.executeCommand("setContext", "aiGitCommit.generating", false);
    }
    cancellationSource.dispose();
  }
}

function cancelGeneration(): void {
  activeGeneration?.cancel();
}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await promptForApiKey(context);
  if (apiKey) {
    void vscode.window.showInformationMessage(`AI Git Commit: ${vscode.l10n.t("API key saved securely.")}`);
  }
}

async function promptForApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: vscode.l10n.t("Set AI Model API Key"),
    prompt: vscode.l10n.t("The API key is stored in VS Code SecretStorage."),
    password: true,
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim() ? undefined : vscode.l10n.t("API key cannot be empty.")),
  });
  const apiKey = value?.trim();
  if (apiKey) {
    await context.secrets.store(API_KEY_SECRET, apiKey);
  }
  return apiKey;
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(API_KEY_SECRET);
  void vscode.window.showInformationMessage(`AI Git Commit: ${vscode.l10n.t("API key cleared.")}`);
}

function localizeError(error: unknown): string {
  if (!(error instanceof ModelRequestError)) {
    return error instanceof Error ? error.message : String(error);
  }

  switch (error.code) {
    case "empty-response":
      return vscode.l10n.t("The model returned an empty commit message.");
    case "invalid-response":
      return vscode.l10n.t("The model API returned an invalid response.");
    case "api-error":
      return vscode.l10n.t("Model API error: {0}", error.details.detail ?? "");
    case "invalid-stream":
      return vscode.l10n.t("The model API returned an invalid streaming response.");
    case "http-error":
      return vscode.l10n.t(
        "Model request failed (HTTP {0}): {1}",
        error.details.status ?? 0,
        error.details.detail ?? "",
      );
    case "timeout":
      return vscode.l10n.t("Model request timed out after {0} seconds.", error.details.seconds ?? 0);
  }
}

function requiredSetting(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new MissingSettingError(name);
  }
  return trimmed;
}

export function deactivate(): void {
  // No resources need explicit disposal beyond context subscriptions.
}
