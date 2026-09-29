/* Core astronomy: frames, coordinate transforms, ephemeris, rise/set, search, descriptions.
   Star vectors are J2000 (EQJ); the per-frame rotation matrix from astronomy-engine carries
   precession, nutation and Earth rotation straight through to horizontal coordinates. */
window.Astro = (function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const S = window.STARS;
  const N = S.length;

  /* --- precomputed J2000 unit vectors, one pass at load --- */
  const VX = new Float64Array(N), VY = new Float64Array(N), VZ = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ra = S[i][0] * 15 * D2R, de = S[i][1] * D2R, cd = Math.cos(de);
    VX[i] = cd * Math.cos(ra); VY[i] = cd * Math.sin(ra); VZ[i] = Math.sin(de);
  }

  /* --- B-V colour index -> effective temperature -> RGB ---
     Ballesteros' formula for T, then a blackbody approximation for the colour. */
  function bvToTemp(bv) {
    bv = Math.max(-0.4, Math.min(2.0, bv));
    return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  }
  function tempToRGB(K) {
    const t = Math.max(1000, Math.min(40000, K)) / 100;
    let r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; }
    else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); }
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = 138.52 * Math.log(t - 10) - 305.04;
    const c = v => Math.max(0, Math.min(255, Math.round(v)));
    return [c(r), c(g), c(b)];
  }
  const colorCache = new Map();
  function bvColor(bv) {
    const k = Math.round((bv || 0) * 20);
    let c = colorCache.get(k);
    if (!c) {
      const [r, g, b] = tempToRGB(bvToTemp(k / 20));
      /* lift toward white — the eye sees stars far less saturated than raw blackbody */
      c = 'rgb(' + Math.round(r * .45 + 255 * .55) + ',' +
                   Math.round(g * .45 + 255 * .55) + ',' +
                   Math.round(b * .45 + 255 * .55) + ')';
      colorCache.set(k, c);
    }
    return c;
  }

  /* --- observer --- */
  let observer = { lat: 51.4779, lon: -0.0015, elev: 30 };
  let obsSource = 'default';
  function setObserver(lat, lon, elev, source) {
    observer = { lat: lat, lon: lon, elev: elev || 0 };
    obsSource = source || 'manual';
  }
  const getObserver = () => observer;
  const getObserverSource = () => obsSource;
  const engineObserver = () => new Astronomy.Observer(observer.lat, observer.lon, observer.elev);

  /* --- a frame: everything that depends only on (time, observer) --- */
  function makeFrame(date) {
    const time = new Astronomy.AstroTime(date);
    const obs = engineObserver();
    const m = Astronomy.Rotation_EQJ_HOR(time, obs).rot;
    const gst = Astronomy.SiderealTime(time);
    return {
      date: date, time: time, obs: obs, m: m,
      lst: ((gst + observer.lon / 15) % 24 + 24) % 24
    };
  }

  /* EQJ unit vector -> {alt, az}. HOR frame is x=north, y=west, z=up. */
  function vecToHorizon(f, x, y, z) {
    const m = f.m;
    const hx = m[0][0] * x + m[1][0] * y + m[2][0] * z;
    const hy = m[0][1] * x + m[1][1] * y + m[2][1] * z;
    const hz = m[0][2] * x + m[1][2] * y + m[2][2] * z;
    return { alt: Math.asin(Math.max(-1, Math.min(1, hz))) * R2D,
             az: (Math.atan2(-hy, hx) * R2D + 360) % 360 };
  }
  function raDecToHorizon(f, raHours, decDeg) {
    const ra = raHours * 15 * D2R, de = decDeg * D2R, cd = Math.cos(de);
    return vecToHorizon(f, cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(de));
  }
  /* Fast path for the catalogue: writes into a caller-owned pair to avoid 10k allocations. */
  function starHorizon(f, i, out) {
    const m = f.m, x = VX[i], y = VY[i], z = VZ[i];
    const hx = m[0][0] * x + m[1][0] * y + m[2][0] * z;
    const hy = m[0][1] * x + m[1][1] * y + m[2][1] * z;
    const hz = m[0][2] * x + m[1][2] * y + m[2][2] * z;
    out[0] = Math.asin(hz > 1 ? 1 : hz < -1 ? -1 : hz) * R2D;
    out[1] = (Math.atan2(-hy, hx) * R2D + 360) % 360;
    return out;
  }

  /* --- refraction: apparent altitude for an airless computed altitude --- */
  function refract(alt) {
    if (alt < -2) return alt;
    const a = Math.max(alt, -1.5);
    return alt + (1.02 / Math.tan((a + 10.3 / (a + 5.11)) * D2R)) / 60;
  }

  /* --- solar system --- */
  const BODIES = [
    { name: 'Sun', body: 'Sun', kind: 'star' },
    { name: 'Moon', body: 'Moon', kind: 'moon' },
    { name: 'Mercury', body: 'Mercury', kind: 'planet' },
    { name: 'Venus', body: 'Venus', kind: 'planet' },
    { name: 'Mars', body: 'Mars', kind: 'planet' },
    { name: 'Jupiter', body: 'Jupiter', kind: 'planet' },
    { name: 'Saturn', body: 'Saturn', kind: 'planet' },
    { name: 'Uranus', body: 'Uranus', kind: 'planet' },
    { name: 'Neptune', body: 'Neptune', kind: 'planet' },
    { name: 'Pluto', body: 'Pluto', kind: 'dwarf' }
  ];

  function solarSystem(f) {
    const out = [];
    for (const b of BODIES) {
      try {
        const eq = Astronomy.Equator(b.body, f.time, f.obs, true, true);
        const h = Astronomy.Horizon(f.time, f.obs, eq.ra, eq.dec, 'normal');
        let mag = null, phaseFrac = null, phaseAngle = null;
        if (b.name !== 'Sun') {
          const ill = Astronomy.Illumination(b.body, f.time);
          mag = ill.mag; phaseFrac = ill.phase_fraction; phaseAngle = ill.phase_angle;
        } else mag = -26.74;
        out.push({
          type: 'body', name: b.name, kind: b.kind, body: b.body,
          ra: eq.ra, dec: eq.dec, alt: h.altitude, az: h.azimuth,
          mag: mag, dist: eq.dist, phase: phaseFrac, phaseAngle: phaseAngle,
          tone: (window.PLANET_INFO[b.name] || {}).tone || '#fff'
        });
      } catch (e) { /* a body outside the engine's supported span — skip it */ }
    }
    return out;
  }

  /* Position angle of the Moon's bright limb, for drawing the phase the right way up. */
  function moonLimbAngle(f) {
    try {
      const mo = Astronomy.Equator('Moon', f.time, f.obs, true, true);
      const su = Astronomy.Equator('Sun', f.time, f.obs, true, true);
      const dRa = (su.ra - mo.ra) * 15 * D2R;
      const d1 = mo.dec * D2R, d2 = su.dec * D2R;
      return Math.atan2(Math.cos(d2) * Math.sin(dRa),
        Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(dRa));
    } catch (e) { return 0; }
  }

  /* --- rise / set / transit, computed from the hour angle (works for fixed stars) --- */
  function riseSetFixed(raHours, decDeg, date) {
    const lat = observer.lat * D2R, dec = decDeg * D2R;
    const h0 = -0.5667 * D2R;                       /* refraction at the horizon */
    const cosH = (Math.sin(h0) - Math.sin(lat) * Math.sin(dec)) /
                 (Math.cos(lat) * Math.cos(dec));
    const transitAlt = 90 - Math.abs(observer.lat - decDeg);
    if (cosH < -1) return { circumpolar: true, transitAlt: transitAlt };
    if (cosH > 1) return { neverRises: true, transitAlt: transitAlt };
    const H = Math.acos(cosH) * R2D / 15;           /* hour angle in hours */
    const time = new Astronomy.AstroTime(date);
    const gst = Astronomy.SiderealTime(time);
    const lst = ((gst + observer.lon / 15) % 24 + 24) % 24;
    /* sidereal hours until an event, converted to solar time */
    const untilSolar = targetLst => {
      let d = targetLst - lst; while (d < 0) d += 24; while (d >= 24) d -= 24;
      return d * 0.9972696;
    };
    const at = hrs => new Date(date.getTime() + hrs * 3600e3);
    return {
      rise: at(untilSolar(((raHours - H) % 24 + 24) % 24)),
      set: at(untilSolar(((raHours + H) % 24 + 24) % 24)),
      transit: at(untilSolar(((raHours) % 24 + 24) % 24)),
      transitAlt: transitAlt
    };
  }

  function riseSetBody(bodyName, date) {
    const obs = engineObserver();
    const t = new Astronomy.AstroTime(date);
    try {
      const r = Astronomy.SearchRiseSet(bodyName, obs, +1, t, 2);
      const s = Astronomy.SearchRiseSet(bodyName, obs, -1, t, 2);
      const c = Astronomy.SearchHourAngle(bodyName, obs, 0, t);
      return {
        rise: r ? r.date : null, set: s ? s.date : null,
        transit: c ? c.time.date : null,
        transitAlt: c ? c.hor.altitude : null,
        circumpolar: !r && !s
      };
    } catch (e) { return {}; }
  }

  /* --- twilight, for the "is it dark yet" readout --- */
  function darkness(date) {
    const f = makeFrame(date);
    const sun = Astronomy.Equator('Sun', f.time, f.obs, true, true);
    const h = Astronomy.Horizon(f.time, f.obs, sun.ra, sun.dec, 'normal').altitude;
    let label, level;
    if (h > -0.833) { label = 'Daylight'; level = 0; }
    else if (h > -6) { label = 'Civil twilight'; level = 1; }
    else if (h > -12) { label = 'Nautical twilight'; level = 2; }
    else if (h > -18) { label = 'Astronomical twilight'; level = 3; }
    else { label = 'Full darkness'; level = 4; }
    return { sunAlt: h, label: label, level: level };
  }

  /* --- formatting --- */
  function fmtRA(h) {
    h = ((h % 24) + 24) % 24;
    const H = Math.floor(h), m = (h - H) * 60, M = Math.floor(m), s = (m - M) * 60;
    return H + 'h ' + String(M).padStart(2, '0') + 'm ' + s.toFixed(1).padStart(4, '0') + 's';
  }
  function fmtDec(d) {
    const sg = d < 0 ? '−' : '+', a = Math.abs(d);
    const D = Math.floor(a), m = (a - D) * 60, M = Math.floor(m), s = Math.round((m - M) * 60);
    return sg + D + '° ' + String(M).padStart(2, '0') + "' " + String(s).padStart(2, '0') + '"';
  }
  const fmtDeg = d => d.toFixed(1) + '°';
  function compass(az) {
    const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return pts[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
  }
  function fmtTime(d) {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDist(ly) {
    if (!ly) return null;
    if (ly < 1000) return ly.toFixed(1) + ' light-years';
    return Math.round(ly).toLocaleString() + ' light-years';
  }

  /* --- star designations and generated descriptions --- */
  function starDesignation(s) {
    const con = s[4];
    if (s[5] && con) return s[5] + ' ' + (window.CON_GEN[con] || con);
    if (s[6] && con) return s[6] + ' ' + (window.CON_GEN[con] || con);
    return s[10] ? 'HD ' + s[10] : null;
  }
  function starShortLabel(s) {
    if (s[7]) return s[7];
    if (s[5]) return s[5] + ' ' + s[4];
    if (s[6]) return s[6] + ' ' + s[4];
    return s[10] ? 'HD ' + s[10] : '—';
  }
  function starTitle(s) { return s[7] || starDesignation(s) || 'Unnamed star'; }

  const CLASS_WORD = {
    O: ['blue', 'over 30,000 K — among the hottest and most massive stars known'],
    B: ['blue-white', 'around 10,000–30,000 K'],
    A: ['white', 'around 7,500–10,000 K'],
    F: ['yellow-white', 'around 6,000–7,500 K'],
    G: ['yellow', 'around 5,200–6,000 K — the Sun’s class'],
    K: ['orange', 'around 3,700–5,200 K'],
    M: ['red', 'below 3,700 K'],
    W: ['blue', 'a Wolf–Rayet star, shedding its outer layers at enormous speed'],
    C: ['deep red', 'a carbon star, its light heavily reddened by soot in its own atmosphere'],
    S: ['red', 'a cool giant with zirconium oxide in its spectrum']
  };
  const LUM_WORD = {
    I: 'supergiant', Ia: 'luminous supergiant', Ib: 'supergiant', II: 'bright giant',
    III: 'giant', IV: 'subgiant', V: 'main-sequence star', VI: 'subdwarf', VII: 'white dwarf'
  };

  function describeStar(s) {
    const spect = s[9] || '';
    const cls = spect.charAt(0).toUpperCase();
    const cw = CLASS_WORD[cls];
    const lm = spect.match(/(Ia|Ib|VII|VI|IV|III|II|V|I)\b/);
    const lum = lm ? LUM_WORD[lm[1]] : null;
    const parts = [];

    if (cw) {
      parts.push('A ' + cw[0] + ' ' + (lum || 'star') + ' of spectral type ' +
        spect + ', with a surface temperature ' + cw[1] + '.');
    } else if (spect) {
      parts.push('Spectral type ' + spect + '.');
    }

    if (s[8]) {
      parts.push('Its light takes ' + fmtDist(s[8]) + ' to reach us' +
        (s[8] > 500 ? ' — it left before anyone alive today was born.' : '.'));
      /* absolute magnitude -> luminosity relative to the Sun */
      const pc = s[8] / 3.261563;
      const M = s[2] - 5 * Math.log10(pc) + 5;
      const L = Math.pow(10, (4.83 - M) / 2.5);
      const lstr = L >= 1000 ? Math.round(L / 100) * 100 + ' times'
        : L >= 10 ? Math.round(L) + ' times'
        : L >= 1 ? L.toFixed(1) + ' times'
        : 'about ' + (L * 100).toFixed(0) + '% of';
      parts.push('That puts its true output at roughly ' + lstr + ' the Sun’s.');
    }

    const con = window.CON_NAMES[s[4]];
    if (con) {
      parts.push(s[2] < 3
        ? 'It is one of the anchor stars of ' + con + '.'
        : 'It lies within the bounds of ' + con + '.');
    }
    if (s[2] > 6) parts.push('At magnitude ' + s[2].toFixed(2) + ' it is beyond naked-eye reach for almost everyone — binoculars will show it easily.');
    else if (s[2] > 4.5) parts.push('At magnitude ' + s[2].toFixed(2) + ' it needs a genuinely dark sky to see unaided.');

    return parts.join(' ');
  }

  function magDescription(m) {
    if (m < -3) return 'Unmistakable — brighter than anything else in the sky bar the Sun and Moon';
    if (m < 0) return 'One of the handful of brightest stars in the sky';
    if (m < 1.5) return 'A first-magnitude star — obvious from anywhere, city included';
    if (m < 3) return 'Easily visible from a suburban sky';
    if (m < 4.5) return 'Visible from a reasonably dark suburban or rural sky';
    if (m < 6) return 'Needs a dark site and dark-adapted eyes';
    return 'Below naked-eye limit — binoculars or a telescope';
  }

  /* --- search across stars, planets, deep-sky objects and constellations --- */
  function searchAll(q, limit) {
    q = (q || '').trim().toLowerCase();
    limit = limit || 60;
    const res = [];
    if (!q) {
      for (const b of BODIES) res.push({ type: 'body', name: b.name, kind: b.kind, score: 0 });
      const bright = [];
      for (let i = 0; i < N && bright.length < 40; i++) if (S[i][7]) bright.push({ type: 'star', i: i, score: 1 });
      return res.concat(bright);
    }
    const score = (hay, w) => {
      if (!hay) return -1;
      hay = hay.toLowerCase();
      if (hay === q) return w;
      if (hay.startsWith(q)) return w + 1;
      if (hay.indexOf(q) >= 0) return w + 2;
      return -1;
    };
    for (const b of BODIES) { const sc = score(b.name, 0); if (sc >= 0) res.push({ type: 'body', name: b.name, kind: b.kind, score: sc }); }
    for (let i = 0; i < N; i++) {
      const s = S[i];
      let sc = score(s[7], 10);
      if (sc < 0 && s[10]) sc = score('hd ' + s[10], 40);
      if (sc < 0) { const d = starDesignation(s); if (d) sc = score(d, 20); }
      if (sc < 0 && s[5] && s[4]) sc = score(s[5] + ' ' + s[4], 20);
      if (sc >= 0) res.push({ type: 'star', i: i, score: sc + s[2] * 0.3 });
    }
    for (let i = 0; i < window.DSOS.length; i++) {
      const d = window.DSOS[i];
      let sc = score(d[2], 10);
      if (sc < 0) sc = score(d[0], 15);
      if (sc < 0) sc = score(d[1], 25);
      if (sc >= 0) res.push({ type: 'dso', i: i, score: sc });
    }
    for (const abbr in window.CON_NAMES) {
      const sc = score(window.CON_NAMES[abbr], 30);
      if (sc >= 0) res.push({ type: 'con', abbr: abbr, score: sc });
    }
    res.sort((a, b) => a.score - b.score);
    return res.slice(0, limit);
  }

  return {
    D2R, R2D, S, N, VX, VY, VZ, BODIES,
    bvColor, bvToTemp, setObserver, getObserver, getObserverSource, engineObserver,
    makeFrame, vecToHorizon, raDecToHorizon, starHorizon, refract,
    solarSystem, moonLimbAngle, riseSetFixed, riseSetBody, darkness,
    fmtRA, fmtDec, fmtDeg, fmtTime, fmtDist, compass,
    starDesignation, starShortLabel, starTitle, describeStar, magDescription, searchAll
  };
})();
