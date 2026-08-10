from pathlib import Path
p=Path('/tmp/patch_04b0.py')
s=p.read_text(encoding='utf-8')
needle="rep('src/server/routes/eveningsRoutes.ts', \"const { table_id, registration_status } = req.body;\\n    const updated = await assignParticipantToTable(db, req.params.participantId, table_id, registration_status, participant.evening_id);\", \"const { table_id } = req.body;\\n    const updated = await assignParticipantToTable(db, req.params.participantId, table_id, participant.evening_id);\")\n"
if needle not in s:
    raise RuntimeError('expected stale table-move replacement not found')
s=s.replace(needle,'',1)
p.write_text(s,encoding='utf-8')
print('removed stale table-move match; bulk path is handled by later canonical rewrite')
