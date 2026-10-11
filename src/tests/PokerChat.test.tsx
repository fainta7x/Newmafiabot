// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PokerChatBubbles, PokerChatDock, type PokerChatMessage } from '../components/player/PokerChat.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const messages: PokerChatMessage[] = [
  { id: 1, player_id: 'bob', nickname: 'Боб', kind: 'text', body: 'всем привет', age_ms: 1000 },
  { id: 2, player_id: 'ann', nickname: 'Аня', kind: 'emote', body: 'bluff', age_ms: 500 },
];

describe('PokerChatDock', () => {
  const dock = (extra: Record<string, unknown> = {}) => render(
    <PokerChatDock messages={messages} viewerId="ann" canPost muted={false} onMutedChange={vi.fn()} onSend={vi.fn()} {...extra} />,
  );

  it('shows the unread count, then the messages with «Я» for own ones', () => {
    dock();
    expect(screen.getByTestId('poker-chat-open').textContent).toContain('1');
    fireEvent.click(screen.getByTestId('poker-chat-open'));
    expect(screen.getByText('всем привет')).toBeTruthy();
    expect(screen.getByText('Я:')).toBeTruthy();
    expect(screen.getByText('Боб:')).toBeTruthy();
  });

  it('sends a text and an emote from the board', () => {
    const onSend = vi.fn();
    dock({ onSend });
    fireEvent.click(screen.getByTestId('poker-chat-open'));
    fireEvent.change(screen.getByLabelText('Сообщение за стол'), { target: { value: '  ну давай  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(onSend).toHaveBeenCalledWith({ text: 'ну давай' });
    fireEvent.click(screen.getByTestId('poker-emote-scared'));
    expect(onSend).toHaveBeenCalledWith({ emote: 'scared' });
  });

  it('lets the viewer switch the chat off, and gives a spectator the chat to read only', () => {
    const onMutedChange = vi.fn();
    const { unmount } = dock({ onMutedChange });
    fireEvent.click(screen.getByTestId('poker-chat-open'));
    fireEvent.click(screen.getByTestId('poker-chat-mute'));
    expect(onMutedChange).toHaveBeenCalledWith(true);
    unmount();
    dock({ canPost: false });
    fireEvent.click(screen.getByTestId('poker-chat-open'));
    expect(screen.queryByTestId('poker-emote-board')).toBeNull();
    expect(screen.getByText(/Писать могут только игроки/)).toBeTruthy();
  });
});

describe('PokerChatBubbles', () => {
  const layout = [{ x: 50, y: 90 }, { x: 10, y: 30 }];
  const players = [{ id: 'ann' }, { id: 'bob' }];

  it('draws a fresh emote and text over the senders, and nothing once they are old or the chat is off', () => {
    const now = Date.now();
    const created = (id: number) => (id === 1 ? now - 1000 : now - 500);
    const { rerender } = render(<PokerChatBubbles messages={messages} createdAt={created} players={players} layout={layout} muted={false} />);
    expect(screen.getByTestId('poker-emote').textContent).toContain('Блефуешь!');
    expect(screen.getByTestId('poker-chat-bubble').textContent).toBe('всем привет');
    rerender(<PokerChatBubbles messages={messages} createdAt={() => now - 20_000} players={players} layout={layout} muted={false} />);
    expect(screen.queryByTestId('poker-emote')).toBeNull();
    rerender(<PokerChatBubbles messages={messages} createdAt={created} players={players} layout={layout} muted />);
    expect(screen.queryByTestId('poker-emote')).toBeNull();
  });
});
