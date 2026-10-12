import { useId, type ReactElement } from 'react';

/**
 * Vector exhibits of the trophy cabinet drawn by Claude (owner, 2026-10-12: «пока отрисуй ты, потом я их перерисую»).
 * One style: a metal body with a light edge, a dark inner field and a clear symbol. Pure SVG, no raster assets.
 */

export type MedalTier = 1 | 2 | 3 | null;
export type NominationGlyph = 'sheriff' | 'don' | 'mafia' | 'citizen' | 'mvp' | 'move' | 'star';

const METALS = {
  1: { light: '#FFF3C2', mid: '#E1B341', dark: '#8A6417', ribbon: '#B2342F', numeral: '1' },
  2: { light: '#F7F9FB', mid: '#B4BDC7', dark: '#59636F', ribbon: '#3C5E8F', numeral: '2' },
  3: { light: '#F6D9BF', mid: '#C78552', dark: '#6B3F1F', ribbon: '#3D7A58', numeral: '3' },
  other: { light: '#E5EAEE', mid: '#8E9AA6', dark: '#46515D', ribbon: '#5B6573', numeral: '' },
} as const;

/** The place a medal stands for: 1, 2 or 3; any other verified place gets a plain steel medal. */
export const medalTierFromPlace = (raw?: string | null): MedalTier => {
  const match = String(raw || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').match(/(?:^|[^\d])([123])\s*(?:-?\s*(?:е|ое|й|я)\s*)?место/);
  return match ? Number(match[1]) as 1 | 2 | 3 : null;
};

/** The symbol of a nomination, read from its title. */
export const nominationGlyphFromTitle = (raw?: string | null): NominationGlyph => {
  const text = String(raw || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (/mvp|лучший игрок|мвп/.test(text)) return 'mvp';
  if (/шериф/.test(text)) return 'sheriff';
  if (/дон/.test(text)) return 'don';
  if (/мафи|чёрн|черн/.test(text)) return 'mafia';
  if (/мирн|красн/.test(text)) return 'citizen';
  if (/лх|лучший ход|ход/.test(text)) return 'move';
  return 'star';
};

export function PlaceMedal({ tier }: { tier: MedalTier }) {
  const id = useId().replace(/:/g, '');
  const metal = METALS[tier ?? 'other'];
  return <svg className="trophy-cabinet__object trophy-cabinet__object--medal" viewBox="0 0 104 124" fill="none" role="img" aria-label={tier ? `Медаль за ${tier} место` : 'Медаль'}>
    <defs>
      <linearGradient id={id + 'm'} x1="22" y1="40" x2="84" y2="112" gradientUnits="userSpaceOnUse">
        <stop stopColor={metal.light} /><stop offset=".45" stopColor={metal.mid} /><stop offset="1" stopColor={metal.dark} />
      </linearGradient>
    </defs>
    <path d="M27 6H44L52 33L60 6H77L61 52H43L27 6Z" fill={metal.ribbon} stroke={metal.light} strokeOpacity=".55" strokeWidth="1.5" />
    <path d="M44 6L52 33L60 6" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" />
    <circle cx="52" cy="78" r="34" fill={`url(#${id}m)`} stroke={metal.light} strokeWidth="2" />
    <circle cx="52" cy="78" r="26.5" fill="#151C25" stroke={metal.dark} strokeWidth="2" />
    <circle cx="52" cy="78" r="21" fill="none" stroke={metal.mid} strokeOpacity=".5" strokeWidth="1" strokeDasharray="2 3" />
    {metal.numeral
      ? <text x="52" y="90" textAnchor="middle" fontFamily="Space Grotesk, Inter, sans-serif" fontWeight="800" fontSize="34" fill={metal.light}>{metal.numeral}</text>
      : <path d="M52 62L57.6 73L69 74.6L60.8 82.6L62.8 94L52 88.6L41.2 94L43.2 82.6L35 74.6L46.4 73L52 62Z" fill={metal.light} />}
    <path d="M30 62C34 50 44 44 52 44" stroke="#fff" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

const GLYPHS: Record<NominationGlyph, ReactElement> = {
  sheriff: <path d="M52 40L58.6 53.4L73.4 55.6L62.7 66L65.2 80.8L52 73.8L38.8 80.8L41.3 66L30.6 55.6L45.4 53.4L52 40Z" />,
  don: <><path d="M34 70H70L66 62C64 54 60 50 52 50C44 50 40 54 38 62L34 70Z" /><rect x="30" y="70" width="44" height="6" rx="3" /></>,
  mafia: <><path d="M38 58H66C70 58 72 60 72 63C72 65 70 66 68 66H60L56 80H46L48 66H40C36 66 34 63 34 61C34 59 35 58 38 58Z" /></>,
  citizen: <path d="M52 80C36 68 33 58 38 52C43 47 49 49 52 54C55 49 61 47 66 52C71 58 68 68 52 80Z" />,
  mvp: <path d="M32 74L36 50L46 62L52 46L58 62L68 50L72 74H32ZM34 78H70V84H34V78Z" />,
  move: <><circle cx="52" cy="62" r="14" /><path d="M52 40V48M52 76V84M30 62H38M66 62H74" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" /></>,
  star: <path d="M52 40L58.6 53.4L73.4 55.6L62.7 66L65.2 80.8L52 73.8L38.8 80.8L41.3 66L30.6 55.6L45.4 53.4L52 40Z" />,
};

export function NominationPlaque({ glyph }: { glyph: NominationGlyph }) {
  const id = useId().replace(/:/g, '');
  return <svg className="trophy-cabinet__object trophy-cabinet__object--plaque" viewBox="0 0 104 124" fill="none" role="img" aria-label="Номинация">
    <defs>
      <linearGradient id={id + 'p'} x1="18" y1="15" x2="86" y2="108"><stop stopColor="#F2D78B" /><stop offset=".45" stopColor="#B28A35" /><stop offset="1" stopColor="#6F5219" /></linearGradient>
    </defs>
    <path d="M18 24L30 12H74L86 24V96L74 108H30L18 96V24Z" fill="#161C24" stroke={`url(#${id}p)`} strokeWidth="5" />
    <path d="M27 30L35 22H69L77 30V90L69 98H35L27 90V30Z" stroke="#C9A24A" strokeOpacity=".5" />
    <g color="#F2D78B" fill="#F2D78B" stroke="none">{GLYPHS[glyph]}</g>
    <path d="M36 94H68" stroke="#B28A35" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
