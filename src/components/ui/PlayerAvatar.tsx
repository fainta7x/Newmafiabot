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

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ nickname, size = 'sm', className = '' }) => {
  const avatarUrl = getPlayerAvatarUrl(nickname);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const initial = (nickname || '?').trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';

  return (
    <span
      className={`${sizeClasses[size]} ${className} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-soft bg-surface-2 font-black text-accent shadow-sm`}
      title={nickname || 'Игрок'}
      aria-label={`Аватар: ${nickname || 'игрок'}`}
    >
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
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
