export const NOIR_EXPORT_COLORS = {
  background: '#09090B',
  surface: '#111114',
  surfaceSoft: '#17171B',
  warmText: '#F3EDE4',
  mutedText: '#9B948C',
  subduedText: '#6F6963',
  wine: '#E63261',
  wineSoft: '#8C2943',
  divider: '#2C292D',
  gold: '#D9B35F',
  silver: '#BFC3C9',
  bronze: '#B77951',
} as const;

// Source of truth: score semantics already used by the post-game/tournament game result surfaces.
export const NOIR_EXPORT_SCORE_COLORS = {
  wins: '#34D399',
  judge: '#34D399',
  protocol: '#34D399',
  best_move: '#FBBF24',
  ci: '#22D3EE',
  game_penalty: '#F87171',
  discipline: '#F87171',
  neutral: '#F8FAFC',
  final: '#F3EDE4',
} as const;

export type NoirExportScoreColorKey = keyof typeof NOIR_EXPORT_SCORE_COLORS;

export const NOIR_EXPORT_LAYOUT = {
  width: 1080,
  margin: 58,
  footerHeight: 86,
} as const;

export const NOIR_EXPORT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

const escapeNoirText = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&apos;');

export function renderNoirExportBackground(width: number, height: number): string {
  return `<defs>
    <linearGradient id="noirDocumentBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#08080A"/>
      <stop offset="55%" stop-color="#0B090C"/>
      <stop offset="100%" stop-color="#120D11"/>
    </linearGradient>
    <linearGradient id="noirWineWash" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5B1329" stop-opacity="0.28"/>
      <stop offset="55%" stop-color="#2A0D18" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#09090B" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="monogramGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4E1728"/>
      <stop offset="48%" stop-color="#261018"/>
      <stop offset="100%" stop-color="#111014"/>
    </linearGradient>
    <filter id="monogramBlur" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#noirDocumentBg)"/>
  <rect width="${width}" height="300" fill="url(#noirWineWash)"/>
  <rect x="0" y="0" width="${width}" height="8" fill="${NOIR_EXPORT_COLORS.wineSoft}"/>`;
}

export function renderNoirExportBrandHeader(
  section: string,
  options: { x?: number; brandY?: number; sectionY?: number } = {},
): string {
  const x = options.x ?? NOIR_EXPORT_LAYOUT.margin;
  const brandY = options.brandY ?? 58;
  const sectionY = options.sectionY ?? 98;
  return `<text x="${x}" y="${brandY}" font-family="${NOIR_EXPORT_FONT_FAMILY}" font-size="21" font-weight="900" fill="#D7A0AE" letter-spacing="3.4">2LA NOIRE</text>
    <text x="${x}" y="${sectionY}" font-family="${NOIR_EXPORT_FONT_FAMILY}" font-size="19" font-weight="850" fill="#857E77" letter-spacing="3.1">${escapeNoirText(section)}</text>`;
}

export function renderNoirExportFooter(
  width: number,
  height: number,
  rightText = '',
): string {
  const margin = NOIR_EXPORT_LAYOUT.margin;
  const dividerY = height - NOIR_EXPORT_LAYOUT.footerHeight + 14;
  const baselineY = height - 26;
  return `<line x1="${margin}" y1="${dividerY}" x2="${width - margin}" y2="${dividerY}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>
    <text x="${margin}" y="${baselineY}" font-family="${NOIR_EXPORT_FONT_FAMILY}" font-size="17" font-weight="900" fill="#B88B97" letter-spacing="3.1">2LA NOIRE</text>
    ${rightText ? `<text x="${width - margin}" y="${baselineY}" text-anchor="end" font-family="${NOIR_EXPORT_FONT_FAMILY}" font-size="15" font-weight="650" fill="${NOIR_EXPORT_COLORS.subduedText}">${escapeNoirText(rightText)}</text>` : ''}`;
}
