import React, { useEffect, useState } from 'react';
import { getPlayerAvatarUrl } from '../../lib/playerAvatars.ts';
import { api } from '../../lib/api.ts';
import { avatarPixelSize, prepareAvatarThumbnail } from '../../lib/playerAvatarThumbnail.ts';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const cssPixels: Record<AvatarSize, number> = { xs: 28, sm: 36, md: 48, lg: 64, xl: 80 };

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
  const [thumbnail, setThumbnail] = useState<{ source: string; pixels: number; url: string } | null>(null);
  const pixels = avatarPixelSize(cssPixels[size], typeof window === 'undefined' ? 1 : window.devicePixelRatio);

  useEffect(() => {
    if (!dataUrl || failed) return;
    let cancelled = false;
    void prepareAvatarThumbnail(dataUrl, pixels).then((url) => {
      if (!cancelled) setThumbnail({ source: dataUrl, pixels, url });
    });
    return () => { cancelled = true; };
  }, [dataUrl, failed, pixels]);

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

  return (
    <span
      className={`${sizeClasses[size]} ${className} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-soft bg-surface-2 font-black text-accent shadow-sm`}
      title={nickname || 'Игрок'}
      aria-label={`Аватар: ${nickname || 'игрок'}`}
    >
      {dataUrl && !failed ? (
        <img
          src={thumbnail?.source === dataUrl && thumbnail.pixels === pixels ? thumbnail.url : dataUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-[center_30%]"
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 64 64" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="32" fill="#292733" />
          <circle cx="32" cy="24" r="11" fill="#AFA9BD" />
          <path d="M12 59c1-13 9-20 20-20s19 7 20 20" fill="#AFA9BD" />
          <path d="M12 59c1-13 9-20 20-20s19 7 20 20" stroke="#D0C9DC" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
};