import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2, Mail, Moon, Sparkles, Sun, UserRound } from 'lucide-react';
import { beginAccountTransitionSafely, getStoredAccountSession, loginAccount, refreshAccountSession, registerAccount } from '../lib/accountClient';
import { activateAccountWorkspace, logoutAccountWorkspace } from '../lib/accountWorkspace';
import { createAuthSessionState, resolveAuthSessionVerification } from '../lib/authRecovery';
import { markLandingIntroSeen } from '../lib/landingIntro';
import { cn } from '../lib/utils';
import { useAppContext } from '../store';

type AuthMode = 'login' | 'register';
type Notice = { type: 'success' | 'error'; message: string };

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme, setTheme } = useAppContext();
  const nextPath = normalizeNextPath(searchParams.get('next'));
  const requestedReauth = searchParams.get('reauth') === '1';
  const [manualReauth, setManualReauth] = React.useState(false);
  const reauth = requestedReauth || manualReauth;
  const [authState, setAuthState] = React.useState(() => createAuthSessionState(getStoredAccountSession(), reauth));
  const session = authState.session;
  const [verificationAttempt, setVerificationAttempt] = React.useState(0);
  const verificationGeneration = React.useRef(0);
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [email, setEmail] = React.useState(() => session?.user.email || '');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const generation = ++verificationGeneration.current;
    const requestedSession = getStoredAccountSession();
    setAuthState(createAuthSessionState(requestedSession, reauth));
    if (reauth) {
      setMode('login');
      setPassword('');
      return () => { cancelled = true; };
    }
    if (!requestedSession) return () => { cancelled = true; };
    const finish = (result: Parameters<typeof resolveAuthSessionVerification>[2]) => {
      if (cancelled || generation !== verificationGeneration.current) return;
      const nextState = resolveAuthSessionVerification(requestedSession, getStoredAccountSession(), result);
      if (nextState) setAuthState(nextState);
    };
    void refreshAccountSession(requestedSession).then(
      (verifiedSession) => finish({ session: verifiedSession }),
      (error: unknown) => finish({ error }),
    );
    return () => { cancelled = true; };
  }, [reauth, verificationAttempt]);

  const recoveringSession = authState.status === 'reauth';
  const title = mode === 'register' ? '创建星轨账户' : recoveringSession ? '重新登录星轨' : '欢迎回来';
  const subtitle = mode === 'register'
    ? '用邮箱和密码，为你的星轨留一个位置。'
    : recoveringSession
      ? '请重新登录，继续你的牌迹与日记。本机记录已保留。'
      : '登录，继续你的牌迹与日记。';

  const retryVerification = () => { setNotice(null); setVerificationAttempt((attempt) => attempt + 1); };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    ++verificationGeneration.current;
    setBusy(true);
    setNotice(null);
    const previousSession = getStoredAccountSession();
    let releaseSync: (() => Promise<void>) | undefined;
    let reloading = false;
    try {
      releaseSync = await beginAccountTransitionSafely();
      const nextSession = mode === 'login' ? await loginAccount({ email, password }) : await registerAccount({ email, password, displayName });
      const activation = await activateAccountWorkspace(nextSession, previousSession);
      setPassword('');
      setNotice({ type: 'success', message: getActivationMessage(mode, activation.source) });
      markLandingIntroSeen();
      window.location.replace(nextPath);
      reloading = true;
    } catch (error: any) {
      setNotice({ type: 'error', message: error?.message || '账户请求失败，请稍后再试。' });
    } finally {
      if (!reloading) {
        await releaseSync?.();
        setBusy(false);
      }
    }
  };

  const handleSwitchAccount = async () => {
    if (busy) return;
    ++verificationGeneration.current;
    let releaseSync: (() => Promise<void>) | undefined;
    try {
      releaseSync = await beginAccountTransitionSafely();
      setBusy(true);
      await logoutAccountWorkspace();
      window.location.replace(`/auth?next=${encodeURIComponent(nextPath)}`);
    } catch (error: any) {
      await releaseSync?.();
      setBusy(false);
      setNotice({ type: 'error', message: error?.message || '切换失败，当前账户和记录已保留。' });
    }
  };

  const switchMode = (nextMode: AuthMode) => { setMode(nextMode); setNotice(null); };

  return (
    <main className="h-full overflow-y-auto bg-apple-bg px-5 pt-[calc(20px+var(--app-safe-top))] pb-[calc(20px+var(--app-safe-bottom))] font-sans text-apple-text sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-40px)] w-full max-w-5xl flex-col">
        <nav aria-label="账户导航" className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate('/')} className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm text-apple-text-muted hover:bg-apple-surface-hover hover:text-apple-text"><ArrowLeft size={18} aria-hidden="true" />返回首页</button>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`切换至${theme === 'dark' ? '浅色' : '深色'}模式`} className="inline-flex size-12 items-center justify-center rounded-xl text-apple-text-muted hover:bg-apple-surface-hover">{theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}</button>
        </nav>

        <div className="grid flex-1 gap-8 py-8 sm:py-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
          <aside className="mx-auto w-full max-w-[440px] lg:max-w-none">
            <div className="mb-5 flex items-center gap-3"><Sparkles size={25} className="text-apple-accent" aria-hidden="true" /><p className="font-serif text-3xl font-semibold">星轨</p><span className="rail-muted">Railstar</span></div>
            <h1 className="text-balance font-serif text-3xl font-medium leading-[1.5] sm:text-4xl">每一段心情，<br className="hidden lg:block" />都可以有迹可循。</h1>
            <p className="rail-body mt-4 max-w-sm text-pretty text-apple-text-muted">让牌迹、日记和那些细小的变化，留在属于你的账户里。</p>
            <img src="/detail-card-hero.png" alt="" width="1254" height="1254" className="mt-8 hidden aspect-square w-64 rounded-t-[44%] rounded-b-2xl object-cover lg:block" />
          </aside>

          <section aria-label={authState.status === 'anonymous' || authState.status === 'reauth' ? '邮箱账户登录与注册' : '当前星轨账户'} className="rail-panel mx-auto w-full max-w-[440px] sm:p-8">
            {authState.status === 'verifying' ? (
              <div role="status" aria-live="polite" aria-busy="true">
                <Loader2 size={32} className="mb-5 animate-spin text-apple-accent" aria-hidden="true" />
                <p className="rail-eyebrow">正在确认登录状态</p>
                <h2 className="text-balance font-serif text-3xl font-medium leading-relaxed">接回你的星轨</h2>
                <p className="rail-body mt-6 text-pretty text-apple-text-muted">正在验证当前账户。本机记录会保留，请稍候。</p>
              </div>
            ) : authState.status === 'unavailable' ? (
              <div>
                <AlertCircle size={32} className="mb-5 text-apple-accent" aria-hidden="true" />
                <p className="rail-eyebrow">账户连接暂时中断</p>
                <h2 className="text-balance font-serif text-3xl font-medium leading-relaxed">暂时无法确认登录</h2>
                <p role="alert" className="rail-body mt-6 text-pretty text-apple-text-muted">{authState.message}</p>
                <p className="rail-muted mt-3">账户和本机记录已保留。网络恢复后可以重试，也可以重新登录。</p>
                <div className="mt-7 grid gap-3">
                  <button type="button" onClick={retryVerification} className="rail-button w-full">重新验证<ArrowRight size={18} aria-hidden="true" /></button>
                  <button type="button" onClick={() => { setNotice(null); setManualReauth(true); }} className="rail-button-secondary w-full">重新登录</button>
                </div>
              </div>
            ) : authState.status === 'ready' ? (
              <div>
                <CheckCircle2 size={32} className="mb-5 text-apple-accent" aria-hidden="true" />
                <p className="rail-eyebrow">账户已就绪</p>
                <h2 className="text-balance break-words font-serif text-3xl font-medium leading-relaxed">欢迎，{authState.session.user.displayName}</h2>
                <p className="rail-muted mt-2 break-all">{authState.session.user.email}</p>
                <p className="rail-body mt-6 text-pretty text-apple-text-muted">进入应用后，可在设置中同步或恢复云端存档，接着记录你的今天。</p>
                {notice && <NoticeMessage notice={notice} />}
                <div className="mt-7 grid gap-3">
                  <button type="button" disabled={busy} onClick={() => { markLandingIntroSeen(); window.location.href = nextPath; }} className="rail-button w-full">进入应用<ArrowRight size={18} aria-hidden="true" /></button>
                  <button type="button" disabled={busy} onClick={handleSwitchAccount} className="rail-button-secondary w-full">切换账户</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} aria-busy={busy}>
                <div aria-label="选择登录或注册" className="mb-7 grid grid-cols-2 gap-1 rounded-xl border border-apple-border bg-apple-bg p-1">
                  {(['login', 'register'] as const).map((authMode) => (
                    <button key={authMode} type="button" onClick={() => switchMode(authMode)} disabled={busy} aria-pressed={mode === authMode} className={cn('min-h-12 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed', mode === authMode ? 'bg-apple-surface text-apple-text shadow-sm' : 'text-apple-text-muted hover:text-apple-text')}>
                      {authMode === 'login' ? '登录' : '注册'}
                    </button>
                  ))}
                </div>
                <h2 className="text-balance font-serif text-3xl font-medium leading-relaxed">{title}</h2>
                <p className="rail-muted mt-2 text-pretty">{subtitle}</p>
                {recoveringSession && session && <p role="status" className="rail-muted mt-3 break-words">重新登录 {session.user.email} 可继续使用原来的本机存档；登录其他账户会载入对应账户的记录。</p>}

                <div className="mt-7 space-y-5">
                  {mode === 'register' && <AuthInput icon={<UserRound size={18} />} label="昵称" value={displayName} onChange={setDisplayName} placeholder="例如：星轨旅人" autoComplete="nickname" disabled={busy} />}
                  <AuthInput icon={<Mail size={18} />} label="邮箱" value={email} onChange={setEmail} placeholder="you@example.com" type="email" autoComplete="email" required disabled={busy} />
                  <AuthInput icon={<KeyRound size={18} />} label="密码" value={password} onChange={setPassword} placeholder="至少 8 位" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} disabled={busy} describedBy="auth-requirements" />
                </div>
                <p id="auth-requirements" className="rail-muted mt-3">请填写有效邮箱，密码至少 8 位。</p>
                {notice && <NoticeMessage notice={notice} />}
                <button type="submit" disabled={busy || !email.trim() || password.length < 8} className="rail-button mt-7 w-full">
                  {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" />正在处理…</> : <>{mode === 'login' ? '登录进入星轨' : '创建并进入星轨'}<ArrowRight size={18} aria-hidden="true" /></>}
                </button>
                <p className="rail-muted mt-4 text-center">目前支持邮箱账户登录</p>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function NoticeMessage({ notice }: { notice: Notice }) {
  return <div id="auth-notice" role={notice.type === 'error' ? 'alert' : 'status'} className={cn('mt-4 flex items-start gap-2 rounded-xl border px-3 py-3 text-[13px] leading-5', notice.type === 'error' ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200' : 'border-apple-border bg-apple-bg text-apple-text')}>
    {notice.type === 'error' ? <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-apple-accent" aria-hidden="true" />}<span>{notice.message}</span>
  </div>;
}

function getActivationMessage(mode: AuthMode, source: string) {
  if (source === 'cloud') return '已登录，并为你恢复云端存档。';
  if (source === 'local') return '已切换到这个账户的本机存档。';
  if (source === 'claimed-local') return '账户已准备好，当前本机记录会归到这个账户下。';
  if (mode === 'register') return '账户创建成功，正在进入星轨。';
  return '登录成功，正在进入星轨。';
}

function normalizeNextPath(value: string | null) {
  if (!value) return '/app';
  try { const decoded = decodeURIComponent(value); return decoded.startsWith('/app') ? decoded : '/app'; }
  catch { return value.startsWith('/app') ? value : '/app'; }
}

function AuthInput({ icon, label, value, onChange, placeholder, type = 'text', autoComplete, disabled, required, minLength, describedBy }: {
  icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: React.HTMLInputTypeAttribute; autoComplete?: string; disabled?: boolean; required?: boolean; minLength?: number; describedBy?: string;
}) {
  const id = React.useId();
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium text-apple-text">{label}</label>
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-apple-text-muted">{icon}</span>
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} name={type === 'password' ? 'password' : autoComplete} disabled={disabled} required={required} minLength={minLength} aria-describedby={describedBy} className="rail-field pl-11 disabled:opacity-60" />
    </div>
  </div>;
}
