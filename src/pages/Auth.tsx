import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  clearAccountSession,
  getStoredAccountSession,
  loginAccount,
  registerAccount,
  type AccountSession,
} from '../lib/accountClient';
import {
  activateAccountWorkspace,
  clearActiveLocalWorkspace,
  saveAccountWorkspace,
} from '../lib/accountWorkspace';

type AuthMode = 'login' | 'register';
type Notice = { type: 'success' | 'error'; message: string };

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = normalizeNextPath(searchParams.get('next'));
  const [session, setSession] = React.useState<AccountSession | null>(() => getStoredAccountSession());
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [email, setEmail] = React.useState(() => session?.user.email || '');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const title = mode === 'login' ? '欢迎回来' : '创建星轨账户';
  const subtitle = mode === 'login'
    ? '登录后继续你的塔罗记录。'
    : '邮箱和密码即可开始。';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setNotice(null);
    const previousSession = getStoredAccountSession();
    try {
      const nextSession = mode === 'login'
        ? await loginAccount({ email, password })
        : await registerAccount({ email, password, displayName });
      const activation = await activateAccountWorkspace(nextSession, previousSession);
      setSession(nextSession);
      setPassword('');
      setNotice({
        type: 'success',
        message: getActivationMessage(mode, activation.source),
      });
      window.setTimeout(() => {
        window.location.href = nextPath;
      }, 520);
    } catch (error: any) {
      setNotice({
        type: 'error',
        message: error?.message || '账户请求失败，请稍后再试。',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchAccount = () => {
    if (session) saveAccountWorkspace(session.user.id);
    clearAccountSession();
    clearActiveLocalWorkspace();
    setSession(null);
    setPassword('');
    setNotice(null);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07080d] px-5 py-5 text-[#fff9ed] selection:bg-[#f4cf83] selection:text-[#0b0910] sm:px-8">
      <img
        src="/details-new.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-48 saturate-[1.05]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_16%,rgba(244,207,131,0.18),transparent_32%),linear-gradient(115deg,rgba(5,6,12,0.98)_0%,rgba(5,6,12,0.9)_45%,rgba(5,6,12,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px] opacity-30" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-40px)] w-full max-w-5xl flex-col">
        <nav className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/12 bg-white/[0.075] px-4 text-sm font-bold text-[#fff7e9] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl transition hover:border-[#f4cf83]/45"
          >
            <ArrowLeft size={17} />
            返回详情
          </button>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f4cf83]/25 bg-[#f4cf83]/12 px-3 py-2 text-sm font-black text-[#ffe0a0] backdrop-blur-2xl">
            <Sparkles size={16} />
            星轨 AstroRail
          </div>
        </nav>

        <section className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
            className="mx-auto w-full max-w-[430px] rounded-[34px] border border-white/14 bg-[#111520]/82 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-3xl"
          >
            {session ? (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f4cf83]/30 bg-[#f4cf83]/12 text-[#f4cf83]">
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-black text-[#fffaf0]">{session.user.displayName}</div>
                    <div className="mt-1 truncate text-sm text-[#cfc6b5]">{session.user.email}</div>
                  </div>
                </div>
                <div className="mt-5 rounded-[24px] border border-white/10 bg-black/18 p-4 text-sm leading-7 text-[#d8cfbf]">
                  已登录。现在进入应用后，可以在“设置”里同步或恢复云端存档。
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = nextPath;
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4cf83] px-5 py-3 text-sm font-black text-[#0b0910] shadow-[0_16px_44px_rgba(244,207,131,0.24)] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0]"
                  >
                    进入应用
                    <ArrowRight size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchAccount}
                    className="rounded-full border border-white/12 bg-white/[0.075] px-5 py-3 text-sm font-bold text-[#fff7e9] transition hover:border-[#f4cf83]/45"
                  >
                    切换账户
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f4cf83]/28 bg-[#f4cf83]/12 text-[#f4cf83]">
                    <Sparkles size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl font-black text-[#fffaf0]">星轨账户</div>
                    <div className="mt-0.5 text-xs text-[#cfc6b5]">邮箱登录 · 自动保留存档</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-black/18 p-1">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`rounded-full py-2.5 text-sm font-black transition ${mode === 'login' ? 'bg-[#f4cf83] text-[#0b0910]' : 'text-[#cfc6b5] hover:text-[#fff7e9]'}`}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`rounded-full py-2.5 text-sm font-black transition ${mode === 'register' ? 'bg-[#f4cf83] text-[#0b0910]' : 'text-[#cfc6b5] hover:text-[#fff7e9]'}`}
                  >
                    注册
                  </button>
                </div>

                <div className="mt-5">
                  <h2 className="text-xl font-black text-[#fffaf0]">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#cfc6b5]">{subtitle}</p>
                </div>

                <div className="mt-5 space-y-3">
                  {mode === 'register' && (
                    <AuthInput
                      icon={<UserRound size={17} />}
                      value={displayName}
                      onChange={setDisplayName}
                      placeholder="昵称，例如：星轨旅人"
                      autoComplete="nickname"
                    />
                  )}
                  <AuthInput
                    icon={<Mail size={17} />}
                    value={email}
                    onChange={setEmail}
                    placeholder="邮箱"
                    type="email"
                    autoComplete="email"
                  />
                  <AuthInput
                    icon={<KeyRound size={17} />}
                    value={password}
                    onChange={setPassword}
                    placeholder="密码，至少 8 位"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>

                {notice && (
                  <div
                    className={`mt-4 flex items-start gap-2 rounded-[22px] border px-3 py-2 text-xs leading-relaxed ${
                      notice.type === 'error'
                        ? 'border-red-400/25 bg-red-400/10 text-red-200'
                        : 'border-[#f4cf83]/25 bg-[#f4cf83]/10 text-[#ffe6ae]'
                    }`}
                  >
                    {notice.type === 'error' ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
                    <span>{notice.message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !email.trim() || password.length < 8}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f4cf83] px-5 py-3.5 text-sm font-black text-[#0b0910] shadow-[0_16px_44px_rgba(244,207,131,0.24)] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
                >
                  {busy ? (
                    <>
                      <Loader2 size={17} className="animate-spin" />
                      处理中
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? '登录进入应用' : '创建并进入应用'}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-xs leading-5 text-[#a89f91]">
                  暂时只支持邮箱账户。
                </p>
              </form>
            )}
          </motion.div>
        </section>
      </div>
    </main>
  );
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
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith('/app') ? decoded : '/app';
  } catch {
    return value.startsWith('/app') ? value : '/app';
  }
}

function AuthInput({
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: React.HTMLInputTypeAttribute;
  autoComplete?: string;
}) {
  return (
    <label className="flex min-h-[54px] items-center gap-3 rounded-[22px] border border-white/12 bg-[#090b12]/72 px-4 text-[#d6ccbc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition focus-within:border-[#f4cf83]/55 focus-within:text-[#f4cf83]">
      <span className="shrink-0">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#fffaf0] outline-none placeholder:text-[#8d8790]"
      />
    </label>
  );
}
