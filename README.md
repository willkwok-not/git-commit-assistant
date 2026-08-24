# Git Commit Assistant

[简体中文] | [[English](README_EN.md)]

根据 Git 暂存区变更调用 AI 生成提交消息，并自动填入 VS Code 源代码管理输入框。

## 主要功能

- 点击源代码管理标题栏的 ✨ 按钮即可生成提交消息
- 生成内容会流式显示，生成过程中可随时取消
- 支持 OpenAI 兼容的 Chat Completions 和 Responses API
- 支持 Conventional Commits、提交语言和自定义规则
- 支持多 Git 仓库工作区
- API Key 保存在 VS Code SecretStorage 中
- 支持当前文件的 AI 行内代码补全，生成范围限制为短逻辑单元

## 快速开始

1. 打开 VS Code 设置，搜索 `Git Commit Assistant`
2. 填写 `Base Url` 和 `Model`
3. 从命令面板运行 `Git Commit Assistant: 设置 API Key`
4. 在 Git 面板暂存需要提交的文件
5. 点击源代码管理标题栏的 ✨ 按钮
6. 检查生成的提交消息后再提交

## 代码补全

代码补全默认关闭。启用 `gitCommitAssistant.codeCompletion.enabled` 后，可以在编辑器中使用行内补全：

- 按 `Tab` 采纳当前补全
- 按 `Esc` 隐藏当前补全
- 按 `Ctrl+Alt+\`（macOS 为 `Cmd+Alt+\`）主动请求一次补全

每次请求根据光标位置动态选择当前文件上下文，默认上限为 4,000 个字符；条件、赋值和函数声明使用更小的上下文。扩展最多显示 16 行、2,000 个字符。

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
  "gitCommitAssistant.baseUrl": "http://localhost:11434/v1",
  "gitCommitAssistant.model": "qwen2.5-coder:7b",
  "gitCommitAssistant.requireApiKey": false
}
```

## 配置

| 设置                                 | 默认值    | 说明                                |
| ------------------------------------ | --------- | ----------------------------------- |
| `gitCommitAssistant.codeCompletion.enabled` | `false` | 启用自动行内代码补全 |
| `gitCommitAssistant.baseUrl`                | 无        | OpenAI 兼容的基础地址或完整接口地址 |
| `gitCommitAssistant.model`                  | 无        | 模型名称                            |
| `gitCommitAssistant.modelProvider`          | `auto`    | 模型 API 服务商                     |
| `gitCommitAssistant.requireApiKey`          | `true`    | 是否要求 API Key                    |
| `gitCommitAssistant.language`               | `English` | 提交消息语言                        |
| `gitCommitAssistant.useConventionalCommits` | `true`    | 使用 Conventional Commits           |
| `gitCommitAssistant.disableThinking` | `true` | 请求模型禁用思考模式 |
| `gitCommitAssistant.maxDiffCharacters`      | `30000`   | 最大发送字符数                      |
| `gitCommitAssistant.codeCompletion.maxContextCharacters` | `4000` | 每次发送的动态上下文上限 |
| `gitCommitAssistant.codeCompletion.maxLines` | `16` | 每次补全最多显示的行数 |
| `gitCommitAssistant.customInstructions`     | 空        | 额外生成规则                        |
| `gitCommitAssistant.codeCompletion.customInstructions` | 空 | 附加代码补全规则 |
| `gitCommitAssistant.codeCompletion.excludedLanguages` | 纯文本、Markdown 等 | 不启用自动补全的语言 ID |
| `gitCommitAssistant.codeCompletion.debounceMilliseconds` | `200` | 停止输入后的请求延迟（毫秒） |
| `gitCommitAssistant.requestTimeoutSeconds`  | `60`      | 请求超时秒数                        |

## 隐私说明

生成提交消息时，Git 暂存区 diff 会发送到你配置的模型服务。启用代码补全后，正在编辑文件的有限上下文会在停止输入或主动触发时发送到该服务。请确认所选服务符合你的代码和数据安全要求。

扩展不会自动执行 `git commit`。
