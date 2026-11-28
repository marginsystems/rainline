# Rainline

An arcade drifting game on Three.js, in TypeScript. It runs in the browser with no server. See [README.md](README.md) for how to run it and how the code is laid out.

## Code comments

Do not write comments in code. No block comments, no line comments, no JSDoc, no docstrings used as comments, no TODO notes. Do not replace a comment with a shorter one.

Agents read this source. Names, types, and tests carry the meaning. A comment that explains a change, a workaround, a tuning value, or a ticket belongs in the commit, the issue, or the PR.

Leave lint and type directives, shebangs, generated-file banners, and legal notices.

This applies to TypeScript, Python, GLSL, CSS, and shell. It does not apply to Markdown or user-facing copy. `test/rules.test.ts` enforces it.

## Types

Game code is TypeScript with `strict` on. Do not add `.js` files.

Give every state object and function a real type. Do not use `any`, `@ts-ignore`, or `@ts-expect-error`. Do not use the non-null `!`; check the value instead. Prefer a discriminated union over a string field plus optional fields. `test/rules.test.ts` enforces this.

Python in `blender/` has full type hints.

Run `npm run typecheck` and get zero errors before every PR.

## Tests

Name a test file exactly after the file it tests, in the same directory: `foo.ts` is tested by `foo.test.ts`. Run `npm test`; it takes a few seconds.

Everything in `sim/` is pure TypeScript with no Three.js and no DOM, so the driving rules are tested in Node. A change to how the car drives, how drifts score, or how laps count goes in `sim/` with a test, never in `src/`.

## Tuning values

Every tuning number lives in a named constant object at the top of its file (`CAR` in `sim/car.ts`, `CHASE` in `src/camera/chase-camera.ts`, `RENDER` in `src/render/stage.ts`, and so on). Do not put a bare number in the middle of a function.

## Motion

Every user-visible change in the HUD animates with spring motion: button presses, mode changes, panels, and text that appears or changes. Nothing may change from one frame to the next.

Use the springs in [src/ui-spring.ts](src/ui-spring.ts): the `--spring-snappy`, `--spring-smooth` and `--spring-bouncy` CSS easings with their `-ms` durations, `createSwapText` in `src/hud/swap-text.ts` for text that changes, or `stepSpring` for motion driven from code. Do not write ad-hoc CSS timings or cubic-bezier curves.

No thick or bright borders, outlines or focus rings, no pill-shaped radii, and small corner radii. Glass panels are clean and transparent.

## Rendering budget

The game targets 60 fps or better on an Apple Silicon MacBook at Retina resolution. The frame draws the scene three times (planar reflection, ambient occlusion normals, colour), so keep draw calls low:

- Repeated props are `InstancedMesh`. Track pieces are merged into one geometry per material.
- Flat overlays (decals, glows, skid marks) and particles are passed to `stage.hideFromAo` so they stay out of the ambient occlusion pass.
- Objects that should not appear in the wet road reflection go on `UNREFLECTED_LAYER`.
- The shadow map renders once per frame; do not turn `shadowMap.autoUpdate` back on.
- Lights that sit near the car or a wall are kept dim or set back, because a bright light at close range floods the bloom. The headlight beam on the road is a decal, not the spot lights.
- Anything costly is switched by the quality tiers in `src/render/quality.ts`. A new costly effect gets a field there, and the lower tiers turn it down or off. The default is fixed Ultra; Auto is a choice in the graphics menu, judges a second by its median frame, and undoes a drop that bought no speed.
- The HUD uses no `backdrop-filter`, and its text updates at 30 Hz.

## Clean pixels

- Nothing drawn should be thinner than a pixel where the player sees it. `src/render/pixel-footprint.ts` has the shared formula; a new thin feature gets a test against it, or fades out before it goes sub-pixel (the skyline windows do this with `fwidth`).
- A shader never raises a possibly negative number to a power and never divides by something that can reach zero: wrap the base in `max(x, 0.0)`. One NaN or infinite pixel becomes a black square once bloom blurs it. `test/rules.test.ts` checks `pow`, and the bloom and lens passes drop non-finite pixels as a last line of defence.
- Keep highlights broad. A mirror-sharp clearcoat or puddle under a point light makes single-pixel sparks that flicker; the car and road keep a roughness floor.
- No light sits inside or right against a mesh it can light.

## Realistic look

The driving is arcade; the picture aims for a real wet night, not a cartoon.

- Ground, road, run-off and walls use scanned CC0 texture sets (colour, normal, roughness) through `src/world/surfaces.ts`. Kerbs keep their red and white paint stripes as the colour map over the scanned concrete normal and roughness maps. A new large surface gets a texture set, not a flat colour or a generated speckle.
- Colours stay neutral: no saturated neon on the track, sky or fog. Lamps are warm white or sodium.
- Image-based light comes from the night photo in `public/hdr/`, kept dim (`NIGHT.photoEnvironmentIntensity`); it is far brighter than the scene.
- Trees are a bark-textured trunk plus alpha-cut foliage cards with outward shading normals (`src/world/trees.ts`), not cones or blobs. Foliage stays out of the ambient occlusion pass and the road reflection.
- Towers show glass panes, mixed office and home lighting and a street glow at the base; no coloured neon trim.
- The car is a plain late-1980s sports coupe, not a supercar: cream solid paint with a modest clearcoat, black rubbing strips and lower trim, raised pop-up headlamps, silver multi-spoke alloys and a thin brushed belt moulding. Only its lamps glow: no emissive trim and no underglow.
- The lens pass applies the grade (`GRADE` in `src/render/lens-pass.ts`): lower saturation and fine film grain. It also draws the raindrops on the lens (`LENS_DROPLETS`), which follow the rain strength.

## Tracks

A track is a venue: a layout in `sim/track.ts` plus a builder that returns a `Venue` (`src/world/venue.ts`) with its sky, road, scenery and a per-frame `update`. `VENUES` lists them; the lobby picker stores the choice and reloads the page behind a fade.

- The coast highway is built in `src/world/coast/`. `plan.ts` is plain code with tests: which stretch of the lap is coast, tunnel or bridge, how sheltered a point is, and the hill, shore and cable profiles. Geometry is extruded along the track with `ribbon` and placed with `boxes`.
- The road surface is the reflection plane, so it stays at height zero on every track. Anything below it (sea, shore) goes on `UNREFLECTED_LAYER`.
- `Venue.update` returns shelter from 0 to 1. Inside a tunnel the sky dims its lights, fog and exposure with it and the rain stops; do not add a second way to darken a tunnel.
- Beaver Run is the meme mode: the coast venue with `sim/traffic.ts` (lanes, kicks, dominoes, bumps, rams, all tested), `src/world/traffic-view.ts` and the rider in `src/world/rider.ts`. A kicked or rammed vehicle becomes a box rigid body (`sim/body.ts`): it tumbles over the venue's `terrain` (the coast's hill, shore, guardrails, tunnel walls and bridge rails come from `src/world/coast/ground.ts`), knocks into other vehicles and lies as a wreck that traffic brakes for. Views draw each body at its pose blended between the last two steps, along `frameAlong`, never snapped to a track sample. The Coast Highway runs the same traffic, lighter, and the car rams it instead of kicking. The roadside cast stands where `sim/crowd.ts` puts it, which also decides kicks, wreck hits and the bike riding into a performer. The joke is that everything looks real: traffic is detailed CC-BY models of fictional makes (`public/models/traffic/`; one instanced mesh per material, plain-bodied cars take a paint colour per instance, glass is see-through and stays out of the ambient occlusion pass), each kept near 11,000 triangles, and the rider is a realistic Shiba Inu playing its sitting clip on the bike, with the kick added in code as a foreleg swipe (`src/world/rider.ts`). The bike is a detailed CC-BY motorcycle whose `fork`, `wheel-front` and `wheel-back` nodes the game turns by name. On the hosted build a cast of Mixamo characters does silly things on the road shoulder (`src/world/roadside-cast.ts`: fourteen performers loaded from the private `public/local/` folder, absent from a plain clone, such as a skateboarding granny, a clown doing the chicken dance and a zombie dancing Thriller, one copy each; each is a skinned clone with its own mixer, recycled ahead of the rider like traffic), kicks throw confetti and comic pops (`src/fx/comic-pops.ts`), the grade is more saturated and the sounds named `meme-*` are cartoon sounds. Do not go back to toy-style or code-built vehicles.
- Thin things seen far away (power lines, bridge hangers, cables and rails) are `thinLines` from `src/world/coast/thin-line.ts`: they keep at least a pixel of width on screen and fade by coverage, so they do not shimmer.

## Assets

This repository is open source. Only commit files that may be redistributed: CC0, CC BY 4.0 with credit, or own work. Every file under `public/` has a row in [ASSETS.md](ASSETS.md) with its source and licence, and `test/assets.test.ts` checks it. Never use a real car brand, logo or livery.

Splice sounds and Mixamo characters may be used in the game but never committed here. They live in the private `marginsystems/rainline-assets` repository, cloned into the git-ignored `public/local/` folder; the game reads `local/manifest.json` and loads only what it names (`src/local-assets.ts`). Every private sound has a CC0 stand-in of the same name in `public/audio/`, so a plain clone plays with full sound. Portal builds (`npm run build:portal`) leave `public/local/` out.

The car is generated: `npm run car` runs `blender/build_car.py` in headless Blender and writes `public/models/car.glb`. Change the script, not the GLB. The game finds parts by name (`Body`, `WheelFL`, `WheelFR`, `WheelRL`, `WheelRR`, each wheel's `_Spin` child, the `ExhaustL` and `ExhaustR` empties) and materials by name (`Headlight`, `Taillight`, `Accent`), so keep those names. The build also writes `public/models/car.features.json`, the thinnest width of every thin part, and refuses to build one under 12 mm; `src/world/car-features.test.ts` checks that list against the pixel size at the chase camera.

Sounds load by fixed base name (the list is in `src/audio/sounds.ts`): first `public/local/audio/` when the manifest names it, then `public/audio/`, then `public/audio/fallback/`. A missing file is skipped, so a new sound is a new name in that list plus a CC0 file, and a row in ASSETS.md.

Asset URLs are relative (`models/car.glb`, not `/models/car.glb`) so the build runs from any folder, as portals serve it.

## Running things

Do not start a dev server, a browser, or anything that can play sound unless the person asked for it in that session. Verify with `npm run typecheck`, `npm test` and `npm run build`.

## Pull requests

Never push to `main`. Every change goes on a branch and lands through a pull request. One feature per PR.

## Files and shell

Never run `rm -r` or `rm -rf`, and never run `rm` on a path built from a shell variable. Write temporary files into a fresh, uniquely named folder and leave them there.
