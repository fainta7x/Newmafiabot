import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();
const DEFAULTS = {
  real_name: false,
  birthday_day_month: false,
  birth_year: false,
  telegram_username: false,
  phone: false,
  game_statistics: true,
  connections: true,
};

type Visibility = typeof DEFAULTS;
const parse = (raw: unknown): Visibility => {
  let value: Record<string, unknown> = {};
  try { value = JSON.parse(String(raw || '{}')); } catch { value = {}; }
  return {
    real_name: value.real_name === true,
    birthday_day_month: value.birthday_day_month === true,
    birth_year: value.birth_year === true,
    telegram_username: value.telegram_username === true,
    phone: value.phone === true,
    game_statistics: value.game_statistics !== false,
    connections: value.connections !== false,
  };
};
const playerId = (req:any) => getPlayerSessionId(req) ? String(getPlayerSessionId(req)) : null;

router.get('/privacy-settings', async (req,res) => {
  const id=playerId(req); if(!id) return res.status(401).json({error:'Player authentication required.'});
  const row=await req.db.get<any>('SELECT profile_visibility_json FROM players WHERE id=? LIMIT 1',[id]);
  if(!row) return res.status(404).json({error:'Игрок не найден'});
  return res.json({visibility:parse(row.profile_visibility_json)});
});

router.patch('/privacy-settings', async (req,res) => {
  const id=playerId(req); if(!id) return res.status(401).json({error:'Player authentication required.'});
  const row=await req.db.get<any>('SELECT profile_visibility_json FROM players WHERE id=? LIMIT 1',[id]);
  if(!row) return res.status(404).json({error:'Игрок не найден'});
  const current=parse(row.profile_visibility_json); const body=req.body?.visibility||req.body||{};
  const next={...current};
  for(const key of Object.keys(DEFAULTS) as Array<keyof Visibility>) if(Object.prototype.hasOwnProperty.call(body,key)) next[key]=body[key]===true;
  const now=new Date().toISOString();
  await req.db.run('UPDATE players SET profile_visibility_json=?, profile_updated_at=?, updated_at=? WHERE id=?',[JSON.stringify(next),now,now,id]);
  return res.json({success:true,visibility:next});
});

router.get('/profiles/:playerId/birthday', async (req,res) => {
  const viewer=playerId(req); const organizer=req.userRole==='ORGANIZER';
  if(!viewer&&!organizer) return res.status(401).json({error:'Player authentication required.'});
  const id=String(req.params.playerId);
  const row=await req.db.get<any>('SELECT birth_day,birth_month,birth_year,profile_visibility_json FROM players WHERE id=? LIMIT 1',[id]);
  if(!row) return res.status(404).json({error:'Игрок не найден'});
  const own=viewer===id; const visibility=parse(row.profile_visibility_json); const privateAccess=own||organizer;
  return res.json({
    day: privateAccess||visibility.birthday_day_month ? row.birth_day ?? null : null,
    month: privateAccess||visibility.birthday_day_month ? row.birth_month ?? null : null,
    year: privateAccess||visibility.birth_year ? row.birth_year ?? null : null,
    private: privateAccess,
  });
});

export default router;
