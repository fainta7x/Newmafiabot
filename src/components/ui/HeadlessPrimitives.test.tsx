// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './Dialog';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './Menu';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './Sheet';

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  if (!globalThis.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
  }

  if (!Element.prototype.getAnimations) {
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => [],
    });
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('2LA Noire headless primitives', () => {
  it('ports Dialog to body, closes with Escape and restores trigger focus', async () => {
    render(
      <Dialog>
        <DialogTrigger>Открыть диалог</DialogTrigger>
        <DialogContent>
          <DialogTitle>Подтверждение</DialogTitle>
          <DialogDescription>Проверка поведения диалога.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole('button', { name: 'Открыть диалог' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.closest('#root')).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('opens and closes the canonical bottom Sheet', async () => {
    render(
      <Sheet>
        <SheetTrigger>Открыть панель</SheetTrigger>
        <SheetContent>
          <SheetTitle>Панель</SheetTitle>
          <p>Содержимое</p>
        </SheetContent>
      </Sheet>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть панель' }));
    expect(await screen.findByText('Содержимое')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByText('Содержимое')).toBeNull());
  });

  it('opens Popover content from its trigger', async () => {
    render(
      <Popover>
        <PopoverTrigger>Фильтр</PopoverTrigger>
        <PopoverContent>Параметры фильтра</PopoverContent>
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Фильтр' }));
    expect(await screen.findByText('Параметры фильтра')).toBeTruthy();
  });

  it('opens Menu and exposes its items', async () => {
    render(
      <Menu>
        <MenuTrigger>Действия</MenuTrigger>
        <MenuContent>
          <MenuItem>Редактировать</MenuItem>
          <MenuItem destructive>Удалить</MenuItem>
        </MenuContent>
      </Menu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия' }));
    expect(await screen.findByText('Редактировать')).toBeTruthy();
    expect(screen.getByText('Удалить')).toBeTruthy();
  });
});
