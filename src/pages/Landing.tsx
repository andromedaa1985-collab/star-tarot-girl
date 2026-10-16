import React from 'react';
import { TAROT_CARDS, resolveTarotArtwork } from '../lib/tarotDeck';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Moon, Sparkles, Sun } from 'lucide-react';
import { markLandingIntroSeen } from '../lib/landingIntro';
import { useAppContext } from '../store';

const ritualSteps = [
  {
    title: '把今天放在心上',
    copy: '从一个问题、一种心情，或一张今日牌开始。不必先把所有事想明白。',
  },
  {
    title: '慢慢读懂一张牌',
    copy: '先看简短的今日指引。还想聊聊时，再追问你的关系、工作和选择。',
  },
  {
    title: '留下自己的答案',
    copy: '把当下的感受记进日记。回头看，你会看见那些微小但真实的变化。',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { theme, setTheme } = useAppContext();
  const enterApp = React.useCallback(() => {
    markLandingIntroSeen();
    navigate('/app');
  }, [navigate]);

  return (
    <main className="h-full overflow-y-auto bg-apple-bg pt-[var(--app-safe-top)] pb-[var(--app-safe-bottom)] font-sans text-apple-text">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4 border-b border-apple-border py-5 sm:py-7">
          <a href="#top" aria-label="塔罗少女首页" className="flex items-center gap-3">
            <Sparkles size={24} aria-hidden="true" className="text-apple-accent" />
            <span>
              <span className="block font-serif text-2xl font-semibold leading-8">塔罗少女</span>
              <span className="rail-muted block">Tarot Girl · 少女塔罗</span>
            </span>
          </a>
          <nav aria-label="首页导航" className="flex items-center gap-2 sm:gap-5">
            <a href="#ritual" className="hidden min-h-12 items-center text-sm text-apple-text-muted hover:text-apple-text sm:inline-flex">如何开始</a>
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`切换至${theme === 'dark' ? '浅色' : '深色'}模式`} className="inline-flex size-12 items-center justify-center rounded-xl text-apple-text-muted hover:bg-apple-surface-hover">
              {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => { markLandingIntroSeen(); navigate('/auth?next=/app'); }} className="rail-button-secondary px-4">登录</button>
          </nav>
        </header>

        <section id="top" aria-labelledby="landing-title" className="grid gap-10 py-12 sm:gap-14 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="rail-eyebrow mb-5 flex items-center gap-2 text-sm"><span aria-hidden="true" className="h-px w-8 bg-apple-accent" />每天一点，和自己相遇</p>
            <h1 id="landing-title" className="text-balance font-serif text-4xl font-medium leading-[1.4] sm:text-5xl lg:text-6xl lg:leading-[1.35]">
              给今天，<br />留一点星光。
            </h1>
            <p className="rail-body mt-6 max-w-[30rem] text-pretty text-apple-text-muted sm:mt-8">
              抽一张牌，和塔罗少女聊聊此刻的心情。<br className="hidden sm:block" />让散乱的思绪，慢慢变成今天可以走的一小步。
            </p>
            <div className="mt-8 flex flex-col items-start gap-4 sm:mt-10 sm:flex-row sm:items-center">
              <button type="button" onClick={enterApp} className="rail-button w-full sm:w-auto">抽一张今日牌<ArrowRight size={18} aria-hidden="true" /></button>
              <a href="#ritual" className="inline-flex min-h-12 items-center gap-2 text-sm text-apple-text-muted hover:text-apple-text">认识塔罗少女<ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <p className="rail-muted mt-4">今日单张牌可免费体验 · 无需先登录</p>
          </div>
          <figure className="mx-auto w-full max-w-[440px] lg:justify-self-end">
            <div className="overflow-hidden rounded-t-[44%] rounded-b-3xl border border-apple-border bg-apple-surface p-2 sm:p-3">
              <img src="/detail-card-hero.png" alt="塔罗少女站在星空与塔罗牌之间，等待与你相遇" width="1254" height="1254" fetchPriority="high" className="aspect-[4/5] w-full rounded-t-[44%] rounded-b-2xl object-cover object-center" />
            </div>
            <figcaption className="mt-4 flex items-center justify-between gap-4 px-1">
              <span className="font-serif text-base">有星光，也有你的答案。</span>
              <span className="rail-muted shrink-0">塔罗少女</span>
            </figcaption>
          </figure>
        </section>

        <section id="ritual" aria-labelledby="ritual-title" className="grid gap-10 border-t border-apple-border py-14 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="rail-eyebrow">属于你的日常仪式</p>
            <h2 id="ritual-title" className="text-balance font-serif text-3xl font-medium leading-[1.5] sm:text-4xl">一张牌的时间，<br />听听自己的声音。</h2>
            <p className="rail-body mt-5 max-w-sm text-pretty text-apple-text-muted">塔罗少女陪你整理感受、记录选择。每个答案，最终都回到你自己的生活里。</p>
            <div className="mt-8 flex items-start gap-4">
              <img src={resolveTarotArtwork(TAROT_CARDS[17].image, 320)} alt="星星塔罗牌" width="320" height="480" loading="lazy" decoding="async" className="w-24 shrink-0 rounded-lg border border-apple-border sm:w-28" />
              <div className="py-3">
                <p className="rail-section-title font-serif font-medium">XVII · 星星</p>
                <p className="rail-muted mt-2 max-w-[18ch]">希望不总是盛大的。有时，只是愿意再试一次。</p>
              </div>
            </div>
          </div>
          <ol className="space-y-0">
            {ritualSteps.map((step, index) => (
              <li key={step.title} className="flex gap-5 border-b border-apple-border py-6 first:pt-0 last:border-b-0 last:pb-0 sm:gap-7 sm:py-8">
                <span aria-hidden="true" className="mt-0.5 font-serif text-2xl tabular-nums text-apple-accent">0{index + 1}</span>
                <div>
                  <h3 className="rail-section-title text-balance">{step.title}</h3>
                  <p className="rail-body mt-3 max-w-[34rem] text-pretty text-apple-text-muted">{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="landing-notes-title" className="rail-panel mb-14 grid gap-7 sm:mb-20 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="mb-3 flex items-center gap-2 text-apple-accent"><BookOpen size={19} aria-hidden="true" /><span className="text-sm font-medium">把每一天，留在这里</span></div>
            <h2 id="landing-notes-title" className="text-balance font-serif text-2xl font-medium leading-relaxed sm:text-3xl">今天的感受，值得被记住。</h2>
            <p className="rail-body mt-3 max-w-2xl text-pretty text-apple-text-muted">保留牌迹，写下日记。登录后可同步云端存档，换一台设备，也能接着聊。</p>
          </div>
          <button type="button" onClick={enterApp} className="rail-button whitespace-nowrap">开始今天的塔罗<ArrowRight size={18} aria-hidden="true" /></button>
        </section>

        <footer className="flex flex-col gap-4 border-t border-apple-border py-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="rail-muted">塔罗少女 Tarot Girl · 陪你看清今天</p>
          <p className="rail-muted max-w-xl text-pretty">塔罗是整理思绪的参考。相信你的判断，也允许自己慢慢来。</p>
        </footer>
      </div>
    </main>
  );
}
