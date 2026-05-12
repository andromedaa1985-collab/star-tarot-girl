import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Gem,
  Moon,
  Shield,
  Sparkles,
  Stars,
  WandSparkles
} from 'lucide-react';

const featureCards = [
  {
    title: '塔罗陪伴',
    copy: '把问题说出来，星轨少女会抽牌、解释、追问，不只给结论。',
    icon: Sparkles,
    path: '/app'
  },
  {
    title: '八字洞察',
    copy: '出生信息沉淀成个人档案，适合做每日运势和长期复访。',
    icon: Compass,
    path: '/app/bazi'
  },
  {
    title: '星轨日记',
    copy: '记录每天的心情、梦境和选择，让星轨慢慢读懂你。',
    icon: BookOpen,
    path: '/app/diary'
  },
  {
    title: '守护灵',
    copy: '需要被听见的时候，她会在这里陪你整理心里的结。',
    icon: Shield,
    path: '/app/guardian'
  }
];

const proofPoints = [
  ['3 次', '每日星轨指引'],
  ['4 种', '塔罗/八字/日记/守护'],
  ['1 位', '专属星轨少女']
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07070b] text-[#f8f3e7] selection:bg-[#d7b46a] selection:text-[#09080d]">
      <Hero onEnter={() => navigate('/app')} />
      <section className="border-y border-white/10 bg-[#0d0b14] px-5 py-4 sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 sm:gap-4">
          {proofPoints.map(([value, label]) => (
            <div key={label} className="border border-white/10 bg-white/[0.04] p-3 text-center sm:p-5">
              <div className="text-xl font-black text-[#f4cf83] sm:text-3xl">{value}</div>
              <div className="mt-1 text-xs text-[#b9ad96] sm:text-sm">{label}</div>
            </div>
          ))}
        </div>
      </section>
      <Features onOpen={(path) => navigate(path)} />
      <RevenuePath onEnter={() => navigate('/app')} />
    </main>
  );
}

function Hero({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative min-h-[92svh] overflow-hidden px-5 pb-16 pt-5 sm:px-8 lg:px-12">
      <img
        src="/details-new.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-45 saturate-[0.9]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#07070b_0%,rgba(7,7,11,0.96)_28%,rgba(7,7,11,0.72)_58%,rgba(7,7,11,0.9)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(244,207,131,0.20),transparent_32%),linear-gradient(180deg,transparent_0%,#07070b_100%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f4cf83]/70 to-transparent" />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-white/10 py-4">
        <button onClick={onEnter} className="flex min-w-0 items-center gap-3 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#f4cf83]/40 bg-[#f4cf83]/10">
            <Moon size={19} className="text-[#f4cf83]" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-black leading-none sm:text-xl">星轨 AstroRail</span>
            <span className="mt-1 block text-xs text-[#b9ad96]">AI 塔罗陪伴工作台</span>
          </span>
        </button>
        <button
          onClick={onEnter}
          className="hidden shrink-0 rounded-lg bg-[#f4cf83] px-4 py-2 text-sm font-black text-[#0b0910] shadow-[0_12px_40px_rgba(244,207,131,0.25)] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0] sm:inline-flex sm:px-5"
        >
          进入应用
        </button>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-[#f4cf83]/30 bg-[#f4cf83]/10 px-3 py-2 text-sm text-[#f4cf83]">
            <Stars size={16} />
            给迷茫的人一个愿意每天打开的答案入口
          </div>
          <h1 className="text-5xl font-black leading-[1.02] text-[#fffaf0] sm:text-7xl lg:text-8xl">
            <span className="block">星轨</span>
            <span className="block">AstroRail</span>
          </h1>
          <p className="mt-6 max-w-[21rem] text-lg font-semibold leading-8 text-[#d8cbb3] sm:max-w-2xl sm:text-2xl">
            一位会抽牌、会追问、会记住你的 AI 塔罗少女。当你不知道怎么选，她会陪你把心里的雾慢慢拨开。
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onEnter}
              className="inline-flex w-full max-w-[21rem] items-center justify-center gap-2 rounded-lg bg-[#f4cf83] px-6 py-4 text-base font-black text-[#0b0910] shadow-[0_18px_55px_rgba(244,207,131,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0] sm:w-auto"
            >
              先体验一次
              <ArrowRight size={19} />
            </button>
            <a
              href="#features"
              className="inline-flex w-full max-w-[21rem] items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] px-6 py-4 text-base font-bold text-[#f8f3e7] transition hover:border-[#f4cf83]/50 hover:bg-[#f4cf83]/10 sm:w-auto"
            >
              了解玩法
            </a>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="absolute -left-8 top-10 h-72 w-72 rounded-full border border-[#f4cf83]/15" />
          <div className="absolute left-10 top-24 h-56 w-56 rounded-full border border-white/10" />
          <div className="relative ml-auto max-w-sm border border-white/12 bg-[#101019]/85 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-sm font-bold text-[#f4cf83]">今日星轨</span>
              <span className="rounded bg-[#f4cf83]/12 px-2 py-1 text-xs text-[#f4cf83]">LV.1</span>
            </div>
            <div className="py-5">
              <img
                src="/default-card.png"
                alt=""
                className="mx-auto h-56 w-40 object-cover shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
              />
            </div>
            <div className="border border-white/10 bg-black/25 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#fffaf0]">
                <WandSparkles size={16} className="text-[#f4cf83]" />
                你的问题正在成形
              </div>
              <p className="text-sm leading-6 text-[#c9bea8]">
                先不要急着问答案。把困惑说清楚，星轨才会给你更贴近当下的指引。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features({ onOpen }: { onOpen: (path: string) => void }) {
  return (
    <section id="features" className="px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 text-sm font-bold text-[#f4cf83]">星轨玩法</div>
            <h2 className="text-4xl font-black text-[#fffaf0] sm:text-5xl">把困惑交给星轨，把答案慢慢照亮。</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#b9ad96]">
            从一次塔罗开始，进入八字、沙盘、日记和守护陪伴。你不需要懂命理，只需要把问题说出来。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.title}
                onClick={() => onOpen(feature.path)}
                className="group min-h-64 border border-white/10 bg-white/[0.045] p-5 text-left transition hover:-translate-y-1 hover:border-[#f4cf83]/50 hover:bg-[#f4cf83]/10"
              >
                <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-lg border border-[#f4cf83]/25 bg-[#f4cf83]/10 text-[#f4cf83]">
                  <Icon size={22} />
                </div>
                <h3 className="text-2xl font-black text-[#fffaf0]">{feature.title}</h3>
                <p className="mt-4 text-sm leading-6 text-[#b9ad96]">{feature.copy}</p>
                <div className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#f4cf83] opacity-80 transition group-hover:opacity-100">
                  打开
                  <ArrowRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RevenuePath({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="ritual" className="px-5 pb-24 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border border-[#f4cf83]/25 bg-[#f4cf83]/10 p-7">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#f4cf83] text-[#0b0910]">
            <Gem size={22} />
          </div>
          <h2 className="text-3xl font-black text-[#fffaf0] sm:text-4xl">开始你的星轨仪式</h2>
          <p className="mt-5 text-base leading-7 text-[#d8cbb3]">
            在这里，你可以问一个正在困扰你的问题，也可以记录今天的心情。星轨会把牌面、命理和你的表达放在一起，给出一段更靠近你的回答。
          </p>
          <button
            onClick={onEnter}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#f4cf83] px-5 py-3 font-black text-[#0b0910] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0]"
          >
            现在去体验
            <ArrowRight size={18} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['提问', '把你正在纠结的事说出来，不需要组织得很完美。'],
            ['抽牌', '选择单张指引、圣三角、爱情十字或事业岔路。'],
            ['沉淀', '把重要解读写进日记，让星轨陪你看见变化。']
          ].map(([title, copy]) => (
            <div key={title} className="border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-8 text-sm font-bold text-[#f4cf83]">{title}</div>
              <p className="text-sm leading-6 text-[#c9bea8]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
