# Track importer

Turns a circuit centreline from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT) into a game track module.

```bash
# 1. download ONE circuit into a scratch directory and read it before using it
mkdir -p /tmp/dl && curl -L -o /tmp/dl/it-1922.geojson \
  https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/it-1922.geojson
# keep the source next to the importer for reproducibility (MIT: keep the licence)
cp /tmp/dl/it-1922.geojson scripts/tracks/data/

# 2. import
npx vite-node scripts/tracks/import-geojson.ts -- \
  --in scripts/tracks/data/it-1922.geojson --id monza \
  --name "Autodromo Nazionale Monza" --country Italy \
  [--length 5793] [--start <lon>,<lat>] [--out lib/game/tracks/monza.ts]
```

What it does (`lib/game/track/import.ts`, helpers in `geo.ts`):
1. equirectangular projection around the centroid (R = 6 371 000 m) — x east, **y south**, so the minimap is north-up and a circuit that
   runs clockwise on the map has a positive `signedArea` (same as Buddh; tested);
2. centripetal Catmull-Rom through the ~120 survey points, resampled to equal arc-length spacing (2.5 m);
3. light Laplacian smoothing (no point moves more than 1.5 m), then uniform scale to the official lap length;
4. rotates so index 0 is the start/finish sample nearest `--start` (default: the file's first coordinate — **unverified**, check the real
   start/finish before registering the track, PLAN-v3 T6);
5. emits `lib/game/tracks/<id>.ts`: a `TrackModule` (float32 base64 data + a meta skeleton). It prints the quality numbers
   (max curvature jump, self-intersections, minimum separation of distant track parts).

The emitted `meta` has PLACEHOLDER pit lane, DRS zones, sectors, width and elevation. Author them (T6), then register the track:
add a catalog entry and a `() => import('../tracks/<id>')` loader in `lib/game/track/registry.ts` (`lazyModules`).
Add a row to `CREDITS.md` for every imported circuit.
