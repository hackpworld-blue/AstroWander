/* Plate solving: work out where a photograph of the night sky is pointing, from the
   photograph alone. Detect star-like sources, match triangles of them against the
   catalogue by shape, recover the camera pose, then verify by reprojection.

   Nothing here contacts a server — the whole solve runs in the page. */
window.Solver = (function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  /* ================= source detection ================= */

  function detect(imgData, w, h, opts) {
    opts = opts || {};
    const px = imgData.data;
    const n = w * h;
    const grey = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      grey[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
    }

    /* coarse background on a tile grid, then bilinear back up */
    const TS = 48;
    const tw = Math.ceil(w / TS), th = Math.ceil(h / TS);
    const bg = new Float32Array(tw * th);
    const buf = [];
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      buf.length = 0;
      const x0 = tx * TS, y0 = ty * TS;
      const x1 = Math.min(w, x0 + TS), y1 = Math.min(h, y0 + TS);
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) buf.push(grey[y * w + x]);
      buf.sort((a, b) => a - b);
      bg[ty * tw + tx] = buf.length ? buf[Math.floor(buf.length * 0.4)] : 0;
    }
    function bgAt(x, y) {
      const fx = Math.min(tw - 1.001, Math.max(0, x / TS - 0.5));
      const fy = Math.min(th - 1.001, Math.max(0, y / TS - 0.5));
      const ix = Math.floor(fx), iy = Math.floor(fy), dx = fx - ix, dy = fy - iy;
      const a = bg[iy * tw + ix], b = bg[iy * tw + Math.min(tw - 1, ix + 1)];
      const c = bg[Math.min(th - 1, iy + 1) * tw + ix], d = bg[Math.min(th - 1, iy + 1) * tw + Math.min(tw - 1, ix + 1)];
      return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
    }

    /* noise level from the median absolute deviation of the residual */
    const samp = [];
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 20000))) {
      samp.push(Math.abs(grey[i] - bgAt(i % w, (i / w) | 0)));
    }
    samp.sort((a, b) => a - b);
    const sigma = Math.max(0.6, samp[Math.floor(samp.length * 0.5)] * 1.4826);
    const thresh = (opts.sigma || 4.0) * sigma;

    /* connected components above threshold */
    const seen = new Uint8Array(n);
    const stack = new Int32Array(4096);
    const sources = [];
    const maxArea = opts.maxArea || 900;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (seen[i]) continue;
        const v0 = grey[i] - bgAt(x, y);
        if (v0 < thresh) { seen[i] = 1; continue; }
        let sp = 0; stack[sp++] = i; seen[i] = 1;
        let sx = 0, sy = 0, sf = 0, area = 0, peak = 0;
        let sxx = 0, syy = 0, sxy = 0, overflow = false;
        while (sp > 0) {
          const p = stack[--sp];
          const pxx = p % w, pyy = (p / w) | 0;
          const v = grey[p] - bgAt(pxx, pyy);
          if (v <= 0) continue;
          sx += pxx * v; sy += pyy * v; sf += v; area++;
          sxx += pxx * pxx * v; syy += pyy * pyy * v; sxy += pxx * pyy * v;
          if (v > peak) peak = v;
          if (area > maxArea) { overflow = true; break; }
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const qx = pxx + dx, qy = pyy + dy;
            if (qx < 1 || qy < 1 || qx >= w - 1 || qy >= h - 1) continue;
            const q = qy * w + qx;
            if (seen[q]) continue;
            if (grey[q] - bgAt(qx, qy) < thresh) { seen[q] = 1; continue; }
            if (sp < stack.length) { seen[q] = 1; stack[sp++] = q; }
          }
        }
        if (overflow || area < 2 || sf <= 0) continue;
        const mx = sx / sf, my = sy / sf;
        /* second moments -> reject trails, aeroplanes, edges of buildings */
        const vxx = sxx / sf - mx * mx, vyy = syy / sf - my * my, vxy = sxy / sf - mx * my;
        const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
        const disc = Math.max(0, tr * tr / 4 - det);
        const l1 = tr / 2 + Math.sqrt(disc), l2 = tr / 2 - Math.sqrt(disc);
        const elong = l2 > 0.02 ? Math.sqrt(l1 / l2) : (l1 > 0.4 ? 99 : 1);
        if (elong > 2.6) continue;
        sources.push({ x: mx, y: my, flux: sf, area: area, peak: peak });
      }
    }
    sources.sort((a, b) => b.flux - a.flux);
    return { sources: sources, sigma: sigma, threshold: thresh };
  }

  /* ================= catalogue index ================= */

  const CELL = 0.02;
  const key = (u, v) => (Math.round(u / CELL) * 8192 + Math.round(v / CELL));
  const VERIFY_MAG = 5.8;

  /* The scale of the triangles that matter is set by the field of view, and that spans
     more than a factor of five. One nearest-neighbour index cannot cover it: neighbours of
     a 1,000-star catalogue sit a few degrees apart, while a 65-degree phone frame wants
     triangles 20-45 degrees on a side. So the index is built in bands, each drawing on a
     star set sparse enough that its neighbours land at the right separation. */
  const BANDS = [
    { name: 'wide',   mag: 3.4, min: 15,  max: 85, fov: [38, 130] },
    { name: 'medium', mag: 4.4, min: 5,   max: 26, fov: [13, 50] },
    { name: 'narrow', mag: 5.5, min: 1.5, max: 8,  fov: [4, 16] }
  ];

  let cache = {};
  let verifySet = null;

  function verifyStars() {
    if (verifySet) return verifySet;
    const ids = [];
    for (let i = 0; i < Astro.N; i++) { if (Astro.S[i][2] > VERIFY_MAG) break; ids.push(i); }
    const m = ids.length;
    const vx = new Float64Array(m), vy = new Float64Array(m), vz = new Float64Array(m);
    for (let a = 0; a < m; a++) { const i = ids[a]; vx[a] = Astro.VX[i]; vy[a] = Astro.VY[i]; vz[a] = Astro.VZ[i]; }
    verifySet = { ids: ids, vx: vx, vy: vy, vz: vz, m: m };
    return verifySet;
  }

  function buildBand(band, vs) {
    if (cache[band.name]) return cache[band.name];
    /* the star list is sorted by magnitude, so a magnitude cut is a prefix */
    let n = 0; while (n < vs.m && Astro.S[vs.ids[n]][2] <= band.mag) n++;
    const cosMin = Math.cos(band.max * D2R), cosMax = Math.cos(band.min * D2R);
    const buckets = new Map();
    let count = 0;
    const near = [];
    for (let a = 0; a < n; a++) {
      /* every star in range of the anchor — no sampling, so generating a triangle only
         from its lowest-index vertex is an exact de-duplication: if all three separations
         are in range, the lowest-index vertex always sees the other two. */
      near.length = 0;
      for (let b = a + 1; b < n; b++) {
        const c = vs.vx[a] * vs.vx[b] + vs.vy[a] * vs.vy[b] + vs.vz[a] * vs.vz[b];
        if (c < cosMin || c > cosMax) continue;
        near.push([c, b]);
      }
      if (near.length < 2) continue;
      const pick = near;
      for (let p = 0; p < pick.length; p++) for (let q = p + 1; q < pick.length; q++) {
        const b = pick[p][1], c = pick[q][1];
        const cbc = vs.vx[b] * vs.vx[c] + vs.vy[b] * vs.vy[c] + vs.vz[b] * vs.vz[c];
        if (cbc < cosMin || cbc > cosMax) continue;   /* the third side must be in range too */
        const sides = [[pick[p][0], a, b], [pick[q][0], a, c], [cbc, b, c]];
        sides.sort((x, y) => x[0] - y[0]);        /* smallest cosine = longest side first */
        const A = Math.acos(Math.max(-1, Math.min(1, sides[0][0])));
        const mid = Math.acos(Math.max(-1, Math.min(1, sides[1][0])));
        const shrt = Math.acos(Math.max(-1, Math.min(1, sides[2][0])));
        if (shrt < 0.4 * D2R) continue;            /* degenerate slivers match everything */
        const u = mid / A, v = shrt / A;
        const kk = key(u, v);
        let arr = buckets.get(kk);
        if (!arr) { arr = []; buckets.set(kk, arr); }
        const longA = sides[0][1], longB = sides[0][2];
        const opp = [a, b, c].find(t => t !== longA && t !== longB);
        /* cosine of the longest side, the two ratios, then the vertices */
        arr.push(sides[0][0], u, v, opp, longA, longB);
        count++;
      }
    }
    cache[band.name] = { buckets: buckets, count: count, stars: n, band: band };
    return cache[band.name];
  }

  /* Returns the verification star set plus the bands whose scale overlaps the field of
     view we are willing to consider. */
  function buildIndex(fovMin, fovMax) {
    fovMin = fovMin || 20; fovMax = fovMax || 110;
    const vs = verifyStars();
    const bands = BANDS.filter(b => b.fov[1] >= fovMin && b.fov[0] <= fovMax).map(b => buildBand(b, vs));
    return { ids: vs.ids, vx: vs.vx, vy: vs.vy, vz: vs.vz, m: vs.m, bands: bands,
             count: bands.reduce((s, b) => s + b.count, 0) };
  }

  /* ================= geometry ================= */

  /* Cosine of the angle subtended at the camera by two image points, at focal length f.
     Strictly increasing in f: a longer lens makes the same two points look closer together.
     Everything downstream compares cosines, so no acos appears in the matching loop. */
  function cosFor(x1, y1, x2, y2, f) {
    const ff = f * f;
    const d = x1 * x2 + y1 * y2 + ff;
    const n1 = x1 * x1 + y1 * y1 + ff, n2 = x2 * x2 + y2 * y2 + ff;
    return d / Math.sqrt(n1 * n2);
  }
  /* Solve f so that two image points subtend a given angle (passed as its cosine). */
  function solveFocalCos(x1, y1, x2, y2, targetCos, fLo, fHi) {
    let lo = fLo, hi = fHi;
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) * 0.5;
      if (cosFor(x1, y1, x2, y2, mid) < targetCos) lo = mid; else hi = mid;
    }
    return (lo + hi) * 0.5;
  }
  function angleFor(x1, y1, x2, y2, f) {
    return Math.acos(Math.max(-1, Math.min(1, cosFor(x1, y1, x2, y2, f))));
  }

  /* Jacobi eigen-decomposition of a symmetric 4x4; returns the eigenvector of the largest value. */
  function topEigenvector4(K) {
    const a = K.map(r => r.slice());
    let V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let sweep = 0; sweep < 10; sweep++) {
      let off = 0;
      for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
      if (off < 1e-20) break;
      for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    let best = 0;
    for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
    return [V[0][best], V[1][best], V[2][best], V[3][best]];
  }

  /* Davenport's q-method: rotation taking camera-frame vectors u to catalogue vectors v. */
  function wahba(us, vs, weights) {
    let b00 = 0, b01 = 0, b02 = 0, b10 = 0, b11 = 0, b12 = 0, b20 = 0, b21 = 0, b22 = 0;
    for (let i = 0; i < us.length; i++) {
      const w = weights ? weights[i] : 1, u = us[i], v = vs[i];
      b00 += w * v[0] * u[0]; b01 += w * v[0] * u[1]; b02 += w * v[0] * u[2];
      b10 += w * v[1] * u[0]; b11 += w * v[1] * u[1]; b12 += w * v[1] * u[2];
      b20 += w * v[2] * u[0]; b21 += w * v[2] * u[1]; b22 += w * v[2] * u[2];
    }
    const sigma = b00 + b11 + b22;
    const z = [b12 - b21, b20 - b02, b01 - b10];
    const S = [[2 * b00, b01 + b10, b02 + b20], [b01 + b10, 2 * b11, b12 + b21], [b02 + b20, b12 + b21, 2 * b22]];
    const K = [
      [sigma, z[0], z[1], z[2]],
      [z[0], S[0][0] - sigma, S[0][1], S[0][2]],
      [z[1], S[1][0], S[1][1] - sigma, S[1][2]],
      [z[2], S[2][0], S[2][1], S[2][2] - sigma]
    ];
    const q = topEigenvector4(K);
    const nq = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    const qw = q[0] / nq, qx = q[1] / nq, qy = q[2] / nq, qz = q[3] / nq;
    /* Davenport's attitude matrix is the transpose of the rotation wanted here, so this
       is built already transposed: callers get R with v = R u, not u = R v. */
    return [
      1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy),
      2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx),
      2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)
    ];
  }
  const applyR = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
                            R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
                            R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  const applyRT = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
                             R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
                             R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

  /* image pixel offsets from centre -> camera-frame unit vector (+Y up, +Z boresight) */
  function ray(x, y, f) {
    const n = Math.sqrt(x * x + y * y + f * f);
    return [x / n, -y / n, f / n];
  }

  /* ================= verification ================= */

  function verify(R, f, srcs, cx, cy, idx, tolPx, limit) {
    const bore = applyR(R, [0, 0, 1]);
    /* only catalogue stars inside the field cone are worth projecting */
    const halfDiag = Math.atan(Math.hypot(cx, cy) / f);
    const cosCone = Math.cos(Math.min(Math.PI / 2.2, halfDiag * 1.12));
    const matches = [];
    const used = new Uint8Array(srcs.length);
    const nScan = Math.min(limit || idx.m, idx.m);
    let nProjected = 0;
    for (let a = 0; a < nScan; a++) {
      const v = [idx.vx[a], idx.vy[a], idx.vz[a]];
      if (v[0] * bore[0] + v[1] * bore[1] + v[2] * bore[2] < cosCone) continue;
      const u = applyRT(R, v);
      if (u[2] <= 0.02) continue;
      const px = cx + f * u[0] / u[2], py = cy - f * u[1] / u[2];
      if (px < -8 || py < -8 || px > cx * 2 + 8 || py > cy * 2 + 8) continue;
      nProjected++;
      let best = -1, bd = tolPx;
      for (let s = 0; s < srcs.length; s++) {
        if (used[s]) continue;
        const d = Math.hypot(srcs[s].x - px, srcs[s].y - py);
        if (d < bd) { bd = d; best = s; }
      }
      if (best >= 0) { used[best] = 1; matches.push({ cat: a, src: best, dist: bd, px: px, py: py }); }
    }
    matches.nProjected = nProjected;
    return matches;
  }

  function refine(matches, srcs, cx, cy, f, idx) {
    const us = [], vs = [];
    for (const m of matches) {
      const s = srcs[m.src];
      us.push(ray(s.x - cx, s.y - cy, f));
      vs.push([idx.vx[m.cat], idx.vy[m.cat], idx.vz[m.cat]]);
    }
    return wahba(us, vs);
  }

  /* Least-squares tweak of the focal length against the current match set. */
  function refineFocal(matches, srcs, cx, cy, f, idx, R) {
    let best = f, bestErr = Infinity;
    for (let k = -8; k <= 8; k++) {
      const ft = f * (1 + k * 0.012);
      let err = 0;
      for (const m of matches) {
        const v = [idx.vx[m.cat], idx.vy[m.cat], idx.vz[m.cat]];
        const u = applyRT(R, v);
        if (u[2] <= 0.02) { err += 1e6; continue; }
        const px = cx + ft * u[0] / u[2], py = cy - ft * u[1] / u[2];
        const s = srcs[m.src];
        err += (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py);
      }
      if (err < bestErr) { bestErr = err; best = ft; }
    }
    return best;
  }

  /* ================= the solve ================= */

  function solve(sources, w, h, opts, onProgress) {
    opts = opts || {};
    const cx = w / 2, cy = h / 2;
    const idx = buildIndex(opts.fovMin || 20, opts.fovMax || 110);
    const nUse = Math.min(opts.maxSources || 14, sources.length);
    const srcs = sources.slice(0, Math.min(opts.matchPool || 60, sources.length));
    const pts = srcs.slice(0, nUse).map(s => [s.x - cx, s.y - cy]);

    /* plausible focal range from the allowed field of view */
    const fovMax = opts.fovMax || 110, fovMin = opts.fovMin || 20;
    const fLo = (w / 2) / Math.tan(fovMax / 2 * D2R);
    const fHi = (w / 2) / Math.tan(fovMin / 2 * D2R);

    /* optional prior on where the camera pointed, to prune the catalogue */
    let priorVec = null, cosPrior = -2;
    if (opts.prior) {
      const f = Astro.makeFrame(opts.date || new Date());
      /* alt/az prior -> an EQJ direction, by inverting the frame rotation */
      const alt = opts.prior.alt * D2R, az = opts.prior.az * D2R;
      const hx = Math.cos(alt) * Math.cos(az), hy = -Math.cos(alt) * Math.sin(az), hz = Math.sin(alt);
      const m = f.m;
      priorVec = [
        m[0][0] * hx + m[0][1] * hy + m[0][2] * hz,
        m[1][0] * hx + m[1][1] * hy + m[1][2] * hz,
        m[2][0] * hx + m[2][1] * hy + m[2][2] * hz
      ];
      cosPrior = Math.cos((opts.priorRadius || 45) * D2R);
    }

    /* triangles of the brightest detections, largest first (most distinctive) */
    const tris = [];
    for (let i = 0; i < nUse; i++) for (let j = i + 1; j < nUse; j++) for (let k = j + 1; k < nUse; k++) {
      const d = [
        [Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]), i, j, k],
        [Math.hypot(pts[i][0] - pts[k][0], pts[i][1] - pts[k][1]), i, k, j],
        [Math.hypot(pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]), j, k, i]
      ];
      d.sort((a, b) => b[0] - a[0]);
      const A = d[0][0];
      if (A < w * 0.06) continue;
      const pA = pts[d[0][1]], pB = pts[d[0][2]];
      /* the cosine range this side can possibly subtend, across the whole allowed focal
         range. Two comparisons against this reject most catalogue triangles for free. */
      tris.push({ A: A, u: d[1][0] / A, v: d[2][0] / A,
                  longA: d[0][1], longB: d[0][2], opp: d[0][3],
                  cosLo: cosFor(pA[0], pA[1], pB[0], pB[1], fLo),
                  cosHi: cosFor(pA[0], pA[1], pB[0], pB[1], fHi),
                  score: A });
    }
    tris.sort((a, b) => b.score - a.score);

    /* Image ratios are measured in the gnomonic plane and catalogue ratios on the sphere,
       so they are not identical — but across a 65-degree frame they agree to under 0.01,
       which is what sets this tolerance. */
    const RTOL = 0.028;
    const ANGTOL = 0.4 * D2R;
    const minInliers = opts.minInliers || 8;
    let best = null;
    let tested = 0;
    let ti = 0;

    /* Cosine tolerance equivalent to ANGTOL at the angle whose cosine is c. */
    const cosTol = c => ANGTOL * Math.sqrt(Math.max(1e-4, 1 - c * c));

    function attempt(tri, cosA_cat, va, vb, vopp) {
      /* f from the longest side, then check the other two sides agree */
      const pA = pts[tri.longA], pB = pts[tri.longB], pO = pts[tri.opp];
      const f = solveFocalCos(pA[0], pA[1], pB[0], pB[1], cosA_cat, fLo, fHi);
      const cosAO = cosFor(pA[0], pA[1], pO[0], pO[1], f);
      const cosBO = cosFor(pB[0], pB[1], pO[0], pO[1], f);
      const catAO = va[0] * vopp[0] + va[1] * vopp[1] + va[2] * vopp[2];
      const catBO = vb[0] * vopp[0] + vb[1] * vopp[1] + vb[2] * vopp[2];
      /* the two assignments of the long side's endpoints */
      const orders = [[catAO, catBO, va, vb], [catBO, catAO, vb, va]];
      for (const [cA, cB, VA, VB] of orders) {
        if (Math.abs(cosAO - cA) > cosTol(cA) || Math.abs(cosBO - cB) > cosTol(cB)) continue;
        const us = [ray(pA[0], pA[1], f), ray(pB[0], pB[1], f), ray(pO[0], pO[1], f)];
        const vsv = [VA, VB, vopp];
        let R = wahba(us, vsv);
        if (priorVec) {
          const bore = applyR(R, [0, 0, 1]);
          if (bore[0] * priorVec[0] + bore[1] * priorVec[1] + bore[2] * priorVec[2] < cosPrior) continue;
        }
        let tol = Math.max(3.5, w * 0.006);
        /* Quick reject: check only the brightest slice of the catalogue first. A wrong
           pose almost never lines up even four bright stars, and this costs a tenth of
           a full verification. */
        if (verify(R, f, srcs, cx, cy, idx, tol, 420).length < 4) continue;
        let m = verify(R, f, srcs, cx, cy, idx, tol);
        if (m.length < 5) continue;
        /* refine, tightening the tolerance each round */
        let ff = f;
        for (let it = 0; it < 3; it++) {
          R = refine(m, srcs, cx, cy, ff, idx);
          ff = refineFocal(m, srcs, cx, cy, ff, idx, R);
          tol = Math.max(2.5, tol * 0.8);
          m = verify(R, ff, srcs, cx, cy, idx, tol);
          if (m.length < 5) break;
        }
        /* A pose is only believable if it explains a decent share of what it predicts.
           With millions of hypotheses tested, eight stars landing within a few pixels does
           happen by chance — but only when the pose projects far more stars than it
           matches. Scoring against that expectation is what separates the two. */
        const explainable = Math.min(srcs.length, m.nProjected || 0);
        if (m.length >= minInliers && m.length >= 0.30 * explainable) {
          const rms = Math.sqrt(m.reduce((s, x) => s + x.dist * x.dist, 0) / m.length);
          if (rms > 3.2) continue;
          return { R: R, f: ff, matches: m, rms: rms, frac: m.length / Math.max(1, explainable) };
        }
      }
      return null;
    }

    const started = performance.now();
    const budget = (opts.timeBudget || 60) * 1000;
    let cancelled = false;
    const handle = { cancel: function () { cancelled = true; } };
    if (opts.control) opts.control.handle = handle;

    return new Promise(function (resolve) {
      function chunk() {
        const t0 = performance.now();
        if (cancelled || t0 - started > budget) { finish(); return; }
        while (ti < tris.length && performance.now() - t0 < 26) {
          const tri = tris[ti++];
          /* look up the hash neighbourhood */
          const cu = Math.round(tri.u / CELL), cv = Math.round(tri.v / CELL);
          const span = Math.ceil(RTOL / CELL);
          for (const band of idx.bands) {
            for (let du = -span; du <= span; du++) {
              for (let dv = -span; dv <= span; dv++) {
                const arr = band.buckets.get((cu + du) * 8192 + (cv + dv));
                if (!arr) continue;
                for (let p = 0; p < arr.length; p += 6) {
                  /* can this side length happen at all within the allowed focal range? */
                  if (arr[p] < tri.cosLo || arr[p] > tri.cosHi) continue;
                  if (Math.abs(arr[p + 1] - tri.u) > RTOL || Math.abs(arr[p + 2] - tri.v) > RTOL) continue;
                  tested++;
                  const opp = arr[p + 3], a = arr[p + 4], b = arr[p + 5];
                  const r = attempt(tri,
                    arr[p],
                    [idx.vx[a], idx.vy[a], idx.vz[a]],
                    [idx.vx[b], idx.vy[b], idx.vz[b]],
                    [idx.vx[opp], idx.vy[opp], idx.vz[opp]]);
                  if (r && (!best || r.matches.length > best.matches.length)) {
                    best = r;
                    if (best.matches.length >= (opts.goodEnough || 16) ||
                        (best.matches.length >= 10 && best.frac > 0.55)) { finish(); return; }
                  }
                }
              }
            }
          }
        }
        if (onProgress) onProgress(ti / Math.max(1, tris.length), tested, best ? best.matches.length : 0);
        if (ti < tris.length) setTimeout(chunk, 0); else finish();
      }
      function finish() {
        if (!best) {
          resolve({ ok: false, tested: tested, triangles: tris.length,
                    searched: ti / Math.max(1, tris.length), cancelled: cancelled,
                    timedOut: performance.now() - started > budget,
                    elapsed: (performance.now() - started) / 1000 });
          return;
        }
        resolve(report(best, srcs, cx, cy, w, h, idx, opts));
      }
      chunk();
    });
  }

  /* ================= result ================= */

  function report(best, srcs, cx, cy, w, h, idx, opts) {
    const R = best.R, f = best.f;
    const bore = applyR(R, [0, 0, 1]);
    const raC = (Math.atan2(bore[1], bore[0]) * R2D / 15 + 24) % 24;
    const decC = Math.asin(Math.max(-1, Math.min(1, bore[2]))) * R2D;
    const fovW = 2 * Math.atan(cx / f) * R2D;
    const fovH = 2 * Math.atan(cy / f) * R2D;
    const scale = (2 * Math.atan(cx / f) * R2D * 3600) / w;   /* arcsec per pixel */

    /* roll: where celestial north ends up on the image */
    const up = applyR(R, [0, 1, 0]);
    const north = [0, 0, 1];
    const nProj = [north[0] - bore[0] * (north[2] * bore[2]),
                   north[1] - bore[1] * (north[2] * bore[2]),
                   north[2] - bore[2] * (north[2] * bore[2])];
    const rightV = applyR(R, [1, 0, 0]);
    const roll = Math.atan2(
      nProj[0] * rightV[0] + nProj[1] * rightV[1] + nProj[2] * rightV[2],
      nProj[0] * up[0] + nProj[1] * up[1] + nProj[2] * up[2]) * R2D;

    /* everything identified: the matched catalogue stars ... */
    const ids = [];
    for (const m of best.matches) {
      const si = idx.ids[m.cat];
      const s = Astro.S[si];
      ids.push({
        kind: 'star', starIndex: si, name: Astro.starShortLabel(s),
        title: Astro.starTitle(s), mag: s[2],
        x: srcs[m.src].x, y: srcs[m.src].y, resid: m.dist,
        named: !!s[7]
      });
    }
    /* ... plus every fainter catalogue star that lands in frame ... */
    const extra = [];
    const seen = new Set(best.matches.map(m => idx.ids[m.cat]));
    for (let i = 0; i < Astro.N; i++) {
      const s = Astro.S[i];
      if (s[2] > 6.2) break;
      if (seen.has(i)) continue;
      const u = applyRT(R, [Astro.VX[i], Astro.VY[i], Astro.VZ[i]]);
      if (u[2] <= 0.05) continue;
      const px = cx + f * u[0] / u[2], py = cy - f * u[1] / u[2];
      if (px < 0 || py < 0 || px > w || py > h) continue;
      extra.push({ kind: 'star', starIndex: i, name: Astro.starShortLabel(s),
                   title: Astro.starTitle(s), mag: s[2], x: px, y: py, predicted: true,
                   named: !!s[7] });
    }
    /* ... deep-sky objects ... */
    const dsos = [];
    for (let i = 0; i < window.DSOS.length; i++) {
      const d = window.DSOS[i];
      const ra = d[6] * 15 * D2R, de = d[7] * D2R, cd = Math.cos(de);
      const u = applyRT(R, [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(de)]);
      if (u[2] <= 0.05) continue;
      const px = cx + f * u[0] / u[2], py = cy - f * u[1] / u[2];
      if (px < 0 || py < 0 || px > w || py > h) continue;
      dsos.push({ kind: 'dso', dsoIndex: i, name: d[0], title: d[2] || d[0], x: px, y: py });
    }
    /* ... and the solar system, for the moment the photograph was taken. */
    const bodies = [];
    const when = opts.date || new Date();
    try {
      const fr = Astro.makeFrame(when);
      for (const b of Astro.BODIES) {
        const eq = Astronomy.Equator(b.body, fr.time, fr.obs, false, true);   /* geocentric J2000 */
        const ra = eq.ra * 15 * D2R, de = eq.dec * D2R, cd = Math.cos(de);
        const u = applyRT(R, [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(de)]);
        if (u[2] <= 0.05) continue;
        const px = cx + f * u[0] / u[2], py = cy - f * u[1] / u[2];
        if (px < 0 || py < 0 || px > w || py > h) continue;
        bodies.push({ kind: 'body', name: b.name, title: b.name, x: px, y: py });
      }
    } catch (e) {}

    /* constellation lines, clipped to the frame */
    const lines = [];
    for (const abbr in window.CON_LINES) {
      for (const seg of window.CON_LINES[abbr]) {
        let run = [];
        for (const [rah, decd] of seg) {
          const ra = rah * 15 * D2R, de = decd * D2R, cd = Math.cos(de);
          const u = applyRT(R, [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(de)]);
          if (u[2] <= 0.05) { if (run.length > 1) lines.push(run); run = []; continue; }
          run.push([cx + f * u[0] / u[2], cy - f * u[1] / u[2]]);
        }
        if (run.length > 1) lines.push(run);
      }
    }

    /* which constellations are actually represented */
    const cons = {};
    for (const o of ids.concat(extra)) {
      const c = Astro.S[o.starIndex][4];
      if (c) cons[c] = (cons[c] || 0) + 1;
    }
    const conList = Object.keys(cons).sort((a, b) => cons[b] - cons[a])
      .map(c => ({ abbr: c, name: window.CON_NAMES[c] || c, n: cons[c] }));

    return {
      ok: true, R: R, f: f, rms: best.rms,
      ra: raC, dec: decC, fovW: fovW, fovH: fovH, scale: scale, roll: roll,
      inliers: best.matches.length,
      stars: ids, extraStars: extra, dsos: dsos, bodies: bodies,
      lines: lines, constellations: conList, date: when
    };
  }

  /* ================= EXIF (JPEG only) ================= */

  function readExif(buf) {
    const dv = new DataView(buf);
    if (dv.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off < dv.byteLength - 4) {
      if (dv.getUint8(off) !== 0xFF) break;
      const marker = dv.getUint8(off + 1), size = dv.getUint16(off + 2);
      if (marker === 0xE1) {
        if (dv.getUint32(off + 4) !== 0x45786966) break;         /* "Exif" */
        const tiff = off + 10;
        const little = dv.getUint16(tiff) === 0x4949;
        const g16 = p => dv.getUint16(p, little), g32 = p => dv.getUint32(p, little);
        if (g16(tiff + 2) !== 42) break;
        const out = {};
        function walk(dirStart, into) {
          const n = g16(dirStart);
          for (let i = 0; i < n; i++) {
            const e = dirStart + 2 + i * 12;
            const tag = g16(e), type = g16(e + 2), cnt = g32(e + 4);
            const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
            const bytes = (sizes[type] || 1) * cnt;
            const vOff = bytes <= 4 ? e + 8 : tiff + g32(e + 8);
            if (tag === 0x8769 || tag === 0x8825) { into[tag] = tiff + g32(e + 8); continue; }
            if (type === 2) {
              let s = '';
              for (let k = 0; k < cnt - 1; k++) s += String.fromCharCode(dv.getUint8(vOff + k));
              into['t' + tag] = s;
            } else if (type === 5 || type === 10) {
              const vals = [];
              for (let k = 0; k < cnt; k++) {
                const num = type === 5 ? g32(vOff + k * 8) : dv.getInt32(vOff + k * 8, little);
                const den = type === 5 ? g32(vOff + k * 8 + 4) : dv.getInt32(vOff + k * 8 + 4, little);
                vals.push(den ? num / den : 0);
              }
              into['t' + tag] = vals;
            } else if (type === 3) into['t' + tag] = g16(vOff);
            else if (type === 4) into['t' + tag] = g32(vOff);
          }
          return g32(dirStart + 2 + n * 12);
        }
        const ifd0 = {}, nextOff = walk(tiff + g32(tiff + 4), ifd0);
        const exifIfd = {}, gpsIfd = {};
        if (ifd0[0x8769]) walk(ifd0[0x8769], exifIfd);
        if (ifd0[0x8825]) walk(ifd0[0x8825], gpsIfd);
        const ds = exifIfd.t36867 || exifIfd.t36868 || ifd0.t306;
        if (ds) {
          const m = ds.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
          if (m) out.date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        }
        if (gpsIfd.t2 && gpsIfd.t4) {
          const dms = a => a[0] + a[1] / 60 + a[2] / 3600;
          let lat = dms(gpsIfd.t2), lon = dms(gpsIfd.t4);
          if (gpsIfd.t1 === 'S' || gpsIfd.t1 === undefined && false) lat = -lat;
          if ((gpsIfd.t1 || '').toUpperCase() === 'S') lat = -Math.abs(lat);
          if ((gpsIfd.t3 || '').toUpperCase() === 'W') lon = -Math.abs(lon);
          out.lat = lat; out.lon = lon;
        }
        if (exifIfd.t37386) out.focalLength = Array.isArray(exifIfd.t37386) ? exifIfd.t37386[0] : exifIfd.t37386;
        if (exifIfd.t41989) out.focal35 = exifIfd.t41989;
        if (exifIfd.t33434) out.exposure = Array.isArray(exifIfd.t33434) ? exifIfd.t33434[0] : exifIfd.t33434;
        if (exifIfd.t34855) out.iso = exifIfd.t34855;
        if (ifd0.t271) out.make = ifd0.t271;
        if (ifd0.t272) out.model = ifd0.t272;
        return out;
      }
      if (marker === 0xDA) break;
      off += 2 + size;
    }
    return null;
  }

  return { detect: detect, solve: solve, buildIndex: buildIndex, readExif: readExif };
})();
