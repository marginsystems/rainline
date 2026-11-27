export interface Race {
  lap: number;
  lapSeconds: number;
  lastLap: number | null;
  bestLap: number | null;
  running: boolean;
}

export type RaceEvent =
  | { readonly kind: 'start' }
  | { readonly kind: 'lap'; readonly seconds: number; readonly best: boolean };

export const createRace = (): Race => ({ lap: 0, lapSeconds: 0, lastLap: null, bestLap: null, running: false });

export function stepRace(race: Race, distance: number, trackLength: number, dt: number): RaceEvent | null {
  if (!race.running) {
    if (distance < 0) return null;
    race.running = true;
    race.lap = 1;
    race.lapSeconds = 0;
    return { kind: 'start' };
  }
  race.lapSeconds += dt;
  if (distance < race.lap * trackLength) return null;
  const seconds = race.lapSeconds;
  const best = race.bestLap === null || seconds < race.bestLap;
  race.lastLap = seconds;
  race.bestLap = best ? seconds : race.bestLap;
  race.lap += 1;
  race.lapSeconds = 0;
  return { kind: 'lap', seconds, best };
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null) return '--:--.---';
  const millis = Math.round(seconds * 1000);
  const minutes = Math.floor(millis / 60000);
  const rest = (millis - minutes * 60000) / 1000;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}
