import React, { useEffect, useState } from 'react';
import { getPlayerAvatarUrl } from '../../lib/playerAvatars.ts';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-20 h-20 text-xl',
};

interface PlayerAvatarProps {
  nickname: string | null | undefined;
  size?: AvatarSize;
  className?: string;
}

const avatarCache = new Map<string, string>();

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ nickname, size = 'sm', className = '' }) => {
  const avatarApiUrl = getPlayerAvatarUrl(nickname);
  const [dataUrl, setDataUrl] = useState<string | null>(() => (avatarApiUrl ? avatarCache.get(avatarApiUrl) || null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!avatarApiUrl) {
      setDataUrl(null);
      setFailed(false);
      return;
    }

    const cached = avatarCache.get(avatarApiUrl);
    if (cached) {
      setDataUrl(cached);
      setFailed(false);
      return;
    }

    let cancelled = false;
    fetch(avatarApiUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load avatar');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.dataUrl === 'string') {
          avatarCache.set(avatarApiUrl, data.dataUrl);
          setDataUrl(data.dataUrl);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [avatarApiUrl]);

  const initial = (nickname || '?').trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';

  return (
    <span
      className={`${sizeClasses[size]} ${className} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-soft bg-surface-2 font-black text-accent shadow-sm`}
      title={nickname || 'Игрок'}
      aria-label={`Аватар: ${nickname || 'игрок'}`}
    >
      {dataUrl && !failed ? (
        <img
          src={dataUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-[center_30%]"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
};
