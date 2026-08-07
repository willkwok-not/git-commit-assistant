import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createCommitMessage, MissingSettingError } from '../client';

test('createCommitMessage identifies a missing base URL setting', async () => {
  await assert.rejects(
    createCommitMessage({
      baseUrl: '   ',
      model: 'test-model',
      systemPrompt: 'system',
      userPrompt: 'user',
      timeoutMs: 1000
    }),
    (error: unknown) => error instanceof MissingSettingError
      && error.settingId === 'aiGitCommit.baseUrl'
  );
});

test('createCommitMessage emits accumulated SSE updates', async () => {
  let requestBody = '';
  let requestPath = '';
  const server = http.createServer((request, response) => {
    requestPath = request.url ?? '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      requestBody += chunk;
    });
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"feat: "}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"支持流式输出"}}]}\n\n');
      response.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const updates: string[] = [];

  try {
    const result = await createCommitMessage({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'test-model',
      systemPrompt: 'system',
      userPrompt: 'user',
      timeoutMs: 1000,
      onUpdate: (content) => updates.push(content)
    });

    assert.equal(result, 'feat: 支持流式输出');
    assert.deepEqual(updates, ['feat: ', 'feat: 支持流式输出']);
    assert.equal(requestPath, '/v1/chat/completions');
    assert.equal(JSON.parse(requestBody).stream, true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('createCommitMessage requests a custom Chat Completions endpoint unchanged', async () => {
  let requestPath = '';
  let requestBody = '';
  const server = http.createServer((request, response) => {
    requestPath = request.url ?? '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      requestBody += chunk;
    });
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: 'fix: 支持自定义接口' } }]
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const result = await createCommitMessage({
      baseUrl: `http://127.0.0.1:${port}/vendor/generate?api-version=1`,
      model: 'test-model',
      systemPrompt: 'system',
      userPrompt: 'user',
      timeoutMs: 1000
    });

    const body = JSON.parse(requestBody);
    assert.equal(result, 'fix: 支持自定义接口');
    assert.equal(requestPath, '/vendor/generate?api-version=1');
    assert.equal(body.messages[0].content, 'system');
    assert.equal(body.messages[1].content, 'user');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('createCommitMessage supports the Responses API and its SSE events', async () => {
  let requestPath = '';
  let requestBody = '';
  const server = http.createServer((request, response) => {
    requestPath = request.url ?? '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      requestBody += chunk;
    });
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('event: response.output_text.delta\n');
      response.write('data: {"type":"response.output_text.delta","delta":"docs: "}\n\n');
      response.write('event: response.output_text.delta\n');
      response.write('data: {"type":"response.output_text.delta","delta":"兼容 Responses API"}\n\n');
      response.end('event: response.completed\ndata: {"type":"response.completed"}\n\n');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const updates: string[] = [];

  try {
    const result = await createCommitMessage({
      baseUrl: `http://127.0.0.1:${port}/v1/responses`,
      model: 'test-model',
      systemPrompt: 'system',
      userPrompt: 'user',
      timeoutMs: 1000,
      onUpdate: (content) => updates.push(content)
    });

    const body = JSON.parse(requestBody);
    assert.equal(result, 'docs: 兼容 Responses API');
    assert.deepEqual(updates, ['docs: ', 'docs: 兼容 Responses API']);
    assert.equal(requestPath, '/v1/responses');
    assert.equal(body.instructions, 'system');
    assert.equal(body.input, 'user');
    assert.equal(body.stream, true);
    assert.equal(body.messages, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('createCommitMessage parses a non-streaming Responses API response', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'refactor: 解析响应结果' }]
      }]
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const result = await createCommitMessage({
      baseUrl: `http://127.0.0.1:${port}/v1/responses`,
      model: 'test-model',
      systemPrompt: 'system',
      userPrompt: 'user',
      timeoutMs: 1000
    });
    assert.equal(result, 'refactor: 解析响应结果');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
