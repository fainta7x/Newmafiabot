import React, { useEffect, useState } from 'react';
import { getPlayerAvatarUrl } from '../../lib/playerAvatars.ts';
import { api } from '../../lib/api.ts';

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
  playerId?: string | null;
  avatarVersion?: string | null;
  /**
   * Used by compact live-game views that know the CRM player id but do not carry
   * avatar_updated_at in their protocol payload. When enabled we optimistically
   * request the stored avatar and gracefully fall back to the initial on 404.
   */
  forceStoredLookup?: boolean;
}

const avatarCache = new Map<string, string>();
const storedAvatarCache = new Map<string, string>();
// Players without a stored avatar: remembered briefly so lists do not refetch 404s on every
// render, while an avatar uploaded during the session still appears after the TTL.
const MISSING_AVATAR_TTL_MS = 2 * 60 * 1000;
const missingAvatarCache = new Map<string, number>();
const isKnownMissing = (key: string) => {
  const expiresAt = missingAvatarCache.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt > Date.now()) return true;
  missingAvatarCache.delete(key);
  return false;
};
const rememberMissing = (key: string) => { missingAvatarCache.set(key, Date.now() + MISSING_AVATAR_TTL_MS); };

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  nickname,
  size = 'sm',
  className = '',
  playerId,
  avatarVersion,
  forceStoredLookup = false,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (playerId !== undefined && playerId !== null) {
      // Stable player identity is authoritative. The API falls back to the
      // repository-managed avatar manifest when no custom BLOB is stored.
      const cacheKey = `${playerId}_${avatarVersion || (forceStoredLookup ? 'live-lookup' : 'repository-default')}`;
      const cached = storedAvatarCache.get(cacheKey);
      if (cached) {
        setDataUrl(cached);
        setFailed(false);
        return;
      }

      if (isKnownMissing(cacheKey)) {
        setDataUrl(null);
        setFailed(true);
        return;
      }

      let cancelled = false;
      setFailed(false);
      api.getPlayerAvatar(playerId)
        .then((res) => {
          if (cancelled) return;
          if (res && typeof res.data_url === 'string') {
            storedAvatarCache.set(cacheKey, res.data_url);
            setDataUrl(res.data_url);
            setFailed(false);
          } else {
            rememberMissing(cacheKey);
            setDataUrl(null);
            setFailed(true);
          }
        })
        .catch((error) => {
          if (Number((error as { status?: number })?.status) === 404) rememberMissing(cacheKey);
          if (!cancelled) {
            setDataUrl(null);
            setFailed(true);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const avatarApiUrl = getPlayerAvatarUrl(nickname);
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
  }, [playerId, avatarVersion, nickname, forceStoredLookup]);

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