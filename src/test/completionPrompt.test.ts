import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodeCompletionPrompt,
  cleanCodeCompletion,
  createBracePairCompletion,
  createMarkupPairCompletion,
  inspectCodeCompletion,
} from "../completionPrompt";

test("buildCodeCompletionPrompt includes the complete current file when it fits", () => {
  const text = "import { value } from './value';\n\nif (value) {\n  \n}\n";
  const cursor = text.indexOf("  \n") + 2;
  const prompt = buildCodeCompletionPrompt(text, cursor, {
    fileName: "src/example.ts",
    languageId: "typescript",
    maxContextCharacters: 20000,
    customInstructions: "Prefer early returns.",
  });

  assert.match(prompt.system, /smallest coherent syntactic unit/);
  assert.match(prompt.system, /concatenation of code before the cursor/);
  assert.match(prompt.system, /Continue partially typed tokens/);
  assert.match(prompt.system, /Use code after the cursor/);
  assert.doesNotMatch(prompt.system, /Inside parentheses/);
  assert.doesNotMatch(prompt.system, /After an assignment/);
  assert.doesNotMatch(prompt.system, /Return an empty response/);
  assert.match(prompt.system, /Prefer early returns/);
  assert.match(prompt.user, /import \{ value \}/);
  assert.match(prompt.user, /<code_before_cursor>/);
  assert.match(prompt.user, /<CURSOR>/);
  assert.match(prompt.user, /Completion slot kind: block-statement/);
  assert.match(prompt.user, /<code_after_cursor>/);
  assert.doesNotMatch(prompt.user, /<file_header>/);
});

test("buildCodeCompletionPrompt treats a blank gap before a closer as a block statement", () => {
  const text = "try {\n  work();\n  \n} catch (error) {\n}\n";
  const cursor = text.indexOf("  \n}") + 2;
  const prompt = buildCodeCompletionPrompt(text, cursor, {
    fileName: "example.js",
    languageId: "javascript",
    maxContextCharacters: 4000,
    customInstructions: "",
  });
  assert.match(prompt.user, /Completion slot kind: block-statement/);
  assert.match(prompt.user, /code after <CURSOR> already exists/);
});

test("buildCodeCompletionPrompt bounds long-file context and keeps the header", () => {
  const text = `HEADER:${"h".repeat(300)}${"p".repeat(1600)}CURSOR${"s".repeat(1000)}`;
  const cursor = text.indexOf("CURSOR");
  const prompt = buildCodeCompletionPrompt(text, cursor, {
    fileName: "large.ts",
    languageId: "typescript",
    maxContextCharacters: 1000,
    customInstructions: "",
  });

  assert.match(prompt.user, /<file_header>\nHEADER:/);
  assert.ok(prompt.user.length < 1500);
  assert.match(prompt.user, /p{100}/);
  assert.match(prompt.user, /s{100}/);
});

test("buildCodeCompletionPrompt describes cursor slots without example-specific prompt rules", () => {
  const cases = [
    { text: "if ()", cursor: 4, expected: "condition" },
    { text: "let value = ", cursor: 12, expected: "assignment-expression" },
    { text: "function Handle", cursor: 15, expected: "declaration" },
    { text: "<di", cursor: 3, expected: "markup-tag" },
  ];
  for (const item of cases) {
    const prompt = buildCodeCompletionPrompt(item.text, item.cursor, {
      fileName: "example.js",
      languageId: "javascript",
      maxContextCharacters: 4000,
      customInstructions: "",
    });
    assert.match(prompt.user, new RegExp(`Completion slot kind: ${item.expected}`));
  }
});

test("buildCodeCompletionPrompt adds a generic markup tag constraint", () => {
  const prompt = buildCodeCompletionPrompt("<di", 3, {
    fileName: "example.html",
    languageId: "html",
    maxContextCharacters: 4000,
    customInstructions: "",
  });
  assert.match(prompt.user, /include the required closing delimiter/);
  assert.doesNotMatch(prompt.user, /div/);
});

test("buildCodeCompletionPrompt carries the effective fallback indentation", () => {
  const prompt = buildCodeCompletionPrompt("const value = {\n", 16, {
    fileName: "example.js",
    languageId: "javascript",
    maxContextCharacters: 4000,
    customInstructions: "",
    indentationStyle: "4 spaces",
  });
  assert.match(prompt.system, /source does not establish a pattern, use 4 spaces/);
  assert.match(prompt.system, /Follow indentation already established in the source/);
});

test("cleanCodeCompletion keeps indentation and removes fences and existing suffix", () => {
  const result = cleanCodeCompletion("```python\n    process(item)\n}\n```", "}\nnext();", 8, 2000);
  assert.equal(result, "    process(item)");
});

test("cleanCodeCompletion limits suggestions to a short block", () => {
  const result = inspectCodeCompletion("one\ntwo\nthree\nfour", "", 3, 2000);
  assert.equal(result.text, "");
  assert.equal(result.rejectionReason, "too-many-lines");
  assert.equal(result.rawLines, 4);
});

test("inspectCodeCompletion identifies empty and duplicate results", () => {
  assert.equal(inspectCodeCompletion("   ", "", 8, 2000).rejectionReason, "empty");
  assert.equal(inspectCodeCompletion("next();", "next();\n", 8, 2000).rejectionReason, "duplicate-suffix");
});

test("inspectCodeCompletion rejects a closing delimiter already present after whitespace", () => {
  const result = inspectCodeCompletion("}", "\n  } catch (error) {", 8, 2000, "try {\n  work();\n  ");
  assert.equal(result.rejectionReason, "duplicate-suffix");
});

test("inspectCodeCompletion removes an already typed keyword prefix", () => {
  const result = inspectCodeCompletion('if (ready) {\n  run();\n}', "\n", 8, 2000, "  if");
  assert.equal(result.text, " (ready) {\n  run();\n}");
});

test("inspectCodeCompletion removes an already typed assignment prefix", () => {
  const result = inspectCodeCompletion("let value = compute();", "\n", 8, 2000, "let value = ");
  assert.equal(result.text, "compute();");
});

test("inspectCodeCompletion completes a missing markup tag delimiter", () => {
  const result = inspectCodeCompletion("div", "\n", 8, 2000, "<d");
  assert.equal(result.text, "iv>");
});

test("inspectCodeCompletion does not duplicate an existing markup delimiter", () => {
  const result = inspectCodeCompletion("div", ">\n", 8, 2000, "<d");
  assert.equal(result.text, "iv");
});

test("createMarkupPairCompletion creates a pair for a normal markup element", () => {
  assert.deepEqual(createMarkupPairCompletion("iv>", "<d", "\n", "html"), {
    beforeCursor: "iv>",
    afterCursor: "</div>",
  });
});

test("createMarkupPairCompletion places the cursor inside a complete returned pair", () => {
  assert.deepEqual(createMarkupPairCompletion("<div></div>", "  ", "\n", "html"), {
    beforeCursor: "<div>",
    afterCursor: "</div>",
  });
  assert.deepEqual(createMarkupPairCompletion("<section>\n</section>", "", "", "html"), {
    beforeCursor: "<section>",
    afterCursor: "\n</section>",
  });
});

test("createMarkupPairCompletion skips void elements and existing closing tags", () => {
  assert.equal(createMarkupPairCompletion("mg>", "<i", "\n", "html"), undefined);
  assert.equal(createMarkupPairCompletion("iv>", "<d", "\n</div>", "html"), undefined);
});

test("createMarkupPairCompletion only applies to markup language modes", () => {
  assert.equal(createMarkupPairCompletion("iv>", "<d", "\n", "javascript"), undefined);
});

test("createBracePairCompletion adds a closer and places the cursor inside", () => {
  assert.deepEqual(createBracePairCompletion("export default {", "  ", "\n</script>", "  "), {
    beforeCursor: "export default {\n  ",
    afterCursor: "\n}",
  });
});

test("createBracePairCompletion handles an empty pair but not a closer by itself", () => {
  assert.deepEqual(createBracePairCompletion("export default {}", "", "", "  "), {
    beforeCursor: "export default {\n  ",
    afterCursor: "\n}",
  });
  assert.equal(createBracePairCompletion("}", "", "", "  "), undefined);
  assert.equal(createBracePairCompletion("data() {\n  return {}", "", "", "  "), undefined);
});

test("createBracePairCompletion does not duplicate a closer after the cursor", () => {
  assert.equal(createBracePairCompletion("if (ready) {", "", "\n}", "  "), undefined);
});

test("inspectCodeCompletion keeps only the missing function declaration suffix", () => {
  const result = inspectCodeCompletion("function Handle() {\n}", "\n", 8, 2000, "function H");
  assert.equal(result.text, "andle() {\n}");
});

test("inspectCodeCompletion extracts only a condition when the cursor is inside parentheses", () => {
  const result = inspectCodeCompletion(
    'if (res.includes("ready")) {\n  run();\n}',
    ")\n",
    8,
    2000,
    "if(",
  );
  assert.equal(result.text, 'res.includes("ready")');
});

test("inspectCodeCompletion rejects a block whose body already exists nearby", () => {
  const existing = 'if (oldCondition) {\n  state.step = "review";\n  state.value = 3;\n  state.error = reason;\n}\nif';
  const result = inspectCodeCompletion(
    'if (newCondition) {\n  state.step = "review";\n  state.value = 3;\n  state.error = reason;\n}',
    "\n",
    8,
    2000,
    existing,
  );
  assert.equal(result.rejectionReason, "duplicate-context");
});
