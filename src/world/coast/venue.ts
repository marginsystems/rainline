import * as THREE from 'three';
import { buildTrack, sampleAt } from '../../../sim/track.ts';
import { createOvercastSky } from '../../render/overcast-sky.ts';
import { UNREFLECTED_LAYER } from '../../render/reflection.ts';
import type { Stage } from '../../render/stage.ts';
import type { Venue, VenueInfo } from '../venue.ts';
import { BRIDGE, buildBridge } from './bridge.ts';
import { buildCoastLand, LAND } from './land.ts';
import { buildStreetLamps, type LampSpot } from './lamps.ts';
import { shelterAt, shoreHeight, spansOf, stations } from './plan.ts';
import { buildGuardrails, buildHighwayRoad } from './road.ts';
import { thinLines } from './thin-line.ts';
import { buildTunnels } from './tunnel.ts';

export const COAST_LOOK = {
  rainColour: [0.78, 0.81, 0.85],
  coastLampEveryMetres: 92,
  coastLampBeyondWall: 1.2,
  bridgeLampEveryMetres: 70,
  bridgeLampAt: 11.3,
} as const;

export function buildCoastVenue(info: VenueInfo, stage: Stage): Venue {
  const track = buildTrack(info.layout);
  const spans = spansOf(track);
  const coast = spans.find((span) => span.section === 'coast');
  const bridge = spans.find((span) => span.section === 'bridge');
  if (!coast || !bridge) throw new Error('the coast highway needs a coast and a bridge');
  const sky = createOvercastSky(stage.scene, stage.renderer);
  const highway = buildHighwayRoad(track, stage.reflection);
  const land = buildCoastLand(track, coast);
  const tunnels = buildTunnels(track, spans.filter((span) => span.section === 'tunnel'));
  const span = buildBridge(track, bridge);

  const lampSpots: LampSpot[] = [];
  for (const index of stations(track, coast, COAST_LOOK.coastLampEveryMetres, 43)) {
    lampSpots.push({ index, lateral: -(track.wallOffset + COAST_LOOK.coastLampBeyondWall), base: shoreHeight(COAST_LOOK.coastLampBeyondWall) });
  }
  stations(track, bridge, COAST_LOOK.bridgeLampEveryMetres, 30).forEach((index, i) => {
    lampSpots.push({ index, lateral: (i % 2 === 0 ? -1 : 1) * COAST_LOOK.bridgeLampAt, base: BRIDGE.kerbHeight });
  });
  const lamps = buildStreetLamps(track, lampSpots);

  const wires = thinLines(land.wires, LAND.wireColour);
  const steel = thinLines(span.lines, BRIDGE.lineColour);
  for (const lines of [wires, steel]) lines.mesh.layers.set(UNREFLECTED_LAYER);

  const group = new THREE.Group();
  group.add(highway.group, buildGuardrails(track, [coast]), land.group, tunnels.group, span.group, lamps.group, wires.mesh, steel.mesh);

  return {
    info,
    track,
    sky,
    road: highway.road,
    group,
    overlays: [...highway.overlays, ...land.forest.foliage, ...lamps.overlays, wires.mesh, steel.mesh],
    rainColour: COAST_LOOK.rainColour,
    update(view) {
      const shelter = shelterAt(track, spans, view.trackIndex);
      sky.setShelter(shelter);
      const sample = sampleAt(track, view.trackIndex);
      tunnels.follow(sample.x, sample.z, view.yaw, shelter);
      wires.setViewport(view.viewportWidth, view.viewportHeight);
      steel.setViewport(view.viewportWidth, view.viewportHeight);
      return shelter;
    },
  };
}
