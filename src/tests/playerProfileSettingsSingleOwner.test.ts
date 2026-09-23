import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(new URL(`../components/player/${file}`, import.meta.url), 'utf8');

describe('player profile settings have one owner per setting', () => {
  it('leaves birthday visibility to the privacy section only', () => {
    const settings = read('PlayerProfileSettings.tsx');
    expect(settings).not.toContain('birthday_visibility');
    expect(read('PlayerProfilePrivacySettings.tsx')).toContain('birthday_day_month');
  });

  it('keeps the phone opt-out next to the phone field, not under the format field', () => {
    const settings = read('PlayerProfileSettings.tsx');
    expect(settings.indexOf("setSensitiveChoice('phone'")).toBeLessThan(settings.indexOf('preferred-format'));
  });

  it('never renders raw role codes or a broken avatar in the profile header', () => {
    const profile = read('CanonicalPremiumPlayerProfile.tsx');
    expect(profile).not.toContain('{g.role||g.team');
    expect(profile).not.toContain('/api/player/players/${playerId}/avatar`');
  });
});
