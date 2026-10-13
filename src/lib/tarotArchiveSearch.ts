import type { TarotReading } from '../store';
import { isWithinRecordRange, matchesRecordQuery, type RecordRange } from './recordSearch';

export type ReadingSource = 'all' | 'ai' | 'fallback' | 'unknown';

export function getReadingSource(reading: Pick<TarotReading, 'usedFallback' | 'model'>): Exclude<ReadingSource, 'all'> {
  if (reading.usedFallback === true || /local|fallback/i.test(reading.model || '')) return 'fallback';
  if (reading.usedFallback === false && reading.model && !/legacy|system/i.test(reading.model)) return 'ai';
  return 'unknown';
}

export function filterTarotArchive(
  readings: TarotReading[],
  options: { query: string; range: RecordRange; source: ReadingSource; now?: Date },
  getSummary: (reading: TarotReading) => string = reading => reading.summary,
): TarotReading[] {
  return readings.filter(reading =>
    isWithinRecordRange(reading.date, options.range, options.now)
    && (options.source === 'all' || getReadingSource(reading) === options.source)
    && matchesRecordQuery(options.query, reading.question, reading.cards, getSummary(reading)));
}
