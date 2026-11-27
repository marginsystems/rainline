export type QualityChoice = 'auto' | number;

export const QUALITY_STORAGE_KEY = 'rainline.quality';
export const DEFAULT_QUALITY: QualityChoice = 0;

const ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
<path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h10M20 17h0"/>
<circle cx="16" cy="7" r="2.4"/><circle cx="10" cy="12" r="2.4"/><circle cx="17" cy="17" r="2.4"/>
</svg>`;

export const defaultQuality = (touch: boolean): QualityChoice => (touch ? 'auto' : DEFAULT_QUALITY);

export function parseQualityChoice(stored: string | null, tiers: number, fallback: QualityChoice = DEFAULT_QUALITY): QualityChoice {
  if (stored === 'auto') return 'auto';
  const level = stored === null || stored === '' ? Number.NaN : Number(stored);
  return Number.isInteger(level) && level >= 0 && level < tiers ? level : fallback;
}

export function nextQualityChoice(choice: QualityChoice, tiers: number): QualityChoice {
  if (choice === 'auto') return 0;
  return choice + 1 < tiers ? choice + 1 : 'auto';
}

export const qualityLabel = (choice: QualityChoice, names: readonly string[]): string => (choice === 'auto' ? 'Auto' : names[choice] ?? 'Auto');

export interface QualityControl {
  readonly element: HTMLElement;
  readonly choice: QualityChoice;
  onChange(handler: (choice: QualityChoice) => void): void;
  set(choice: QualityChoice): void;
}

function readStored(storage: Storage | null, tiers: number, fallback: QualityChoice): QualityChoice {
  try {
    return parseQualityChoice(storage?.getItem(QUALITY_STORAGE_KEY) ?? null, tiers, fallback);
  } catch {
    return fallback;
  }
}

export function createQualityControl(storage: Storage | null, names: readonly string[], fallback: QualityChoice = DEFAULT_QUALITY): QualityControl {
  let choice = readStored(storage, names.length, fallback);
  const handlers: ((choice: QualityChoice) => void)[] = [];
  const element = document.createElement('div');
  element.className = 'quality';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'settings-toggle';
  toggle.setAttribute('aria-label', 'Graphics settings');
  toggle.innerHTML = ICON;
  const panel = document.createElement('div');
  panel.className = 'quality-panel';
  const heading = document.createElement('div');
  heading.className = 'label';
  heading.textContent = 'Graphics';
  panel.append(heading);
  const options: { readonly choice: QualityChoice; readonly button: HTMLButtonElement }[] = [];
  const choices: QualityChoice[] = [...names.map((_name, level) => level), 'auto'];
  for (const option of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quality-option';
    button.textContent = qualityLabel(option, names);
    button.addEventListener('click', () => {
      button.blur();
      commit(option);
      element.classList.remove('open');
    });
    options.push({ choice: option, button });
    panel.append(button);
  }
  element.append(toggle, panel);

  function show(): void {
    for (const option of options) option.button.classList.toggle('active', option.choice === choice);
  }

  function commit(next: QualityChoice): void {
    choice = next;
    try {
      storage?.setItem(QUALITY_STORAGE_KEY, String(next));
    } catch {
      show();
    }
    show();
    for (const handler of handlers) handler(choice);
  }

  toggle.addEventListener('click', () => {
    toggle.blur();
    element.classList.toggle('open');
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !element.contains(event.target)) element.classList.remove('open');
  });
  show();

  return {
    element,
    get choice() { return choice; },
    onChange(handler) { handlers.push(handler); },
    set: commit,
  };
}
