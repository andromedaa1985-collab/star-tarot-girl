/** Stable card identities; artwork may change without rewriting saved readings. */
const definitions = [
  ['愚者', 'fool', '0-愚者_3.png', '启程 · 信任 · 未知'],
  ['魔术师', 'magician', '1-魔术师_2.png', '创造 · 意志 · 行动'],
  ['女祭司', 'high-priestess', '2-女祭司_2.png', '直觉 · 静默 · 内在'],
  ['女皇', 'empress', '3-女皇_1.png', '丰盛 · 滋养 · 生长'],
  ['皇帝', 'emperor', '4-皇帝_1.png', '秩序 · 边界 · 责任'],
  ['教皇', 'hierophant', '5-教皇_3.png', '传承 · 信念 · 指引'],
  ['恋人', 'lovers', '6-恋人_4.png', '联结 · 选择 · 一致'],
  ['战车', 'chariot', '7-战车_3.png', '方向 · 驾驭 · 前进'],
  ['力量', 'strength', '8-力量_1.png', '勇气 · 温柔 · 韧性'],
  ['隐士', 'hermit', '9-隐士_2.png', '独处 · 探索 · 内省'],
  ['命运之轮', 'wheel-of-fortune', '10-命运之轮_3.png', '周期 · 变化 · 契机'],
  ['正义', 'justice', '11-正义_4.png', '平衡 · 事实 · 因果'],
  ['倒吊人', 'hanged-man', '12-倒吊人_1.png', '暂停 · 放下 · 换个角度'],
  ['死神', 'death', '13-死神_4.png', '结束 · 转化 · 新生'],
  ['节制', 'temperance', '14-节制_2.png', '调和 · 节奏 · 整合'],
  ['恶魔', 'devil', '15-恶魔_4.png', '执着 · 诱惑 · 束缚'],
  ['塔', 'tower', '16-塔_3.png', '震动 · 揭示 · 重建'],
  ['星星', 'star', '17-星星_4.png', '希望 · 疗愈 · 灵感'],
  ['月亮', 'moon', '18-月亮_4.png', '梦境 · 潜意识 · 迷雾'],
  ['太阳', 'sun', '19-太阳_4.png', '清晰 · 活力 · 喜悦'],
  ['审判', 'judgement', '20-审判_4.png', '觉醒 · 回应 · 重启'],
  ['世界', 'world', '21-世界_4.png', '完整 · 连接 · 抵达'],
] as const;

export type TarotArtworkWidth = 320 | 640 | 1024;
const ARTWORK_DIRECTORY = '/tarot/mecha-v1';
const artworkPath = (stem: string, width: TarotArtworkWidth = 1024) =>
  `${ARTWORK_DIRECTORY}/${stem}${width === 1024 ? '' : `-${width}`}.webp`;

export const TAROT_CARDS = definitions.map(([name, slug, legacyFile, keywords], index) => ({
  index, name, slug, keywords,
  image: artworkPath(`${String(index).padStart(2, '0')}-${slug}`),
  previousImage: `/tarot/neon-v1/${String(index).padStart(2, '0')}-${slug}.webp`,
  legacyImage: `/tarot/${legacyFile}`,
}));
export const TAROT_CARD_BACK = artworkPath('back');
export const TAROT_CARD_INDEX_BY_IMAGE = new Map<string, number>(
  TAROT_CARDS.flatMap(card => [
    card.image, card.previousImage, card.legacyImage,
    artworkPath(`${String(card.index).padStart(2, '0')}-${card.slug}`, 320),
    artworkPath(`${String(card.index).padStart(2, '0')}-${card.slug}`, 640),
  ].map(source => [source, card.index] as [string, number])),
);

const BACK_ALIASES = new Set([
  '/default-card.png', 'default-card.png', '/tarot/neon-v1/back.webp',
  TAROT_CARD_BACK, artworkPath('back', 320), artworkPath('back', 640),
]);

/** Resolve at the display boundary, leaving archive associations and stored URLs intact. */
export function resolveTarotArtwork(source?: string, width: TarotArtworkWidth = 1024): string {
  if (!source || BACK_ALIASES.has(source)) return artworkPath('back', width);
  const index = TAROT_CARD_INDEX_BY_IMAGE.get(source);
  return index === undefined ? source : artworkPath(`${String(index).padStart(2, '0')}-${TAROT_CARDS[index].slug}`, width);
}

/** Let the browser pick a suitable size; custom artwork keeps its original URL. */
export function getTarotArtworkSrcSet(source?: string): string | undefined {
  if (source && !BACK_ALIASES.has(source) && !TAROT_CARD_INDEX_BY_IMAGE.has(source)) return undefined;
  return ([320, 640, 1024] as const)
    .map(width => `${resolveTarotArtwork(source, width)} ${width}w`).join(', ');
}
