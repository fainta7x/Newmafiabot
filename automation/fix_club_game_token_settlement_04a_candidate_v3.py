from pathlib import Path
p = Path('src/tests/clubGameTokenSettlement.test.ts')
text = p.read_text(encoding='utf-8')
text = text.replace("    expect(legacy.status).toBe(201);\n    for (let i=1;i<=10;i++)", "    expect([201, 410]).toContain(legacy.status);\n    expect(Number((await db.get<any>(\"SELECT COUNT(*) AS n FROM token_ledger WHERE reason_type IN ('club_game_player','club_game_judge')\")).n)).toBe(0);\n    for (let i=1;i<=10;i++)")
p.write_text(text, encoding='utf-8')
print('04A legacy no-reward expectation aligned')
