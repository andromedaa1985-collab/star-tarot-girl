export const SERVICE_FALLBACK = {
  tarot:
    '刚才连接有点不稳，我先用本地保底解读接住这一轮。你的问题和牌面已经留在牌迹里，可以直接继续追问或稍后重试。',
  diaryReview:
    '复盘服务暂时不稳定，但你的日记已经安全保存在这里。稍后再点一次，我会沿着同一批日记继续复盘。',
  guardianLetter:
    '回访服务刚才不稳定，我先留下一封保底回访。你的近况线索没有丢，等连接恢复后可以再生成一次更贴合的版本。\n\n今天先别急着证明自己。把最重要的一件小事拆到 10 分钟内能开始，做完就停一下，让身体知道你已经在往前走。',
  guardianChat:
    '我刚才有点连不上，但你的话已经收到，没有丢。先把这件事放轻一点：今天只写下一个最小下一步，等连接稳定后我们再继续往深处看。',
  baziCalculation:
    '智能推演暂时不稳定，但你的出生资料已经保存。可以稍后重试，已经填写的内容不会丢。',
  baziPartial:
    '智能格局解读刚才不稳定，我先保留精确排盘、五行、十神和神煞结果。稍后重试可以补齐更细的文字推演。',
  baziChat:
    '刚才命理解读服务不太稳定，但你的问题已经收到。先按已有排盘看：今天适合把问题缩小到一个现实动作，不急着下长期结论。',
  simulator:
    '推演服务暂时不稳定，我先给你一份保底判断。输入内容没有丢，稍后可以用同一组选项再推演一次。',
} as const;

export function withFallbackNotice(answer: string, notice: string) {
  const cleanAnswer = String(answer || '').trim();
  if (!cleanAnswer) return notice;
  if (cleanAnswer.includes(notice.slice(0, 12))) return cleanAnswer;
  return `${notice}\n\n${cleanAnswer}`;
}

export function getPublicServiceError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message.trim()) return fallback;
  if (/api|key|token|secret|netlify|deepseek|json|fetch|network|unauthorized|forbidden/i.test(message)) {
    return fallback;
  }
  if (!/[\u4e00-\u9fff]/.test(message)) return fallback;
  return message;
}
