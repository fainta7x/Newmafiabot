export type ObsConnectionSnapshot = {
  obsVersion: string | null;
  websocketVersion: string | null;
  currentScene: string | null;
  streamActive: boolean;
  recordingActive: boolean;
  scenes: string[];
  audioInputs: Array<{ name: string; muted: boolean }>;
};

export type ObsRemoteCommand =
  | { type: 'scene'; scene: string }
  | { type: 'stream'; action: 'start' | 'stop' }
  | { type: 'record'; action: 'start' | 'stop' }
  | { type: 'mute'; input: string; muted: boolean };

type ObsMessage = { op: number; d?: Record<string, any> };
type PendingRequest = { resolve: (value: Record<string, any>) => void; reject: (error: Error) => void };

const bytesToBase64 = (bytes: ArrayBuffer) => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const sha256Base64 = async (value: string) => bytesToBase64(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
);

export async function createObsAuthentication(password: string, salt: string, challenge: string) {
  const secret = await sha256Base64(`${password}${salt}`);
  return sha256Base64(`${secret}${challenge}`);
}

export class ObsWebSocketClient {
  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestCounter = 0;

  async connect(url: string, password: string): Promise<ObsConnectionSnapshot> {
    this.disconnect();
    const socket = new WebSocket(url);
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout = 0;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        this.disconnect();
        reject(new Error(message));
      };
      timeout = window.setTimeout(() => fail('OBS не ответил. Проверьте, что WebSocket-сервер включён.'), 8_000);

      socket.onerror = () => fail('Не удалось подключиться к OBS на этом ноутбуке.');
      socket.onclose = (event) => {
        for (const pending of this.pending.values()) pending.reject(new Error('Соединение с OBS закрыто'));
        this.pending.clear();
        if (!settled) fail(event.reason || 'OBS закрыл соединение. Проверьте пароль WebSocket.');
      };
      socket.onmessage = async (event) => {
        let message: ObsMessage;
        try { message = JSON.parse(String(event.data)); } catch { return; }

        if (message.op === 0) {
          const authentication = message.d?.authentication;
          const identify: Record<string, any> = { rpcVersion: 1, eventSubscriptions: 0 };
          if (authentication) {
            if (!password) return fail('В OBS задан пароль — введите его ниже.');
            identify.authentication = await createObsAuthentication(
              password,
              String(authentication.salt || ''),
              String(authentication.challenge || ''),
            );
          }
          socket.send(JSON.stringify({ op: 1, d: identify }));
          return;
        }

        if (message.op === 2) {
          window.clearTimeout(timeout);
          try {
            const snapshot = await this.readSnapshot();
            settled = true;
            resolve(snapshot);
          } catch (error) { fail(error instanceof Error ? error.message : 'OBS не ответил'); }
          return;
        }

        if (message.op === 7) {
          const requestId = String(message.d?.requestId || '');
          const pending = this.pending.get(requestId);
          if (!pending) return;
          this.pending.delete(requestId);
          if (message.d?.requestStatus?.result === true) pending.resolve(message.d?.responseData || {});
          else pending.reject(new Error(String(message.d?.requestStatus?.comment || 'OBS отклонил запрос')));
        }
      };
    });
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async readSnapshot(): Promise<ObsConnectionSnapshot> {
    const [version, scene, stream, recording, sceneList, inputList] = await Promise.all([
      this.request('GetVersion'),
      this.request('GetCurrentProgramScene'),
      this.request('GetStreamStatus'),
      this.request('GetRecordStatus'),
      this.request('GetSceneList'),
      this.request('GetInputList'),
    ]);
    // OBS lists scenes bottom-up; show them the way they appear in OBS.
    const scenes = (Array.isArray(sceneList.scenes) ? sceneList.scenes : [])
      .map((item: any) => String(item?.sceneName || '')).filter(Boolean).reverse();
    // Only inputs that carry sound answer GetInputMute; the rest (cameras, pictures) are skipped.
    const audioInputs: Array<{ name: string; muted: boolean }> = [];
    for (const input of (Array.isArray(inputList.inputs) ? inputList.inputs : []).slice(0, 30)) {
      const name = String(input?.inputName || '');
      if (!name) continue;
      try {
        const mute = await this.request('GetInputMute', { inputName: name });
        audioInputs.push({ name, muted: mute.inputMuted === true });
      } catch { /* not an audio input */ }
    }
    return {
      obsVersion: typeof version.obsVersion === 'string' ? version.obsVersion : null,
      websocketVersion: typeof version.obsWebSocketVersion === 'string' ? version.obsWebSocketVersion : null,
      currentScene: typeof scene.currentProgramSceneName === 'string' ? scene.currentProgramSceneName : null,
      streamActive: stream.outputActive === true,
      recordingActive: recording.outputActive === true,
      scenes,
      audioInputs,
    };
  }

  /** A button pressed on the phone, carried here by the heartbeat. */
  async run(command: ObsRemoteCommand) {
    if (command.type === 'scene') return this.request('SetCurrentProgramScene', { sceneName: command.scene });
    if (command.type === 'mute') return this.request('SetInputMute', { inputName: command.input, inputMuted: command.muted });
    if (command.type === 'stream') return this.request(command.action === 'start' ? 'StartStream' : 'StopStream');
    return this.request(command.action === 'start' ? 'StartRecord' : 'StopRecord');
  }

  disconnect() {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  }

  private request(requestType: string, requestData: Record<string, unknown> = {}): Promise<Record<string, any>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Нет соединения с OBS'));
    const requestId = `obs-${Date.now()}-${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.socket!.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }
}
