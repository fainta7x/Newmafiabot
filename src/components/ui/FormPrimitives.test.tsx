// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AsyncState from './AsyncState';
import { Field, FieldDescription, FieldLabel, FieldMessage } from './Field';
import { Input } from './Input';

afterEach(() => cleanup());

describe('2LA Noire shared form primitives', () => {
  it('associates a canonical Input with its Field label and description', () => {
    render(
      <Field>
        <FieldLabel htmlFor="nickname">Игровой ник</FieldLabel>
        <Input id="nickname" aria-describedby="nickname-hint" defaultValue="Чагин" />
        <FieldDescription id="nickname-hint">Имя за игровым столом.</FieldDescription>
      </Field>,
    );

    const input = screen.getByLabelText('Игровой ник') as HTMLInputElement;
    expect(input.value).toBe('Чагин');
    expect(input.getAttribute('data-slot')).toBe('input');
    expect(screen.getByText('Имя за игровым столом.').getAttribute('data-slot')).toBe('field-description');
  });

  it('exposes invalid inputs and semantic field messages', () => {
    render(
      <>
        <Input aria-label="Телефон" aria-invalid="true" />
        <FieldMessage tone="error">Некорректное значение</FieldMessage>
        <FieldMessage tone="success">Сохранено</FieldMessage>
      </>,
    );

    expect(screen.getByLabelText('Телефон').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Некорректное значение');
    expect(screen.getByRole('status').textContent).toContain('Сохранено');
  });

  it('keeps AsyncState semantics and retry behavior consistent', () => {
    const retry = vi.fn();
    const { rerender } = render(<AsyncState kind="loading" title="Загрузка" />);

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');

    rerender(
      <AsyncState
        kind="error"
        title="Не удалось загрузить"
        description="Проверьте соединение"
        onAction={retry}
      />,
    );

    expect(screen.getByRole('alert').getAttribute('aria-busy')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
