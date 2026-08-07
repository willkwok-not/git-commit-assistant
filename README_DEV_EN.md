# AI Git Commit Development Guide

[[简体中文](README_DEV.md)] | [English]

This document covers extension development, testing, and packaging. See [README.md](README.md) for user instructions.

## Technical Overview

- VS Code extension supporting VS Code `1.85.0` and later
- TypeScript targeting ES2022
- Node.js `http` and `https` modules for model requests
- VS Code Git Extension API for staged diffs and the Source Control input box
- VS Code SecretStorage for API keys
- VS Code localization API with English and Simplified Chinese resources

## Development

Install dependencies and compile:

```bash
npm install
npm run compile
```

Open the project in VS Code and press `F5` to launch the Extension Development Host.

For incremental compilation:

```bash
npm run watch
```

## Project Structure

```text
src/
├── extension.ts       Activation, commands, settings, and user interaction
├── client.ts          OpenAI-compatible requests and streaming parsers
├── git.ts             Repository selection and staged diff access
├── prompt.ts          Prompt construction and commit message cleanup
└── test/              Node.js unit tests

l10n/                  Runtime localization bundles
package.nls*.json      Manifest and settings translations
```

Compiled output is written to `out/`; the extension entry point is `out/extension.js`.

## API Compatibility

`src/client.ts` selects the request format from the configured URL:

| URL form                          | Behavior                                     |
| --------------------------------- | -------------------------------------------- |
| Root URL or URL ending in `/v1`   | Append `/chat/completions`                   |
| URL ending in `/chat/completions` | Use the URL unchanged with Chat Completions  |
| URL ending in `/responses`        | Use the URL unchanged with the Responses API |
| Any other path                    | Use the URL unchanged with Chat Completions  |

Chat Completions sends `messages` and parses `choices[].delta.content`. The Responses API sends `instructions` and
`input`, then parses `response.output_text.delta` events. Both formats also support non-streaming responses.

## Localization

- `package.nls.json` contains default English manifest strings.
- `package.nls.zh-cn.json` contains Simplified Chinese manifest translations.
- `l10n/bundle.l10n.json` contains default English runtime strings.
- `l10n/bundle.l10n.zh-cn.json` contains Simplified Chinese runtime translations.
- Runtime strings in extension-host code use `vscode.l10n.t()`.

The `aiGitCommit.language` setting controls generated commit messages and is independent of the VS Code display language.

## Testing

Run compilation and all tests:

```bash
npm test
```

Tests cover prompt truncation, message cleanup, Chat Completions streaming, custom endpoints, Responses API streaming and
non-streaming responses, and missing-setting errors.

## Packaging

```bash
npm run package
```

The `vscode:prepublish` hook compiles the extension before producing an installable `.vsix` file. The extension details
page displays the root `README.md`.

`.vscodeignore` excludes source code, tests, source maps, and development configuration. Runtime localization resources
must remain in the package.

## Pre-release Checklist

1. Run `npm test`.
2. Check the version and release notes.
3. Run `npm run package`.
4. Install the VSIX in a clean VS Code environment.
5. Verify the English and Simplified Chinese UI, settings, commands, generation, cancellation, and API key flows.
