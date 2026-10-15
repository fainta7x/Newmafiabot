/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GameRoleBadge } from '../components/ui/GameRole.tsx';
import { getGameRoleDefinition, normalizeGameRole } from '../shared/gameRoles.ts';
import { ROLE_LABELS } from '../lib/tournamentRoleValidation.ts';
import { getPlayerGameRoleLabel } from '../lib/playerGameRoleLabels.ts';

afterEach(cleanup);

describe('one role identity across game and player presentation', () => {
  it.each([
    ['citizen', 'Мирный', 'red'], ['sheriff', 'Шериф', 'red'],
    ['mafia', 'Мафия', 'black'], ['don', 'Дон', 'black'],
  ])('uses the same %s identity for API keys and judge-engine names', (key, label, team) => {
    expect(getGameRoleDefinition(key)?.team).toBe(team);
    expect(ROLE_LABELS[key as keyof typeof ROLE_LABELS]).toBe(label);
    expect(getPlayerGameRoleLabel(key)).toBe(label);
    expect(normalizeGameRole(label)).toBe(key);
    const { container } = render(<><GameRoleBadge role={key} /><GameRoleBadge role={label} /></>);
    expect(screen.getAllByText(label)).toHaveLength(2);
    expect([...container.querySelectorAll('[data-game-role]')].map(node => node.getAttribute('data-game-role'))).toEqual([key, key]);
  });

  it.each([null, '', 'unknown', 'red', 'black', '__proto__', 'constructor'])('does not turn an unknown/hidden role (%s) into a citizen', value => {
    expect(getGameRoleDefinition(value)).toBeNull();
    expect(normalizeGameRole(value)).toBeNull();
    render(<GameRoleBadge role={value} />);
    expect(screen.getByText('Роль не указана')).toBeTruthy();
    expect(screen.queryByText('Мирный')).toBeNull();
  });
});
