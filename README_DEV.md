# Git Commit Assistant 开发文档

[简体中文] | [[English](README_DEV_EN.md)]

面向扩展开发、测试和打包维护。普通使用方法请参阅 [README.md](README.md)

## 技术概览

- VS Code 扩展，最低支持 VS Code `1.85.0`
- TypeScript，目标运行时为 ES2022
- 使用 Node.js `http` / `https` 模块发送模型请求
- 使用 VS Code Git Extension API 读取暂存区 diff 和写入提交消息输入框
- API Key 使用 VS Code SecretStorage 保存

## 开发运行

安装依赖并编译：

```bash
pnpm install
pnpm compile
```

在 VS Code 中打开项目，按 `F5` 启动 Extension Development Host

开发工作区通过 `.vscode/settings.json` 默认启用代码补全。在新打开的 Extension Development Host 中：

1. 配置 `Base Url`、`Model` 和 API Key
2. 打开 `src/` 下的 TypeScript 文件（Markdown 默认不补全）
3. 输入代码并等待约 200 毫秒，或按 `Ctrl+Alt+\` 主动触发
4. 若没有出现建议，从“视图 → 输出”选择 `Git Commit Assistant` 查看跳过或请求失败原因

`Git Commit Assistant` 输出频道、请求提示、完整提示词和模型原始响应只在按 `F5` 启动的开发模式中启用。安装打包后的 VSIX 时不会创建该调试输出频道，也不会显示“正在请求代码补全”通知。

开发期间可以运行增量编译：

```bash
pnpm watch
```

## 项目结构

```text
src/
├── extension.ts       扩展激活、命令注册、配置和交互流程
├── client.ts          OpenAI 兼容请求及流式响应解析
├── codeCompletion.ts  VS Code 行内补全提供器、防抖、缓存和 Snippet 生成
├── completionPrompt.ts 代码补全上下文、提示词、结果清理和结构后处理
├── git.ts             Git 仓库选择和暂存区 diff 读取
├── prompt.ts          提示词构建和提交消息清理
└── test/              Node.js 单元测试
```

编译结果输出到 `out/`，扩展入口为 `out/extension.js`。

## 模型接口兼容

`src/client.ts` 根据配置地址选择接口格式：

| 地址形式                    | 实际行为                           |
| --------------------------- | ---------------------------------- |
| 根地址或以 `/v1` 结尾       | 追加 `/chat/completions`           |
| 以 `/chat/completions` 结尾 | 使用原地址和 Chat Completions 格式 |
| 以 `/responses` 结尾        | 使用原地址和 Responses API 格式    |
| 其他路径                    | 使用原地址和 Chat Completions 格式 |

Chat Completions 使用 `messages` 请求体，并解析 `choices[].delta.content`；Responses API 使用 `instructions` 和 `input` 请求体，并解析 `response.output_text.delta` 事件。两种格式都兼容非流式响应

## 本地化

- `package.nls.json` 保存清单和设置的默认英文文案
- `package.nls.zh-cn.json` 保存清单和设置的简体中文翻译
- `l10n/bundle.l10n.json` 保存运行时默认英文文案
- `l10n/bundle.l10n.zh-cn.json` 保存运行时简体中文翻译
- 扩展宿主中的运行时文案使用 `vscode.l10n.t()`

`gitCommitAssistant.language` 只控制生成的提交消息语言，与 VS Code 界面语言相互独立

## 测试

运行编译和全部测试：

```bash
pnpm test
```

当前测试覆盖提示词截断、提交消息清理、代码补全上下文、结果限制、结构配对和缩进处理、Chat Completions 流式输出、自定义接口地址、Responses API 流式与非流式响应，以及缺少配置时的错误类型

## 打包

```bash
pnpm package
```

打包前会通过 `vscode:prepublish` 自动编译，并在 `dist/` 目录生成可通过“扩展：从 VSIX 安装”安装的 `.vsix` 文件

`.vscodeignore` 用于排除源码、测试、Source Map 和开发配置，运行时只需要清单、资源和编译后的代码

## 发布前检查

1. 运行 `pnpm test`
2. 确认 `package.json` 的版本号和更新日志
3. 运行 `pnpm package`
4. 在新的 Extension Development Host 或干净的 VS Code 环境中安装 VSIX
5. 检查扩展详情、设置项、命令、生成、取消和 API Key 管理流程
