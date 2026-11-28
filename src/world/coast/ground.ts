import type { Barrier, Terrain } from '../../../sim/body.ts';
import { mod } from '../../../sim/math.ts';
import { sampleAt, type Track } from '../../../sim/track.ts';
import { BRIDGE } from './bridge.ts';
import { COAST, hillHeight, sectionOf, shoreHeight } from './plan.ts';
import { HIGHWAY } from './road.ts';
import { TUNNEL } from './tunnel.ts';

export const GROUND = {
  railDepth: 1.2,
  tunnelKerbInset: 0.05,
  tunnelRockDepth: 60,
  bridgeRailDepth: 1,
} as const;

export function coastTerrain(track: Track): Terrain {
  const wall = track.wallOffset;
  const guardrail: Barrier = { at: wall, top: HIGHWAY.railLow + 4 * HIGHWAY.railRise, depth: GROUND.railDepth };
  const tunnelWall: Barrier = { at: wall - GROUND.tunnelKerbInset + TUNNEL.wallBeyondKerb, top: TUNNEL.ceiling, depth: GROUND.tunnelRockDepth };
  const bridgeRail: Barrier = { at: BRIDGE.railAt, top: BRIDGE.kerbHeight + Math.max(...BRIDGE.railHeights), depth: GROUND.bridgeRailDepth };
  const sectionAt = (along: number): ReturnType<typeof sectionOf> => sectionOf(sampleAt(track, mod(Math.round(along / track.spacing), track.samples.length)));
  return {
    height(along, lateral) {
      const section = sectionAt(along);
      const outside = Math.abs(lateral) - wall;
      switch (section) {
        case 'tunnel':
          return 0;
        case 'bridge':
          return Math.abs(lateral) > BRIDGE.walkEdge ? COAST.seaLevel : 0;
        case 'coast':
          if (outside <= 0) return 0;
          return lateral > 0 ? hillHeight(outside) : shoreHeight(outside);
      }
    },
    barrier(along) {
      const section = sectionAt(along);
      switch (section) {
        case 'tunnel':
          return tunnelWall;
        case 'bridge':
          return bridgeRail;
        case 'coast':
          return guardrail;
      }
    },
  };
}
