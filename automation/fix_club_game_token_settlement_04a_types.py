from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, got {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# DB variable is intentionally request-or-default, so it infers any. Avoid generic syntax on untyped calls.
p = Path('src/server/routes/gamesRoutesBase.ts')
text = p.read_text(encoding='utf-8')
old = "const existing = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);"
if text.count(old) != 3:
    raise RuntimeError(f'expected three new settlement-route db.get<any> calls, got {text.count(old)}')
text = text.replace(old, "const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);", 3)
p.write_text(text, encoding='utf-8')

replace_once(
    'src/server/services/clubGameTokenSettlementService.ts',
    "  const additionalPointsTenths = [\n    input.judgeBonus,\n    input.protocolBonus,\n    input.bestMovePoints,\n    input.ciPoints,\n    input.disciplinaryPoints,\n  ].reduce((sum, value) => sum + decimalPointsToTenths(value), 0);",
    "  const additionalPointsTenths = [\n    input.judgeBonus,\n    input.protocolBonus,\n    input.bestMovePoints,\n    input.ciPoints,\n    input.disciplinaryPoints,\n  ].map(decimalPointsToTenths).reduce((sum, value) => sum + value, 0);"
)

replace_once(
    'src/tests/clubGameTokenSettlement.test.ts',
    "  const ledgerCount = async () => Number((await db.get<{n:number}>('SELECT COUNT(*) AS n FROM token_ledger')).n);",
    "  const ledgerCount = async () => Number((await db.get<{n:number}>('SELECT COUNT(*) AS n FROM token_ledger'))?.n || 0);"
)
print('04A TypeScript cleanup applied')
