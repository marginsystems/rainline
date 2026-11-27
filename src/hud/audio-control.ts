import { clamp } from '../../sim/math.ts';

export interface AudioSetting {
  readonly volume: number;
  readonly muted: boolean;
}

export const AUDIO_STORAGE_KEY = 'rainline.audio';
export const DEFAULT_AUDIO: AudioSetting = { volume: 0.8, muted: false };
const KEY_VOLUME_STEP = 0.05;
const ARROW_VOLUME_STEP: Partial<Record<string, number>> = {
  ArrowUp: KEY_VOLUME_STEP,
  ArrowRight: KEY_VOLUME_STEP,
  ArrowDown: -KEY_VOLUME_STEP,
  ArrowLeft: -KEY_VOLUME_STEP,
};

const ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/>
<path class="wave" d="M16 9.5a4 4 0 0 1 0 5"/>
<path class="wave far" d="M18.6 7a7.6 7.6 0 0 1 0 10"/>
<path class="slash" d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>
</svg>`;

export function parseAudioSetting(stored: string | null): AudioSetting {
  if (!stored) return DEFAULT_AUDIO;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null) return DEFAULT_AUDIO;
    const volume = 'volume' in value && typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : DEFAULT_AUDIO.volume;
    const muted = 'muted' in value && value.muted === true;
    return { volume, muted };
  } catch {
    return DEFAULT_AUDIO;
  }
}

export interface AudioControl {
  readonly element: HTMLElement;
  readonly setting: AudioSetting;
  onChange(handler: (setting: AudioSetting) => void): void;
  toggleMute(): AudioSetting;
}

function readStored(storage: Storage | null): AudioSetting {
  try {
    return parseAudioSetting(storage?.getItem(AUDIO_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_AUDIO;
  }
}

export function createAudioControl(storage: Storage | null): AudioControl {
  let setting = readStored(storage);
  const handlers: ((setting: AudioSetting) => void)[] = [];
  const element = document.createElement('div');
  element.className = 'audio';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mute';
  button.innerHTML = ICON;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.className = 'volume';
  slider.setAttribute('aria-label', 'Volume');
  element.append(button, slider);

  function show(): void {
    element.classList.toggle('muted', setting.muted || setting.volume === 0);
    button.setAttribute('aria-label', setting.muted || setting.volume === 0 ? 'Unmute' : 'Mute');
    slider.value = String(Math.round(setting.volume * 100));
    slider.style.setProperty('--fill', `${Math.round(setting.volume * 100)}%`);
  }

  function persist(): void {
    try {
      storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(setting));
    } catch {
      return;
    }
  }

  function apply(next: AudioSetting): AudioSetting {
    setting = next;
    show();
    for (const handler of handlers) handler(setting);
    return setting;
  }

  function commit(next: AudioSetting): AudioSetting {
    const applied = apply(next);
    persist();
    return applied;
  }

  function toggleMute(): AudioSetting {
    if (setting.muted || setting.volume === 0) return commit({ volume: setting.volume === 0 ? DEFAULT_AUDIO.volume : setting.volume, muted: false });
    return commit({ volume: setting.volume, muted: true });
  }

  button.addEventListener('click', () => {
    button.blur();
    toggleMute();
  });
  slider.addEventListener('input', () => apply({ volume: Number(slider.value) / 100, muted: false }));
  slider.addEventListener('change', () => {
    persist();
    slider.blur();
  });
  slider.addEventListener('keydown', (event) => {
    const step = ARROW_VOLUME_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    commit({ volume: clamp(setting.volume + step, 0, 1), muted: false });
  });
  show();

  return {
    element,
    get setting() { return setting; },
    onChange(handler) { handlers.push(handler); },
    toggleMute,
  };
}
