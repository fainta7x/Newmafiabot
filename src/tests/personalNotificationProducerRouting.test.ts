import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

describe('channel-neutral personal notification producers',()=>{
  it('routes scheduled personal notification types through queuePersonalNotification',()=>{
    const source=read('src/server/services/personalTelegramNotificationService.ts');
    expect(source).toContain("from './personalNotificationRouterService.ts'");
    expect(source).not.toContain('telegram_user_id IS NOT NULL');
    for(const type of ['invitation','upcoming_evening','booking_attendance_status','evening_reminder','attendance_confirmation','game_result','elo_change','bet_result','bet_refund']) expect(source).toContain(`'${type}'`);
  });
  it('routes direct friend invitations through the same channel-neutral service',()=>{
    const source=read('src/server/services/playerInvitationEligibilityService.ts');
    expect(source).toContain("from './personalNotificationRouterService.ts'");
    expect(source).toContain("eventType:'evening_invite'");
    expect(source).not.toContain('enqueueTelegramMessage');
    expect(source).toContain('Приглашение не создаёт запись автоматически');
  });
  it('keeps in-app notification generation independent from external delivery',()=>{
    const source=read('src/server/routes/playerNotificationsRoutes.ts');
    expect(source).toContain("router.get('/notifications'");
    expect(source).not.toContain('VK_GROUP_ACCESS_TOKEN');
    expect(source).not.toContain('TELEGRAM_BOT_TOKEN');
  });
  it('exposes channel status and safe test action in player settings',()=>{
    const route=read('src/server/routes/playerNotificationPreferenceRoutes.ts');
    const ui=read('src/components/player/PlayerNotificationSettings.tsx');
    expect(route).toContain("router.post('/notification-preferences/test'");
    expect(route).toContain("eventType: 'test_notification'");
    expect(ui).toContain('available_channels.map');
    expect(ui).toContain('Отправить тестовое уведомление');
    expect(ui).toContain('нужно разрешить сообщения');
  });
});