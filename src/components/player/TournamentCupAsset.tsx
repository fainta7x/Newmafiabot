import { useId } from 'react';

/** Reusable in-app vector trophies with four independent 2.5D silhouettes.
 * The family and miniature serial are derived from the tournament, not the winner. */
export default function TournamentCupAsset({ designKey }: { designKey: string | null }) {
  const unique = useId().replace(/:/g, '');
  const family = designKey?.split(':')[0] || 'amphora';
  const signature = (designKey?.split(':')[1] || '2LA').slice(0, 5);
  const metals: Record<string, { light: string; mid: string; dark: string; accent: string }> = {
    spire: { light: '#F1D9B5', mid: '#B69C78', dark: '#665844', accent: '#D4C8B6' },
    amphora: { light: '#F5F6F2', mid: '#A3B0B9', dark: '#4B5665', accent: '#C5D5DC' },
    laurel: { light: '#E8D5B6', mid: '#A88D69', dark: '#5B493B', accent: '#95A9A0' },
    obelisk: { light: '#E4E7EA', mid: '#8D9AA7', dark: '#333F4F', accent: '#9C8293' },
  };
  const metal = metals[family] || metals.amphora;
  const grad = unique + '-metal', rim = unique + '-rim', base = unique + '-base';
  const metalFill = 'url(#' + grad + ')', rimFill = 'url(#' + rim + ')';
  return <svg className="trophy-cabinet__object trophy-cabinet__object--cup" viewBox="0 0 104 124" fill="none" role="img"
    aria-label={'Кубок турнира, модель ' + family + ', серия ' + signature}>
    <defs>
      <linearGradient id={grad} x1="13" y1="20" x2="94" y2="97" gradientUnits="userSpaceOnUse">
        <stop stopColor={metal.dark}/><stop offset=".16" stopColor={metal.mid}/><stop offset=".32" stopColor={metal.light}/>
        <stop offset=".5" stopColor={metal.mid}/><stop offset=".68" stopColor={metal.dark}/><stop offset=".82" stopColor={metal.mid}/><stop offset="1" stopColor={metal.light}/>
      </linearGradient>
      <linearGradient id={rim} x1="10" y1="12" x2="96" y2="52"><stop stopColor={metal.light}/><stop offset=".55" stopColor={metal.dark}/><stop offset="1" stopColor={metal.light}/></linearGradient>
      <linearGradient id={base} x1="27" y1="95" x2="80" y2="122"><stop stopColor="#56606B"/><stop offset=".48" stopColor="#1B222C"/><stop offset="1" stopColor="#0B111B"/></linearGradient>
    </defs>
    {family === 'spire' ? <>
      <path d="M52 5L74 42L70 76L52 91L34 76L30 42L52 5Z" fill={metalFill} stroke={metal.light} strokeWidth="1"/>
      <path d="M52 8V85L35 71L34 43L52 8Z" fill={metal.dark} fillOpacity=".66"/>
      <path d="M52 8L70 44L66 69L52 85V8Z" fill={metal.mid} fillOpacity=".44"/>
      <path d="M38 42L52 17L66 42L52 66L38 42Z" fill="#161F2C" stroke={metal.accent} strokeWidth="1.7"/>
      <path d="M52 22L61 42L52 57L43 42L52 22Z" fill={metal.accent} fillOpacity=".3"/>
      <path d="M52 16V84" stroke={metal.light} strokeWidth=".7" opacity=".75"/>
      <path d="M36 77L52 88L68 77L62 94H42L36 77Z" fill={rimFill}/>
      <path d="M23 41L15 50L23 72L34 78M81 41L89 50L81 72L70 78" stroke={metal.accent} strokeWidth="3.4" strokeLinejoin="round"/>
      <path d="M46 92H58V100H46Z" fill={metalFill}/>
    </> : family === 'amphora' ? <>
      <path d="M28 27C14 18 7 30 13 49C16 61 25 67 38 63M76 27C90 18 97 30 91 49C88 61 79 67 66 63"
        stroke={rimFill} strokeWidth="7" strokeLinecap="round"/>
      <path d="M17 19C22 58 30 73 52 76C74 73 82 58 87 19Z" fill={metalFill} stroke={metal.light} strokeWidth="1.2"/>
      <ellipse cx="52" cy="19" rx="36" ry="6" fill={metal.dark} stroke={metal.light} strokeWidth="2"/>
      <ellipse cx="52" cy="19" rx="27" ry="3" fill="#1B2530" stroke={metal.accent} strokeWidth=".7"/>
      <path d="M24 24C28 47 32 61 43 67" stroke={metal.light} strokeOpacity=".6" strokeWidth="1.8"/>
      <path d="M62 67C72 58 77 41 80 25" stroke={metal.dark} strokeOpacity=".55" strokeWidth="2.2"/>
      <path d="M42 42L52 36L62 42V54L52 60L42 54V42Z" fill="#192330" stroke={metal.accent} strokeWidth="1.5"/>
      <path d="M47 46H57M52 42V54" stroke={metal.light} strokeWidth="1.3"/>
      <path d="M46 75H58V91L67 99H37L46 91V75Z" fill={metalFill}/>
    </> : family === 'laurel' ? <>
      <path d="M52 15L27 44L34 77L52 87L70 77L77 44L52 15Z" fill={metalFill} stroke={metal.light} strokeWidth="1.4"/>
      <circle cx="52" cy="50" r="26" fill="#202A33" stroke={metal.light} strokeWidth="5"/>
      <circle cx="52" cy="50" r="20" fill={rimFill} stroke={metal.dark} strokeWidth="2"/>
      <circle cx="52" cy="50" r="14" fill="#111820" stroke={metal.accent} strokeWidth="1.4"/>
      <path d="M46 41L52 35L58 41V51L52 58L46 51V41Z" fill={metal.light}/>
      <path d="M24 34C7 39 8 61 27 76L40 82M80 34C97 39 96 61 77 76L64 82" stroke={metal.mid} strokeWidth="4" strokeLinecap="round"/>
      {Array.from({length:5},(_,i)=><g key={i} stroke={metal.light} strokeWidth="1.6" strokeLinecap="round">
        <path d={'M' + (16+i*2) + ' ' + (40+i*6) + 'l8 -3M' + (88-i*2) + ' ' + (40+i*6) + 'l-8 -3'}/>
      </g>)}
      <path d="M47 86H57V99H47Z" fill={metalFill}/>
    </> : <>
      <path d="M50 8L66 8L81 72L52 96L24 72L39 8L50 8Z" fill={metal.dark} stroke={metal.mid} strokeWidth="1.4"/>
      <path d="M39 8L52 88L24 72L39 8Z" fill={metalFill} fillOpacity=".85"/>
      <path d="M66 8L52 88L81 72L66 8Z" fill="#101927" stroke={metal.light} strokeOpacity=".7"/>
      <path d="M52 19L63 64L52 79L41 64L52 19Z" fill={metal.accent} fillOpacity=".75"/>
      <path d="M52 28V67" stroke={metal.light} strokeWidth="2"/>
      <path d="M32 58L18 46L18 66L31 81M73 58L87 46L87 66L74 81" stroke={rimFill} strokeWidth="5" strokeLinejoin="bevel"/>
      <path d="M44 88H61V99H44Z" fill={metalFill}/>
    </>}
    <path d="M29 99H75L81 106H23L29 99Z" fill={metalFill} stroke={metal.light} strokeWidth=".7"/>
    <path d="M23 106H81V116H23V106Z" fill={'url(#' + base + ')'} stroke="#72808C" strokeWidth="1"/>
    <path d="M28 116H76V121H28V116Z" fill="#0C1119" stroke="#737E8C" strokeWidth=".8"/>
    <rect x="36" y="107.5" width="32" height="7" rx="1.5" fill={metal.mid} stroke={metal.light} strokeWidth=".5"/>
    <text x="52" y="112.6" fill="#14202D" textAnchor="middle" fontSize="5.8" fontFamily="sans-serif" fontWeight="bold" letterSpacing=".5">{signature}</text>
  </svg>;
}
