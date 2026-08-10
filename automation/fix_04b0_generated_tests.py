from pathlib import Path

# The migration creates an evening/response index; the focused SQLite fixture needs the indexed column.
p=Path('src/tests/eveningCanonicalStatus.test.ts')
s=p.read_text(encoding='utf-8')
s=s.replace("CREATE TABLE evening_participants(id TEXT PRIMARY KEY,response_status TEXT NOT NULL DEFAULT 'unanswered',registration_status TEXT,attendance_status TEXT,arrival_status TEXT);",
            "CREATE TABLE evening_participants(id TEXT PRIMARY KEY,evening_id TEXT NOT NULL DEFAULT 'e1',response_status TEXT NOT NULL DEFAULT 'unanswered',registration_status TEXT,attendance_status TEXT,arrival_status TEXT);")
p.write_text(s,encoding='utf-8')

# Existing UI test must assert the new explicit arrival actions and canonical write payload.
p=Path('src/tests/eveningParticipantSheet.test.tsx')
s=p.read_text(encoding='utf-8')
s=s.replace("registration_status: 'going', attendance_status", "response_status: 'going', registration_status: 'going', attendance_status")
s=s.replace("fireEvent.click(screen.getByRole('button', { name: 'Пришёл' }));\n    await waitFor(() => expect(mocks.updateParticipant).toHaveBeenCalledWith('ep-1', { attendance_status: 'attended' }));",
            "fireEvent.click(screen.getByRole('button', { name: 'Вовремя' }));\n    await waitFor(() => expect(mocks.updateParticipant).toHaveBeenCalledWith('ep-1', { attendance_fact: 'on_time' }));\n    expect(mocks.updateParticipant).not.toHaveBeenCalledWith('ep-1', expect.objectContaining({ response_status: expect.anything() }));\n\n    fireEvent.click(screen.getByRole('button', { name: 'Позже' }));\n    await waitFor(() => expect(mocks.updateParticipant).toHaveBeenCalledWith('ep-1', { attendance_fact: 'late' }));")
p.write_text(s,encoding='utf-8')
print('aligned 04B0 focused test fixtures')
