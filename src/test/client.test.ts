import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createCommitMessage } from '../client';

test('createCommitMessage emits accumulated SSE updates', async () => {
  let requestBody = '';
  const server = http.createServer((request, response) => {
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
    assert.equal(JSON.parse(requestBody).stream, true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
