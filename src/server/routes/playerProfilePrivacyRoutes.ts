import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import {
  DEFAULT_PLAYER_PROFILE_VISIBILITY,
  ensurePlayerProfileVisibilitySchema,
  parsePlayerProfileVisibility,
  type PlayerProfileVisibility,
} from '../services/playerProfileVisibilityService.ts';

const router = Router();
const playerId = (req:any) => getPlayerSessionId(req) ? String(getPlayerSessionId(req)) : null;

const legacyBirthdayVisibility = (visibility: PlayerProfileVisibility) =>
  visibility.birthday_day_month ? (visibility.birth_year ? 'full' : 'day_month') : 'private';

router.get('/privacy-settings', async (req,res) => {
  const id=playerId(req); if(!id) return res.status(401).json({error:'Player authentication required.'});
  await ensurePlayerProfileVisibilitySchema(req.db);
  const row=await req.db.get<any>('SELECT profile_visibility_json,birthday_visibility FROM players WHERE id=? LIMIT 1',[id]);
  if(!row) return res.status(404).json({error:'Игрок не найден'});
  return res.json({visibility:parsePlayerProfileVisibility(row.profile_visibility_json,row.birthday_visibility)});
});

router.patch('/privacy-settings', async (req,res) => {
  const id=playerId(req); if(!id) return res.status(401).json({error:'Player authentication required.'});
  await ensurePlayerProfileVisibilitySchema(req.db);
  const row=await req.db.get<any>('SELECT profile_visibility_json,birthday_visibility FROM players WHERE id=? LIMIT 1',[id]);
  if(!row) return res.status(404).json({error:'Игрок не найден'});
  const current=parsePlayerProfileVisibility(row.profile_visibility_json,row.birthday_visibility); const body=req.body?.visibility||req.body||{};
  const next: PlayerProfileVisibility={...current};
  for(const key of Object.keys(DEFAULT_PLAYER_PROFILE_VISIBILITY) as Array<keyof PlayerProfileVisibility>) {
    if(Object.prototype.hasOwnProperty.call(body,key)) next[key]=body[key]===true;
  }
  const now=new Date().toISOString();
  await req.db.run(
    'UPDATE players SET profile_visibility_json=?, birthday_visibility=?, profile_updated_at=?, updated_at=? WHERE id=?',
    [JSON.stringify(next),legacyBirthdayVisibility(next),now,now,id],
  );
  return res.json({success:true,visibility:next});
});

router.get('/profiles/:playerId/birthday', async (req,res) => {
  const viewer=playerId(req); const organizer=(req as any).userRole==='ORGANIZER';
  if(!viewer&&!organizer) return res.status(401).json({error:'Player authentication required.'});
  await ensurePlayerProfileVisibilitySchema(req.db);
  const id=String(req.params.playerId);
  const row=await req.db.get<any>('SELECT birth_day,birth_month,birth_year,birthday_visibility,profile_visibility_json FROM players WHERE id=? LIMIT 1',[id]);
  if(!row) return res.status(404).json({error:'Игрок не найден'});
  const own=viewer===id; const visibility=parsePlayerProfileVisibility(row.profile_visibility_json,row.birthday_visibility); const privateAccess=own||organizer;
  return res.json({
    day: privateAccess||visibility.birthday_day_month ? row.birth_day ?? null : null,
    month: privateAccess||visibility.birthday_day_month ? row.birth_month ?? null : null,
    year: privateAccess||visibility.birth_year ? row.birth_year ?? null : null,
    private: privateAccess,
  });
});

export default router;
