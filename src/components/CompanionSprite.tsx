import clsx from 'clsx';

export type CompanionOutfitId = 'auto' | 'moon' | 'moon-oracle' | 'star-cloak' | 'academy-tarot' | 'glass-robe';
export type CompanionExpression = 'idle' | 'thinking' | 'drawing' | 'happy' | 'memory';
export type CompanionAction = 'float' | 'wave' | 'read' | 'draw' | 'remember' | 'celebrate';

type OutfitAsset = {
  src: string;
  accent: string;
  glow: string;
};

const OUTFIT_ASSETS: Record<Exclude<CompanionOutfitId, 'auto'>, OutfitAsset> = {
  moon: {
    src: '/outfits/chibi/moon-chibi.png',
    accent: '#8db7ff',
    glow: 'rgba(141,183,255,0.34)',
  },
  'moon-oracle': {
    src: '/outfits/chibi/moon-oracle-chibi.png',
    accent: '#f4cf83',
    glow: 'rgba(244,207,131,0.36)',
  },
  'star-cloak': {
    src: '/outfits/chibi/star-cloak-chibi.png',
    accent: '#88a8ff',
    glow: 'rgba(136,168,255,0.34)',
  },
  'academy-tarot': {
    src: '/outfits/chibi/academy-tarot-chibi.png',
    accent: '#c28a3b',
    glow: 'rgba(194,138,59,0.32)',
  },
  'glass-robe': {
    src: '/outfits/chibi/glass-robe-chibi.png',
    accent: '#b7a8ff',
    glow: 'rgba(183,168,255,0.34)',
  },
};

const EXPRESSION_LABELS: Record<CompanionExpression, string> = {
  idle: '陪伴中',
  thinking: '解读中',
  drawing: '抽牌中',
  happy: '开心',
  memory: '记得你',
};

const ACTION_LABELS: Record<CompanionAction, string> = {
  float: '轻轻漂浮',
  wave: '抬手回应',
  read: '读牌思考',
  draw: '星牌闪动',
  remember: '翻看线索',
  celebrate: '撒星星',
};

function resolveOutfit(outfit: CompanionOutfitId): Exclude<CompanionOutfitId, 'auto'> {
  return outfit === 'auto' ? 'moon' : outfit;
}

function outfitAsset(outfit: CompanionOutfitId) {
  return OUTFIT_ASSETS[resolveOutfit(outfit)] || OUTFIT_ASSETS.moon;
}

export function getDefaultCompanionAction(expression: CompanionExpression): CompanionAction {
  if (expression === 'thinking') return 'read';
  if (expression === 'drawing') return 'draw';
  if (expression === 'happy') return 'celebrate';
  if (expression === 'memory') return 'remember';
  return 'float';
}

export function CompanionExpressionBadge({
  expression,
  className,
}: {
  expression: CompanionExpression;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide', className)}>
      {EXPRESSION_LABELS[expression]}
    </span>
  );
}

export function CompanionActionBadge({
  action,
  className,
}: {
  action: CompanionAction;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide', className)}>
      {ACTION_LABELS[action]}
    </span>
  );
}

export default function CompanionSprite({
  outfit,
  expression = 'idle',
  action,
  className,
  label,
}: {
  outfit: CompanionOutfitId;
  expression?: CompanionExpression;
  action?: CompanionAction;
  className?: string;
  label?: string;
}) {
  const asset = outfitAsset(outfit);
  const resolvedAction = action || getDefaultCompanionAction(expression);

  return (
    <div
      role="img"
      aria-label={label || '星轨塔罗少女 Q 版桌宠'}
      data-expression={expression}
      data-action={resolvedAction}
      className={clsx('companion-sprite block h-full w-full overflow-visible', `companion-action-${resolvedAction}`, className)}
    >
      <style>
        {`
          .companion-sprite {
            position: relative;
            isolation: isolate;
          }
          .companion-sprite::before {
            content: '';
            position: absolute;
            inset: 10% 5% 4%;
            z-index: -1;
            border-radius: 999px;
            background: radial-gradient(circle at 50% 38%, ${asset.glow}, transparent 62%);
            filter: blur(8px);
          }
          .companion-sprite .companion-image {
            position: relative;
            z-index: 1;
            width: 100%;
            height: 100%;
            object-fit: contain;
            object-position: center bottom;
            transform-origin: center bottom;
            filter: drop-shadow(0 16px 20px rgba(31, 22, 12, 0.18));
            user-select: none;
            pointer-events: none;
          }
          @media (prefers-reduced-motion: no-preference) {
            .companion-action-float .companion-image {
              animation: companionImageFloat 4.6s ease-in-out infinite;
            }
            .companion-action-wave .companion-image {
              animation: companionImageWave 2.5s ease-in-out infinite;
            }
            .companion-action-read .companion-image {
              animation: companionImageRead 3s ease-in-out infinite;
            }
            .companion-action-draw .companion-image {
              animation: companionImageDraw 1.55s ease-in-out infinite;
            }
            .companion-action-remember .companion-image {
              animation: companionImageRemember 3.2s ease-in-out infinite;
            }
            .companion-action-celebrate .companion-image {
              animation: companionImageCelebrate 2.2s ease-in-out infinite;
            }
          }
          @keyframes companionImageFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4%); }
          }
          @keyframes companionImageWave {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            35% { transform: translateY(-2%) rotate(-2.2deg); }
            70% { transform: translateY(-1%) rotate(1.4deg); }
          }
          @keyframes companionImageRead {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            45% { transform: translateY(-2%) rotate(-1.2deg); }
          }
          @keyframes companionImageDraw {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-5%) scale(1.025); }
          }
          @keyframes companionImageRemember {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            48% { transform: translateY(-2%) rotate(1.6deg); }
          }
          @keyframes companionImageCelebrate {
            0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
            32% { transform: translateY(-5%) rotate(-1.4deg) scale(1.03); }
            68% { transform: translateY(-2%) rotate(1.2deg) scale(1.01); }
          }
        `}
      </style>
      <img className="companion-image" src={asset.src} alt="" aria-hidden="true" draggable={false} />
    </div>
  );
}
