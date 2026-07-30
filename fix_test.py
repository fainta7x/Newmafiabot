import sys
content = open('src/tests/disciplinePersistence.test.ts', 'r').read()

target = """  const p1Game = sp1.games[0];
  expect(p1Game.game_penalty_points).toBe(0.25);
  expect(p1Game.disciplinary_penalty_points).toBe(2.9);
  expect(p1Game.penalty_points).toBe(3.15);


  const nomRes = await request(app)
    .get(`/api/tournaments/${tournamentId}/nominations`)
    .set('Cookie', organizerCookie);
  
  const bestCitizen = nomRes.body.nominations.find((n: any) => n.category === 'best_citizen');
  const nP1 = bestCitizen.candidates.find((c: any) => c.participant_id === p1.participant_id);
  expect(nP1.nomination_points).toBe(-0.25);
"""

replacement = """  const p1Game = sp1.games[0];
  expect(p1Game.game_penalty_points).toBe(0.25);
  expect(p1Game.disciplinary_penalty_points).toBe(2.9);
  expect(p1Game.penalty_points).toBe(3.15);

  const nomRes = await request(app)
    .get(`/api/tournaments/${tournamentId}/nominations`)
    .set('Cookie', organizerCookie);
  
  const bestCitizen = nomRes.body.nominations.find((n: any) => n.category === 'best_citizen');
  const nP1 = bestCitizen.candidates.find((c: any) => c.participant_id === p1.participant_id);
  expect(nP1.nomination_points).toBe(-0.25);
});
"""

content = content.replace("});", "") # clean up everything
# wait, if I stripped all "});", I need to add them back.
# I will just write a new test file, easier.
