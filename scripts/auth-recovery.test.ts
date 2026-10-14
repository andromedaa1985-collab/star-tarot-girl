import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountSession } from '../src/lib/accountClient';
import { createAuthSessionState, isInvalidAccountSessionError, resolveAuthSessionVerification } from '../src/lib/authRecovery';

function session(id = 'fixture-owner', token = 'fixture-token'): AccountSession {
  return {
    token,
    user: { id, email: 'fixture@example.invalid', displayName: 'Fixture', createdAt: '2026-10-14T00:00:00Z', archiveUpdatedAt: null, archiveRecordCount: 2 },
  };
}

function accountError(status: number, code?: string) {
  return Object.assign(new Error('Fixture account response'), { status, code });
}

test('a stored account is verified before it can show the ready screen', () => {
  const existing = session();
  assert.deepEqual(createAuthSessionState(null), { status: 'anonymous', session: null });
  assert.deepEqual(createAuthSessionState(existing), { status: 'verifying', session: existing });
  const refreshed = { ...existing, user: { ...existing.user, archiveRecordCount: 3 } };
  assert.deepEqual(resolveAuthSessionVerification(existing, existing, { session: refreshed }), { status: 'ready', session: refreshed });
});

test('forced reauthentication shows login while preserving the original workspace owner', () => {
  const existing = session();
  const state = createAuthSessionState(existing, true);
  assert.equal(state.status, 'reauth');
  assert.strictEqual(state.session, existing);
  assert.equal(state.session?.user.id, 'fixture-owner');
  assert.deepEqual(createAuthSessionState(null, true), { status: 'reauth', session: null });
});

test('only an explicit application session failure requires a new login', () => {
  const existing = session();
  const invalid = accountError(401, 'ACCOUNT_SESSION_INVALID');
  assert.equal(isInvalidAccountSessionError(invalid), true);
  assert.deepEqual(resolveAuthSessionVerification(existing, existing, { error: invalid }), { status: 'reauth', session: existing });
  for (const error of [accountError(401), accountError(401, 'UPSTREAM_UNAUTHORIZED'), accountError(403, 'ACCOUNT_SESSION_INVALID'), accountError(503, 'ACCOUNT_SERVICE_UNAVAILABLE'), new Error('Fixture network failure')]) {
    assert.equal(isInvalidAccountSessionError(error), false);
    const state = resolveAuthSessionVerification(existing, existing, { error });
    assert.equal(state?.status, 'unavailable');
    assert.strictEqual(state?.session, existing);
  }
});

test('late validation cannot downgrade a refreshed token, another account or a logout', () => {
  const started = session();
  const refreshed = session(started.user.id, 'fixture-new-token');
  const differentOwner = session('fixture-other-owner', started.token);
  for (const current of [refreshed, differentOwner, null]) {
    assert.equal(resolveAuthSessionVerification(started, current, { session: started }), null);
    assert.equal(resolveAuthSessionVerification(started, current, { error: accountError(401, 'ACCOUNT_SESSION_INVALID') }), null);
  }
});

test('a server identity mismatch cannot replace the requested owner', () => {
  const existing = session();
  assert.equal(resolveAuthSessionVerification(existing, existing, { session: session('fixture-other-owner') }), null);
  assert.equal(resolveAuthSessionVerification(existing, existing, { session: session(existing.user.id, 'fixture-other-token') }), null);
});

test('a verification retry can recover from an outage without losing account identity', () => {
  const existing = session();
  const outage = resolveAuthSessionVerification(existing, existing, { error: accountError(503, 'ACCOUNT_SERVICE_UNAVAILABLE') });
  assert.equal(outage?.status, 'unavailable');
  assert.strictEqual(outage?.session, existing);
  const recovered = resolveAuthSessionVerification(existing, existing, { session: existing });
  assert.equal(recovered?.status, 'ready');
  assert.strictEqual(recovered?.session, existing);
});
