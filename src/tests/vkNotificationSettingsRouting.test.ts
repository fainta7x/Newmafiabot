import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source=fs.readFileSync(path.join(process.cwd(),'src/server/routes/playerNotificationPreferenceRoutes.ts'),'utf8');
describe('player notification settings routing',()=>{
  it('requires canonical player session and never accepts player_id from the browser',()=>{
    expect(source).toContain('getPlayerSessionId(req)');
    expect(source).not.toContain('req.body?.player_id');
    expect(source).not.toContain('req.query?.player_id');
  });
  it('only allows linked explicit channels and rate limits safe test notifications',()=>{
    expect(source).toContain('!routingBefore.available_channels.includes(requestedChannel)');
    expect(source).toContain("datetime('now','-30 seconds')");
    expect(source).toContain("router.post('/notification-preferences/test'");
  });
});
