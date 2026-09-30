/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObsWebSocketClient } from '../lib/obsWebSocket.ts';
import { orderObsScenes } from '../lib/obsScenes.ts';

/** A stand-in for OBS WebSocket v5: answers Hello/Identify and every request with success. */
class FakeObsSocket {
  static OPEN = 1;
  static last: FakeObsSocket | null = null;
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { reason: string }) => void) | null = null;
  constructor() {
    FakeObsSocket.last = this;
    setTimeout(() => { this.readyState = 1; this.receive({ op: 0, d: { rpcVersion: 1 } }); });
  }
  receive(message: any) { this.onmessage?.({ data: JSON.stringify(message) }); }
  send(raw: string) {
    const message = JSON.parse(raw);
    this.sent.push(message);
    if (message.op === 1) setTimeout(() => this.receive({ op: 2, d: {} }));
    if (message.op === 6) {
      const { requestType, requestId, requestData } = message.d;
      const responses: Record<string, Record<string, unknown>> = {
        GetSceneList: { scenes: [{ sceneName: 'Итоги' }, { sceneName: 'Стол' }, { sceneName: 'Заставка' }] },
        GetInputList: { inputs: [{ inputName: 'Камера' }, { inputName: 'Микрофон зала' }] },
        GetCurrentProgramScene: { currentProgramSceneName: 'Заставка' },
      };
      const responseData = responses[String(requestType)] || {};
      // Cameras have no sound: OBS refuses GetInputMute for them.
      const ok = !(requestType === 'GetInputMute' && requestData.inputName === 'Камера');
      setTimeout(() => this.receive({ op: 7, d: { requestId, requestStatus: { result: ok }, responseData: requestType === 'GetInputMute' ? { inputMuted: true } : responseData } }));
    }
  }
  close() { this.readyState = 3; }
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('OBS bridge commands', () => {
  it('reads scenes top-down with sound inputs only, and runs the phone buttons', async () => {
    vi.stubGlobal('WebSocket', FakeObsSocket);
    const client = new ObsWebSocketClient();
    const snapshot = await client.connect('ws://127.0.0.1:4455', '');
    expect(snapshot.scenes).toEqual(['Заставка', 'Стол', 'Итоги']);
    expect(snapshot.audioInputs).toEqual([{ name: 'Микрофон зала', muted: true }]);

    await client.run({ type: 'scene', scene: 'Стол' });
    await client.run({ type: 'mute', input: 'Микрофон зала', muted: false });
    await client.run({ type: 'stream', action: 'start' });
    await client.run({ type: 'record', action: 'stop' });
    const requests = FakeObsSocket.last!.sent.filter((message) => message.op === 6).slice(-4).map((message) => [message.d.requestType, message.d.requestData]);
    expect(requests).toEqual([
      ['SetCurrentProgramScene', { sceneName: 'Стол' }],
      ['SetInputMute', { inputName: 'Микрофон зала', inputMuted: false }],
      ['StartStream', {}],
      ['StopRecord', {}],
    ]);
  });

  it('puts the agreed scenes first, then the rest', () => {
    expect(orderObsScenes(['Камера 2', 'Итоги', 'Заставка']).map((scene) => scene.name)).toEqual(['Заставка', 'Итоги', 'Камера 2']);
  });
});
