import * as vscode from "vscode";

export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: { value: string };
  diff(cached?: boolean): Promise<string>;
}

interface GitApi {
  readonly repositories: GitRepository[];
  getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

export async function getRepository(): Promise<GitRepository> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) {
    throw new Error(vscode.l10n.t("The built-in VS Code Git extension was not found."));
  }

  const git = extension.isActive ? extension.exports : await extension.activate();
  if (!git.enabled) {
    throw new Error(vscode.l10n.t("Git support is currently disabled in VS Code."));
  }

  const api = git.getAPI(1);
  if (api.repositories.length === 0) {
    throw new Error(vscode.l10n.t("No Git repositories were found in the current workspace."));
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const activeRepository = api.getRepository(activeUri);
    if (activeRepository) {
      return activeRepository;
    }
  }

  if (api.repositories.length === 1) {
    return api.repositories[0];
  }

  const selected = await vscode.window.showQuickPick(
    api.repositories.map((repository) => ({
      label: vscode.workspace.asRelativePath(repository.rootUri, false),
      description: repository.rootUri.fsPath,
      repository,
    })),
    { placeHolder: vscode.l10n.t("Select a Git repository for commit message generation") },
  );

  if (!selected) {
    throw new vscode.CancellationError();
  }
  return selected.repository;
}

export async function getStagedDiff(repository: GitRepository): Promise<string> {
  const diff = await repository.diff(true);
  if (!diff.trim()) {
    throw new Error(vscode.l10n.t("No staged changes. Stage files before generating a commit message."));
  }
  return diff;
}
