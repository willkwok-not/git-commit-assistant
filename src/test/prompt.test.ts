import assert from "node:assert/strict";
import test from "node:test";
import { buildPrompt, cleanCommitMessage } from "../prompt";

test("buildPrompt truncates oversized diffs", () => {
  const result = buildPrompt("x".repeat(20), {
    language: "简体中文",
    conventional: true,
    customInstructions: "",
    maxDiffCharacters: 10,
  });
  assert.equal(result.truncated, true);
  assert.match(result.user, /xxxxxxxxxx/);
  assert.match(result.user, /DIFF TRUNCATED/);
  assert.doesNotMatch(result.user, /xxxxxxxxxxx/);
});

test("buildPrompt requires one header for multi-module conventional commits", () => {
  const result = buildPrompt("diff --git a/api.ts b/api.ts", {
    language: "简体中文",
    conventional: true,
    customInstructions: "",
    maxDiffCharacters: 1000,
  });
  assert.match(result.system, /exactly one commit message/i);
  assert.match(result.system, /exactly one Conventional Commit header/i);
  assert.match(result.system, /several modules.*omit the scope/i);
  assert.match(result.system, /Do not choose chore merely because multiple modules changed/i);
});

test("cleanCommitMessage removes a markdown fence", () => {
  assert.equal(cleanCommitMessage("```text\nfeat: add login\n```"), "feat: add login");
});

test("cleanCommitMessage preserves an optional body", () => {
  assert.equal(cleanCommitMessage("fix: handle timeout  \n\nRetry the request.  "), "fix: handle timeout\n\nRetry the request.");
});
