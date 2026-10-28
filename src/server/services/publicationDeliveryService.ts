import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import type { DeliveryCertainty } from './messageDeliveryCertainty.ts';

export type PublicationResult = { ok: boolean; inFlight?: boolean; certainty: DeliveryCertainty; temporary?: boolean; error?: string; ids?: string[]; url?: string | null; retryAfter?: number };
export type PublicationContext = { key: string; entityId?: string; kind: string; legacyStatus?: string | null };
const STALE_MS = 15 * 60_000;

export async function ensurePublicationDeliverySchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS publication_deliveries (
    delivery_key TEXT PRIMARY KEY, entity_id TEXT, kind TEXT NOT NULL, channel TEXT NOT NULL,
    target TEXT NOT NULL, payload TEXT NOT NULL, fingerprint TEXT NOT NULL,
    attempt_id TEXT NOT NULL, status TEXT NOT NULL, result TEXT, next_attempt_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS publication_delivery_decisions (
    id TEXT PRIMARY KEY, delivery_key TEXT NOT NULL, attempt_id TEXT NOT NULL,
    actor TEXT NOT NULL, decision TEXT NOT NULL, evidence TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS publication_delivery_migrations (source TEXT PRIMARY KEY,created_at TEXT NOT NULL)`);
}

/** Persist before HTTP. A lost response or failed result write never grants another send. */
export async function deliverPublication<T>(db: DatabaseWrapper, context: PublicationContext, channel: string, target: string, payload: T,
  send: (payload: T, target: string) => Promise<PublicationResult>): Promise<PublicationResult> {
  await ensurePublicationDeliverySchema(db);
  const now = new Date().toISOString();
  const encoded = JSON.stringify(payload);
  const legacyUnknown = ['sending', 'retry', 'failed', 'uncertain'].includes(String(context.legacyStatus || ''));
  await db.run(`INSERT OR IGNORE INTO publication_deliveries
    (delivery_key,entity_id,kind,channel,target,payload,fingerprint,attempt_id,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [context.key, context.entityId || null, context.kind, channel, target, encoded,
    createHash('sha256').update(encoded).digest('hex'), randomUUID(), legacyUnknown ? 'uncertain' : 'ready', now, now]);
  await recoverStalePublicationDeliveries(db);
  await db.run("UPDATE publication_deliveries SET payload=?,target=?,fingerprint=? WHERE delivery_key=? AND status='ready' AND payload LIKE '%\"legacy\":true%'", [encoded,target,createHash('sha256').update(encoded).digest('hex'),context.key]);
  const attempt = randomUUID();
  const claimed = await db.run(`UPDATE publication_deliveries SET status='sending',attempt_id=?,updated_at=?
    WHERE delivery_key=? AND status IN ('ready','rejected') AND (next_attempt_at IS NULL OR next_attempt_at<=?)`, [attempt, now, context.key, now]);
  const row = await db.get<any>('SELECT * FROM publication_deliveries WHERE delivery_key=?', [context.key]);
  if (!claimed.changes) {
    if (row?.status === 'accepted') return JSON.parse(row.result || '{"ok":true,"certainty":"accepted"}');
    if (['rejected','failed'].includes(row?.status) && row.result) return JSON.parse(row.result);
    return { ok: false, inFlight:row?.status === 'sending', certainty: 'uncertain', error: 'Пост мог выйти. Проверьте публикацию в разделе «Дела».' };
  }
  let result: PublicationResult;
  try { result = await send(JSON.parse(row.payload), row.target); }
  catch (error: any) { result = { ok: false, certainty: 'uncertain', error: error?.message || String(error) }; }
  // Only explicit temporary rejection is automatically retryable. Permanent rejection stays held.
  const status = result.certainty === 'rejected' && !result.temporary ? 'failed' : result.certainty;
  const saved = await db.run(`UPDATE publication_deliveries SET status=?,result=?,next_attempt_at=?,updated_at=? WHERE delivery_key=? AND attempt_id=? AND status='sending'`,
    [status, JSON.stringify(result), result.certainty === 'rejected' && result.temporary ? new Date(Date.now() + Math.max(1, result.retryAfter || 30) * 1000).toISOString() : null, new Date().toISOString(), context.key, attempt]);
  if (!saved.changes) throw new Error('Попытка уже сверена организатором');
  return result;
}

export async function recoverStalePublicationDeliveries(db: DatabaseWrapper) {
  await db.run(`UPDATE publication_deliveries SET status='uncertain',updated_at=? WHERE status='sending' AND updated_at<=?`,
    [new Date().toISOString(), new Date(Date.now() - STALE_MS).toISOString()]);
}

export async function listHeldPublications(db: DatabaseWrapper) {
  return db.all<any>(`SELECT delivery_key,entity_id,kind,channel,target,payload,attempt_id,status,result,updated_at
    FROM publication_deliveries WHERE status='uncertain' OR (status='ready' AND COALESCE(json_extract(payload,'$.legacy'),0)<>1) OR (status='sending' AND updated_at<=?) ORDER BY created_at,delivery_key`,[new Date(Date.now()-STALE_MS).toISOString()]);
}

export async function reconcilePublication(db: DatabaseWrapper, input: { key: string; attemptId: string; decision: string; actor: string; evidence?: string; confirmed?: boolean }) {
  await ensurePublicationDeliverySchema(db);
  await recoverStalePublicationDeliveries(db);
  if (!['accepted', 'absent'].includes(input.decision) || !input.actor || (input.decision === 'absent' && input.confirmed !== true)) {
    throw Object.assign(new Error('Подтвердите результат проверки публикации'), { statusCode: 400 });
  }
  await db.transaction(async (tx) => {
    const changed = await tx.run(`UPDATE publication_deliveries SET status=?,result=?,updated_at=?
      WHERE delivery_key=? AND attempt_id=? AND status='uncertain'`, [input.decision === 'accepted' ? 'accepted' : 'ready',
      input.decision === 'accepted' ? JSON.stringify({ ok: true, certainty: 'accepted', manual: true, url: input.evidence || null }) : null,
      new Date().toISOString(), input.key, input.attemptId]);
    if (!changed.changes) throw Object.assign(new Error('Состояние уже изменилось. Обновите список.'), { statusCode: 409 });
    if (input.key.startsWith('club:')) {
      const key=input.key.slice(5).replace(/:text$/, '');
      await tx.run("UPDATE club_result_posts SET status=?,updated_at=? WHERE post_key=? AND status IN ('uncertain','sending','retry')", [input.decision === 'accepted' ? 'sent' : 'pending',new Date().toISOString(),key]);
    }
    await tx.run(`INSERT INTO publication_delivery_decisions (id,delivery_key,attempt_id,actor,decision,evidence,created_at) VALUES (?,?,?,?,?,?,?)`,
      [randomUUID(), input.key, input.attemptId, input.actor, input.decision, String(input.evidence || '').slice(0,1000), new Date().toISOString()]);
  });
}

/** Per-source cutover, once: do not reinterpret historical terminal club results or personal queues. */
export async function importLegacyPublicationHolds(db: DatabaseWrapper) {
  await ensurePublicationDeliverySchema(db);
  for (const source of ['club_result_posts','evening_today_posts','evening_cancel_posts','poker_tournament_publications','custom_event_publications','evening_reschedule_notices']) {
    if (!await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[source])) continue;
    if (await db.get('SELECT 1 FROM publication_delivery_migrations WHERE source=?',[source])) continue;
    await db.transaction(async tx => {
      if (await tx.get('SELECT 1 FROM publication_delivery_migrations WHERE source=?',[source])) return;
      const rows=await tx.all<any>(`SELECT * FROM ${source}`);
      const hold=async(key:string,entity:string,kind:string,channel:string,target:string,text:string) => {
        const encoded=JSON.stringify({legacy:true,text});const now=new Date().toISOString();
        await tx.run(`INSERT OR IGNORE INTO publication_deliveries (delivery_key,entity_id,kind,channel,target,payload,fingerprint,attempt_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'uncertain',?,?)`,
          [key,entity,kind,channel,target,encoded,createHash('sha256').update(encoded).digest('hex'),randomUUID(),now,now]);
      };
      for(const row of rows) {
        if(source==='club_result_posts') {
          if(!['retry','sending','uncertain'].includes(row.status) || ['mvp-ask','vote-nudge','cards','marker'].includes(row.kind) || row.post_key.startsWith('mvp-result-dm:'))continue;
          await hold('club:'+row.post_key,row.evening_id||row.game_id||'',row.kind,row.post_key.includes('-vk:')?'vk':'telegram','До обновления: проверьте исходный канал',row.last_error||'Исход отправки до обновления не подтверждён');
          await tx.run("UPDATE club_result_posts SET status='uncertain' WHERE post_key=?",[row.post_key]);
        } else if(source==='evening_reschedule_notices') {
          for(const channel of ['telegram','vk'])if(['failed','sending','uncertain'].includes(row[channel+'_status']) || (row.sending_until && row[channel+'_status']!=='published'))
            await hold(`reschedule:${row.id}:${channel}`,row.evening_id,'reschedule',channel,'До обновления: проверьте исходный канал',`Перенос вечера: ${row.old_starts_at} → ${row.new_starts_at}`);
        } else if(source.startsWith('evening_')) {
          const kind=source==='evening_today_posts'?'today':'cancel';
          for(const channel of ['telegram','vk'])if(['failed','sending','uncertain'].includes(row[channel+'_status']) || (kind==='today' && row.sending_until && row[channel+'_status']!=='published'))
            await hold(`${kind}:${row.evening_id}:${channel}`,row.evening_id,kind,channel,'До обновления: проверьте исходный канал',row.text||'');
        } else if(row.channel!=='bot_dm' && ['failed','sending','uncertain'].includes(row.status)) {
          const kind=source.startsWith('poker')?'poker':'custom';const id=row.tournament_id||row.event_id;
          await hold(`${kind}:${id}:${row.channel}:${row.target_key}`,id,kind,row.channel,row.target_key,row.last_error||'Исход отправки до обновления не подтверждён');
        }
      }
      await tx.run('INSERT INTO publication_delivery_migrations(source,created_at) VALUES (?,?)',[source,new Date().toISOString()]);
    });
  }
}
