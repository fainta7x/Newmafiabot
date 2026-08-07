export interface PreparedAvatar {
  data_url: string;
  width: number;
  height: number;
  byte_size: number;
}

export async function preparePlayerAvatar(file: File): Promise<PreparedAvatar> {
  const maxInputSize = 20 * 1024 * 1024; // 20 MB
  if (file.size > maxInputSize) {
    throw new Error('Размер исходного файла не должен превышать 20 МБ');
  }

  // Load through an object URL
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось загрузить изображение. Возможно, файл поврежден.'));
      image.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Не удалось получить 2D контекст канваса');
    }

    // Fill background with #111827
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 512, 512);

    // Center-crop to a square
    const minDim = Math.min(img.width, img.height);
    const sx = (img.width - minDim) / 2;
    const sy = (img.height - minDim) / 2;

    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 512, 512);

    const qualities = [0.86, 0.78, 0.70, 0.62, 0.54];
    let finalDataUrl = '';
    let finalByteSize = 0;
    const maxOutputSize = 700 * 1024; // 700 KB

    for (const quality of qualities) {
      finalDataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64Str = finalDataUrl.substring('data:image/jpeg;base64,'.length);
      let padding = 0;
      if (base64Str.endsWith('==')) padding = 2;
      else if (base64Str.endsWith('=')) padding = 1;
      finalByteSize = (base64Str.length * 3) / 4 - padding;

      if (finalByteSize <= maxOutputSize) {
        break;
      }
    }

    if (finalByteSize > maxOutputSize) {
      throw new Error('Не удалось сжать изображение до размера менее 700 КБ');
    }

    return {
      data_url: finalDataUrl,
      width: 512,
      height: 512,
      byte_size: finalByteSize,
    };
  } finally {
    // always revoke the object URL
    URL.revokeObjectURL(objectUrl);
  }
}
