export interface TrackOption {
  readonly id: string;
  readonly name: string;
}

export interface TrackPicker {
  readonly element: HTMLElement;
  onChange(handler: (id: string) => void): void;
}

export function createTrackPicker(options: readonly TrackOption[], current: string): TrackPicker {
  const handlers: ((id: string) => void)[] = [];
  const element = document.createElement('div');
  element.className = 'tracks';
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track-option';
    button.textContent = option.name;
    button.classList.toggle('active', option.id === current);
    button.addEventListener('click', () => {
      button.blur();
      if (option.id === current) return;
      for (const other of element.children) other.classList.toggle('active', other === button);
      for (const handler of handlers) handler(option.id);
    });
    element.append(button);
  }
  return {
    element,
    onChange(handler) { handlers.push(handler); },
  };
}
