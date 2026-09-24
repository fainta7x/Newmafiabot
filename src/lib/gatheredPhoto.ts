/** Shrinks a camera photo for the «Мы собрались» post: longest side ≤ 1600 px, JPEG ≤ ~1.1 MB. */
export async function prepareGatheredPhoto(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Файл больше 25 МБ');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть фото'));
      img.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось обработать фото');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if ((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75 <= 1_100_000) return dataUrl;
    }
    throw new Error('Фото слишком большое');
  } finally {
    URL.revokeObjectURL(url);
  }
}
