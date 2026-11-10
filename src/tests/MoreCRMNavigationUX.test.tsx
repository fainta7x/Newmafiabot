/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoreCRM } from '../components/crm/MoreCRM.tsx';

vi.mock('../components/crm/BettingAdminCRM.tsx', () => ({ BettingAdminCRM: () => null }));
vi.mock('../components/crm/CommerceAdminCRM.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/DataSettingsCRM.tsx', () => ({ DataSettingsCRM: () => null }));
vi.mock('../components/crm/DeveloperTestModeCRM.tsx', () => ({ DeveloperTestModeCRM: () => null }));
vi.mock('../components/crm/TelegramCRM.tsx', () => ({ TelegramCRM: () => <div>Открыты публикации</div> }));
vi.mock('../components/crm/SystemStatusCard.tsx', () => ({ SystemStatusCard: () => <div>Открыто состояние системы</div> }));
vi.mock('../components/crm/MusicLibraryCRM.tsx', () => ({ MusicLibraryCRM: () => null }));
vi.mock('../components/crm/NoviceDevelopmentCRM.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/LearningProgressCRM.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerAccessBulkCRM.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/ProjectBoardCRM.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/WhatsNewCRM.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/BotFaqCRM.tsx', () => ({ default: () => null }));

const props = {
  onOpenTasks: vi.fn(),
  onOpenAnalytics: vi.fn(),
  onOpenTheme: vi.fn(),
  onLogout: vi.fn(),
  onOpenPlayerMusic: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CRM «Ещё» navigation hierarchy', () => {
  it('groups actions by what the organizer is doing and keeps all original destinations', () => {
    render(<MoreCRM {...props} />);
    const group = (title: string) => screen.getByText(title).closest('section')!;
    const expected: Record<string, string[]> = {
      'Ведение игр': ['tasks', 'music', 'analytics'],
      'Игроки': ['development', 'access', 'learning', 'gifts'],
      'Игровая часть': ['achievements', 'vip', 'tokens', 'betting'],
      'Сообщения': ['telegram', 'whatsnew', 'botfaq'],
      'Деньги': ['commerce', 'prices'],
    };
    for (const [title, ids] of Object.entries(expected)) for (const id of ids) expect(within(group(title)).getByTestId(`crm-more-${id}`)).toBeDefined();
    expect(screen.queryByTestId('crm-more-guide')).toBeNull();
    expect(screen.queryByTestId('crm-more-service-tools')).toBeNull();
  });

  it('opens the published content screen and returns to the More menu', () => {
    render(<MoreCRM {...props} />);
    fireEvent.click(screen.getByTestId('crm-more-telegram'));
    expect(screen.getByText('Открыты публикации')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Назад в раздел Ещё' }));
    expect(screen.getByTestId('crm-more-botfaq')).toBeDefined();
  });

  it('opens the novice guide from «Обучение» as a guide, not as a copy action', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<MoreCRM {...props} activeScreen="learning" />);
    fireEvent.click(screen.getByTestId('crm-more-guide'));
    expect(open).toHaveBeenCalledWith('/guide', '_blank', 'noopener');
  });

  it('keeps maintenance tools expanded when returning from a direct service deep link', () => {
    const onScreenChange = vi.fn();
    const { rerender } = render(<MoreCRM {...props} activeScreen="system" onScreenChange={onScreenChange} />);
    expect(screen.getByText('Открыто состояние системы')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Назад в раздел Ещё' }));
    expect(onScreenChange).toHaveBeenCalledWith(null);
    rerender(<MoreCRM {...props} activeScreen={null} onScreenChange={onScreenChange} />);
    expect(screen.getByTestId('crm-more-service-tools')).toBeDefined();
    expect(screen.getByTestId('crm-more-system')).toBeDefined();
  });
});
