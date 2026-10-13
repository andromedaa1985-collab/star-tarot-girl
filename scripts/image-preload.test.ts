import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createImagePreloader } from '../src/lib/preloadImages';

function fakeImage() {
  return {
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    decoding: '',
    src: '',
    complete: false,
    naturalWidth: 0,
  };
}

test('concurrent image preloads share one request and cache successful loads', async () => {
  const images: ReturnType<typeof fakeImage>[] = [];
  const preload = createImagePreloader({
    createImage: () => {
      const image = fakeImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
  });
  const first = preload(['/card.png', '/card.png']);
  const second = preload(['/card.png']);
  assert.equal(images.length, 1);
  images[0].onload?.();
  await Promise.all([first, second]);
  await preload(['/card.png']);
  assert.equal(images.length, 1);
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
});

test('images with no load or error event settle within the timeout and can be retried', async () => {
  const images: ReturnType<typeof fakeImage>[] = [];
  const preload = createImagePreloader({
    timeoutMs: 10,
    createImage: () => {
      const image = fakeImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
  });
  await preload(['/stalled.png']);
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
  const retry = preload(['/stalled.png']);
  assert.equal(images.length, 2);
  images[1].onload?.();
  await retry;
});

test('failed and already broken images do not become permanently cached', async () => {
  let requests = 0;
  const preload = createImagePreloader({
    createImage: () => {
      requests += 1;
      return { ...fakeImage(), complete: true, naturalWidth: 0 } as unknown as HTMLImageElement;
    },
  });
  await preload(['/broken.png']);
  await preload(['/broken.png']);
  assert.equal(requests, 2);
});

test('image initialization failure still allows the interaction to proceed', async () => {
  const preload = createImagePreloader({ createImage: () => { throw new Error('Image unavailable'); } });
  await assert.doesNotReject(preload(['/card.png']));
});
