export const CAR_FEATURES_PATH = 'public/models/car.features.json';

export interface CarFeature {
  readonly name: string;
  readonly minWidthMetres: number;
}

export function parseCarFeatures(json: string): CarFeature[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('the car feature manifest is not a list');
  return parsed.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('name' in entry) || !('minWidthMetres' in entry)) throw new Error('a car feature lacks its name or width');
    if (typeof entry.name !== 'string' || typeof entry.minWidthMetres !== 'number') throw new Error('a car feature has the wrong types');
    return { name: entry.name, minWidthMetres: entry.minWidthMetres };
  });
}
