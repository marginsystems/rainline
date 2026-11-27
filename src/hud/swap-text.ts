import { springSeconds, UI_SPRINGS } from '../ui-spring.ts';

export interface SwapText {
  readonly element: HTMLElement;
  set(text: string): void;
}

export function createSwapText(className: string, initial = ''): SwapText {
  const element = document.createElement('span');
  element.className = `swap ${className}`;
  let current = document.createElement('span');
  current.textContent = initial;
  element.append(current);
  let shown = initial;
  return {
    element,
    set(text) {
      if (text === shown) return;
      shown = text;
      const leaving = current;
      leaving.classList.add('after');
      window.setTimeout(() => leaving.remove(), springSeconds(UI_SPRINGS.bouncy) * 1000);
      const entering = document.createElement('span');
      entering.textContent = text;
      entering.classList.add('before');
      element.append(entering);
      void entering.offsetWidth;
      entering.classList.remove('before');
      current = entering;
    },
  };
}
