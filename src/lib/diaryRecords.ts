import type { DiaryEntry, ReviewEntry } from '../store';
import { matchesRecordQuery } from './recordSearch';

export interface DiaryFilters {
  query: string;
  mood: DiaryEntry['mood'] | 'all';
  tag: string;
}

export function parseDiaryTags(value: string) {
  return [...new Set(value.split(/[,，\s]+/).map(tag => tag.trim()).filter(Boolean))];
}

export function filterDiaryEntries(entries: DiaryEntry[], filters: DiaryFilters) {
  return entries.filter(entry => (
    (filters.mood === 'all' || entry.mood === filters.mood) &&
    (!filters.tag || entry.tags?.includes(filters.tag)) &&
    matchesRecordQuery(filters.query, entry.content, entry.date, entry.tags || [])
  ));
}

export function updateDiaryEntry(entries: DiaryEntry[], id: string, changes: Pick<DiaryEntry, 'content' | 'mood' | 'tags'>, updatedAt: string) {
  if (!changes.content.trim()) return entries;
  return entries.map(entry => entry.id === id ? {
    ...entry,
    content: changes.content.trim(),
    mood: changes.mood,
    tags: [...changes.tags],
    updatedAt,
  } : entry);
}

/** Small stable cache fingerprint; source text stays only in the diary, not every review. */
export function getDiarySourceSignature(entries: DiaryEntry[]) {
  const source = JSON.stringify([...entries].sort((a, b) => a.id.localeCompare(b.id)).map(entry => ({
    id: entry.id,
    date: entry.date,
    content: entry.content,
    mood: entry.mood,
    tags: [...(entry.tags || [])].sort(),
  })));
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `v1:${source.length}:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function isDiaryReviewCurrent(review: Pick<ReviewEntry, 'sourceSignature'>, entries: DiaryEntry[]) {
  return Boolean(review.sourceSignature && review.sourceSignature === getDiarySourceSignature(entries));
}
