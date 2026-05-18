import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Gem,
  History,
  Moon,
  Shield,
  Sparkles,
  Stars,
  WandSparkles,
} from 'lucide-react';

const featureCards = [
  {
    title: '塔罗陪伴',
    copy: '把问题说出来，星轨会抽牌、追问、记录，不急着给你一个粗糙结论。',
    icon: Sparkles,
    path: '/app',
  },
  {
    title: '八字洞察',
    copy: '出生信息沉淀成个人档案，适合做每日运势和长期复盘。',
    icon: Compass,
    path: '/app/bazi',
  },
  {
    title: '星轨日记',
    copy: '记录心情、梦境和选择，让每一次表达都能被温柔接住。',
    icon: BookOpen,
    path: '/app/diary',
  },
  {
    title: '守护来信',
    copy: '需要被听见的时候，她会帮你把心里的结慢慢拆开。',
    icon: Shield,
    path: '/app/guardian',
  },
];

const proofPoints = [
  ['3 次', '每日免费指引'],
  ['4 种', '塔罗 / 八字 / 日记 / 守护'],
  ['1 位', '专属星轨少女'],
];

const ritualSteps = [
  ['提问', '把正在纠结的事说出来，不需要组织得很完美。'],
  ['抽牌', '选择单张指引、圣三角、爱情十字或事业岔路。'],
  ['沉淀', '把重要解读写进日记，让星轨陪你看见变化。'],
];

export default function Landing() {
  const navigate = useNavigate();
  const openAuth = React.useCallback(
    (nextPath = '/app') => navigate(`/auth?next=${encodeURIComponent(nextPath)}`),
    [navigate],
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07080d] text-[#fff9ed] selection:bg-[#f4cf83] selection:text-[#0b0910]">
      <Hero onEnter={() => openAuth('/app')} />
      <section className="relative border-y border-white/10 bg-[#090a12]/82 px-5 py-4 backdrop-blur-2xl sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 sm:gap-4">
          {proofPoints.map(([value, label]) => (
            <div
              key={label}
              className="rounded-[26px] border border-white/12 bg-white/[0.075] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl sm:p-5"
            >
              <div className="text-xl font-black text-[#f4cf83] sm:text-3xl">{value}</div>
              <div className="mt-1 text-xs text-[#cfc6b5] sm:text-sm">{label}</div>
            </div>
          ))}
        </div>
      </section>
      <Features onOpen={(path) => openAuth(path)} />
      <CompanionLooks />
      <RevenuePath onEnter={() => openAuth('/app')} />
    </main>
  );
}

function Hero({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative min-h-[92svh] overflow-hidden px-5 pb-20 pt-5 sm:px-8 lg:px-12">
      <img
        src="/details-new.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-72 saturate-[1.05]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,12,0.98)_0%,rgba(5,6,12,0.92)_36%,rgba(5,6,12,0.48)_68%,rgba(5,6,12,0.84)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,13,0.08)_0%,rgba(7,8,13,0.16)_58%,#07080d_100%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f4cf83]/70 to-transparent" />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-white/12 bg-white/[0.075] px-3 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl">
        <button onClick={onEnter} className="flex min-w-0 items-center gap-3 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#f4cf83]/34 bg-[#f4cf83]/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
            <Moon size={19} className="text-[#f4cf83]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-black leading-none sm:text-xl">星轨 AstroRail</span>
            <span className="mt-1 block truncate text-xs text-[#d0c7b8]">AI 塔罗陪伴工作台</span>
          </span>
        </button>
        <button
          onClick={onEnter}
          className="hidden shrink-0 rounded-full bg-[#f4cf83] px-5 py-2.5 text-sm font-black text-[#0b0910] shadow-[0_14px_42px_rgba(244,207,131,0.24)] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0] sm:inline-flex"
        >
          进入应用
        </button>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:pt-24">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-[#f4cf83]/28 bg-[#f4cf83]/12 px-3.5 py-2 text-sm font-semibold text-[#ffe0a0] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
            <Stars size={16} />
            <span className="truncate">给迷茫的人一个愿意每天打开的答案入口</span>
          </div>
          <h1 className="text-5xl font-black leading-[1.02] text-[#fffaf0] sm:text-7xl lg:text-8xl">
            <span className="block">星轨</span>
            <span className="block">AstroRail</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg font-semibold leading-8 text-[#eadfcc] sm:text-2xl">
            一位会抽牌、会追问、会记住你的 AI 塔罗少女。当你不知道怎么选，她会陪你把心里的雾慢慢拨开。
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onEnter}
              className="inline-flex w-full max-w-[21rem] items-center justify-center gap-2 rounded-full bg-[#f4cf83] px-6 py-4 text-base font-black text-[#0b0910] shadow-[0_18px_55px_rgba(244,207,131,0.24)] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0] sm:w-auto"
            >
              先体验一次
              <ArrowRight size={19} />
            </button>
            <a
              href="#features"
              className="inline-flex w-full max-w-[21rem] items-center justify-center rounded-full border border-white/15 bg-white/[0.08] px-6 py-4 text-base font-bold text-[#fff7e9] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl transition hover:border-[#f4cf83]/50 hover:bg-[#f4cf83]/12 sm:w-auto"
            >
              了解玩法
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[430px] lg:ml-auto">
          <div className="absolute -inset-10 rounded-[54px] border border-white/8 bg-white/[0.035] backdrop-blur-[2px]" />
          <div className="relative overflow-hidden rounded-[40px] border border-white/14 bg-[#121521]/62 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-3xl">
            <div className="flex items-center justify-between border-b border-white/10 px-1 pb-3">
              <span className="text-sm font-bold text-[#f4cf83]">今日星轨</span>
              <span className="rounded-full border border-[#f4cf83]/24 bg-[#f4cf83]/12 px-3 py-1 text-xs font-bold text-[#f4cf83]">
                LV.1
              </span>
            </div>

            <div className="relative mt-5 aspect-square overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.035))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <img
                src="/detail-card-hero.png"
                alt="星轨塔罗少女"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,244,210,0.16),transparent_34%),linear-gradient(180deg,rgba(9,12,22,0)_62%,rgba(9,12,22,0.45)_100%)]" />
            </div>

            <div className="mt-4 rounded-[28px] border border-white/12 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#fffaf0]">
                <WandSparkles size={16} className="text-[#f4cf83]" />
                你的问题正在成形
              </div>
              <p className="text-sm leading-6 text-[#d5c9b6]">
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
            <h2 className="max-w-3xl text-4xl font-black leading-tight text-[#fffaf0] sm:text-5xl">
              把困惑交给星轨，把答案慢慢照亮。
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#cfc6b5]">
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
                className="group min-h-64 rounded-[30px] border border-white/12 bg-white/[0.07] p-5 text-left shadow-[0_18px_54px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl transition hover:-translate-y-1 hover:border-[#f4cf83]/44 hover:bg-[#f4cf83]/12"
              >
                <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-[20px] border border-[#f4cf83]/25 bg-[#f4cf83]/12 text-[#f4cf83]">
                  <Icon size={22} />
                </div>
                <h3 className="text-2xl font-black text-[#fffaf0]">{feature.title}</h3>
                <p className="mt-4 text-sm leading-6 text-[#cfc6b5]">{feature.copy}</p>
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

function CompanionLooks() {
  return (
    <section className="px-5 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-4 overflow-hidden rounded-[38px] border border-white/12 bg-white/[0.065] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl lg:grid-cols-[0.9fr_1.1fr] lg:p-5">
        <div className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-black/18 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f4cf83]/24 bg-[#f4cf83]/12 px-3 py-1.5 text-sm font-bold text-[#f4cf83]">
              <Sparkles size={15} />
              星轨衣柜预览
            </div>
            <h2 className="text-3xl font-black leading-tight text-[#fffaf0] sm:text-4xl">
              同一位星轨少女，多种陪伴形态。
            </h2>
            <p className="mt-4 text-base leading-7 text-[#cfc6b5]">
              从光羽礼服到星斗斗篷，她会随着羁绊成长解锁新的样子。每套形象都保留熟悉的温柔，只换一种靠近你的方式。
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs font-bold text-[#eadfcc]">
            {['月白神谕', '午夜星斗篷', '学院占星', '液态玻璃礼装'].map((label) => (
              <div key={label} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-center">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#f4f0e8]">
          <img
            src="/companion-outfit-sheet.png"
            alt="星轨塔罗少女多套形象设定"
            className="h-full min-h-[280px] w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}

function RevenuePath({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="ritual" className="px-5 pb-24 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[34px] border border-[#f4cf83]/24 bg-[#f4cf83]/12 p-7 shadow-[0_18px_54px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[20px] bg-[#f4cf83] text-[#0b0910]">
            <Gem size={22} />
          </div>
          <h2 className="text-3xl font-black text-[#fffaf0] sm:text-4xl">开始你的星轨仪式</h2>
          <p className="mt-5 text-base leading-7 text-[#eadfcc]">
            在这里，你可以问一个正在困扰你的问题，也可以记录今天的心情。星轨会把牌面、命理和你的表达放在一起，给出一段更靠近你的回答。
          </p>
          <button
            onClick={onEnter}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f4cf83] px-5 py-3 font-black text-[#0b0910] transition hover:-translate-y-0.5 hover:bg-[#ffe0a0]"
          >
            现在去体验
            <ArrowRight size={18} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {ritualSteps.map(([title, copy], index) => (
            <div
              key={title}
              className="rounded-[30px] border border-white/12 bg-white/[0.065] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-2xl"
            >
              <div className="mb-8 flex items-center justify-between gap-3 text-sm font-bold text-[#f4cf83]">
                <span>{title}</span>
                {index === 0 ? <Stars size={15} /> : index === 1 ? <History size={15} /> : <Sparkles size={15} />}
              </div>
              <p className="text-sm leading-6 text-[#cfc6b5]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
