const IMAGE_PRELOAD_TIMEOUT_MS = 3000;

/** Warm image assets without letting an unavailable asset block an interaction. */
export function createImagePreloader(options: {
  timeoutMs?: number;
  createImage?: () => HTMLImageElement;
} = {}) {
  const loadedImages = new Set<string>();
  const pendingImages = new Map<string, Promise<void>>();
  const createImage = options.createImage || (typeof Image === 'undefined' ? null : () => new Image());
  const timeoutMs = options.timeoutMs ?? IMAGE_PRELOAD_TIMEOUT_MS;

  const preloadImage = (src: string): Promise<void> => {
    if (!src || loadedImages.has(src) || !createImage) return Promise.resolve();
    const pending = pendingImages.get(src);
    if (pending) return pending;

    const promise = new Promise<void>((resolve) => {
      let image: HTMLImageElement | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (loaded = false) => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) clearTimeout(timeout);
        if (image) {
          image.onload = null;
          image.onerror = null;
        }
        if (loaded) loadedImages.add(src);
        resolve();
      };

      try {
        image = createImage();
        timeout = setTimeout(() => finish(), timeoutMs);
        image.onload = () => finish(true);
        image.onerror = () => finish();
        image.decoding = 'async';
        image.src = src;
        if (image.complete) finish(image.naturalWidth > 0);
      } catch {
        finish();
      }
    }).finally(() => pendingImages.delete(src));

    pendingImages.set(src, promise);
    return promise;
  };

  return (sources: string[]) =>
    Promise.all(Array.from(new Set(sources)).map(preloadImage)).then(() => undefined);
}

export const preloadImages = createImagePreloader();
