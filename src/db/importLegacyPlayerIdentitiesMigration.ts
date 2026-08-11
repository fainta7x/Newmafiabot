import type { DatabaseWrapper } from './index.ts';

const MIGRATION_KEY = '0013_import_legacy_player_identities_v1';
const SEED = [
['5196a52a-71f6-59ec-acee-b1ba7066c011','5161632361','Jin','Jin',null],
['7b4e5d1a-24a3-5820-a322-8f41ba598538','5537728008','Алоэ','Алла Ламонова 🌵',null],
['3a9ea2f8-d067-5821-aeec-616defbb9fde','972766043','Аннушка','Ульяна','ubullka'],
['55b14a7c-18a8-5029-aaab-a37e9725812b','587422177','Богданчик','@kamchatskyman','kamchatskyman'],
['5cb3658a-a384-52ba-a5a2-87e47d6a5026','1283715893','Борменталь','Алексей Bormental','Bormental112'],
['c5413cdb-ac95-59ad-b262-bb3b0249e8e5','712557578','Гриня','Григорий Подколзин','physics_grinya'],
['2e90152e-ac77-5c4a-8844-1f32ef5330a8','306803584','Денди','Елизавета Межерицкая','lizmezh'],
['0f9b0e05-b254-53fd-9802-1bd476b25711','1576242455','Джава','Маргарита','M_rita00'],
['d314d9b3-a3d1-5bb6-b8d4-c4b576ece418','1721771945','Джокер','Андрей','DrewRelax'],
['c0d18e7e-766e-56d8-9464-77d1fb71ae20','7301463518','Диссонанс',null,'DissonasMafia'],
['c1fbf290-e6aa-522d-aee1-490a4502c3b1','402009136','Добряк','Alexander Kurenev','A123321aa'],
['2585c81d-37c0-5d9f-bf55-44becedbd330','381165212','Донор','Oleg Leonov','al_al_71'],
['7443a957-9d6b-576a-8841-fa11f4dcca0e','308155418','Дре','Andrei','andrei_video'],
['e764b461-6e2f-5a83-9aa7-686790cf38ed','706477103','Знак','Николай','NY6971'],
['fc95d84b-eb43-5590-b60c-8b7f37966a27','488889302','Индиго','Пётр','pitr_k'],
['43b56f84-ad4f-5d80-a1f6-611e2108e76d','1200548887','Истина','Оля','olgachek05'],
['e2cd6c62-e214-5867-ad88-0d94079b2927','1775610895','Кавасаки','Кирилл','geforce_amd'],
['291905b7-a3ae-5483-aa7e-b0f22e846aae','595795530','Матроскина','Екатерина','karadorka'],
['5b0bcdd0-ea1c-5e84-9ac7-023bfa2c0a1a','790467112','Милорд','𝐌𝐈𝐋𝐋𝐎𝐔𝐑𝐓','themillourt'],
['0f7844e0-0604-5284-82e6-29a66b6b1372','299267166','Мона Дарья','mona daria','mona_daria'],
['01764ada-e4a5-5894-9499-5304785873f1','710664378','Насон','Артём Насонов','Nasonchik3006'],
['27116a88-dd2b-5b18-b182-213913056ff8','6625402118','Перец','Виктор','mr_drag13'],
['7a5c7e73-60a3-56f2-ba26-5c87a1476a2d','1192864659','Пристань','Pavel Grachev','PGrachev'],
['8adf276d-a752-501e-abdd-2b8ae0c41c52','1976372410','Север','Настя Зуева','Nastya_MF220B'],
['87d61af4-cea4-54d9-9303-65af1f5924f4','1915876775','Серый','Сергей Трифонов',null],
['139120c3-0077-5e57-8716-d5084439cb6a','633500672','Спящий','Алексей','hermit_sta'],
['7dabb975-421e-5d8f-bb4b-d09725481ca3','461971527','Стаут','Di D','spiterful'],
['1831ebec-3b1d-5e8e-b40a-758d73bb3706','1642017050','Точка','ꂪꀤꉸꀤ꒒꒒ ꏿꉢꂅꉢꌗ🖤♻️💔','kirill_otets'],
['4a6e2e1f-5003-5583-a3d0-315f8f89bef2','7374388878','Феникс','ㅤ♡゙‍ ๋࣭ ⋆𝓁𝒶𝒹𝒾𝓈𝓁𝒶𝓊𝓈⋆ . ࣪ ᜊ','theladislaus'],
['fad23405-9715-566f-acd9-5632c30eb198','806709593','Чагин','Evgeniy Chagin','Chagina7x'],
] as const;

const norm = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('ru-RU');
const text = (v: unknown) => String(v ?? '').trim();

export function applyImportLegacyPlayerIdentitiesMigration(db: DatabaseWrapper): void {
  if (db.dbPath === ':memory:') return;

  const existing = db.sqlite.prepare('SELECT status FROM migration_history WHERE migration_name=? LIMIT 1').get(MIGRATION_KEY) as {status?: string}|undefined;
  if (existing?.status === 'completed') return;
  if (existing) throw new Error('Legacy player identity migration has an unexpected existing status.');

  db.sqlite.transaction(() => {
    if (new Set(SEED.map(r=>r[0])).size!==SEED.length || new Set(SEED.map(r=>r[1])).size!==SEED.length || new Set(SEED.map(r=>norm(r[2]))).size!==SEED.length) throw new Error('Legacy player identity seed contains duplicate identifiers.');

    const byTelegram=db.sqlite.prepare('SELECT id,telegram_user_id,nickname,full_name,telegram_username FROM players WHERE telegram_user_id=? LIMIT 2');
    const byNickname=db.sqlite.prepare('SELECT id,telegram_user_id,nickname,full_name,telegram_username FROM players WHERE lower(trim(nickname))=lower(trim(?)) LIMIT 2');
    const byId=db.sqlite.prepare('SELECT id FROM players WHERE id=? LIMIT 1');
    const update=db.sqlite.prepare(`UPDATE players SET
      telegram_user_id=CASE WHEN telegram_user_id IS NULL OR trim(telegram_user_id)='' THEN ? ELSE telegram_user_id END,
      full_name=CASE WHEN full_name IS NULL OR trim(full_name)='' THEN ? ELSE full_name END,
      telegram_username=CASE WHEN telegram_username IS NULL OR trim(telegram_username)='' THEN ? ELSE telegram_username END,
      updated_at=? WHERE id=?`);
    const insert=db.sqlite.prepare(`INSERT INTO players
      (id,telegram_user_id,nickname,full_name,telegram_username,phone,lifecycle_status,contact_status,source,notes,elo,tokens,created_at,updated_at)
      VALUES (?,?,?,?,?,NULL,'normal','normal','legacy_bot_identity',NULL,1000,0,?,?)`);

    let reused=0, inserted=0;
    const now=new Date().toISOString();
    for (const [newId,tg,nick,fullName,username] of SEED) {
      const tgMatches=byTelegram.all(tg) as any[];
      if (tgMatches.length>1) throw new Error('Legacy player identity migration found duplicate Telegram ownership.');
      let player=tgMatches[0];
      if (player && norm(player.nickname)!==norm(nick)) throw new Error('Legacy player identity migration found Telegram ID on a different nickname.');
      if (!player) {
        const nickMatches=byNickname.all(nick) as any[];
        if (nickMatches.length>1) throw new Error('Legacy player identity migration found multiple nickname matches.');
        player=nickMatches[0];
      }
      if (player) {
        const current=text(player.telegram_user_id);
        if (current && current!==tg) throw new Error('Legacy player identity migration found nickname with different Telegram ID.');
        const owner=byTelegram.get(tg) as any|undefined;
        if (owner && String(owner.id)!==String(player.id)) throw new Error('Legacy player identity migration found Telegram ID conflict.');
        update.run(tg,fullName,username,now,player.id);
        reused++;
      } else {
        if (byId.get(newId)) throw new Error('Legacy player identity migration found configured new player ID already in use.');
        insert.run(newId,tg,nick,fullName,username,now,now);
        inserted++;
      }
    }

    db.sqlite.prepare('INSERT INTO migration_history (id,migration_name,status,details_json,executed_at) VALUES (?,?,?,?,?)')
      .run(MIGRATION_KEY,MIGRATION_KEY,'completed',JSON.stringify({processed:SEED.length,reused,inserted,skipped:0,conflicts:0}),now);
  })();

  console.log('Applied legacy player identity migration.');
}
