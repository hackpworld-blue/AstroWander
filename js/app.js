/* UI wiring: tabs, the live chart, the camera overlay, the photo solver and the atlas. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  /* ================= state ================= */
  let timeOffsetMin = 0;      /* minutes from now, driven by the slider */
  let live = true;
  let selected = null;        /* {type:'star'|'body'|'dso'|'con', ...} */
  let currentTab = 'sky';
  let solveImage = null;      /* {canvas, w, h, exif, sources} */
  let solveResult = null;
  let solveControl = null;

  const now = () => new Date(Date.now() + timeOffsetMin * 60000);

  /* ================= location ================= */
  function saveLoc(o) { try { localStorage.setItem('astrowander.loc', JSON.stringify(o)); } catch (e) {} }
  function loadLoc() { try { return JSON.parse(localStorage.getItem('astrowander.loc')); } catch (e) { return null; } }

  function showLoc() {
    const o = Astro.getObserver();
    const ns = o.lat >= 0 ? 'N' : 'S', ew = o.lon >= 0 ? 'E' : 'W';
    $('locBtn').textContent = Math.abs(o.lat).toFixed(2) + '°' + ns + '  ' +
                              Math.abs(o.lon).toFixed(2) + '°' + ew;
    $('locBtn').title = 'Observing from ' + $('locBtn').textContent +
      ' (' + Astro.getObserverSource() + ') — click to change';
  }

  function askLocation(force) {
    if (!navigator.geolocation) { if (force) promptManual(); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      Astro.setObserver(p.coords.latitude, p.coords.longitude, p.coords.altitude || 0, 'device');
      saveLoc({ lat: p.coords.latitude, lon: p.coords.longitude, elev: p.coords.altitude || 0 });
      showLoc(); redraw(); renderAtlas();
    }, function () { if (force) promptManual(); else showLoc(); }, { timeout: 8000, maximumAge: 600000 });
  }

  function promptManual() {
    const o = Astro.getObserver();
    const s = prompt('Latitude, longitude — decimal degrees, north and east positive.\n' +
      'For example:  51.48, -0.12', o.lat.toFixed(4) + ', ' + o.lon.toFixed(4));
    if (!s) return;
    const m = s.split(/[, ]+/).map(parseFloat).filter(v => !isNaN(v));
    if (m.length < 2 || Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) {
      alert('That did not read as a latitude and longitude. Latitude runs −90 to 90, longitude −180 to 180.');
      return;
    }
    Astro.setObserver(m[0], m[1], 0, 'manual');
    saveLoc({ lat: m[0], lon: m[1], elev: 0 });
    showLoc(); redraw(); renderAtlas();
  }

  /* ================= tabs ================= */
  const TAB_LABEL = { sky: 'Sky', point: 'Point', solve: 'Solve', atlas: 'Atlas' };

  function setNavOpen(open) {
    $('navbar').dataset.open = String(open);
    $('navToggle').setAttribute('aria-expanded', String(open));
  }

  function setTab(name) {
    currentTab = name;
    for (const t of document.querySelectorAll('[role=tab]')) {
      t.setAttribute('aria-selected', String(t.dataset.panel === name));
    }
    for (const p of ['sky', 'point', 'solve', 'atlas']) $('panel-' + p).hidden = (p !== name);
    $('navCurrent').textContent = TAB_LABEL[name] || name;
    setNavOpen(false);                       /* fold away again once a choice is made */
    if (name !== 'point' && ar) ar.stop();
    if (name === 'sky') { sky.resize(); redraw(); }
    if (name === 'atlas') renderAtlas();
  }
  for (const t of document.querySelectorAll('[role=tab]')) {
    t.addEventListener('click', () => setTab(t.dataset.panel));
  }
  $('navToggle').addEventListener('click', function () {
    setNavOpen($('navbar').dataset.open !== 'true');
  });
  /* tapping the view itself, or pressing Escape, folds the bar back */
  document.querySelector('main').addEventListener('pointerdown', function () {
    if ($('navbar').dataset.open === 'true') setNavOpen(false);
  }, true);
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('navbar').dataset.open === 'true') setNavOpen(false);
  });

  /* ================= sky chart ================= */
  const sky = SkyMap.create($('sky'));

  function redraw() {
    if (currentTab !== 'sky') return;
    const d = now();
    const frame = Astro.makeFrame(d);
    sky.selection = selected && selected.type !== 'con' ? selected : null;
    sky.render(frame);
    $('clock').textContent = d.toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const dk = Astro.darkness(d);
    const up = Astro.solarSystem(frame).filter(b => b.alt > 0 && b.name !== 'Sun' && b.name !== 'Moon');
    $('skyHud').innerHTML =
      '<b>' + dk.label + '</b>  ·  sun ' + dk.sunAlt.toFixed(0) + '°<br>' +
      'LST ' + fmtHours(frame.lst) + '<br>' +
      (up.length ? 'planets up: ' + up.map(b => b.name).join(', ') : 'no planets above the horizon');
  }
  function fmtHours(h) {
    const H = Math.floor(h), M = Math.floor((h - H) * 60);
    return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0');
  }

  addEventListener('resize', () => { sky.resize(); redraw(); if (ar) ar.resize(); });
  setInterval(() => { if (live && currentTab === 'sky') redraw(); }, 10000);

  $('timeSlider').addEventListener('input', function () {
    timeOffsetMin = +this.value; live = (timeOffsetMin === 0); redraw();
  });
  $('nowBtn').addEventListener('click', function () {
    timeOffsetMin = 0; live = true; $('timeSlider').value = 0; redraw();
  });
  function toggleChip(id, key) {
    $(id).addEventListener('click', function () {
      const on = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', String(on));
      sky.cfg[key] = on; redraw();
    });
  }
  toggleChip('tLines', 'showLines');
  toggleChip('tNames', 'showNames');
  toggleChip('tDso', 'showDSO');
  toggleChip('tMw', 'showMilkyWay');
  $('tReset').addEventListener('click', () => { sky.resetView(); redraw(); });

  /* pan, pinch and tap on the chart */
  (function () {
    const wrap = $('chartwrap');
    let pts = new Map(), startDist = 0, startZoom = 1, startPan = [0, 0], mid0 = [0, 0], moved = 0;
    wrap.addEventListener('pointerdown', e => {
      wrap.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved = 0;
      if (pts.size === 1) { startPan = sky.pan.slice(); mid0 = [e.clientX, e.clientY]; startZoom = sky.zoom; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        startDist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        startZoom = sky.zoom; startPan = sky.pan.slice();
        mid0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      }
    });
    wrap.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        const dx = e.clientX - mid0[0], dy = e.clientY - mid0[1];
        moved = Math.max(moved, Math.hypot(dx, dy));
        sky.setView(sky.zoom, startPan[0] + dx, startPan[1] + dy);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const z = startZoom * (d / (startDist || d));
        sky.setView(z, startPan[0] + (mid[0] - mid0[0]), startPan[1] + (mid[1] - mid0[1]));
        moved = 99;
      }
      redraw();
    });
    function up(e) {
      if (pts.size === 1 && moved < 6) {
        const r = wrap.getBoundingClientRect();
        const hit = sky.pick(e.clientX - r.left, e.clientY - r.top);
        if (hit) showObject(hit); else closeSheet();
      }
      pts.delete(e.pointerId);
    }
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      sky.setView(sky.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), sky.pan[0], sky.pan[1]);
      redraw();
    }, { passive: false });
  })();

  /* ================= point / AR ================= */
  let ar = null;
  $('arStartBtn').addEventListener('click', async function () {
    $('arStart').hidden = true;
    if (!ar) {
      ar = ARView.create($('arvideo'), $('arcanvas'), {
        onStatus: m => { $('arNote').textContent = m; },
        onReticle: (c, src, fov) => {
          $('arReadout').textContent = 'alt ' + c.alt.toFixed(0) + '°  az ' + c.az.toFixed(0) +
            '° ' + Astro.compass(c.az) +
            (src === 'relative' ? '  · compass not absolute' : '');
        }
      });
      $('arFov').value = ar.fov;
      if (selected) ar.target = withLabel(selected);
    }
    await ar.start();
  });
  $('arCal').addEventListener('click', () => { if (ar) { ar.resetCalibration(); $('arNote').textContent = 'Nudge cleared.'; } });
  $('arFov').addEventListener('input', function () { if (ar) ar.setFov(+this.value); });

  (function () {
    const wrap = $('arwrap');
    let down = null;
    wrap.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY, 0]; });
    wrap.addEventListener('pointermove', e => {
      if (!down || !ar) return;
      const dx = e.clientX - down[0], dy = e.clientY - down[1];
      down[2] = Math.max(down[2], Math.hypot(dx, dy));
      if (down[2] > 6) {
        /* dragging steers: it nudges the compass when there is one, otherwise it looks around */
        ar.nudge(-dx * 0.12, ar.isManual ? dy * 0.12 : 0);
        down[0] = e.clientX; down[1] = e.clientY;
        if (!ar.isManual) $('arNote').textContent = 'Nudged ' + ar.azOffset.toFixed(0) + '° — remembered for next time.';
      }
    });
    wrap.addEventListener('pointerup', e => {
      if (down && down[2] < 6 && ar) {
        const r = wrap.getBoundingClientRect();
        const hit = ar.pick(e.clientX - r.left, e.clientY - r.top);
        if (hit) showObject(hit);
      }
      down = null;
    });
  })();

  /* ================= atlas ================= */
  let filter = 'all';
  for (const b of document.querySelectorAll('[data-filter]')) {
    b.addEventListener('click', function () {
      filter = this.dataset.filter;
      for (const o of document.querySelectorAll('[data-filter]')) o.setAttribute('aria-pressed', String(o === this));
      renderAtlas();
    });
  }
  $('q').addEventListener('input', renderAtlas);

  function renderAtlas() {
    const frame = Astro.makeFrame(now());
    const q = $('q').value;
    let list = Astro.searchAll(q, 300);
    if (filter === 'body') list = list.filter(r => r.type === 'body');
    else if (filter === 'star') list = list.filter(r => r.type === 'star');
    else if (filter === 'dso') list = list.filter(r => r.type === 'dso');

    const ul = $('results');
    ul.textContent = '';
    const pair = [0, 0];
    let shown = 0;
    for (const r of list) {
      if (shown >= 120) break;
      let title, sub, mag, alt;
      if (r.type === 'body') {
        const info = window.PLANET_INFO[r.name] || {};
        try {
          const eq = Astronomy.Equator(r.name, frame.time, frame.obs, true, true);
          const h = Astronomy.Horizon(frame.time, frame.obs, eq.ra, eq.dec, 'normal');
          alt = h.altitude;
          mag = r.name === 'Sun' ? -26.7 : Astronomy.Illumination(r.name, frame.time).mag;
        } catch (e) { alt = -99; mag = null; }
        title = (info.symbol ? info.symbol + '  ' : '') + r.name;
        sub = info.tagline || '';
      } else if (r.type === 'star') {
        const s = Astro.S[r.i];
        Astro.starHorizon(frame, r.i, pair); alt = pair[0]; mag = s[2];
        title = Astro.starTitle(s);
        const d = Astro.starDesignation(s);
        sub = [d !== title ? d : null, window.CON_NAMES[s[4]]].filter(Boolean).join('  ·  ');
      } else if (r.type === 'dso') {
        const d = window.DSOS[r.i];
        const h = Astro.raDecToHorizon(frame, d[6], d[7]); alt = h.alt; mag = d[4] < 90 ? d[4] : null;
        title = d[2] || d[0];
        const t = window.DSO_TYPES[d[3]];
        sub = [d[0], d[1], t && t.label].filter(Boolean).join('  ·  ');
      } else {
        title = window.CON_NAMES[r.abbr]; sub = 'Constellation · ' + r.abbr; alt = null; mag = null;
      }
      if (filter === 'up' && !(alt > 0)) continue;

      const li = el('li');
      const dot = el('div', 'updot' + (alt > 0 ? ' up' : ''));
      dot.title = alt == null ? '' : alt > 0 ? 'Above the horizon' : 'Below the horizon';
      const nm = el('div', 'rname');
      nm.appendChild(el('strong', null, title));
      if (sub) nm.appendChild(el('span', null, sub));
      li.appendChild(dot); li.appendChild(nm);
      if (mag != null) li.appendChild(el('div', 'rmag', 'mag ' + mag.toFixed(1)));
      li.addEventListener('click', () => showObject(r));
      ul.appendChild(li);
      shown++;
    }
    if (!shown) {
      const li = el('li'); li.appendChild(el('div', 'muted small', 'Nothing matches that.'));
      ul.appendChild(li);
    }
  }

  /* ================= detail sheet ================= */
  function withLabel(o) {
    const c = Object.assign({}, o);
    if (o.type === 'star') c.label = Astro.starTitle(Astro.S[o.i]);
    else if (o.type === 'body') c.label = o.name;
    else if (o.type === 'dso') c.label = window.DSOS[o.i][2] || window.DSOS[o.i][0];
    return c;
  }
  function closeSheet() { $('sheet').hidden = true; selected = null; if (currentTab === 'sky') redraw(); }
  $('shClose').addEventListener('click', closeSheet);

  function statBlock(label, value) {
    const d = el('div', 'stat', label); const b = el('b', null, value);
    d.textContent = ''; d.appendChild(b); d.appendChild(document.createTextNode(label));
    return d;
  }

  function showObject(o) {
    selected = o;
    const frame = Astro.makeFrame(now());
    const sheet = $('sheet');
    sheet.hidden = false;
    const body = $('shBody'); body.textContent = '';
    const nowStrip = $('shNow'); nowStrip.textContent = '';

    let title = '', sub = '', alt = null, az = null, ra = null, dec = null, rs = null, mag = null;

    if (o.type === 'body') {
      const info = window.PLANET_INFO[o.name] || {};
      title = o.name;
      sub = info.tagline || '';
      try {
        const eq = Astronomy.Equator(o.name, frame.time, frame.obs, true, true);
        const h = Astronomy.Horizon(frame.time, frame.obs, eq.ra, eq.dec, 'normal');
        alt = h.altitude; az = h.azimuth; ra = eq.ra; dec = eq.dec;
        mag = o.name === 'Sun' ? -26.74 : Astronomy.Illumination(o.name, frame.time).mag;
      } catch (e) {}
      rs = Astro.riseSetBody(o.name, now());

      if (info.warn) { const p = el('p', 'warn small', info.warn); body.appendChild(p); }
      if (info.text) body.appendChild(el('p', null, info.text));
      if (o.name === 'Moon') {
        try {
          const ill = Astronomy.Illumination('Moon', frame.time);
          const ph = Astronomy.MoonPhase(frame.time);
          body.appendChild(el('h4', null, 'Right now'));
          body.appendChild(el('p', null, phaseName(ph) + ' — ' +
            (ill.phase_fraction * 100).toFixed(0) + '% illuminated.'));
        } catch (e) {}
      }
      if (info.facts) {
        body.appendChild(el('h4', null, 'The body itself'));
        body.appendChild(factTable(info.facts));
      }
      if (info.obs) { body.appendChild(el('h4', null, 'Observing it')); body.appendChild(el('p', null, info.obs)); }

    } else if (o.type === 'star') {
      const s = Astro.S[o.i];
      title = Astro.starTitle(s);
      const desig = Astro.starDesignation(s);
      sub = [desig !== title ? desig : null, window.CON_NAMES[s[4]], s[10] ? 'HD ' + s[10] : null]
        .filter(Boolean).join('  ·  ');
      const pair = [0, 0]; Astro.starHorizon(frame, o.i, pair);
      alt = pair[0]; az = pair[1]; ra = s[0]; dec = s[1]; mag = s[2];
      rs = Astro.riseSetFixed(s[0], s[1], now());

      if (s[7] && window.STAR_LORE[s[7]]) body.appendChild(el('p', null, window.STAR_LORE[s[7]]));
      const gen = Astro.describeStar(s);
      if (gen) body.appendChild(el('p', null, gen));
      const facts = [];
      facts.push(['Apparent magnitude', s[2].toFixed(2)]);
      if (s[9]) facts.push(['Spectral type', s[9]]);
      if (s[3]) facts.push(['Colour index B−V', (s[3] > 0 ? '+' : '') + s[3].toFixed(2) +
        '  (≈' + Math.round(Astro.bvToTemp(s[3]) / 10) * 10 + ' K)']);
      if (s[8]) facts.push(['Distance', Astro.fmtDist(s[8])]);
      facts.push(['Right ascension', Astro.fmtRA(s[0]) + '  (J2000)']);
      facts.push(['Declination', Astro.fmtDec(s[1]) + '  (J2000)']);
      body.appendChild(el('h4', null, 'Catalogue'));
      body.appendChild(factTable(facts));
      body.appendChild(el('p', 'small muted', Astro.magDescription(s[2]) + '.'));

    } else if (o.type === 'dso') {
      const d = window.DSOS[o.i];
      title = d[2] || d[0];
      sub = [d[0], d[1]].filter(Boolean).join('  ·  ');
      const h = Astro.raDecToHorizon(frame, d[6], d[7]);
      alt = h.alt; az = h.az; ra = d[6]; dec = d[7]; mag = d[4] < 90 ? d[4] : null;
      rs = Astro.riseSetFixed(d[6], d[7], now());
      const t = window.DSO_TYPES[d[3]];
      if (t) { body.appendChild(el('p', null, t.blurb)); }
      const facts = [];
      if (t) facts.push(['Type', t.label]);
      if (mag != null) facts.push(['Magnitude', mag.toFixed(1)]);
      if (d[5]) facts.push(['Apparent size', d[5].replace('x', ' × ') + ' arcmin']);
      facts.push(['Right ascension', Astro.fmtRA(d[6]) + '  (J2000)']);
      facts.push(['Declination', Astro.fmtDec(d[7]) + '  (J2000)']);
      body.appendChild(el('h4', null, 'Catalogue'));
      body.appendChild(factTable(facts));
      if (mag != null) body.appendChild(el('p', 'small muted',
        mag < 6 ? 'Bright enough to find in binoculars from a dark site.'
        : mag < 9 ? 'Binoculars from a dark site, or any small telescope.'
        : 'A telescope object.'));

    } else if (o.type === 'con') {
      title = window.CON_NAMES[o.abbr];
      sub = 'Constellation · ' + o.abbr + (window.CON_GEN[o.abbr] ? ' · genitive ' + window.CON_GEN[o.abbr] : '');
      const members = [];
      for (let i = 0; i < Astro.N && members.length < 14; i++) if (Astro.S[i][4] === o.abbr) members.push(i);
      body.appendChild(el('p', null, 'Its brightest stars, in order:'));
      const ul = el('ul'); ul.style.cssText = 'margin:0;padding-left:18px';
      for (const i of members) {
        const s = Astro.S[i];
        const li = el('li'); li.style.cursor = 'pointer';
        li.appendChild(el('span', null, Astro.starTitle(s) + '  '));
        li.appendChild(el('span', 'mono small muted', 'mag ' + s[2].toFixed(2)));
        li.addEventListener('click', () => showObject({ type: 'star', i: i }));
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }

    $('shTitle').textContent = title;
    $('shSub').textContent = sub;

    /* the "right now" strip */
    if (alt != null) {
      const app = Astro.refract(alt);
      const badge = el('span', 'badge ' + (alt > 0 ? 'up' : 'down'), alt > 0 ? 'Above horizon' : 'Below horizon');
      badge.style.alignSelf = 'center';
      nowStrip.appendChild(badge);
      nowStrip.appendChild(statBlock('altitude', app.toFixed(1) + '°'));
      nowStrip.appendChild(statBlock('azimuth', az.toFixed(0) + '° ' + Astro.compass(az)));
      if (mag != null) nowStrip.appendChild(statBlock('magnitude', mag.toFixed(mag < -1 ? 1 : 2)));
    }

    /* rise, transit and set */
    if (rs) {
      body.appendChild(el('h4', null, 'Tonight, from where you are'));
      const rows = [];
      if (rs.circumpolar) rows.push(['Visibility', 'Circumpolar — it never sets']);
      else if (rs.neverRises) rows.push(['Visibility', 'Never rises at this latitude']);
      else {
        rows.push(['Rises', Astro.fmtTime(rs.rise)]);
        rows.push(['Highest', Astro.fmtTime(rs.transit) + (rs.transitAlt != null ? '  at ' + rs.transitAlt.toFixed(0) + '°' : '')]);
        rows.push(['Sets', Astro.fmtTime(rs.set)]);
      }
      if (rs.circumpolar && rs.transitAlt != null) rows.push(['Highest', rs.transitAlt.toFixed(0) + '° above the horizon']);
      body.appendChild(factTable(rows));
    }

    /* actions */
    const acts = el('div', 'actions');
    if (o.type !== 'con') {
      const b1 = el('button', 'primary', 'Point me at it');
      b1.addEventListener('click', function () {
        setTab('point');
        if (ar) ar.target = withLabel(o);
        else $('arStart').hidden = false;
        if (ar) { /* already running */ } else { /* user must start the camera */ }
      });
      acts.appendChild(b1);
      const b2 = el('button', null, 'Show on chart');
      b2.addEventListener('click', function () { setTab('sky'); sky.selection = o; redraw(); });
      acts.appendChild(b2);
    }
    body.appendChild(acts);

    if (currentTab === 'sky') redraw();
  }

  function phaseName(deg) {
    const n = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
               'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    return n[Math.floor(((deg + 22.5) % 360) / 45)];
  }
  function factTable(rows) {
    const t = el('table', 'facts');
    for (const [k, v] of rows) {
      const tr = el('tr');
      tr.appendChild(el('th', null, k));
      tr.appendChild(el('td', null, v));
      t.appendChild(tr);
    }
    return t;
  }

  /* ================= solve ================= */
  $('drop').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0]); });
  ['dragenter', 'dragover'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault(); $('drop').classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault(); $('drop').classList.remove('over');
  }));
  $('drop').addEventListener('drop', e => {
    const f = e.dataTransfer.files[0]; if (f) loadImage(f);
  });

  async function loadImage(file) {
    const out = $('solveOut'); out.textContent = '';
    solveResult = null;
    const buf = await file.arrayBuffer();
    let exif = null;
    try { exif = Solver.readExif(buf); } catch (e) {}

    const url = URL.createObjectURL(new Blob([buf]));
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      const MAX = 1400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, w, h);
      solveImage = { canvas: cv, w: w, h: h, exif: exif, scale: scale,
                     origW: img.width, origH: img.height };

      /* if the photo carries a location, offer to observe from there */
      if (exif && exif.lat != null && Astro.getObserverSource() === 'default') {
        Astro.setObserver(exif.lat, exif.lon, 0, 'photo');
        showLoc();
      }
      $('solveOpts').hidden = false;
      renderSolvePreview();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      out.appendChild(card('Could not read that image',
        'The browser could not decode the file. HEIC photos straight off an iPhone sometimes ' +
        'need converting to JPEG first — sharing or exporting the photo usually does that.'));
    };
    img.src = url;
  }

  function card(title, text) {
    const c = el('div', 'card');
    c.appendChild(el('h3', null, title));
    if (text) c.appendChild(el('p', 'small muted', text));
    return c;
  }

  function renderSolvePreview() {
    const out = $('solveOut'); out.textContent = '';
    const c = el('div', 'card');
    const wrap = el('div', 'solvecanvaswrap');
    const cv = document.createElement('canvas');
    cv.width = solveImage.w; cv.height = solveImage.h;
    wrap.appendChild(cv);
    c.appendChild(wrap);
    out.appendChild(c);
    drawSolveCanvas(cv);

    if (solveImage.exif) {
      const e = solveImage.exif, rows = [];
      if (e.make || e.model) rows.push(['Camera', [e.make, e.model].filter(Boolean).join(' ')]);
      if (e.date) rows.push(['Taken', e.date.toLocaleString()]);
      if (e.exposure) rows.push(['Exposure', e.exposure >= 1 ? e.exposure.toFixed(1) + ' s' : '1/' + Math.round(1 / e.exposure) + ' s']);
      if (e.iso) rows.push(['ISO', String(e.iso)]);
      if (e.focal35) rows.push(['Focal length', e.focal35 + ' mm (35mm equivalent)']);
      if (e.lat != null) rows.push(['Location', e.lat.toFixed(4) + ', ' + e.lon.toFixed(4)]);
      if (rows.length) {
        const c2 = el('div', 'card');
        c2.appendChild(el('h3', null, 'From the file'));
        c2.appendChild(factTable(rows));
        if (e.focal35) {
          const fov = 2 * Math.atan(36 / (2 * e.focal35)) * 180 / Math.PI;
          c2.appendChild(el('p', 'small muted',
            'That focal length implies a horizontal field of about ' + fov.toFixed(0) +
            '°, which narrows the search considerably.'));
          const sel = $('fovHint');
          sel.value = fov > 70 ? '45,110' : fov > 40 ? '30,60' : '12,35';
        }
        out.appendChild(c2);
      }
    }
  }

  function drawSolveCanvas(cv) {
    const g = cv.getContext('2d');
    g.drawImage(solveImage.canvas, 0, 0);
    if (!solveResult || !solveResult.ok) return;
    const r = solveResult;
    const S = Math.max(1, cv.width / 900);

    g.strokeStyle = 'rgba(120,160,220,.45)'; g.lineWidth = 1 * S;
    for (const line of r.lines) {
      g.beginPath();
      line.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.stroke();
    }
    g.lineWidth = 1.4 * S;
    g.font = (11 * S) + 'px "IBM Plex Sans", sans-serif';
    g.textBaseline = 'middle';

    for (const s of r.stars) {
      g.strokeStyle = s.named ? 'rgba(217,164,65,.95)' : 'rgba(217,164,65,.42)';
      g.beginPath(); g.arc(s.x, s.y, 9 * S, 0, Math.PI * 2); g.stroke();
      if (s.named || s.mag < 3) {
        g.fillStyle = 'rgba(255,238,200,.96)';
        g.fillText(s.name, s.x + 12 * S, s.y);
      }
    }
    for (const d of r.dsos) {
      g.strokeStyle = 'rgba(78,158,143,.95)';
      g.strokeRect(d.x - 10 * S, d.y - 10 * S, 20 * S, 20 * S);
      g.fillStyle = 'rgba(150,220,205,.96)';
      g.fillText(d.title, d.x + 13 * S, d.y);
    }
    for (const b of r.bodies) {
      g.strokeStyle = 'rgba(255,140,90,.98)'; g.lineWidth = 2 * S;
      g.beginPath(); g.arc(b.x, b.y, 14 * S, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,190,150,.98)';
      g.font = '600 ' + (12 * S) + 'px "IBM Plex Sans", sans-serif';
      g.fillText(b.name, b.x + 18 * S, b.y);
      g.font = (11 * S) + 'px "IBM Plex Sans", sans-serif';
      g.lineWidth = 1.4 * S;
    }
  }

  $('solveBtn').addEventListener('click', runSolve);
  $('cancelBtn').addEventListener('click', function () {
    if (solveControl && solveControl.handle) solveControl.handle.cancel();
  });

  async function runSolve() {
    if (!solveImage) return;
    const out = $('solveOut');
    $('solveProg').hidden = false;
    $('cancelBtn').hidden = false;
    $('solveBtn').disabled = true;
    $('progText').textContent = 'Finding stars in the image…';
    $('prog').value = 0;
    await new Promise(r => setTimeout(r, 30));

    const g = solveImage.canvas.getContext('2d', { willReadFrequently: true });
    const data = g.getImageData(0, 0, solveImage.w, solveImage.h);
    const det = Solver.detect(data, solveImage.w, solveImage.h, {});
    const sources = det.sources;

    if (sources.length < 8) {
      finishSolve({ ok: false, tooFew: true, found: sources.length });
      return;
    }
    $('progText').textContent = sources.length + ' point sources found. Matching against the catalogue…';

    const [fmin, fmax] = $('fovHint').value.split(',').map(Number);
    solveControl = {};
    const t0 = performance.now();
    const res = await Solver.solve(sources, solveImage.w, solveImage.h, {
      fovMin: fmin, fovMax: fmax,
      date: (solveImage.exif && solveImage.exif.date) || new Date(),
      timeBudget: 90, control: solveControl
    }, function (frac, tested, inl) {
      $('prog').value = frac;
      $('progText').textContent = (frac * 100).toFixed(0) + '% searched · ' +
        tested.toLocaleString() + ' candidate patterns tried' +
        (inl ? ' · best so far ' + inl + ' stars' : '');
    });
    res.detected = sources.length;
    res.elapsedTotal = (performance.now() - t0) / 1000;
    finishSolve(res);
  }

  function finishSolve(res) {
    $('solveProg').hidden = true;
    $('cancelBtn').hidden = true;
    $('solveBtn').disabled = false;
    solveResult = res;
    const out = $('solveOut');

    if (!res.ok) {
      renderSolvePreview();
      let why;
      if (res.tooFew) {
        why = 'Only ' + res.found + ' point-like sources came out of the image, and the matcher ' +
          'needs at least eight real stars. That usually means the sky was too bright, the ' +
          'exposure too short, or the picture is of something other than open sky.';
      } else if (res.cancelled) {
        why = 'Stopped before the search finished — it had covered ' +
          (res.searched * 100).toFixed(0) + '% of the candidate patterns.';
      } else if (res.timedOut) {
        why = 'The search ran out of time after covering ' + (res.searched * 100).toFixed(0) +
          '% of the candidate patterns. If you know roughly how wide the frame is, setting ' +
          'that above narrows the search a great deal.';
      } else {
        why = 'The search covered every candidate pattern and found no arrangement of ' +
          'catalogue stars that fits. Star trails, heavy cloud, or a frame containing only ' +
          'faint stars will all do this. It deliberately reports nothing rather than guessing.';
      }
      out.insertBefore(card('Not solved', why), out.firstChild);
      return;
    }

    renderSolvePreview();
    const c = el('div', 'card');
    c.appendChild(el('h3', null, 'Solved'));
    const named = res.stars.filter(s => s.named);
    c.appendChild(el('p', null,
      'The camera was pointing at ' + Astro.fmtRA(res.ra) + ', ' + Astro.fmtDec(res.dec) +
      '. ' + res.inliers + ' catalogue stars line up with detections to within ' +
      res.rms.toFixed(1) + ' pixels.'));

    const rows = [
      ['Centre RA', Astro.fmtRA(res.ra)],
      ['Centre Dec', Astro.fmtDec(res.dec)],
      ['Field of view', res.fovW.toFixed(1) + '° × ' + res.fovH.toFixed(1) + '°'],
      ['Image scale', res.scale.toFixed(1) + '" per pixel'],
      ['Rotation', 'celestial north is ' + res.roll.toFixed(0) + '° from image up'],
      ['Stars matched', res.inliers + ' of ' + res.detected + ' detections'],
      ['Residual', res.rms.toFixed(2) + ' px RMS'],
      ['Search time', res.elapsedTotal.toFixed(1) + ' s']
    ];
    c.appendChild(factTable(rows));
    out.insertBefore(c, out.firstChild);

    if (res.constellations.length) {
      const c2 = el('div', 'card');
      c2.appendChild(el('h3', null, 'What is in the frame'));
      c2.appendChild(el('p', 'small muted', 'Constellations represented: ' +
        res.constellations.slice(0, 5).map(x => x.name).join(', ') + '.'));
      if (named.length) {
        c2.appendChild(el('h4', null, 'Named stars'));
        const ul = el('ul', 'results');
        for (const s of named.slice(0, 20)) {
          const li = el('li'); li.style.padding = '8px 0';
          const nm = el('div', 'rname');
          nm.appendChild(el('strong', null, s.title));
          nm.appendChild(el('span', null, 'magnitude ' + s.mag.toFixed(2)));
          li.appendChild(nm);
          li.addEventListener('click', () => showObject({ type: 'star', i: s.starIndex }));
          ul.appendChild(li);
        }
        c2.appendChild(ul);
      }
      if (res.dsos.length) {
        c2.appendChild(el('h4', null, 'Deep-sky objects in frame'));
        const ul = el('ul', 'results');
        for (const d of res.dsos.slice(0, 14)) {
          const li = el('li'); li.style.padding = '8px 0';
          const nm = el('div', 'rname');
          nm.appendChild(el('strong', null, d.title));
          nm.appendChild(el('span', null, d.name));
          li.appendChild(nm);
          li.addEventListener('click', () => showObject({ type: 'dso', i: d.dsoIndex }));
          ul.appendChild(li);
        }
        c2.appendChild(ul);
      }
      if (res.bodies.length) {
        c2.appendChild(el('h4', null, 'Solar system, at the time of the photo'));
        c2.appendChild(el('p', 'small', res.bodies.map(b => b.name).join(', ') +
          ' — computed for ' + res.date.toLocaleString() +
          (solveImage.exif && solveImage.exif.date ? ', taken from the file' : ', which is the current time since the file carries no timestamp') + '.'));
      }
      out.insertBefore(c2, out.children[1] || null);
    }
  }

  /* ================= night vision ================= */
  $('nightBtn').addEventListener('click', function () {
    const on = this.getAttribute('aria-pressed') !== 'true';
    this.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('night', on);
    try { localStorage.setItem('astrowander.night', on ? '1' : '0'); } catch (e) {}
  });
  $('locBtn').addEventListener('click', () => askLocation(true));

  /* ================= boot ================= */
  (function boot() {
    const saved = loadLoc();
    if (saved) Astro.setObserver(saved.lat, saved.lon, saved.elev, 'saved');
    try {
      if (localStorage.getItem('astrowander.night') === '1') {
        document.body.classList.add('night');
        $('nightBtn').setAttribute('aria-pressed', 'true');
      }
    } catch (e) {}
    showLoc();
    sky.resize();
    redraw();
    renderAtlas();
    askLocation(false);
    /* warm the matcher index in the background so the first solve is not slowed by it */
    setTimeout(() => { try { Solver.buildIndex(20, 110); } catch (e) {} }, 2500);
  })();
})();
