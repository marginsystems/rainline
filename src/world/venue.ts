import type * as THREE from 'three';
import { COAST_HIGHWAY, DUSK_CIRCUIT, type Track, type TrackLayout } from '../../sim/track.ts';
import type { Sky } from '../render/sky.ts';
import type { RoadSurface } from './road-material.ts';

export type VenueId = 'coast' | 'city' | 'beaver';

export interface VenueInfo {
  readonly id: VenueId;
  readonly name: string;
  readonly tagline: string;
  readonly layout: TrackLayout;
}

export const VENUES: readonly VenueInfo[] = [
  { id: 'coast', name: 'Coast Highway', tagline: 'Coast highway · rain, tunnel and bridge', layout: COAST_HIGHWAY },
  { id: 'city', name: 'Night Circuit', tagline: 'Night circuit · drift for points', layout: DUSK_CIRCUIT },
  { id: 'beaver', name: 'Beaver Run', tagline: 'Shiba on a bike · Z kicks left, C kicks right', layout: COAST_HIGHWAY },
];

export const DEFAULT_VENUE: VenueId = 'coast';
export const VENUE_STORAGE_KEY = 'rainline.track';
export const VENUE_QUERY = 'track';

export interface VenueView {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly trackIndex: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface Venue {
  readonly info: VenueInfo;
  readonly track: Track;
  readonly sky: Sky;
  readonly road: RoadSurface;
  readonly group: THREE.Group;
  readonly overlays: THREE.Object3D[];
  readonly rainColour: readonly [number, number, number];
  update(view: VenueView): number;
}

const isVenueId = (value: string | null): value is VenueId => VENUES.some((venue) => venue.id === value);

export function chooseVenue(search: string, stored: string | null): VenueId {
  const asked = new URLSearchParams(search).get(VENUE_QUERY);
  if (isVenueId(asked)) return asked;
  return isVenueId(stored) ? stored : DEFAULT_VENUE;
}

export const venueAddress = (path: string, id: string, remembered: boolean): string => (remembered ? path : `${path}?${VENUE_QUERY}=${encodeURIComponent(id)}`);

export function venueInfo(id: VenueId): VenueInfo {
  const found = VENUES.find((venue) => venue.id === id) ?? VENUES[0];
  if (!found) throw new Error('no venues are defined');
  return found;
}
