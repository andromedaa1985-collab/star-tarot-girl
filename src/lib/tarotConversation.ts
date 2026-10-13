import type { Message, TarotReading } from '../store';

export interface RegenerationSource {
  message: Message;
  question: string;
  reading?: TarotReading;
  originalDraw: boolean;
}

export function canAddTarotReading(readings: readonly TarotReading[], limit: number) {
  return readings.length < limit;
}

/** A membership change limits new records; it never removes an existing record. */
export function appendTarotReading(readings: TarotReading[], reading: TarotReading, limit: number) {
  return canAddTarotReading(readings, limit) ? [reading, ...readings] : readings;
}

export function removeTarotReading(readings: TarotReading[], readingId: string) {
  return readings.filter((reading) => reading.id !== readingId);
}

export function getRegenerationSource(
  messages: readonly Message[],
  readings: readonly TarotReading[],
  messageId: string,
): RegenerationSource | null {
  const targetIndex = messages.findIndex((message) => message.id === messageId && message.role === 'ai');
  if (targetIndex < 0) return null;
  const message = messages[targetIndex];
  let question = message.sourceQuestion?.trim()
    || messages.find((item) => item.id === message.replyToMessageId && item.role === 'user')?.text.trim()
    || '';
  let reading = readings.find((item) => item.id === message.readingId);
  // A deliberately removed archive must not fall through to an unrelated draw.
  if (message.readingId && !reading) return null;

  for (let index = targetIndex - 1; index >= 0 && !question; index -= 1) {
    if (messages[index].role === 'user') {
      question = messages[index].text.trim();
      break;
    }
  }

  // Follow-ups stay with the preceding draw, even when newer draws exist below it.
  for (let index = targetIndex; index >= 0 && !reading; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== 'ai') continue;
    reading = readings.find((item) => item.generationId && item.generationId === candidate.generationId);
    if (!reading && candidate.cardImage) {
      reading = readings
        .filter((item) => item.cardImage === candidate.cardImage
          // Older backups save the answer just before saving its archive record.
          && Date.parse(item.date) <= candidate.timestamp + 1000)
        .sort((first, second) => Math.abs(Date.parse(first.date) - candidate.timestamp)
          - Math.abs(Date.parse(second.date) - candidate.timestamp))[0];
      if (!reading) return null;
    }
  }

  const originalDraw = Boolean(reading && (
    (message.generationId && message.generationId === reading.generationId)
    || (message.cardImage && message.generationKind !== 'tarot_followup')
  ));
  // A draw also carries its question in the archive, including in older backups.
  if (originalDraw && reading) question = reading.question;
  if (!question) return null;
  return { message, question, reading, originalDraw };
}

export function replaceTarotAnswer(messages: Message[], messageId: string, answer: Message) {
  return messages.map((message) => message.id === messageId && message.role === 'ai'
    ? { ...message, ...answer, id: message.id, timestamp: message.timestamp }
    : message);
}
