import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(__dirname, "../..");

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(projectRoot, relativePath), "utf8")) as Record<string, unknown>;
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{\d+\}/g), (match) => match[0]).sort();
}

test("manifest localization resources have matching keys", () => {
  const manifestText = readFileSync(resolve(projectRoot, "package.json"), "utf8");
  const referencedKeys = Array.from(manifestText.matchAll(/%([^%]+)%/g), (match) => match[1]).sort();
  const english = readJson("package.nls.json");
  const chinese = readJson("package.nls.zh-cn.json");

  assert.deepEqual(sortedKeys(english), referencedKeys);
  assert.deepEqual(sortedKeys(chinese), referencedKeys);
});

test("runtime localization resources cover all source messages", () => {
  const source = ["src/extension.ts", "src/git.ts"]
    .map((file) => readFileSync(resolve(projectRoot, file), "utf8"))
    .join("\n");
  const sourceMessages = Array.from(
    source.matchAll(/vscode\.l10n\.t\(\s*"([^"]+)"/g),
    (match) => match[1],
  ).sort();
  const english = readJson("l10n/bundle.l10n.json");
  const chinese = readJson("l10n/bundle.l10n.zh-cn.json");

  assert.deepEqual(sortedKeys(english), sourceMessages);
  assert.deepEqual(sortedKeys(chinese), sourceMessages);

  for (const key of sourceMessages) {
    assert.equal(english[key], key);
    assert.deepEqual(placeholders(String(chinese[key])), placeholders(key));
  }
});
