import React, { useEffect, useRef, useState } from 'react';
import { avatarPixelSize, prepareAvatarThumbnail } from '../../lib/playerAvatarThumbnail.ts';

/** Preserves the original image while preparing its display-sized raster. */
export function AvatarImage({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [thumbnail, setThumbnail] = useState<{ source: string; url: string } | null>(null);

  useEffect(() => {
    if (!src || !imageRef.current) return;
    const image = imageRef.current;
    let cancelled = false;
    let lastPixels = 0;
    const prepare = () => {
      const edge = Math.max(image.clientWidth, image.clientHeight);
      const pixels = avatarPixelSize(edge, window.devicePixelRatio);
      if (!edge || pixels === lastPixels) return;
      lastPixels = pixels;
      void prepareAvatarThumbnail(src, pixels).then((url) => {
        if (!cancelled) setThumbnail({ source: src, url });
      });
    };
    const observer = new ResizeObserver(prepare);
    observer.observe(image);
    window.addEventListener('resize', prepare);
    prepare();
    return () => { cancelled = true; observer.disconnect(); window.removeEventListener('resize', prepare); };
  }, [src]);

  return <img {...props} ref={imageRef} src={thumbnail && thumbnail.source === src ? thumbnail.url : src} />;
}
