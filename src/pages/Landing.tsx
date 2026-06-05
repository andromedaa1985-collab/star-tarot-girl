import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  Compass,
  Download,
  HeartHandshake,
  MessageCircleHeart,
  MoonStar,
  ShieldCheck,
  Sparkles,
  Star,
  WandSparkles,
  Zap,
} from 'lucide-react';

const proofPoints = [
  { value: '1 张', label: '每天的主牌' },
  { value: '4 步', label: '抽牌、深解、记录、复盘' },
  { value: '云端', label: '账号存档同步' },
];

const productScenes = [
  {
    title: '每日运势',
    kicker: '主产品',
    copy: '每天先抽一张牌，不急着展开所有人生问题，只把今天最该看清的一件事讲明白。',
    icon: Sparkles,
  },
  {
    title: '今日深解',
    kicker: 'Plus',
    copy: '当你真的想继续往下看，再展开情绪、关系、工作节奏和晚间回看。',
    icon: WandSparkles,
  },
  {
    title: '命运日记',
    kicker: '复盘',
    copy: '把当天的心情和选择留下来，之后回头看，会知道自己是怎么慢慢变清楚的。',
    icon: BookOpen,
  },
  {
    title: '云端账户',
    kicker: '安全感',
    copy: '登录后保留牌迹、能量、会员和记录，换设备也能继续接上。',
    icon: Cloud,
  },
];

const ritualSteps = [
  ['先问今天', '不用组织得很完整，说出现在最卡的点就够了。'],
  ['抽一张主牌', '星轨先给一个短而准的今日方向，不把内容一次讲满。'],
  ['需要再深解', '想继续看时，再展开更细的关系、节奏和行动提醒。'],
  ['晚上回看', '把今天发生的事记下来，形成自己的牌迹档案。'],
];

const trustItems = [
  '只在你允许时参考旧记录',
  '不把建议说成绝对命运',
  '每日先给短指引，深解再展开',
  '登录后换设备也能接回存档',
];

const LANDING_INTRO_STORAGE_KEY = 'railstar_landing_intro_seen_v1';

function markLandingIntroSeen() {
  try {
    window.localStorage.setItem(LANDING_INTRO_STORAGE_KEY, '1');
  } catch {
    // Ignore private-mode storage errors; navigation should still work.
  }
}

export default function Landing() {
  const navigate = useNavigate();
  const openAuth = React.useCallback((nextPath = '/app') => {
    markLandingIntroSeen();
    navigate(`/auth?next=${encodeURIComponent(nextPath)}`);
  }, [navigate]);

  return (
    <main className="h-full min-h-screen overflow-y-auto bg-[#f5f7fb] text-[#151821] selection:bg-[#91e6f2] selection:text-[#081016]">
      <Hero onEnter={() => openAuth('/app')} />
      <ProofStrip />
      <ProductFocus onEnter={() => openAuth('/app')} />
      <UsePath onEnter={() => openAuth('/app')} />
      <TrustAndDownload onEnter={() => openAuth('/app')} />
    </main>
  );
}

function Hero({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative min-h-[88svh] overflow-hidden px-5 pb-14 pt-4 sm:px-8 lg:px-12">
      <img
        src="/railstar-app-icon-no-text.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-95"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(246,248,253,0.94)_0%,rgba(246,248,253,0.78)_38%,rgba(246,248,253,0.18)_78%,rgba(246,248,253,0.64)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_42%,rgba(114,91,255,0.20),transparent_36%),radial-gradient(circle_at_18%_82%,rgba(31,179,196,0.22),transparent_34%)]" />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 py-3">
        <button type="button" onClick={onEnter} className="flex min-w-0 items-center gap-3 text-left">
          <img
            src="/details-new.png"
            alt=""
            className="h-12 w-12 shrink-0 rounded-[16px] shadow-[0_12px_32px_rgba(83,78,145,0.18)]"
          />
          <span className="min-w-0">
            <span className="block truncate text-base font-black text-[#1b2130]">星轨 Railstar</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-[#606a7f]">塔罗少女陪你过今天</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onEnter}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#151821] px-4 py-2.5 text-sm font-black text-white shadow-[0_16px_36px_rgba(21,24,33,0.18)] transition hover:-translate-y-0.5 hover:bg-[#252a38]"
        >
          打开应用
          <ArrowRight size={16} />
        </button>
      </nav>

      <div className="relative z-10 mx-auto flex min-h-[calc(88svh-92px)] max-w-6xl flex-col justify-end pb-4">
        <div className="max-w-4xl">
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[#6f61ff]/20 bg-white/70 px-3.5 py-2 text-sm font-black text-[#5b4fe0] shadow-[0_12px_40px_rgba(91,79,224,0.10)] backdrop-blur-2xl">
            <MoonStar size={16} />
            <span className="truncate">一张牌，不替你决定人生，只陪你看清今天</span>
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.06] tracking-[0] text-[#121620] sm:text-6xl lg:text-7xl">
            每天抽一张牌，
            <br />
            把今天过清楚一点。
          </h1>
          <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-[#4e596d] sm:text-xl">
            星轨是一款 AI 塔罗陪伴 App。它把每日运势做成主入口：短一点、准一点、温柔一点；当你想继续看，再进入今日深解、日记复盘和云端档案。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onEnter}
              className="inline-flex w-full max-w-[22rem] items-center justify-center gap-2 rounded-full bg-[#151821] px-6 py-4 text-base font-black text-white shadow-[0_18px_46px_rgba(21,24,33,0.22)] transition hover:-translate-y-0.5 hover:bg-[#252a38] sm:w-auto"
            >
              先抽今日运势
              <Sparkles size={18} />
            </button>
            <a
              href="#focus"
              className="inline-flex w-full max-w-[22rem] items-center justify-center rounded-full border border-[#151821]/12 bg-white/70 px-6 py-4 text-base font-black text-[#151821] shadow-[0_14px_42px_rgba(82,92,126,0.12)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-[#6f61ff]/28 hover:bg-white sm:w-auto"
            >
              看看值不值得用
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="border-y border-[#dce3ef] bg-white/72 px-5 py-4 backdrop-blur-2xl sm:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 sm:gap-4">
        {proofPoints.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-xl font-black text-[#151821] sm:text-3xl">{item.value}</div>
            <div className="mt-1 text-xs font-semibold text-[#667085] sm:text-sm">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductFocus({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="focus" className="px-5 py-18 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eaf8fb] px-3 py-1.5 text-sm font-black text-[#087a8f]">
              <Compass size={15} />
              围绕每日运势重新组织
            </div>
            <h2 className="max-w-xl text-3xl font-black leading-tight text-[#151821] sm:text-5xl">
              它不是占卜大全，是每天愿意打开一次的情绪入口。
            </h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-[#5d6678]">
              先给一个克制的今日方向，不把所有内容一次讲满；真正需要的时候，再把深解、日记和复盘接上。这样免费体验不会臃肿，付费点也更自然。
            </p>
            <button
              type="button"
              onClick={onEnter}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#6f61ff] px-5 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(111,97,255,0.26)] transition hover:-translate-y-0.5 hover:bg-[#5d51df]"
            >
              体验这条路径
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {productScenes.map((scene) => {
              const Icon = scene.icon;
              return (
                <article
                  key={scene.title}
                  className="rounded-[28px] border border-[#dde4ef] bg-white p-5 shadow-[0_18px_50px_rgba(82,92,126,0.10)]"
                >
                  <div className="mb-10 flex items-center justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#f2f0ff] text-[#6f61ff]">
                      <Icon size={22} />
                    </div>
                    <span className="rounded-full bg-[#f5f7fb] px-3 py-1 text-xs font-black text-[#667085]">
                      {scene.kicker}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-[#151821]">{scene.title}</h3>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#667085]">{scene.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function UsePath({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative isolate overflow-hidden bg-[#111622] px-5 pb-36 pt-28 text-white sm:px-8 sm:pb-40 sm:pt-36 lg:px-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-48 bg-[linear-gradient(180deg,#f5f7fb_0%,rgba(245,247,251,0.78)_30%,rgba(17,22,34,0.68)_76%,rgba(17,22,34,0)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-56 bg-[linear-gradient(180deg,rgba(17,22,34,0)_0%,rgba(26,35,52,0.92)_34%,rgba(111,97,255,0.10)_66%,#f5f7fb_100%)]"
      />
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-sm font-black text-[#91e6f2]">
              <MessageCircleHeart size={15} />
              真实使用路径
            </div>
            <h2 className="max-w-3xl text-3xl font-black leading-tight sm:text-5xl">
              从“我今天有点乱”，到“我知道先做什么”。
            </h2>
          </div>
          <p className="max-w-lg text-base font-semibold leading-7 text-[#b9c2d4]">
            详情页不用堆功能，用户只需要看懂第一件事：星轨能把当下的混乱，变成一个今天能执行的小动作。
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {ritualSteps.map(([title, copy], index) => (
              <article
                key={title}
                className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                <div className="mb-8 flex items-center justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#91e6f2] text-sm font-black text-[#081016]">
                    {index + 1}
                  </span>
                  {index === 0 ? <Sparkles size={18} className="text-[#91e6f2]" /> : index === 1 ? <Star size={18} className="text-[#91e6f2]" /> : index === 2 ? <Zap size={18} className="text-[#91e6f2]" /> : <BookOpen size={18} className="text-[#91e6f2]" />}
                </div>
                <h3 className="text-xl font-black">{title}</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#b9c2d4]">{copy}</p>
              </article>
            ))}
          </div>

          <div className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="relative overflow-hidden rounded-[26px] bg-[#070b16] p-3">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(244,207,131,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(111,97,255,0.20),transparent_30%)]" />
              <img
                src="/landing/daily-share-preview.jpg"
                alt="星轨牌迹分享图预览"
                className="relative mx-auto aspect-[9/16] max-h-[570px] w-full max-w-[360px] rounded-[22px] object-cover shadow-[0_22px_60px_rgba(0,0,0,0.34)]"
              />
              <button
                type="button"
                onClick={onEnter}
                className="relative mx-auto mt-4 inline-flex w-full max-w-[360px] items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-black text-[#151821] shadow-[0_16px_38px_rgba(0,0,0,0.22)]"
              >
                去生成我的今日牌迹
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustAndDownload({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="px-5 py-18 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fff3d8] px-3 py-1.5 text-sm font-black text-[#9b650d]">
            <ShieldCheck size={15} />
            不玄乎的安全感
          </div>
          <h2 className="max-w-xl text-3xl font-black leading-tight text-[#151821] sm:text-5xl">
            温柔，但不装神秘。陪伴，但不越界。
          </h2>
          <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-[#5d6678]">
            星轨适合那些不想被一句“命运如此”糊弄的人。它更像一个每天陪你整理情绪的小工具：有仪式感，也有边界感。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {trustItems.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-[24px] border border-[#dde4ef] bg-white p-4 shadow-[0_14px_34px_rgba(82,92,126,0.09)]">
              <CheckCircle2 className="shrink-0 text-[#17a7b8]" size={20} />
              <span className="text-sm font-black text-[#273041]">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-6xl rounded-[34px] bg-[linear-gradient(135deg,#151821,#2d2767_48%,#087a8f)] p-6 text-white shadow-[0_24px_80px_rgba(21,24,33,0.24)] sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/12">
              <Download size={22} />
            </div>
            <h2 className="text-3xl font-black sm:text-4xl">准备好，把今天交给一张牌。</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/74">
              先从每日运势开始。喜欢它，再让星轨继续记住你的牌迹、日记和选择。
            </p>
          </div>
          <button
            type="button"
            onClick={onEnter}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-base font-black text-[#151821] shadow-[0_16px_42px_rgba(255,255,255,0.18)] transition hover:-translate-y-0.5 md:w-auto"
          >
            进入星轨
            <HeartHandshake size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
