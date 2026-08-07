# AI Git Commit

根据 Git 暂存区变更调用 AI 生成提交消息，并自动填入 VS Code 源代码管理输入框

## 主要功能

- 点击源代码管理标题栏的 ✨ 按钮即可生成提交消息
- 生成内容会流式显示，生成过程中可随时取消
- 支持 OpenAI 兼容的 Chat Completions 和 Responses API
- 支持 Conventional Commits、提交语言和自定义规则
- 支持多 Git 仓库工作区
- API Key 保存在 VS Code SecretStorage 中

## 快速开始

1. 打开 VS Code 设置，搜索 `AI Git Commit`
2. 填写 `Base Url` 和 `Model`
3. 从命令面板运行 `AI Git Commit: 设置 API Key`
4. 在 Git 面板暂存需要提交的文件
5. 点击源代码管理标题栏的 ✨ 按钮
6. 检查生成的提交消息后再提交

## 接口地址

扩展不预设接口地址和模型名称。支持以下地址形式：

- 根地址或以 `/v1` 结尾：自动使用 `/chat/completions`
- 以 `/chat/completions` 结尾：使用 Chat Completions 格式
- 以 `/responses` 结尾：使用 Responses API 格式
- 其他完整地址：原样请求，并按 Chat Completions 格式处理

例如，填写 `https://api.openai.com/v1` 时，实际请求地址为 `https://api.openai.com/v1/chat/completions`

### 本地无鉴权服务

使用 Ollama 等提供 OpenAI 兼容接口的本地服务时，可以设置：

```json
{
  "aiGitCommit.baseUrl": "http://localhost:11434/v1",
  "aiGitCommit.model": "qwen2.5-coder:7b",
  "aiGitCommit.requireApiKey": false
}
```

## 配置

| 设置                                 | 默认值     | 说明                                |
| ------------------------------------ | ---------- | ----------------------------------- |
| `aiGitCommit.baseUrl`                | 无         | OpenAI 兼容的基础地址或完整接口地址 |
| `aiGitCommit.model`                  | 无         | 模型名称                            |
| `aiGitCommit.requireApiKey`          | `true`     | 是否要求 API Key                    |
| `aiGitCommit.language`               | `简体中文` | 提交消息语言                        |
| `aiGitCommit.useConventionalCommits` | `true`     | 使用 Conventional Commits           |
| `aiGitCommit.customInstructions`     | 空         | 额外生成规则                        |
| `aiGitCommit.maxDiffCharacters`      | `30000`    | 最大发送字符数                      |
| `aiGitCommit.requestTimeoutSeconds`  | `60`       | 请求超时秒数                        |

## 隐私说明

生成时，Git 暂存区 diff 会发送到你配置的模型服务。请确认所选服务符合你的代码和数据安全要求

扩展不会自动执行 `git commit`
