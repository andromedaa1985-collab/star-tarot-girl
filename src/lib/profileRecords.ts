import type { DiaryEntry, SimulationHistoryEntry, TarotReading } from '../store';
import { getRecordTime } from './recordSearch';

export interface ProfileRecord {
  id: string;
  kind: 'tarot' | 'diary' | 'simulator';
  label: string;
  title: string;
  date: string;
  href: string;
}

export function getRecentProfileRecords(
  tarotReadings: TarotReading[], diaryEntries: DiaryEntry[], simulationHistory: SimulationHistoryEntry[], limit = 5,
): ProfileRecord[] {
  const records: ProfileRecord[] = [
    ...tarotReadings.map(record => ({ id: record.id, kind: 'tarot' as const, label: '牌迹', title: record.question || '未命名问题', date: record.date, href: `/app?history=1&reading=${encodeURIComponent(record.id)}` })),
    ...diaryEntries.map(record => ({ id: record.id, kind: 'diary' as const, label: '日记', title: record.content.trim() || '心情记录', date: record.date, href: `/app/diary?entry=${encodeURIComponent(record.id)}` })),
    ...simulationHistory.map(record => ({ id: record.id, kind: 'simulator' as const, label: '沙盘', title: record.dilemma || '未命名选择', date: record.date, href: `/app/simulator?record=${encodeURIComponent(record.id)}` })),
  ];
  return records.sort((a, b) => (getRecordTime(b.date) ?? -Infinity) - (getRecordTime(a.date) ?? -Infinity)).slice(0, Math.max(0, limit));
}

export function formatArchiveTime(value: string | null | undefined, empty = '尚无记录'): string {
  const time = getRecordTime(value);
  return time == null ? empty : new Date(time).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
