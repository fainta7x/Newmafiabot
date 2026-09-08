import { beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.fn();
const contexts = vi.fn();
vi.mock('../server/services/playerConnectionAnalyticsService.ts', () => ({ loadCachedPlayerConnectionAnalytics: analytics }));
vi.mock('../server/services/playerInvitationEligibilityService.ts', () => ({ loadInvitationContextsForRecipients: contexts }));

const { loadSmartFriendInviteSuggestions } = await import('../server/services/smartFriendInviteSuggestionService.ts');

describe('smart friend invite suggestions', () => {
  beforeEach(() => { analytics.mockReset(); contexts.mockReset(); });

  it('resolves candidate eligibility in one bounded batch call', async () => {
    analytics.mockResolvedValue([
      { player_id:'b',nickname:'Бета',avatar_url:'/b',relationship:'Часто в одной команде',shared_games:8,same_team_games:6,opponent_games:2 },
      { player_id:'c',nickname:'Гамма',avatar_url:'/c',relationship:'Часто за одним столом',shared_games:5,same_team_games:2,opponent_games:3 },
    ]);
    contexts.mockResolvedValue(new Map([
      ['b',{ can_invite:true, evenings:[{id:'e1',title:'Пятница',starts_at:null,venue:null,format:'CASUAL',state:'eligible'}] }],
      ['c',{ can_invite:false, evenings:[{id:'e1',title:'Пятница',starts_at:null,venue:null,format:'CASUAL',state:'registered'}] }],
    ]));
    const db={} as any;
    const result=await loadSmartFriendInviteSuggestions(db,'a',4);
    expect(analytics).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveBeenCalledWith(db,'a',['b','c']);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({player_id:'b',evening:{id:'e1'}});
  });
});
