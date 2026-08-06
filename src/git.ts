import * as vscode from 'vscode';

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
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    throw new Error('未找到 VS Code 内置 Git 扩展。');
  }

  const git = extension.isActive ? extension.exports : await extension.activate();
  if (!git.enabled) {
    throw new Error('VS Code 的 Git 功能当前未启用。');
  }

  const api = git.getAPI(1);
  if (api.repositories.length === 0) {
    throw new Error('当前工作区中没有 Git 仓库。');
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
      repository
    })),
    { placeHolder: '选择要生成提交消息的 Git 仓库' }
  );

  if (!selected) {
    throw new vscode.CancellationError();
  }
  return selected.repository;
}

export async function getStagedDiff(repository: GitRepository): Promise<string> {
  const diff = await repository.diff(true);
  if (!diff.trim()) {
    throw new Error('暂存区没有变更。请先暂存文件，再生成提交消息。');
  }
  return diff;
}
