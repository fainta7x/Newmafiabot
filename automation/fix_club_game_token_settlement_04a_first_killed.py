from pathlib import Path

def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

replace_once(
    'src/server/services/clubGameTokenSettlementService.ts',
    "  const relevant = modern.filter((move: any) => String(move?.participant_id || '') === participantId);\n  if (relevant.length) {\n    return relevant.reduce((sum: number, move: any) => sum + calculateBestMovePoints(move?.seat_numbers, playerResults), 0);\n  }\n  if (String(protocol?.best_move_participant_id || '') === participantId) {\n    return calculateBestMovePoints(protocol?.best_move_seats, playerResults);\n  }",
    "  const firstKilledParticipantId = String(protocol?.first_killed_participant_id || '');\n  if (!participantId || participantId !== firstKilledParticipantId) return 0;\n  const relevant = modern.filter((move: any) =>\n    move?.source === 'first_killed' && String(move?.participant_id || '') === participantId\n  );\n  if (relevant.length) {\n    return relevant.reduce((sum: number, move: any) => sum + calculateBestMovePoints(move?.seat_numbers, playerResults), 0);\n  }\n  if (\n    String(protocol?.best_move_participant_id || '') === participantId\n    && (!protocol?.best_move_source || protocol.best_move_source === 'first_killed')\n  ) {\n    return calculateBestMovePoints(protocol?.best_move_seats, playerResults);\n  }"
)

replace_once(
    'src/tests/clubGameTokenSettlement.test.ts',
    "    const completed = protocol('completed', results, { best_moves:[{participant_id:'ep-1',source:'first_killed',seat_numbers:[8,9,10]}] });",
    "    const completed = protocol('completed', results, {\n      first_killed_participant_id:'ep-1', zero_round_voted_participant_id:'ep-2',\n      best_moves:[\n        {participant_id:'ep-1',source:'first_killed',seat_numbers:[8,9,10]},\n        {participant_id:'ep-2',source:'zero_round_voted',seat_numbers:[8,9,10]},\n      ],\n    });"
)
replace_once(
    'src/tests/clubGameTokenSettlement.test.ts',
    "    expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-1'\")).tokens)).toBe(315);\n    expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-11'\")).tokens)).toBe(100);",
    "    expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-1'\")).tokens)).toBe(315);\n    expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-2'\")).tokens)).toBe(215);\n    expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-11'\")).tokens)).toBe(100);"
)
print('04A first-killed LH mapping fixed')
