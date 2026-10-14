import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { AI_CLIENT_TIMEOUT_MS, AI_UPSTREAM_TIMEOUT_MS, VERCEL_API_MAX_DURATION_SECONDS } from '../src/lib/aiRequestBudget';

test('AI upstream times out before its client and both leave Vercel time to return the error', () => {
  const functionBudgetMs = VERCEL_API_MAX_DURATION_SECONDS * 1000;
  assert.ok(AI_UPSTREAM_TIMEOUT_MS > 30_000, 'a slow AI request must survive the old 30 second cutoff');
  assert.ok(AI_CLIENT_TIMEOUT_MS - AI_UPSTREAM_TIMEOUT_MS >= 5_000, 'the client needs time to receive the API timeout response');
  assert.ok(functionBudgetMs - AI_CLIENT_TIMEOUT_MS >= 5_000, 'the platform must not terminate the invocation first');
});

test('deployed Vercel API budget agrees with the deadline contract', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/*.ts'].maxDuration, VERCEL_API_MAX_DURATION_SECONDS);
  assert.ok(config.functions['api/*.ts'].maxDuration * 1000 > AI_CLIENT_TIMEOUT_MS);
});
