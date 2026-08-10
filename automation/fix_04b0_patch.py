from pathlib import Path
p=Path('/tmp/patch_04b0.py')
s=p.read_text(encoding='utf-8')

stale_table="rep('src/server/routes/eveningsRoutes.ts', \"const { table_id, registration_status } = req.body;\\n    const updated = await assignParticipantToTable(db, req.params.participantId, table_id, registration_status, participant.evening_id);\", \"const { table_id } = req.body;\\n    const updated = await assignParticipantToTable(db, req.params.participantId, table_id, participant.evening_id);\")\n"
if stale_table not in s: raise RuntimeError('expected stale table-move replacement not found')
s=s.replace(stale_table,'',1)

old="rep('src/server/routes/eveningsRoutes.ts', \"import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\", \"import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\\nimport { getActualAttendanceFact, normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';\")"
new="rep('src/server/routes/eveningsRoutes.ts', \"import { assignParticipantToTable } from '../services/tableAssignmentService.ts';\", \"import { assignParticipantToTable } from '../services/tableAssignmentService.ts';\\nimport { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';\")"
if old not in s: raise RuntimeError('stale evenings import replacement not found')
s=s.replace(old,new,1)

old2="rep('src/server/routes/participantRoutes.ts', \"import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\", \"import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\\nimport { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';\")"
new2="rep('src/server/routes/participantRoutes.ts', \"import { assignParticipantToTable } from '../services/tableAssignmentService.ts';\", \"import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\\nimport { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';\")"
if old2 not in s: raise RuntimeError('stale participant import replacement not found')
s=s.replace(old2,new2,1)

p.write_text(s,encoding='utf-8')
print('aligned 04B0 patch with current route imports')
