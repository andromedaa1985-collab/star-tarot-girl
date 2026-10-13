export interface GuardianLetterStatus {
  date: string;
  usedFallback: boolean;
  generatedAt: string;
}

export function normalizeGuardianDate(value: string | null | undefined) {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec((value || '').trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getGuardianLetterState(today: string, letter: string | null, letterDate: string | null, status: GuardianLetterStatus | undefined) {
  const hasToday = Boolean(letter?.trim() && normalizeGuardianDate(letterDate) === today);
  // Older versions saved a service fallback as a completed letter without metadata.
  const legacyFallback = Boolean(letter?.includes('回访服务刚才不稳定') || letter?.includes('保底回访'));
  const usedFallback = hasToday && (status?.date === today ? status.usedFallback : legacyFallback);
  return { hasToday, usedFallback, completed: hasToday && !usedFallback, canGenerate: !hasToday || usedFallback };
}

export function shouldRewardGuardianLetter(previous: ReturnType<typeof getGuardianLetterState>, usedFallback: boolean) {
  return !usedFallback && !previous.completed;
}

export function appendGuardianStarter(input: string, starter: string) {
  if (!input.trim()) return starter;
  if (input.includes(starter)) return input;
  return `${input.trimEnd()}\n${starter}`;
}
