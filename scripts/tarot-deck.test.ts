import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { TAROT_CARDS, TAROT_CARD_BACK, TAROT_CARD_INDEX_BY_IMAGE, resolveTarotArtwork, getTarotArtworkSrcSet } from '../src/lib/tarotDeck';

test('the complete 22-card deck and back have distinct deployed assets', () => {
  assert.equal(TAROT_CARDS.length, 22);
  assert.equal(new Set(TAROT_CARDS.map(card => card.image)).size, 22);
  for (const source of [...TAROT_CARDS.map(card => card.image), TAROT_CARD_BACK]) {
    assert.ok(existsSync(`public${source}`), `Missing artwork: ${source}`);
  }
});

test('legacy and new images identify the same card for recent draw history', () => {
  for (const card of TAROT_CARDS) {
    assert.equal(TAROT_CARD_INDEX_BY_IMAGE.get(card.legacyImage), card.index);
    assert.equal(TAROT_CARD_INDEX_BY_IMAGE.get(card.image), card.index);
    assert.equal(resolveTarotArtwork(card.legacyImage), card.image);
    assert.equal(resolveTarotArtwork(card.image), card.image);
  }
});

test('display resolution preserves unknown custom artwork and maps legacy backs', () => {
  assert.equal(resolveTarotArtwork('/custom/private-card.png'), '/custom/private-card.png');
  assert.equal(resolveTarotArtwork('data:image/png;base64,example'), 'data:image/png;base64,example');
  assert.equal(resolveTarotArtwork('/default-card.png'), TAROT_CARD_BACK);
  assert.equal(resolveTarotArtwork('default-card.png'), TAROT_CARD_BACK);
});

test('saved artwork from the previous deck keeps its card identity after replacement', () => {
  for (const card of TAROT_CARDS) {
    assert.equal(TAROT_CARD_INDEX_BY_IMAGE.get(card.previousImage), card.index);
    assert.equal(resolveTarotArtwork(card.previousImage), card.image);
    for (const width of [320, 640, 1024] as const) {
      const variant = resolveTarotArtwork(card.legacyImage, width);
      assert.equal(TAROT_CARD_INDEX_BY_IMAGE.get(variant), card.index);
      assert.equal(resolveTarotArtwork(variant), card.image);
    }
  }
  assert.equal(resolveTarotArtwork('/tarot/neon-v1/back.webp'), TAROT_CARD_BACK);
});

test('all display sizes are real WebP assets within mobile transfer budgets', () => {
  for (const source of [...TAROT_CARDS.map(card => card.image), TAROT_CARD_BACK]) {
    for (const [width, maxBytes] of [[320, 40 * 1024], [640, 120 * 1024], [1024, 250 * 1024]] as const) {
      const path = `public${resolveTarotArtwork(source, width)}`;
      assert.ok(existsSync(path), `Missing ${width}px artwork: ${path}`);
      assert.ok(statSync(path).size <= maxBytes, `Artwork exceeds ${width}px transfer budget: ${path}`);
      const bytes = readFileSync(path);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    }
    const candidates = getTarotArtworkSrcSet(source)!.split(', ');
    assert.equal(candidates.length, 3);
    assert.ok(candidates.every(candidate => existsSync(`public${candidate.split(' ')[0]}`)));
  }
  assert.equal(getTarotArtworkSrcSet('/custom/private-card.png'), undefined);
  assert.equal(getTarotArtworkSrcSet('data:image/png;base64,example'), undefined);
  assert.equal(resolveTarotArtwork('/custom/private-card.png', 320), '/custom/private-card.png');
});
