type NativeImageShareOptions = {
  blob: Blob;
  fileName: string;
  title: string;
  text?: string;
  dialogTitle?: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read image data.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function shareImageWithNativeSheet(options: NativeImageShareOptions) {
  const [{ Capacitor }, { Directory, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  if (
    !Capacitor.isNativePlatform() ||
    !Capacitor.isPluginAvailable('Filesystem') ||
    !Capacitor.isPluginAvailable('Share')
  ) {
    return false;
  }

  const canShare = await Share.canShare().catch(() => ({ value: true }));
  if (!canShare.value) return false;

  const fileName = sanitizeFileName(options.fileName || `astrorail-share-${Date.now()}.png`);
  const path = `shares/${fileName.endsWith('.png') ? fileName : `${fileName}.png`}`;
  const data = await blobToBase64(options.blob);

  await Filesystem.mkdir({
    directory: Directory.Cache,
    path: 'shares',
    recursive: true,
  }).catch(() => undefined);

  await Filesystem.writeFile({
    directory: Directory.Cache,
    path,
    data,
  });

  const file = await Filesystem.getUri({
    directory: Directory.Cache,
    path,
  });

  await Share.share({
    title: options.title,
    text: options.text,
    files: [file.uri],
    dialogTitle: options.dialogTitle || options.title,
  });

  return true;
}
