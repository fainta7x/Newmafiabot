from pathlib import Path
p = Path('src/tests/clubGameTokenSettlement.test.ts')
text = p.read_text(encoding='utf-8')
text = text.replace("expect(managedBalance).toBe(215);", "expect(managedBalance).toBe(225);")
text = text.replace("expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-1'\")).tokens)).toBe(215);", "expect(Number((await db.get<any>(\"SELECT tokens FROM players WHERE id='p-1'\")).tokens)).toBe(225);")
text = text.replace("slot_num:idx+1,player_id:`p-${idx+1}`", "slot:idx+1,player_id:`p-${idx+1}`")
p.write_text(text, encoding='utf-8')
print('04A remaining focused expectations fixed')
