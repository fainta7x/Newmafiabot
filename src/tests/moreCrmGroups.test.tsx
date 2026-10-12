/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreCRM from '../components/crm/MoreCRM.tsx';

const props = { onOpenTasks: vi.fn(), onOpenAnalytics: vi.fn(), onOpenTheme: vi.fn(), onLogout: vi.fn(), onOpenPlayerMusic: vi.fn() };

describe('«Ещё» structure', () => {
  afterEach(() => cleanup());

  it('groups entries by the organizer task with plain names', () => {
    render(<MoreCRM {...props} />);
    for (const title of ['Каждый день', 'Люди и обучение', 'Деньги и отчёты']) expect(screen.getByText(title)).toBeDefined();
    expect(screen.getByTestId('crm-more-development').textContent).toContain('Заявки новых игроков');
    expect(screen.getByTestId('crm-more-telegram').textContent).toContain('Публикации и каналы');
    expect(screen.getByTestId('crm-more-analytics')).toBeDefined();
  });

  it('keeps the newcomer guide and technical items out of the top level', () => {
    render(<MoreCRM {...props} />);
    expect(screen.queryByTestId('crm-more-guide')).toBeNull();
    expect(screen.queryByTestId('crm-more-system')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Администрирование и настройки/ }));
    expect(screen.getByTestId('crm-more-guide').textContent).toContain('Ссылка-памятка для новичка');
    expect(screen.getByTestId('crm-more-system')).toBeDefined();
  });
});
