# AstroWander

A star and planet atlas that runs entirely in the browser. It charts your live sky, labels
it through the phone camera, and identifies a photograph of the night sky by solving it
against a star catalogue — with no server, no API keys and no network calls at runtime.

## What it does

**Sky** — an all-sky chart for your location and time. 9,981 stars down to magnitude 6.6,
88 constellations, 110 Messier objects, Milky Way contours, and the Sun, Moon and planets.
Star colours are computed from each star's real B−V colour index through a blackbody curve,
so spectral class is visible rather than decorative. Pinch to zoom, drag to pan, tap to
identify, and scrub ±12 hours to see what rises later.

**Point** — the camera feed with the catalogue projected over it. Select any object and it
draws a ring on it, or an off-screen arrow with the angular distance counting down.

**Solve** — give it a photograph and it works out where the camera was pointing. It detects
star-like sources, matches triangles of them against the catalogue by shape, and recovers
the camera pose. Output is the centre RA/Dec, field of view, image scale, rotation, and every
star, deep-sky object and planet in frame.

**Atlas** — search everything. Each object gets its current altitude and azimuth, rise,
transit and set times for your latitude, catalogue data and a description.

## How the plate solver works

The interesting part. Given only a list of point sources in an image, with no idea of the
pointing, orientation or focal length:

1. **Detection** — tile-median background estimate, bilinear interpolation back to full
   resolution, threshold at 4σ above a MAD-derived noise level, then 8-connected component
   labelling with flux-weighted centroids. Second moments reject trails and elongated blobs.

2. **A multi-scale catalogue index** — the scale of the triangles that matter is set by the
   field of view, which spans more than a factor of five. A single nearest-neighbour index
   cannot cover that: neighbours in a 1,000-star catalogue sit a few degrees apart, while a
   65° phone frame wants triangles 20–45° on a side. The index is therefore built in bands,
   each drawn from a star set sparse enough that its neighbours land at the right separation.

3. **Matching** — triangles of the brightest detections are looked up by their two
   side-length ratios, which are scale and rotation invariant. Candidates are gated first on
   whether the longest side could subtend the required angle anywhere in the allowed focal
   range — two float comparisons that reject most of them for free.

4. **Pose** — the focal length is solved from the longest side by bisection on the subtended
   cosine, which is monotonic in focal length. The rotation then comes from Davenport's
   q-method, via a Jacobi eigen-decomposition of the 4×4 K-matrix. The whole matching loop is
   written in cosines so no `acos` appears in it.

5. **Verification** — every catalogue star inside the field cone is reprojected and matched
   to detections. A pose is accepted only if it explains a reasonable share of what it
   predicts: with millions of hypotheses tested, eight stars landing within a few pixels does
   happen by chance, but only when the pose projects far more stars than it matches. Scoring
   against that expectation is what separates a real solve from a coincidence.

Against synthetic fields at known poses it recovers the centre to about 0.005° and the field
of view exactly, across 22°–85° frames with missed detections, spurious sources and pixel
noise. On random non-sky point fields it reports failure rather than guessing.

## Running it

It is a static site. Open `index.html` over HTTP, or serve the directory:

```
python -m http.server 8000
```

**HTTPS is required for the camera and geolocation.** Browsers block both on plain HTTP
except on `localhost`, so a deployed copy must be served over TLS. GitHub Pages, Netlify and
Cloudflare Pages all provide that.

## Layout

```
index.html          markup, styles, script tags
js/astro.js         coordinate frames, ephemeris, rise/set, search, descriptions
js/sky.js           the all-sky chart
js/ar.js            camera overlay and device-orientation handling
js/solve.js         source detection, catalogue index, plate solver, EXIF reader
data/stars.js       9,981 stars (HYG, merged with Yale BSC proper names)
data/constellations.js  88 constellation line figures
data/dsos.js        110 Messier objects
data/milkyway.js    Milky Way brightness contours
data/lore.js        written descriptions
```

The only external dependency is [astronomy-engine](https://github.com/cosinekitty/astronomy)
from a CDN, which supplies precession, nutation and planetary ephemerides. Star positions are
J2000 unit vectors rotated straight to horizontal coordinates by a per-frame matrix.

## Known limits

- **Compass accuracy.** Phone magnetometers are typically 5–15° out, and nothing in software
  fixes that. The Point tab has a drag-to-nudge calibration that is remembered per device.
- **The solver needs roughly eight real stars in frame.** A handheld snapshot of a bright
  city sky will not solve. A few seconds of exposure on a steady surface usually will.
- **A failed solve is slow** — 40–90 seconds, because it has to exhaust the search space
  before it can honestly report nothing. Narrowing the field-of-view dropdown cuts this
  considerably, and EXIF focal length sets it automatically when present.
- **Landscape orientation on phones is untested.** The screen-rotation sign in the
  device-orientation maths follows a reference implementation rather than direct measurement.

## Data sources

- [HYG Database](https://github.com/astronexus/HYG-Database) — star positions, distances,
  spectral types, colour indices
- [Yale Bright Star Catalogue](https://github.com/brettonw/YaleBrightStarCatalog) — proper names
- [d3-celestial](https://github.com/ofrohn/d3-celestial) — constellation figures, Messier
  catalogue, Milky Way contours

Each retains its own licence.
