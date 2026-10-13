export type RecordRange = 'all' | '7d' | '30d';

export function getRecordTime(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date.getTime();
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function isWithinRecordRange(value: string | number | null | undefined, range: RecordRange, now = new Date()): boolean {
  if (range === 'all') return true;
  const time = getRecordTime(value);
  if (time == null) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (range === '7d' ? 6 : 29));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return time >= start.getTime() && time < end.getTime();
}

export function matchesRecordQuery(query: string, ...values: Array<unknown>): boolean {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = values.flat().filter(value => value != null).map(String).join(' ').toLocaleLowerCase();
  return tokens.every(token => haystack.includes(token));
}

export function formatRecordDate(value: string | number | null | undefined): string {
  const time = getRecordTime(value);
  return time == null ? '日期未记录' : new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}
