// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicOffer } from '../components/public/PublicOffer.tsx';

describe('public offer page (payment provider moderation)', () => {
  it('carries everything the provider asks for, without a login', () => {
    render(<PublicOffer />);
    const page = screen.getByTestId('public-offer').textContent || '';
    for (const part of ['Чагин Евгений Борисович', '710311119597', 'fainta7x@gmail.com', 'Стоимость', 'Как записаться', 'Оплата', 'Как оказывается услуга', 'Отказ и возврат денег', 'Персональные данные']) {
      expect(page).toContain(part);
    }
    expect(page).toContain('не вычитаем');
    expect(screen.getAllByRole('link', { name: 'fainta7x@gmail.com' }).length).toBeGreaterThan(0);
  });
});
