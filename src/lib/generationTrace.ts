export type GenerationKind =
  | 'tarot'
  | 'tarot_followup'
  | 'diary_review'
  | 'simulator'
  | 'guardian_chat'
  | 'bazi_calculation'
  | 'bazi_chat';

export interface GenerationTrace {
  generationId: string;
  generationKind: GenerationKind;
  generatedAt: string;
  model?: string;
  usedFallback?: boolean;
}

type MaybeRecord = Record<string, unknown>;

function randomToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function compactDate(value: string) {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14) || 'unknown';
}

function getRecordDate(record: MaybeRecord) {
  const candidate = record.generatedAt || record.createdAt || record.updatedAt || record.date || record.timestamp;
  if (typeof candidate === 'number') return new Date(candidate).toISOString();
  if (typeof candidate === 'string') {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date(0).toISOString();
}

function getStableSource(record: MaybeRecord) {
  const stable = record.generationId || record.id || record.timestamp || record.date;
  if (stable !== undefined && stable !== null) return String(stable);
  try {
    return JSON.stringify(record);
  } catch {
    return 'unserializable';
  }
}

export function createRecordId(prefix: string) {
  return `${prefix}_${randomToken()}`;
}

export function createGenerationTrace(
  kind: GenerationKind,
  options: { model?: string; usedFallback?: boolean; generatedAt?: Date } = {},
): GenerationTrace {
  const generatedAt = (options.generatedAt || new Date()).toISOString();
  return {
    generationId: `gen_${kind}_${compactDate(generatedAt)}_${randomToken()}`,
    generationKind: kind,
    generatedAt,
    ...(options.model ? { model: options.model } : {}),
    ...(options.usedFallback !== undefined ? { usedFallback: options.usedFallback } : {}),
  };
}

export function ensureGenerationTrace<T extends MaybeRecord>(record: T, kind: GenerationKind): T & GenerationTrace {
  const generatedAt = typeof record.generatedAt === 'string' ? record.generatedAt : getRecordDate(record);
  const generationId = typeof record.generationId === 'string' && record.generationId
    ? record.generationId
    : `gen_${kind}_legacy_${shortHash(`${kind}:${getStableSource(record)}:${generatedAt}`)}`;

  return {
    ...record,
    generationId,
    generationKind: typeof record.generationKind === 'string' ? record.generationKind as GenerationKind : kind,
    generatedAt,
  };
}

function isRecord(value: unknown): value is MaybeRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeArray(value: unknown, kind: GenerationKind, onlyAiMessages = false) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!isRecord(item)) return item;
    if (onlyAiMessages && item.role !== 'ai') return item;
    return ensureGenerationTrace(item, kind);
  });
}

export function normalizeGeneratedStorageValue(key: string, value: unknown) {
  switch (key) {
    case 'tarotReadings':
      return normalizeArray(value, 'tarot');
    case 'reviewHistory':
      return normalizeArray(value, 'diary_review');
    case 'simulationHistory':
      return normalizeArray(value, 'simulator');
    case 'messages':
      return normalizeArray(value, 'tarot_followup', true);
    case 'guardianMessages':
      return normalizeArray(value, 'guardian_chat', true);
    case 'baziMessages':
      return normalizeArray(value, 'bazi_chat', true);
    case 'baziResult':
      return isRecord(value) ? ensureGenerationTrace(value, 'bazi_calculation') : value;
    default:
      return value;
  }
}
