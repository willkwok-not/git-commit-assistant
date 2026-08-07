import * as vscode from "vscode";
import { createCommitMessage, MissingSettingError, RequestCancelledError } from "./client";
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
    void vscode.window.showInformationMessage("AI Git Commit: 已有生成任务正在进行");
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

          progress.report({ message: prompt.truncated ? "正在请求模型（自动截断）" : "正在请求模型" });
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
            throw new Error("模型返回的提交消息为空。");
          }
          repository.inputBox.value = message;
          completed = true;
        } finally {
          progressCancellation.dispose();
        }
      },
    );
    // void vscode.window.showInformationMessage('AI Git Commit: 提交消息已写入源代码管理输入框');
  } catch (error) {
    if (error instanceof MissingSettingError) {
      const openSettings = "打开设置";
      const selection = await vscode.window.showErrorMessage(`AI Git Commit: ${error.message}`, openSettings);
      if (selection === openSettings) {
        await vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${context.extension.id}`);
      }
    } else if (!(error instanceof vscode.CancellationError) && !(error instanceof RequestCancelledError)) {
      const message = error instanceof Error ? error.message : String(error);
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
    void vscode.window.showInformationMessage("AI Git Commit: API Key 已安全保存");
  }
}

async function promptForApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: "设置 AI 模型 API Key",
    prompt: "API Key 将保存在 VS Code SecretStorage 中",
    password: true,
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim() ? undefined : "API Key 不能为空"),
  });
  const apiKey = value?.trim();
  if (apiKey) {
    await context.secrets.store(API_KEY_SECRET, apiKey);
  }
  return apiKey;
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(API_KEY_SECRET);
  void vscode.window.showInformationMessage("AI Git Commit: API Key 已清除");
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
