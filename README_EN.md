# Git Commit Assistant

[[简体中文](README.md)] | [English]

Generate commit messages from staged Git changes using AI, then place them directly in the VS Code Source Control input box.

## Features

- Generate a commit message from the Source Control title bar
- Stream generated content and cancel generation at any time
- Support OpenAI-compatible Chat Completions and Responses APIs
- Support Conventional Commits, multiple output languages, and custom instructions
- Support multi-repository workspaces
- Store API keys securely in VS Code SecretStorage
- Provide AI inline completion for the current file, limited to short logical units

## Quick Start

1. Open VS Code Settings and search for `Git Commit Assistant`.
2. Enter the `Base Url` and `Model` settings.
3. Run `Git Commit Assistant: Set API Key` from the Command Palette.
4. Stage the files you want to commit.
5. Click the ✨ button in the Source Control title bar.
6. Review the generated message before committing.

## Code Completion

Code completion is disabled by default. After enabling `gitCommitAssistant.codeCompletion.enabled`, inline completion is available in the editor:

- Press `Tab` to accept the current completion.
- Press `Esc` to hide it.
- Press `Ctrl+Alt+\` (`Cmd+Alt+\` on macOS) to request a completion explicitly.

Each request dynamically selects current-file context based on the cursor position, with a default upper bound of 4,000 characters; conditions, assignments, and function declarations use less context. The extension displays at most 16 lines or 2,000 characters.

## API URLs

The extension does not provide a default API URL or model name. It supports these URL forms:

- Root URLs or URLs ending in `/v1`: append `/chat/completions` automatically
- URLs ending in `/chat/completions`: use the Chat Completions format
- URLs ending in `/responses`: use the Responses API format
- Other complete URLs: request them unchanged using the Chat Completions format

For example, `https://api.openai.com/v1` is requested as `https://api.openai.com/v1/chat/completions`.

### Local services without authentication

For an OpenAI-compatible local service such as Ollama:

```json
{
  "gitCommitAssistant.baseUrl": "http://localhost:11434/v1",
  "gitCommitAssistant.model": "qwen2.5-coder:7b",
  "gitCommitAssistant.requireApiKey": false
}
```

## Settings

| Setting                              | Default   | Description                                     |
| ------------------------------------ | --------- | ----------------------------------------------- |
| `gitCommitAssistant.codeCompletion.enabled` | `false` | Enable automatic inline code completion |
| `gitCommitAssistant.baseUrl`                | None      | OpenAI-compatible base URL or complete endpoint |
| `gitCommitAssistant.model`                  | None      | Model name                                      |
| `gitCommitAssistant.modelProvider`          | `auto`    | Model API provider                              |
| `gitCommitAssistant.requireApiKey`          | `true`    | Whether an API key is required                  |
| `gitCommitAssistant.language`               | `English` | Commit message language                         |
| `gitCommitAssistant.useConventionalCommits` | `true`    | Use Conventional Commits                        |
| `gitCommitAssistant.disableThinking` | `true` | Request non-thinking mode from the model |
| `gitCommitAssistant.maxDiffCharacters`      | `30000`   | Maximum number of diff characters sent          |
| `gitCommitAssistant.codeCompletion.maxContextCharacters` | `4000` | Maximum dynamically selected context per request |
| `gitCommitAssistant.codeCompletion.maxLines` | `16` | Maximum displayed lines per completion |
| `gitCommitAssistant.customInstructions`     | Empty     | Additional generation instructions              |
| `gitCommitAssistant.codeCompletion.customInstructions` | Empty | Additional code-completion rules |
| `gitCommitAssistant.codeCompletion.excludedLanguages` | Plain text, Markdown, etc. | Language IDs excluded from automatic completion |
| `gitCommitAssistant.codeCompletion.debounceMilliseconds` | `200` | Delay after typing stops, in milliseconds |
| `gitCommitAssistant.requestTimeoutSeconds`  | `60`      | Request timeout in seconds                      |

## Privacy

When generating a commit message, the staged Git diff is sent to the configured model service. After code completion is enabled, bounded context from the file being edited is sent when typing pauses or completion is explicitly triggered. Make sure that service meets your code and data security requirements.

The extension never runs `git commit` automatically.
