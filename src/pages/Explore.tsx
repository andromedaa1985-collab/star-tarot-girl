import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, GitBranch, Moon, BookOpen } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { useAppContext } from '../store';
import { hasFeatureAccess } from '../lib/membership';

const exploreItems = [
  { to: '/app/bazi', title: '八字档案', description: '从出生信息出发，了解自己的性格与节奏。', icon: Compass },
  { to: '/app/simulator', title: '选择沙盘', description: '把两个选择摆在一起，理清利弊。', icon: GitBranch },
  { to: '/app/guardian', title: '星轨守护', description: '结合最近的记录，聊聊你的心事。', icon: Moon },
  { to: '/app/collection', title: '记忆图鉴', description: '回看收集到的记忆碎片。', icon: BookOpen },
];

export default function Explore() {
  const { membership } = useAppContext();

  return (
    <div className="rail-page">
      <div className="rail-page-content max-w-[720px]">
        <PageHeader title="探索" description="想多了解一点自己时，来这里看看。" />
        <nav aria-label="探索工具">
          <ul className="rail-explore-list">
            {exploreItems.map(({ to, title, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="group flex min-h-24 items-center gap-4 px-4 py-6 hover:bg-apple-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-apple-accent sm:px-6">
                  <span className="rail-explore-icon"><Icon size={23} strokeWidth={1.6} className="text-apple-accent" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-medium">
                      {title}
                      {to === '/app/guardian' && !hasFeatureAccess(membership, 'guardian') && <span className="text-xs font-normal text-apple-text-muted">需 Plus</span>}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-apple-text-muted">{description}</span>
                  </span>
                  <ArrowRight size={17} className="text-apple-text-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
