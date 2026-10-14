/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreCRM from '../components/crm/MoreCRM.tsx';

const props = { onOpenTasks: vi.fn(), onOpenAnalytics: vi.fn(), onOpenTheme: vi.fn(), onLogout: vi.fn(), onOpenPlayerMusic: vi.fn() };

describe('«Ещё» structure', () => {
  afterEach(() => cleanup());

  it('groups entries by the organizer task with plain names', () => {
    render(<MoreCRM {...props} />);
    for (const title of ['Проведение и дела', 'Сообщения и публикации', 'Игроки и обучение', 'Отчёты и финансы']) expect(screen.getByText(title)).toBeDefined();
    expect(screen.getByTestId('crm-more-development').textContent).toContain('Заявки новых игроков');
    expect(screen.getByTestId('crm-more-telegram').textContent).toContain('Публикации и каналы');
    expect(screen.getByTestId('crm-more-analytics')).toBeDefined();
  });

  it('keeps the novice guide with player tools while hiding technical items', () => {
    render(<MoreCRM {...props} />);
    expect(screen.getByTestId('crm-more-guide').textContent).toContain('Памятка для новичка');
    expect(screen.queryByTestId('crm-more-system')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Служебное/ }));
    expect(screen.getByTestId('crm-more-system')).toBeDefined();
    expect(screen.getAllByTestId('crm-more-guide')).toHaveLength(1);
  });
});
