from pathlib import Path
import re
import subprocess

ROOT = Path('.')
EXP = ROOT / 'src/lib/tournamentResultsExport.ts'
MODAL = ROOT / 'src/components/crm/tournaments/ResultsImageExportModal.tsx'
STAND_VIEW = ROOT / 'src/components/crm/tournaments/TournamentStandingsView.tsx'
DETAIL = ROOT / 'src/components/crm/tournaments/TournamentDetailView.tsx'
OFFICIAL_VIEW = ROOT / 'src/components/crm/tournaments/TournamentOfficialResults.tsx'
NOMS_VIEW = ROOT / 'src/components/crm/tournaments/TournamentNominationsView.tsx'
TEST = ROOT / 'src/tests/resultExportPublication.test.ts'

text = EXP.read_text(encoding='utf-8')

def rep(old, new, label, count=1):
    global text
    found = text.count(old)
    if found != count:
        raise SystemExit(f'{label}: expected {count}, found {found}')
    text = text.replace(old, new, count)

rep("add('judge', 'Баллы', row.judge_bonus);", "add('judge', 'Оценка судей', row.judge_bonus);", 'game judge label')
rep("add('protocol', 'Доп. баллы', row.protocol_bonus);", "add('protocol', row.protocol_bonus < 0 ? 'Штраф по протоколу' : 'Бонус по протоколу', row.protocol_bonus);", 'game protocol label')
rep('ОФИЦИАЛЬНЫЙ ПРОТОКОЛ ИГРЫ', 'ИТОГИ ИГРЫ', 'game title')
rep('2LA NOIRE · ОФИЦИАЛЬНЫЙ СПОРТИВНЫЙ ПРОТОКОЛ', '2LA NOIRE · ИТОГИ ИГРЫ', 'game footer')

new_standings = Path('/tmp/new_generate_standings.ts').read_text(encoding='utf-8').strip()
pattern = re.compile(r"export function generateStandingsSvg\([\s\S]*?\n}\n\nexport function renderSvgToPngDataUrl")
match = pattern.search(text)
if not match:
    raise SystemExit('generateStandingsSvg boundary not found')
text = text[:match.start()] + new_standings + "\n\nexport function renderSvgToPngDataUrl" + text[match.end():]

old_head = """  let headline = 'ЛУЧШАЯ ОЦЕНКА СУДЕЙ';
  let headToHeadLabel: string | null = null;
  if (criterion === 'points') {
    headline = `ЛУЧШАЯ ОЦЕНКА СУДЕЙ · ${formatPosterNumber(candidate.points)}`;
  } else if (criterion === 'additional_points') {
    headline = `ПРИ РАВНОЙ ОЦЕНКЕ · ВЫШЕ ИГРОВЫЕ НАЧИСЛЕНИЯ ${formatPosterNumber(candidate.additional_points, { signed: true })}`;
  } else if (criterion === 'role_wins') {
    headline = `ПРИ РАВНОЙ ОЦЕНКЕ И НАЧИСЛЕНИЯХ · ${nominationRoleWinLabel(result.category, candidate.role_wins)}`;
  } else if (criterion === 'head_to_head') {
    const scores = result.comparison.head_to_head_scores || {};
    const winnerScore = scores[candidate.participant_id] || 0;
    const finalStage = [...result.comparison.stages].reverse().find((stage) => stage.criterion === 'head_to_head');
    const opponentScores = (finalStage?.candidate_ids || [])
      .filter((id) => id !== candidate.participant_id)
      .map((id) => scores[id] || 0);
    headToHeadLabel = opponentScores.length === 1
      ? `${winnerScore}:${opponentScores[0]}`
      : `${winnerScore} ${russianPlural(winnerScore, 'победа', 'победы', 'побед')} против ${opponentScores.join(' / ')}`;
    headline = `ЛИЧНЫЕ ВСТРЕЧИ · ${headToHeadLabel}`;
  }
"""
new_head = """  let headline = 'ПОБЕДИЛ ПО ОЦЕНКЕ СУДЕЙ';
  let headToHeadLabel: string | null = null;
  if (criterion === 'points') {
    headline = `ПОБЕДИЛ ПО ОЦЕНКЕ СУДЕЙ · ${formatPosterNumber(candidate.points)}`;
  } else if (criterion === 'additional_points') {
    headline = `ПРИ РАВНОЙ ОЦЕНКЕ СУДЕЙ · ЛУЧШЕ ПО БОНУСАМ И ШТРАФАМ`;
  } else if (criterion === 'role_wins') {
    headline = `ПРИ РАВНЫХ БАЛЛАХ · ${nominationRoleWinLabel(result.category, candidate.role_wins)}`;
  } else if (criterion === 'head_to_head') {
    const scores = result.comparison.head_to_head_scores || {};
    const winnerScore = scores[candidate.participant_id] || 0;
    const finalStage = [...result.comparison.stages].reverse().find((stage) => stage.criterion === 'head_to_head');
    const opponentScores = (finalStage?.candidate_ids || [])
      .filter((id) => id !== candidate.participant_id)
      .map((id) => scores[id] || 0);
    headToHeadLabel = opponentScores.length === 1
      ? `${winnerScore}:${opponentScores[0]}`
      : `${winnerScore} ${russianPlural(winnerScore, 'победа', 'победы', 'побед')} против ${opponentScores.join(' / ')}`;
    headline = `ПРИ ПОЛНОМ РАВЕНСТВЕ · ЛИЧНЫЕ ВСТРЕЧИ ${headToHeadLabel}`;
  }
"""
rep(old_head, new_head, 'nomination headline')

old_metrics = """const nominationMetricComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics) return [];
  const items: OfficialScoreComponent[] = [];
  const push = (kind: OfficialScoreKind, label: string, value: number, showPlus = false) => {
    const rounded = roundOfficial(value);
    items.push({ kind, label, value: rounded, tone: 'bonus', show_plus: showPlus });
  };
  push('judge', 'Оценка судей', reason.points);
  push('protocol', 'Игровые начисления', reason.additional_points, true);
  if ((reason.category === 'best_sheriff' || reason.category === 'best_don') && reason.decisive_criterion !== 'points' && reason.decisive_criterion !== 'additional_points') {
    push('wins', 'Победы в роли', reason.role_wins);
  }
  return items;
};

const nominationBreakdownComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics) return [];
  const items: OfficialScoreComponent[] = [];
  const push = (kind: OfficialScoreKind, label: string, value: number) => {
    const rounded = roundOfficial(value);
    if (Math.abs(rounded) < 0.0001) return;
    items.push({ kind, label, value: rounded, tone: 'bonus', show_plus: true });
  };
  push('protocol', 'Протокольные начисления', reason.protocol_bonus);
  push('best_move', 'Лучший ход', reason.best_move_points);
  return items;
};
"""
new_metrics = """const nominationMetricComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics) return [];
  if (reason.decisive_criterion === 'points') {
    return [{ kind: 'judge', label: 'Оценка судей', value: roundOfficial(reason.points), tone: 'base', show_plus: false }];
  }
  if (reason.decisive_criterion === 'additional_points') {
    return [{ kind: 'protocol', label: 'Итог бонусов и штрафов', value: roundOfficial(reason.additional_points), tone: 'base', show_plus: true }];
  }
  if (reason.decisive_criterion === 'role_wins') {
    return [{ kind: 'wins', label: 'Победы в роли', value: roundOfficial(reason.role_wins), tone: 'base', show_plus: false }];
  }
  return [];
};

const nominationBreakdownComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics || reason.decisive_criterion !== 'additional_points') return [];
  const items: OfficialScoreComponent[] = [];
  const protocol = roundOfficial(reason.protocol_bonus);
  if (Math.abs(protocol) >= 0.0001) {
    items.push({
      kind: 'protocol',
      label: protocol < 0 ? 'Штраф по протоколу' : 'Бонус по протоколу',
      value: protocol,
      tone: protocol < 0 ? 'penalty' : 'bonus',
      show_plus: true,
    });
  }
  const bestMove = roundOfficial(reason.best_move_points);
  if (Math.abs(bestMove) >= 0.0001) {
    items.push({ kind: 'best_move', label: 'Лучший ход', value: bestMove, tone: 'bonus', show_plus: true });
  }
  return items;
};
"""
rep(old_metrics, new_metrics, 'nomination metrics')

page_snippet = Path('/tmp/export_pages_snippet.ts').read_text(encoding='utf-8').strip()
marker = 'export function renderSvgToPngBlob(svgString: string, width: number, height: number): Promise<Blob> {'
if text.count(marker) != 1:
    raise SystemExit(f'renderSvgToPngBlob marker count = {text.count(marker)}')
text = text.replace(marker, page_snippet + '\n\n' + marker, 1)
EXP.write_text(text, encoding='utf-8')

MODAL.write_text(Path('/tmp/ResultsImageExportModal.new.tsx').read_text(encoding='utf-8'), encoding='utf-8')

def replace_file(path: Path, replacements):
    content = path.read_text(encoding='utf-8')
    for old, new, label in replacements:
        count = content.count(old)
        if count != 1:
            raise SystemExit(f'{path}:{label}: expected 1, found {count}')
        content = content.replace(old, new, 1)
    path.write_text(content, encoding='utf-8')

replace_file(STAND_VIEW, [('Скачать таблицу PNG', 'Посмотреть промежуточные итоги', 'standings action')])
replace_file(DETAIL, [('Результаты PNG', 'Посмотреть результат', 'game action')])
replace_file(OFFICIAL_VIEW, [
    ('Сформировать итоговый PNG', 'Посмотреть итоговый результат', 'official action'),
    ('PNG будет сформирован заново из актуальной таблицы и официальных наград. Генерация не меняет данные турнира.', 'Предпросмотр будет сформирован заново из актуальной таблицы и официальных наград. Генерация не меняет данные турнира.', 'official description'),
    ('Итоговый PNG станет доступен после завершения турнира и разрешения всех равенств.', 'Итоговый результат станет доступен после завершения турнира и разрешения всех равенств.', 'official unavailable copy'),
])

nom = NOMS_VIEW.read_text(encoding='utf-8')
nom_repls = [
    ('Сравнение: Баллы → Доп. баллы → для Дона/Шерифа победы в роли → личное сравнение. Ручного выбора победителя нет.',
     'Сравнение: оценка судей → бонусы и штрафы → для Дона/Шерифа победы в роли → личные встречи. Ручного выбора победителя нет.'),
    ('<span className="text-text-muted">Баллы </span><strong>{signed(winner.points)}</strong>',
     '<span className="text-text-muted">Оценка судей </span><strong>{signed(winner.points)}</strong>'),
    ('<span className="text-text-muted">Доп. </span><strong>{signed(winner.additional_points)}</strong>',
     '<span className="text-text-muted">Бонусы и штрафы </span><strong>{signed(winner.additional_points)}</strong>'),
    ('<div>Б {signed(candidate.points)}</div><div>Д {signed(candidate.additional_points)}</div>',
     '<div>Судьи {signed(candidate.points)}</div><div>Б/Ш {signed(candidate.additional_points)}</div>'),
]
for old, new in nom_repls:
    if nom.count(old) != 1:
        raise SystemExit(f'nominations UI replacement not unique: {old[:50]!r} count={nom.count(old)}')
    nom = nom.replace(old, new, 1)
NOMS_VIEW.write_text(nom, encoding='utf-8')

TEST.write_text(Path('/tmp/resultExportPublication.test.ts').read_text(encoding='utf-8'), encoding='utf-8')
subprocess.run(['git', 'add', '-N', str(TEST)], check=True)
print('patched export publication flow')
