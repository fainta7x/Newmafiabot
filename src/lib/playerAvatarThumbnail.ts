/** Display-only downsampling. Original uploads/repository assets remain untouched. */
const thumbnails = new Map<string, Map<number, Promise<string>>>();
const MAX_SOURCES = 64;

export function avatarPixelSize(cssSize: number, devicePixelRatio = 1): number {
  const ratio = Number.isFinite(devicePixelRatio) ? Math.max(1, Math.min(4, devicePixelRatio)) : 1;
  return Math.ceil(cssSize * ratio);
}

async function downsample(source: string, edge: number): Promise<string> {
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Avatar could not be decoded'));
    });
    image.src = source;
    await loaded;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const shorter = Math.min(width, height);
    if (!shorter || shorter <= edge) return source;

    // A large texture reduced directly by CSS can alias at tiny list sizes.
    // Halving first retains fine details; the final raster fits the physical pixels.
    let input: CanvasImageSource = image;
    let w = width;
    let h = height;
    while (Math.min(w, h) > edge) {
      const nextEdge = Math.max(edge, Math.floor(Math.min(w, h) / 2));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * nextEdge / shorter);
      canvas.height = Math.round(height * nextEdge / shorter);
      const context = canvas.getContext('2d');
      if (!context) return source;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(input, 0, 0, canvas.width, canvas.height);
      input = canvas;
      w = canvas.width;
      h = canvas.height;
    }
    // Keep the original aspect ratio/colours/alpha; CSS keeps the existing crop.
    return (input as HTMLCanvasElement).toDataURL('image/png');
  } catch {
    return source;
  }
}

export function prepareAvatarThumbnail(source: string, edge: number): Promise<string> {
  // PlayerAvatar uses API-provided data URLs. Do not load new external URLs here.
  if (!source.startsWith('data:image/') || !Number.isFinite(edge) || edge < 1) return Promise.resolve(source);
  const size = Math.max(1, Math.min(320, Math.ceil(edge)));
  let sizes = thumbnails.get(source);
  if (!sizes) {
    if (thumbnails.size >= MAX_SOURCES) thumbnails.delete(thumbnails.keys().next().value!);
    sizes = new Map();
    thumbnails.set(source, sizes);
  }
  let thumbnail = sizes.get(size);
  if (!thumbnail) {
    thumbnail = downsample(source, size);
    sizes.set(size, thumbnail);
  }
  return thumbnail;
}
