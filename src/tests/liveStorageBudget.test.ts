// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { evictReplayFrames, replayFramesKey, setItemFreeingSpace } from '../lib/liveStorageBudget';
import { writeLiveSession } from '../components/LiveGameEngine/liveSessionStorage';

/** A storage with a character budget, like the browser's. */
class QuotaStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> {
  private data = new Map<string, string>();
  constructor(private limit: number) {}
  get length() { return this.data.size; }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  used() { let total = 0; this.data.forEach((value, key) => { total += key.length + value.length; }); return total; }
  setItem(key: string, value: string) {
    const next = this.used() - (this.data.has(key) ? key.length + (this.data.get(key) as string).length : 0) + key.length + value.length;
    if (next > this.limit) throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(key, value);
  }
}

describe('live game storage budget', () => {
  beforeEach(() => localStorage.clear());

  it('replay frames of other games give way when the storage is full', () => {
    const storage = new QuotaStorage(1000);
    storage.setItem(replayFramesKey(1), 'x'.repeat(400));
    storage.setItem(replayFramesKey(2), 'y'.repeat(400));
    expect(setItemFreeingSpace('mafia_live_session', 'z'.repeat(500), 3, storage)).toBe(true);
    expect(storage.getItem('mafia_live_session')).toHaveLength(500);
    expect(storage.getItem(replayFramesKey(1))).toBeNull();
  });

  it('keeps the frames of the current game while other frames are enough to free', () => {
    const storage = new QuotaStorage(1000);
    storage.setItem(replayFramesKey(1), 'x'.repeat(500));
    storage.setItem(replayFramesKey(2), 'y'.repeat(300));
    expect(setItemFreeingSpace('mafia_live_session', 'z'.repeat(400), 2, storage)).toBe(true);
    expect(storage.getItem(replayFramesKey(2))).not.toBeNull();
    expect(storage.getItem(replayFramesKey(1))).toBeNull();
  });

  it('as a last resort the current frames go too, never the live session', () => {
    const storage = new QuotaStorage(600);
    storage.setItem(replayFramesKey(7), 'x'.repeat(500));
    expect(setItemFreeingSpace('mafia_live_session', 'z'.repeat(400), 7, storage)).toBe(true);
    expect(storage.getItem(replayFramesKey(7))).toBeNull();
  });

  it('evictReplayFrames removes only replay frames', () => {
    localStorage.setItem(replayFramesKey(1), 'a');
    localStorage.setItem(replayFramesKey(2), 'b');
    localStorage.setItem('mafia_live_session', 'keep');
    expect(evictReplayFrames(2)).toBe(1);
    expect(localStorage.getItem(replayFramesKey(2))).toBe('b');
    expect(localStorage.getItem('mafia_live_session')).toBe('keep');
  });

  it('the engine session is still written when the device is full of replay frames', () => {
    const real = Storage.prototype.setItem;
    const quota = 20_000;
    localStorage.setItem(replayFramesKey(1), 'f'.repeat(15_000));
    localStorage.setItem(replayFramesKey(2), 'f'.repeat(4_000));
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      let used = 0;
      for (let i = 0; i < this.length; i += 1) { const k = this.key(i) as string; used += k.length + (this.getItem(k) as string).length; }
      const prior = this.getItem(key);
      if (used - (prior === null ? 0 : key.length + prior.length) + key.length + value.length > quota) throw new DOMException('quota', 'QuotaExceededError');
      real.call(this, key, value);
    };
    try {
      writeLiveSession({ phase: 'night', postNightStage: 'death_protocol', shotPlayerSlot: 4, activePlayers: [] } as never);
      expect(JSON.parse(localStorage.getItem('mafia_live_session') || '{}').postNightStage).toBe('death_protocol');
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});
