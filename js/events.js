/* What the sky is doing: tonight's conditions, how things shift day to day, and the
   dated events coming up. Everything here is computed from the ephemeris on this device —
   nothing is looked up, with the single exception of the meteor shower table, which is
   observational and cannot be derived. */
window.Events = (function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const DAY = 86400e3;

  const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

  /* ---------------- helpers ---------------- */

  /* Equator() needs an observer and throws without one, so geocentric directions come
     from GeoVector instead. */
  function geoVec(body, time) {
    const v = Astronomy.GeoVector(body, time, true);
    const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return [v.x / n, v.y / n, v.z / n];
  }
  function sepDeg(a, b) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return Math.acos(Math.max(-1, Math.min(1, d))) * R2D;
  }
  function pairSep(b1, b2, time) {
    return sepDeg(geoVec(b1, time), geoVec(b2, time));
  }
  const at = (date, days) => new Astronomy.AstroTime(new Date(date.getTime() + days * DAY));

  /* ---------------- tonight ---------------- */

  function twilight(date, obs) {
    const t = new Astronomy.AstroTime(date);
    const out = {};
    const safe = fn => { try { return fn(); } catch (e) { return null; } };
    out.sunset  = safe(() => { const r = Astronomy.SearchRiseSet('Sun', obs, -1, t, 1); return r && r.date; });
    out.sunrise = safe(() => { const r = Astronomy.SearchRiseSet('Sun', obs, +1, t, 1); return r && r.date; });
    for (const [key, alt] of [['civil', -6], ['nautical', -12], ['astro', -18]]) {
      out[key + 'Dusk'] = safe(() => { const r = Astronomy.SearchAltitude('Sun', obs, -1, t, 1, alt); return r && r.date; });
      out[key + 'Dawn'] = safe(() => { const r = Astronomy.SearchAltitude('Sun', obs, +1, t, 1, alt); return r && r.date; });
    }
    /* length of true darkness, when the sun is more than 18 degrees down */
    if (out.astroDusk && out.astroDawn) {
      let ms = out.astroDawn - out.astroDusk;
      if (ms < 0) ms += DAY;
      out.darkHours = ms / 3600e3;
    } else {
      /* no astronomical night at this latitude and season */
      out.darkHours = 0;
      out.noAstroNight = true;
    }
    return out;
  }

  function moonTonight(date, obs) {
    const t = new Astronomy.AstroTime(date);
    const ill = Astronomy.Illumination('Moon', t);
    const phase = Astronomy.MoonPhase(t);
    const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
                   'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    const safe = fn => { try { return fn(); } catch (e) { return null; } };
    return {
      phaseAngle: phase,
      phaseName: names[Math.floor(((phase + 22.5) % 360) / 45)],
      illum: ill.phase_fraction,
      mag: ill.mag,
      rise: safe(() => { const r = Astronomy.SearchRiseSet('Moon', obs, +1, t, 1); return r && r.date; }),
      set:  safe(() => { const r = Astronomy.SearchRiseSet('Moon', obs, -1, t, 1); return r && r.date; }),
      /* how much it will wash out faint objects */
      interference: ill.phase_fraction > 0.75 ? 'strong'
                  : ill.phase_fraction > 0.40 ? 'moderate'
                  : ill.phase_fraction > 0.15 ? 'slight' : 'negligible'
    };
  }

  /* Best moment to look at a body tonight: highest it gets while the sky is dark. */
  function bestWindow(body, date, obs, tw) {
    const safe = fn => { try { return fn(); } catch (e) { return null; } };
    const altAt = d => safe(() => {
      const t = new Astronomy.AstroTime(d);
      const eq = Astronomy.Equator(body, t, obs, true, true);
      return Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal').altitude;
    });
    const start = tw.astroDusk || tw.nauticalDusk || tw.sunset || date;
    let end = tw.astroDawn || tw.nauticalDawn || tw.sunrise;
    if (!end) return null;
    if (end <= start) end = new Date(end.getTime() + DAY);
    let best = null;
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const d = new Date(start.getTime() + (end - start) * i / steps);
      const a = altAt(d);
      if (a == null) continue;
      if (!best || a > best.alt) best = { when: d, alt: a };
    }
    return best && best.alt > 0 ? best : null;
  }

  function tonight(date, obs) {
    const tw = twilight(date, obs);
    const moon = moonTonight(date, obs);
    const t = new Astronomy.AstroTime(date);
    const list = [];
    for (const p of PLANETS) {
      try {
        const ill = Astronomy.Illumination(p, t);
        const best = bestWindow(p, date, obs, tw);
        const eq = Astronomy.Equator(p, t, obs, true, true);
        const hz = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
        const elong = Astronomy.AngleFromSun(p, t);
        list.push({
          name: p, mag: ill.mag, altNow: hz.altitude, azNow: hz.azimuth,
          best: best, elongation: elong, dist: eq.dist,
          /* too close to the Sun to observe, regardless of how high it gets */
          lostInGlare: elong < 15
        });
      } catch (e) {}
    }
    list.sort((a, b) => {
      const av = a.best && !a.lostInGlare, bv = b.best && !b.lostInGlare;
      if (av !== bv) return av ? -1 : 1;
      return a.mag - b.mag;
    });
    return { twilight: tw, moon: moon, planets: list };
  }

  /* ---------------- day-to-day change ---------------- */

  function changes(date, obs) {
    const t0 = new Astronomy.AstroTime(date);
    const t1 = at(date, 1);
    const t7 = at(date, 7);
    const out = [];
    const safeRise = (body, t) => {
      try { const r = Astronomy.SearchRiseSet(body, obs, +1, t, 2); return r && r.date; }
      catch (e) { return null; }
    };
    for (const p of PLANETS.concat(['Moon'])) {
      try {
        const i0 = Astronomy.Illumination(p, t0), i7 = Astronomy.Illumination(p, t7);
        /* The next rise after t0, then the one after THAT. Searching from t0 + 1 day can
           return the same event again, which silently reads as no drift at all. */
        const r0 = safeRise(p, t0);
        const r1 = r0 ? safeRise(p, new Astronomy.AstroTime(new Date(r0.getTime() + 3600e3))) : null;
        let riseShift = null;
        if (r0 && r1) {
          const gap = (r1 - r0) / 60000;
          if (gap > 60 && gap < 2200) riseShift = gap - 1440;   /* minutes later each day */
        }
        const e0 = Astronomy.Equator(p, t0, obs, true, true);
        const e7 = Astronomy.Equator(p, t7, obs, true, true);
        out.push({
          name: p,
          mag: i0.mag,
          magWeek: i7.mag - i0.mag,
          distNow: e0.dist,
          distWeek: e7.dist - e0.dist,
          riseShift: riseShift,
          illum: p === 'Moon' || p === 'Mercury' || p === 'Venus' ? i0.phase_fraction : null,
          illumWeek: p === 'Moon' || p === 'Mercury' || p === 'Venus'
            ? i7.phase_fraction - i0.phase_fraction : null
        });
      } catch (e) {}
    }
    return out;
  }

  /* ---------------- close approaches, found by scanning ---------------- */

  /* Walk the separation of a pair forward in time, bracket every local minimum below the
     threshold, then refine it by ternary search. There is no closed-form search for this
     in the ephemeris library, so it has to be hunted. */
  function conjunctions(date, days, opts) {
    opts = opts || {};
    const found = [];
    const pairs = [];
    for (const p of PLANETS) pairs.push(['Moon', p, opts.moonThreshold || 5.0, 0.25]);
    pairs.push(['Moon', 'Sun', 0, 0]);                      /* skip: that is a new moon */
    for (let i = 0; i < PLANETS.length; i++) {
      for (let j = i + 1; j < PLANETS.length; j++) {
        pairs.push([PLANETS[i], PLANETS[j], opts.planetThreshold || 3.5, 1.0]);
      }
    }
    for (const [a, b, thresh, step] of pairs) {
      if (!thresh) continue;
      let prev2 = null, prev1 = null, tPrev2 = null, tPrev1 = null;
      for (let d = 0; d <= days; d += step) {
        let s;
        try { s = pairSep(a, b, at(date, d)); } catch (e) { continue; }
        if (prev1 != null && prev2 != null && prev1 < prev2 && prev1 < s && prev1 < thresh * 1.8) {
          /* minimum bracketed between tPrev2 and d — refine */
          let lo = tPrev2, hi = d;
          for (let k = 0; k < 40; k++) {
            const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
            let s1, s2;
            try { s1 = pairSep(a, b, at(date, m1)); s2 = pairSep(a, b, at(date, m2)); }
            catch (e) { break; }
            if (s1 < s2) hi = m2; else lo = m1;
          }
          const tm = (lo + hi) / 2;
          let sm;
          try { sm = pairSep(a, b, at(date, tm)); } catch (e) { sm = prev1; }
          if (sm <= thresh) {
            const when = new Date(date.getTime() + tm * DAY);
            /* a conjunction behind the Sun is not an event anyone can watch */
            let elong = 999;
            try { elong = Astronomy.AngleFromSun(a === 'Moon' ? b : a, new Astronomy.AstroTime(when)); } catch (e) {}
            found.push({
              date: when, kind: 'conjunction', a: a, b: b, sep: sm,
              hidden: elong < 15,
              title: a + ' and ' + b + ' close together',
              detail: sm.toFixed(1) + '° apart' + (elong < 15 ? ' — but too near the Sun to see' : '')
            });
          }
        }
        prev2 = prev1; prev1 = s; tPrev2 = tPrev1; tPrev1 = d;
      }
    }
    return found;
  }

  /* ---------------- dated events ---------------- */

  function upcoming(date, obs, days, opts) {
    opts = opts || {};
    const ev = [];
    const t0 = new Astronomy.AstroTime(date);
    const horizon = new Date(date.getTime() + days * DAY);
    const within = d => d && d >= date && d <= horizon;
    const push = o => { if (within(o.date)) ev.push(o); };
    const safe = fn => { try { return fn(); } catch (e) { return null; } };

    /* moon phases */
    const PHASE = [[0, 'New Moon', 'The Moon is between us and the Sun — the darkest skies of the month.'],
                   [90, 'First quarter', 'Half lit, and well placed in the evening. Best time for craters along the terminator.'],
                   [180, 'Full Moon', 'Fully lit all night, and bright enough to wash out everything faint.'],
                   [270, 'Last quarter', 'Half lit, rising around midnight. Evenings are dark again.']];
    for (const [lon, name, blurb] of PHASE) {
      let search = t0;
      for (let k = 0; k < Math.ceil(days / 29.5) + 1; k++) {
        const r = safe(() => Astronomy.SearchMoonPhase(lon, search, 40));
        if (!r) break;
        push({ date: r.date, kind: 'moon', title: name, detail: blurb, icon: '☽' });
        search = new Astronomy.AstroTime(new Date(r.date.getTime() + 10 * DAY));
        if (r.date > horizon) break;
      }
    }

    /* lunar perigee and apogee — the supermoon mechanism */
    let apsis = safe(() => Astronomy.SearchLunarApsis(t0));
    for (let k = 0; k < Math.ceil(days / 13.5) + 1 && apsis; k++) {
      const km = apsis.dist_km;
      const isPeri = apsis.kind === 0 || apsis.kind === 'Pericenter';
      push({
        date: apsis.time.date, kind: 'moon',
        title: isPeri ? 'Moon at perigee' : 'Moon at apogee',
        detail: Math.round(km).toLocaleString() + ' km — ' +
          (isPeri ? 'its closest this orbit, so it looks largest' : 'its furthest this orbit, so it looks smallest'),
        icon: '☽', minor: true
      });
      const next = safe(() => Astronomy.NextLunarApsis(apsis));
      if (!next || next.time.date > horizon) break;
      apsis = next;
    }

    /* eclipses */
    let le = safe(() => Astronomy.SearchLunarEclipse(t0));
    for (let k = 0; k < 6 && le; k++) {
      if (le.peak.date > horizon) break;
      const kindName = { 0: 'Penumbral', 1: 'Partial', 2: 'Total', penumbral: 'Penumbral', partial: 'Partial', total: 'Total' };
      const kn = kindName[le.kind] || String(le.kind);
      /* is the Moon even above the horizon here when it peaks? */
      let visible = null;
      try {
        const tt = new Astronomy.AstroTime(le.peak.date);
        const eq = Astronomy.Equator('Moon', tt, obs, true, true);
        visible = Astronomy.Horizon(tt, obs, eq.ra, eq.dec, 'normal').altitude > 0;
      } catch (e) {}
      push({
        date: le.peak.date, kind: 'eclipse', major: true,
        title: kn + ' lunar eclipse',
        detail: (visible === null ? '' : visible ? 'The Moon is above your horizon at peak — visible from here. '
                                                 : 'The Moon is below your horizon at peak — not visible from here. ') +
                (le.sd_total ? 'Totality lasts about ' + Math.round(le.sd_total * 2) + ' minutes.' : ''),
        icon: '●'
      });
      const n = safe(() => Astronomy.NextLunarEclipse(le.peak));
      if (!n) break;
      le = n;
    }

    /* solar eclipses, as seen from where the observer actually is */
    let se = safe(() => Astronomy.SearchLocalSolarEclipse(t0, obs));
    for (let k = 0; k < 4 && se; k++) {
      if (se.peak.time.date > horizon) break;
      const kindName = { 0: 'Partial', 1: 'Annular', 2: 'Total', partial: 'Partial', annular: 'Annular', total: 'Total' };
      const kn = kindName[se.kind] || String(se.kind);
      push({
        date: se.peak.time.date, kind: 'eclipse', major: true,
        title: kn + ' solar eclipse',
        detail: 'Visible from your location. The Sun is ' +
          (se.obscuration != null ? (se.obscuration * 100).toFixed(0) + '% covered at maximum. ' : '') +
          'Never look at the Sun without a proper solar filter.',
        icon: '☉'
      });
      const n = safe(() => Astronomy.NextLocalSolarEclipse(se.peak.time, obs));
      if (!n) break;
      se = n;
    }

    /* oppositions, solar conjunctions, greatest elongations */
    for (const p of PLANETS) {
      if (p === 'Mercury' || p === 'Venus') {
        /* inner planets never reach opposition; they swing out to a maximum angle instead */
        let el = safe(() => Astronomy.SearchMaxElongation(p, t0));
        for (let k = 0; k < 8 && el; k++) {
          if (el.time.date > horizon) break;
          push({
            date: el.time.date, kind: 'planet', body: p,
            title: p + ' at greatest ' + (el.visibility === 'morning' ? 'western' : 'eastern') + ' elongation',
            detail: el.elongation.toFixed(0) + '° from the Sun — its best showing in the ' +
              (el.visibility === 'morning' ? 'morning sky before sunrise' : 'evening sky after sunset') + '.',
            icon: '✦'
          });
          const n = safe(() => Astronomy.SearchMaxElongation(p, new Astronomy.AstroTime(new Date(el.time.date.getTime() + 20 * DAY))));
          if (!n) break;
          el = n;
        }
      } else {
        let search = t0;
        for (let k = 0; k < 3; k++) {
          const op = safe(() => Astronomy.SearchRelativeLongitude(p, 180, search));
          if (!op || op.date > horizon) break;
          let mag = null;
          try { mag = Astronomy.Illumination(p, op).mag; } catch (e) {}
          push({
            date: op.date, kind: 'planet', body: p, major: true,
            title: p + ' at opposition',
            detail: 'Opposite the Sun, so it rises at sunset and is up all night — closest and brightest of the year' +
              (mag != null ? ', at magnitude ' + mag.toFixed(1) : '') + '. The best night to observe it.',
            icon: '✦'
          });
          search = new Astronomy.AstroTime(new Date(op.date.getTime() + 30 * DAY));
        }
      }
    }

    /* Venus at its brightest */
    for (const p of ['Venus']) {
      const pk = safe(() => Astronomy.SearchPeakMagnitude(p, t0));
      if (pk) push({
        date: pk.time.date, kind: 'planet', body: p,
        title: p + ' at peak brightness',
        detail: 'Magnitude ' + pk.mag.toFixed(1) + ' — bright enough to cast a shadow from a dark site.',
        icon: '✦'
      });
    }

    /* equinoxes and solstices */
    const yr = date.getUTCFullYear();
    for (const y of [yr, yr + 1, yr + 2]) {
      const s = safe(() => Astronomy.Seasons(y));
      if (!s) continue;
      const items = [
        [s.mar_equinox, 'March equinox', 'Day and night equal everywhere; the Sun crosses the celestial equator going north.'],
        [s.jun_solstice, 'June solstice', 'The Sun reaches its northernmost point. Shortest nights in the north, longest in the south.'],
        [s.sep_equinox, 'September equinox', 'The Sun crosses back south over the celestial equator.'],
        [s.dec_solstice, 'December solstice', 'The Sun reaches its southernmost point. Longest nights in the north.']
      ];
      for (const [tm, title, detail] of items) {
        if (tm) push({ date: tm.date, kind: 'season', title: title, detail: detail, icon: '☀' });
      }
    }

    /* close approaches */
    if (opts.conjunctions !== false) {
      for (const c of conjunctions(date, Math.min(days, 180), opts)) {
        push({ date: c.date, kind: 'conjunction', title: c.title, detail: c.detail,
               icon: '○', hidden: c.hidden, sep: c.sep });
      }
    }

    /* meteor showers — the one thing here that is tabulated rather than computed */
    for (const sh of showers(date, days, obs)) push(sh);

    ev.sort((a, b) => a.date - b.date);
    return ev;
  }

  /* Meteor showers cannot be derived from planetary positions: the rates come from
     observation. Peak dates drift about a day year to year, so these are approximate. */
  const SHOWERS = [
    [1, 3, 'Quadrantids', 110, 'A sharp peak only a few hours wide, from asteroid 2003 EH1.'],
    [4, 22, 'Lyrids', 18, 'Dust from comet Thatcher, recorded for over 2,600 years.'],
    [5, 6, 'Eta Aquariids', 50, 'Debris from Halley’s Comet. Favours the southern hemisphere.'],
    [7, 30, 'Delta Aquariids', 25, 'A long, steady shower rather than a sharp peak.'],
    [8, 12, 'Perseids', 100, 'The reliable one — warm nights and fast, bright meteors from comet Swift–Tuttle.'],
    [10, 21, 'Orionids', 20, 'Halley’s Comet again, on the other side of its orbit.'],
    [11, 17, 'Leonids', 15, 'Usually modest, but produces a storm roughly every 33 years.'],
    [12, 14, 'Geminids', 150, 'The strongest shower of the year, from the rock-comet 3200 Phaethon.'],
    [12, 22, 'Ursids', 10, 'A small shower close to the solstice.']
  ];

  function showers(date, days, obs) {
    const out = [];
    const y0 = date.getUTCFullYear();
    for (const y of [y0, y0 + 1, y0 + 2]) {
      for (const [m, d, name, zhr, blurb] of SHOWERS) {
        const when = new Date(Date.UTC(y, m - 1, d, 2, 0, 0));
        if (when < date || when > new Date(date.getTime() + days * DAY)) continue;
        let moonNote = '';
        try {
          const ill = Astronomy.Illumination('Moon', new Astronomy.AstroTime(when));
          const f = ill.phase_fraction;
          moonNote = f > 0.7 ? ' A bright Moon will drown out all but the brightest this year.'
                   : f > 0.4 ? ' A half-lit Moon will interfere somewhat.'
                   : ' The Moon is out of the way this year — a good one.';
        } catch (e) {}
        out.push({
          date: when, kind: 'meteor',
          title: name + ' meteor shower peaks',
          detail: 'Up to about ' + zhr + ' an hour under ideal conditions. ' + blurb + moonNote +
            ' Peak dates shift by a day or so year to year.',
          icon: '☄', approximate: true
        });
      }
    }
    return out;
  }

  return {
    tonight: tonight, changes: changes, upcoming: upcoming,
    conjunctions: conjunctions, twilight: twilight, PLANETS: PLANETS
  };
})();
