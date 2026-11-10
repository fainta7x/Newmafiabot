/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreCRM from '../components/crm/MoreCRM.tsx';

const props = { onOpenTasks: vi.fn(), onOpenAnalytics: vi.fn(), onOpenTheme: vi.fn(), onLogout: vi.fn(), onOpenPlayerMusic: vi.fn() };
const open = (id: string) => fireEvent.click(screen.getByTestId(`crm-more-cat-${id}`));

describe('«Ещё» structure', () => {
  afterEach(() => cleanup());

  it('shows six categories on the first level and the items one level down', () => {
    render(<MoreCRM {...props} />);
    for (const title of ['Ведение игр', 'Игроки', 'Игровая часть', 'Сообщения', 'Деньги', 'Система']) expect(screen.getByText(title)).toBeDefined();
    expect(screen.queryByTestId('crm-more-telegram')).toBeNull();
    open('messages');
    expect(screen.getByTestId('crm-more-telegram').textContent).toContain('Публикации и каналы');
    expect(screen.getByTestId('crm-more-botfaq')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Назад к разделам/ }));
    expect(screen.getByTestId('crm-more-cat-messages')).toBeDefined();
  });

  it('keeps technical items in «Система» and the theme in the header; the guide lives inside «Обучение»', () => {
    render(<MoreCRM {...props} />);
    expect(screen.queryByTestId('crm-more-system')).toBeNull();
    open('system');
    expect(screen.getByTestId('crm-more-system')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Назад к разделам/ }));
    fireEvent.click(screen.getByTestId('crm-more-theme'));
    expect(props.onOpenTheme).toHaveBeenCalled();
    expect(screen.queryByTestId('crm-more-guide')).toBeNull();
  });

  it('puts every item into its category', () => {
    render(<MoreCRM {...props} />);
    const expected: Record<string, string[]> = {
      run: ['tasks', 'music', 'analytics'], people: ['development', 'access', 'learning', 'gifts'], game: ['achievements', 'vip', 'tokens', 'betting'],
      messages: ['telegram', 'whatsnew', 'botfaq'], money: ['commerce', 'prices'], system: ['data', 'project', 'system', 'developer'],
    };
    for (const [category, ids] of Object.entries(expected)) {
      open(category);
      const list = screen.getByTestId('crm-more-category');
      for (const id of ids) expect(within(list).getByTestId(`crm-more-${id}`)).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: /Назад к разделам/ }));
    }
  });
});
