from pathlib import Path
import re


def sub_once(pattern: str, replacement: str, text: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return result


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return text.replace(old, new, 1)

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

s = replace_once(
    s,
    '  const fontSize = 21;\n  const gap = 24;',
    '  const fontSize = 19;\n  const gap = 24;',
    'publication score font',
)
s = replace_once(
    s,
    "    const fullWidth = component.kind === 'ci' || estimateOfficialTextWidth(text, fontSize) > columnWidth;",
    "    const fullWidth = estimateOfficialTextWidth(text, fontSize) > columnWidth;",
    'publication score full-width rule',
)

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

s = replace_once(s, 'font-size="21" font-weight="700"', 'font-size="19" font-weight="700"', 'publication score render font')
s = replace_once(s, '${y + rowIndex * 27}', '${y + rowIndex * 22}', 'publication score row gap')

ranking_start = s.find('function generateRankingPublicationSvg(')
ranking_end = s.find('export function generateOfficialWinnersSvg(', ranking_start)
if ranking_start < 0 or ranking_end < 0:
    raise SystemExit('ranking publication function bounds missing')
block = s[ranking_start:ranking_end]
replacements = [
    ('  const headerHeight = 228 + titleExtra;', '  const headerHeight = 218 + titleExtra;', 'header height'),
    ('  const rankingHeaderHeight = 68;', '  const rankingHeaderHeight = 54;', 'ranking header height'),
    ('  const rankX = margin + 22;', '  const rankX = margin + 18;', 'rank axis'),
    ('  const avatarX = margin + 52;', '  const avatarX = margin + 42;', 'avatar axis'),
    ('  const avatarSize = 64;', '  const avatarSize = 58;', 'avatar size'),
    ('  const contentX = margin + 136;', '  const contentX = margin + 112;', 'content axis'),
    ('  const totalColumnWidth = 112;', '  const totalColumnWidth = 94;', 'total column'),
    ('  const contentRight = totalRight - totalColumnWidth - 28;', '  const contentRight = totalRight - totalColumnWidth - 22;', 'content right'),
    ('${officialSvgTextLines(titleLines, margin, 160, 48, `font-family="${font}" font-size="46" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.8"`)}', '${officialSvgTextLines(titleLines, margin, 150, 44, `font-family="${font}" font-size="42" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.7"`)}', 'title'),
    ('<text x="${margin}" y="${214 + titleExtra}" font-family="${font}" font-size="19" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>', '<text x="${margin}" y="${190 + titleExtra}" font-family="${font}" font-size="18" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>', 'meta'),
    ('<text x="${margin}" y="${headerHeight + 43}" font-family="${font}" font-size="30" font-weight="900"', '<text x="${margin}" y="${headerHeight + 37}" font-family="${font}" font-size="28" font-weight="900"', 'ranking heading'),
    ('<text x="${totalRight}" y="${headerHeight + 43}"', '<text x="${totalRight}" y="${headerHeight + 37}"', 'participant count'),
    ('<text x="${rankX}" y="${y + 48}"', '<text x="${rankX}" y="${y + 41}"', 'rank baseline'),
    ('font-size="31" font-weight="900"', 'font-size="29" font-weight="900"', 'rank font'),
    ('${officialAvatarSvg(item.avatar_data_url, item.display_name, avatarX, y + 17, avatarSize,', '${officialAvatarSvg(item.avatar_data_url, item.display_name, avatarX, y + 12, avatarSize,', 'avatar baseline'),
    ('`font-family="${font}" font-size="29" font-weight="900"', '`font-family="${font}" font-size="27" font-weight="900"', 'name font'),
    ('<text x="${contentX}" y="${y + layout.winsY}" font-family="${font}" font-size="20" font-weight="650" fill="#AAA39A">${escapeXml(formatWinsSummary(item.wins, item.games_played))}</text>', '${officialSvgTextLines(layout.contextLines, contentX, y + layout.contextY, 20, `font-family="${font}" font-size="18" font-weight="650" fill="#AAA39A"`)}', 'context line'),
    ('<text x="${totalRight}" y="${y + 49}"', '<text x="${totalRight}" y="${y + 42}"', 'total baseline'),
]
for old, new, label in replacements:
    block = replace_once(block, old, new, f'ranking {label}')

block = sub_once(
    r"\n    if \(layout\.tieY !== null\) \{.*?\n    \}",
    '',
    block,
    'remove separate secondary stat block',
)
s = s[:ranking_start] + block + s[ranking_end:]
p.write_text(s, encoding='utf-8')

p = Path('src/lib/seatingExport.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    '<text x="${width - margin}" y="${222 + titleExtra}" text-anchor="end" font-family="${font}" font-size="17" font-weight="700" fill="${NOIR_EXPORT_COLORS.subduedText}">В ячейке — место игрока за столом</text>',
    '<text x="${width - margin}" y="${tableTop - 22}" text-anchor="end" font-family="${font}" font-size="15" font-weight="700" fill="${NOIR_EXPORT_COLORS.subduedText}">В ячейке — место игрока за столом</text>',
    'seating hint',
)
p.write_text(s, encoding='utf-8')

print('visual compaction patch applied')
