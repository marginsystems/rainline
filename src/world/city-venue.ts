import * as THREE from 'three';
import { FLAT_TERRAIN } from '../../sim/body.ts';
import { buildTrack } from '../../sim/track.ts';
import { createNightSky } from '../render/night-sky.ts';
import type { Stage } from '../render/stage.ts';
import { buildScenery } from './scenery.ts';
import { buildSkyline } from './skyline.ts';
import { buildTrackMeshes } from './track-mesh.ts';
import { plantTrees } from './trees.ts';
import type { Venue, VenueInfo } from './venue.ts';

export const CITY = {
  rainColour: [0.5, 0.58, 0.75],
} as const;

export function buildCityVenue(info: VenueInfo, stage: Stage): Venue {
  const track = buildTrack(info.layout);
  const sky = createNightSky(stage.scene, stage.renderer);
  const meshes = buildTrackMeshes(track, stage.reflection);
  const scenery = buildScenery(track);
  const forest = plantTrees(track);
  const group = new THREE.Group();
  group.add(meshes.group, scenery.group, forest.group, buildSkyline(track));
  return {
    info,
    track,
    sky,
    road: meshes.road,
    group,
    overlays: [...meshes.overlays, ...scenery.overlays, ...forest.foliage],
    rainColour: CITY.rainColour,
    terrain: FLAT_TERRAIN,
    update(view) {
      scenery.update(view.x, view.z, view.trackIndex);
      return 0;
    },
  };
}
