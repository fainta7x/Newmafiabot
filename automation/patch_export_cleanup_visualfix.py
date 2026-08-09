from pathlib import Path
import re


def sub_once(pattern: str, replacement: str, text: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return result

p = Path('src/lib/tournamentResultsExport.ts')
s = p.read_text(encoding='utf-8')

s = sub_once(
    r"interface PublicationRankingRowLayout \{.*?\n\}",
    '''interface PublicationRankingRowLayout {
  item: OfficialStandingPresentation;
  nameLines: string[];
  nameY: number;
  nameLineHeight: number;
  contextLines: string[];
  contextY: number;
  scoreY: number;
  scoreRows: PublicationScoreRow[];
  rowHeight: number;
}''',
    s,
    'publication ranking interface',
)

s = s.replace('  const fontSize = 21;\n  const gap = 24;', '  const fontSize = 19;\n  const gap = 24;', 1)
s = s.replace("    const fullWidth = component.kind === 'ci' || estimateOfficialTextWidth(text, fontSize) > columnWidth;", "    const fullWidth = estimateOfficialTextWidth(text, fontSize) > columnWidth;", 1)

s = sub_once(
    r"function layoutPublicationRankingRow\(.*?\n\}\n\nfunction renderPublicationScoreGrid",
    '''function layoutPublicationRankingRow(item: OfficialStandingPresentation, contentWidth: number): PublicationRankingRowLayout {
  const nameFontSize = 27;
  const nameLineHeight = 28;
  const nameLines = wrapExportText(item.display_name, Math.max(14, Math.floor(contentWidth / (nameFontSize * 0.53))), 2);
  const nameY = 30;
  const nameBottom = nameY + Math.max(0, nameLines.length - 1) * nameLineHeight;
  const contextText = [formatWinsSummary(item.wins, item.games_played), ...buildTieBreakStats(item)].join(' · ');
  const contextLines = wrapExportText(contextText, Math.max(34, Math.floor(contentWidth / (18 * 0.53))), 2);
  const contextY = nameBottom + 22;
  const scoreRows = layoutPublicationScoreGrid(getOfficialScoreComponents(item), contentWidth);
  const scoreY = contextY + Math.max(0, contextLines.length - 1) * 20 + 28;
  const scoreBottom = scoreRows.length ? scoreY + Math.max(0, scoreRows.length - 1) * 22 + 14 : contextY + 14;
  const rowHeight = Math.max(124, scoreBottom + 16);
  return { item, nameLines, nameY, nameLineHeight, contextLines, contextY, scoreY, scoreRows, rowHeight };
}

function renderPublicationScoreGrid''',
    s,
    'publication ranking layout',
)

s = s.replace('font-size="21" font-weight="700"', 'font-size="19" font-weight="700"', 1)
s = s.replace('${y + rowIndex * 27}', '${y + rowIndex * 22}', 1)

replacements = {
    '  const headerHeight = 228 + titleExtra;': '  const headerHeight = 218 + titleExtra;',
    '  const rankingHeaderHeight = 68;': '  const rankingHeaderHeight = 54;',
    '  const rankX = margin + 22;': '  const rankX = margin + 18;',
    '  const avatarX = margin + 52;': '  const avatarX = margin + 42;',
    '  const avatarSize = 64;': '  const avatarSize = 58;',
    '  const contentX = margin + 136;': '  const contentX = margin + 112;',
    '  const totalColumnWidth = 112;': '  const totalColumnWidth = 94;',
    '  const contentRight = totalRight - totalColumnWidth - 28;': '  const contentRight = totalRight - totalColumnWidth - 22;',
    '${officialSvgTextLines(titleLines, margin, 160, 48, `font-family="${font}" font-size="46" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.8"`)}': '${officialSvgTextLines(titleLines, margin, 150, 44, `font-family="${font}" font-size="42" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.7"`)}',
    '<text x="${margin}" y="${214 + titleExtra}" font-family="${font}" font-size="19" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>': '<text x="${margin}" y="${190 + titleExtra}" font-family="${font}" font-size="18" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>',
    '<text x="${margin}" y="${headerHeight + 43}" font-family="${font}" font-size="30" font-weight="900"': '<text x="${margin}" y="${headerHeight + 37}" font-family="${font}" font-size="28" font-weight="900"',
    '<text x="${totalRight}" y="${headerHeight + 43}"': '<text x="${totalRight}" y="${headerHeight + 37}"',
    '<text x="${rankX}" y="${y + 48}"': '<text x="${rankX}" y="${y + 41}"',
    'font-size="31" font-weight="900"': 'font-size="29" font-weight="900"',
    '${officialAvatarSvg(item.avatar_data_url, item.display_name, avatarX, y + 17, avatarSize,': '${officialAvatarSvg(item.avatar_data_url, item.display_name, avatarX, y + 12, avatarSize,',
    '`font-family="${font}" font-size="29" font-weight="900"': '`font-family="${font}" font-size="27" font-weight="900"',
    '<text x="${contentX}" y="${y + layout.winsY}" font-family="${font}" font-size="20" font-weight="650" fill="#AAA39A">${escapeXml(formatWinsSummary(item.wins, item.games_played))}</text>': '${officialSvgTextLines(layout.contextLines, contentX, y + layout.contextY, 20, `font-family="${font}" font-size="18" font-weight="650" fill="#AAA39A"`)}',
    '<text x="${totalRight}" y="${y + 49}"': '<text x="${totalRight}" y="${y + 42}"',
}
for old, new in replacements.items():
    if s.count(old) != 1:
        raise SystemExit(f'ranking compact match failed ({s.count(old)}): {old[:80]}')
    s = s.replace(old, new, 1)

s = sub_once(
    r"\n    if \(layout\.tieY !== null\) \{.*?\n    \}",
    '',
    s,
    'remove separate secondary stat block',
)

p.write_text(s, encoding='utf-8')

p = Path('src/lib/seatingExport.ts')
s = p.read_text(encoding='utf-8')
old = '<text x="${width - margin}" y="${222 + titleExtra}" text-anchor="end" font-family="${font}" font-size="17" font-weight="700" fill="${NOIR_EXPORT_COLORS.subduedText}">В ячейке — место игрока за столом</text>'
new = '<text x="${width - margin}" y="${tableTop - 22}" text-anchor="end" font-family="${font}" font-size="15" font-weight="700" fill="${NOIR_EXPORT_COLORS.subduedText}">В ячейке — место игрока за столом</text>'
if s.count(old) != 1:
    raise SystemExit(f'seating hint match={s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

print('visual compaction patch applied')
