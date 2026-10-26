/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { organizerHeaders } from '../lib/organizerAuth';

afterEach(() => localStorage.clear());

describe('organizer request headers', () => {
  it('send the JSON type and the stored organizer token', () => {
    expect(organizerHeaders()).toEqual({ 'Content-Type': 'application/json' });
    expect(organizerHeaders(false)).toEqual({});
    localStorage.setItem('organizer_token', 'abc');
    expect(organizerHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer abc' });
    expect(organizerHeaders(false)).toEqual({ Authorization: 'Bearer abc' });
  });
});
