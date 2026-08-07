# AI Git Commit

[[简体中文](README.zh-CN.md)] | [English]

Generate commit messages from staged Git changes using AI, then place them directly in the VS Code Source Control input box.

## Features

- Generate a commit message from the Source Control title bar
- Stream generated content and cancel generation at any time
- Support OpenAI-compatible Chat Completions and Responses APIs
- Support Conventional Commits, multiple output languages, and custom instructions
- Support multi-repository workspaces
- Store API keys securely in VS Code SecretStorage

## Quick Start

1. Open VS Code Settings and search for `AI Git Commit`.
2. Enter the `Base Url` and `Model` settings.
3. Run `AI Git Commit: Set API Key` from the Command Palette.
4. Stage the files you want to commit.
5. Click the ✨ button in the Source Control title bar.
6. Review the generated message before committing.

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
  "aiGitCommit.baseUrl": "http://localhost:11434/v1",
  "aiGitCommit.model": "qwen2.5-coder:7b",
  "aiGitCommit.requireApiKey": false
}
```

## Settings

| Setting                              | Default    | Description                                     |
| ------------------------------------ | ---------- | ----------------------------------------------- |
| `aiGitCommit.baseUrl`                | None       | OpenAI-compatible base URL or complete endpoint |
| `aiGitCommit.model`                  | None       | Model name                                      |
| `aiGitCommit.requireApiKey`          | `true`     | Whether an API key is required                  |
| `aiGitCommit.language`               | `简体中文` | Commit message language                         |
| `aiGitCommit.useConventionalCommits` | `true`     | Use Conventional Commits                        |
| `aiGitCommit.customInstructions`     | Empty      | Additional generation instructions              |
| `aiGitCommit.maxDiffCharacters`      | `30000`    | Maximum number of diff characters sent          |
| `aiGitCommit.requestTimeoutSeconds`  | `60`       | Request timeout in seconds                      |

## Privacy

The staged Git diff is sent to the model service you configure. Make sure that service meets your code and data security requirements.

The extension never runs `git commit` automatically.
