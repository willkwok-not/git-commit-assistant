# AI Git Commit

一个轻量的 VS Code 扩展：读取 Git **暂存区 diff**，调用 OpenAI 兼容的大模型生成提交消息，并自动填入源代码管理输入框。

## 功能

- 从源代码管理标题栏一键生成提交消息
- 生成期间显示停止按钮，可随时取消模型请求
- 模型输出会流式更新到 Git 提交消息输入框
- 支持 OpenAI 兼容的 `/chat/completions` 接口
- 支持 Conventional Commits、提交语言和自定义规则
- 多模块变更仍生成一个提交标题，必要时在正文中分条概括
- 多 Git 仓库工作区选择
- API Key 使用 VS Code SecretStorage 保存，不进入 `settings.json`
- 暂存差异大小限制和提示词注入防护

## 开发运行

```bash
npm install
npm run compile
```

在 VS Code 中打开本目录，按 `F5` 启动 Extension Development Host。

## 使用

1. 在设置中填写 `AI Git Commit: Base Url` 和 `Model`。
2. 运行命令 `AI Git Commit: 设置 API Key`。
3. 在 Git 面板暂存需要提交的文件。
4. 点击源代码管理标题栏的 ✨ 按钮，或从命令面板运行 `AI: 生成 Git 提交消息`。
5. 检查生成结果后再提交。

默认配置使用 `https://api.openai.com/v1`。其他兼容服务可填写基础地址，也可直接填写完整的 `/chat/completions` 地址。

### 本地无鉴权模型示例

使用提供 OpenAI 兼容接口的本地服务时，可以设置：

```json
{
  "aiGitCommit.baseUrl": "http://localhost:11434/v1",
  "aiGitCommit.model": "qwen2.5-coder:7b",
  "aiGitCommit.requireApiKey": false
}
```

## 配置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `aiGitCommit.baseUrl` | `https://api.openai.com/v1` | API 基础地址或完整接口地址 |
| `aiGitCommit.model` | `gpt-4o-mini` | 模型名称 |
| `aiGitCommit.language` | `简体中文` | 提交消息语言 |
| `aiGitCommit.useConventionalCommits` | `true` | 使用 Conventional Commits |
| `aiGitCommit.customInstructions` | 空 | 额外生成规则 |
| `aiGitCommit.maxDiffCharacters` | `30000` | 最大发送字符数 |
| `aiGitCommit.requestTimeoutSeconds` | `60` | 请求超时秒数 |
| `aiGitCommit.requireApiKey` | `true` | 是否要求 API Key |

## 打包

```bash
npm run package
```

这会生成可通过“扩展：从 VSIX 安装”安装的 `.vsix` 文件。

## 隐私说明

生成时，暂存区 diff 会发送到你配置的模型服务。请确认所选服务符合代码和数据安全要求。扩展不会自动执行 `git commit`。
