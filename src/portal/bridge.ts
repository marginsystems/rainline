export const BRIDGE = {
  global: 'bridge',
  events: { pause: 'PAUSE_STATE_CHANGED', interstitial: 'INTERSTITIAL_STATE_CHANGED' },
  ready: 'game_ready',
} as const;

export type InterstitialState = 'loading' | 'opened' | 'closed' | 'failed';

const INTERSTITIAL_STATES: readonly InterstitialState[] = ['loading', 'opened', 'closed', 'failed'];

export interface Bridge {
  sendMessage(message: string): void;
  showInterstitial(): void;
  onPause(listener: (paused: boolean) => void): void;
  onInterstitial(listener: (state: InterstitialState) => void): void;
}

function part(owner: unknown, name: string): object | null {
  if (typeof owner !== 'object' || owner === null) return null;
  const found: unknown = Reflect.get(owner, name);
  return typeof found === 'object' && found !== null ? found : null;
}

function callable(owner: object | null, name: string): owner is object {
  return owner !== null && typeof Reflect.get(owner, name) === 'function';
}

function invoke(owner: object, name: string, args: readonly unknown[]): unknown {
  const found: unknown = Reflect.get(owner, name);
  if (typeof found !== 'function') throw new TypeError(`the bridge has no ${name}`);
  return Reflect.apply(found, owner, args);
}

function eventName(names: object | null, key: string): string | null {
  if (names === null) return null;
  const found: unknown = Reflect.get(names, key);
  return typeof found === 'string' ? found : null;
}

function listen(owner: object, event: string | null, listener: (value: unknown) => void): void {
  if (event === null || !callable(owner, 'on')) return;
  invoke(owner, 'on', [event, listener]);
}

const interstitialState = (value: unknown): InterstitialState | null => INTERSTITIAL_STATES.find((state) => state === value) ?? null;

export function readBridge(root: unknown): Bridge | null {
  const platform = part(root, 'platform');
  const advertisement = part(root, 'advertisement');
  const names = part(root, 'EVENT_NAME');
  if (!callable(platform, 'sendMessage') || !callable(advertisement, 'showInterstitial')) return null;
  return {
    sendMessage: (message) => void invoke(platform, 'sendMessage', [message]),
    showInterstitial: () => void invoke(advertisement, 'showInterstitial', []),
    onPause(listener) {
      listen(platform, eventName(names, BRIDGE.events.pause), (paused) => {
        if (typeof paused === 'boolean') listener(paused);
      });
    },
    onInterstitial(listener) {
      listen(advertisement, eventName(names, BRIDGE.events.interstitial), (state) => {
        const known = interstitialState(state);
        if (known !== null) listener(known);
      });
    },
  };
}

export async function startBridge(root: unknown): Promise<Bridge | null> {
  if (typeof root !== 'object' || root === null || !callable(root, 'initialize')) return null;
  await Promise.resolve(invoke(root, 'initialize', []));
  return readBridge(root);
}
