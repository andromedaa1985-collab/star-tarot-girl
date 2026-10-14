import type { AccountSession } from './accountClient';

export type AuthSessionState =
  | { status: 'anonymous'; session: null }
  | { status: 'reauth'; session: AccountSession | null }
  | { status: 'verifying'; session: AccountSession }
  | { status: 'ready'; session: AccountSession }
  | { status: 'unavailable'; session: AccountSession; message: string };

export function createAuthSessionState(session: AccountSession | null, reauth = false): AuthSessionState {
  if (reauth) return { status: 'reauth', session };
  return session ? { status: 'verifying', session } : { status: 'anonymous', session: null };
}

export function isInvalidAccountSessionError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return candidate.status === 401 && candidate.code === 'ACCOUNT_SESSION_INVALID';
}

type VerificationResult = { session: AccountSession } | { error: unknown };

export function resolveAuthSessionVerification(
  requestedSession: AccountSession,
  currentSession: AccountSession | null,
  result: VerificationResult,
): AuthSessionState | null {
  // A late verification belongs to the token it started with. Never replace a
  // newer login, nor turn the previous owner's workspace into guest records.
  if (currentSession?.token !== requestedSession.token || currentSession.user.id !== requestedSession.user.id) return null;
  if ('session' in result) {
    if (result.session.token !== requestedSession.token || result.session.user.id !== requestedSession.user.id) return null;
    return { status: 'ready', session: result.session };
  }
  if (isInvalidAccountSessionError(result.error)) return { status: 'reauth', session: currentSession };
  const message = result.error instanceof Error && result.error.message.trim()
    ? result.error.message
    : '账户服务暂时不可用，请稍后重试。';
  return { status: 'unavailable', session: currentSession, message };
}
