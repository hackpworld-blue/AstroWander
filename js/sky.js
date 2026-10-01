/* Live all-sky chart: stereographic projection of the visible hemisphere.
   Zenith at centre, horizon on the rim, north at top and east to the LEFT — the
   orientation you get holding a planisphere over your head. */
window.SkyMap = (function () {
  'use strict';
  const D2R = Math.PI / 180;

  function create(canvas, opts) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, cx = 0, cy = 0, R = 0, dpr = 1;
    let zoom = 1, panX = 0, panY = 0;
    let frame = null, hits = [], sel = null;
    /* Labels are collected while drawing and placed afterwards in priority order, so a
       planet never loses its name to a constellation caption drawn earlier. Anything that
       would overprint something already placed is dropped rather than stacked. */
    let labels = [];
    const label = (text, x, y, font, color, prio, align) =>
      labels.push({ text: text, x: x, y: y, font: font, color: color, prio: prio, align: align || 'left' });

    function flushLabels() {
      labels.sort((a, b) => a.prio - b.prio);
      const placed = [];
      for (const L of labels) {
        ctx.font = L.font;
        const w = ctx.measureText(L.text).width;
        const h = parseFloat(L.font.match(/(\d+(?:\.\d+)?)px/)[1]) * 1.15;
        const x0 = L.align === 'center' ? L.x - w / 2 : L.x;
        const box = [x0 - 2, L.y - h / 2 - 1, x0 + w + 2, L.y + h / 2 + 1];
        let clash = false;
        for (const q of placed) {
          if (box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]) { clash = true; break; }
        }
        if (clash) continue;
        placed.push(box);
        ctx.fillStyle = L.color;
        ctx.textAlign = L.align; ctx.textBaseline = 'middle';
        ctx.fillText(L.text, L.x, L.y);
      }
      ctx.textAlign = 'left';
    }
    const cfg = Object.assign({
      showLines: true, showNames: true, showMilkyWay: true,
      showDSO: true, showLabels: true, magLimit: 5.6
    }, opts || {});

    const pair = [0, 0];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      R = Math.min(W, H) / 2 - 18;
    }

    /* alt/az -> screen. Returns null when the point is below the drawn horizon. */
    function project(alt, az, allowBelow) {
      if (alt < (allowBelow ? -8 : -0.2)) return null;
      const z = (90 - alt) * D2R;
      const r = R * Math.tan(z / 2) * zoom;
      const a = az * D2R;
      return [cx - r * Math.sin(a) + panX, cy - r * Math.cos(a) + panY];
    }
    /* screen -> alt/az, for tap handling */
    function unproject(sx, sy) {
      const dx = sx - cx - panX, dy = sy - cy - panY;
      const r = Math.hypot(dx, dy) / (R * zoom);
      const alt = 90 - 2 * Math.atan(r) / D2R;
      const az = ((Math.atan2(-dx, -dy) / D2R) + 360) % 360;
      return { alt: alt, az: az };
    }

    const onScreen = p => p && p[0] > -60 && p[0] < W + 60 && p[1] > -60 && p[1] < H + 60;

    function drawMilkyWay() {
      if (!cfg.showMilkyWay || !window.MILKYWAY) return;
      const levels = [['ol1', 0.030], ['ol3', 0.045], ['ol5', 0.060]];
      for (const [key, alpha] of levels) {
        const rings = window.MILKYWAY[key]; if (!rings) continue;
        ctx.fillStyle = 'rgba(190,205,255,' + alpha + ')';
        ctx.beginPath();
        for (const ring of rings) {
          let started = false, prev = null;
          for (let k = 0; k < ring.length; k++) {
            const h = Astro.raDecToHorizon(frame, ring[k][0], ring[k][1]);
            const p = project(h.alt, h.az, true);
            if (!p) { started = false; prev = null; continue; }
            /* a jump across the projection means a new sub-path */
            if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > R * 1.2) started = false;
            if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
            prev = p;
          }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
    }

    function drawGrid(theme) {
      ctx.save();
      /* altitude circles at 30 and 60 degrees */
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      for (const alt of [30, 60]) {
        const rr = R * Math.tan((90 - alt) / 2 * D2R) * zoom;
        ctx.beginPath(); ctx.arc(cx + panX, cy + panY, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
      /* horizon */
      ctx.strokeStyle = theme.horizon; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx + panX, cy + panY, R * zoom, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    function drawCardinals(theme) {
      ctx.save();
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const marks = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
      for (const [az, label] of marks) {
        const rr = R * zoom + 11;
        const a = az * D2R;
        const x = cx - rr * Math.sin(a) + panX, y = cy - rr * Math.cos(a) + panY;
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        ctx.fillStyle = label.length === 1 ? theme.cardinalMajor : theme.cardinal;
        ctx.fillText(label, x, y);
      }
      ctx.restore();
    }

    function drawConstellations(theme) {
      if (!cfg.showLines) return;
      ctx.save();
      ctx.strokeStyle = theme.conLine; ctx.lineWidth = 1; ctx.lineCap = 'round';
      const centroids = {};
      for (const abbr in window.CON_LINES) {
        let sx = 0, sy = 0, n = 0;
        ctx.beginPath();
        for (const seg of window.CON_LINES[abbr]) {
          let prev = null;
          for (let k = 0; k < seg.length; k++) {
            const h = Astro.raDecToHorizon(frame, seg[k][0], seg[k][1]);
            const p = project(h.alt, h.az, false);
            if (!p) { prev = null; continue; }
            sx += p[0]; sy += p[1]; n++;
            if (prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); }
            prev = p;
          }
        }
        ctx.stroke();
        if (n > 3) centroids[abbr] = [sx / n, sy / n, n];
      }
      if (cfg.showNames) {
        for (const abbr in centroids) {
          const c = centroids[abbr];
          if (c[2] < 6) continue;
          const name = window.CON_NAMES[abbr];
          if (name) label(name.toUpperCase(), c[0], c[1],
            '500 11.5px "IBM Plex Sans", sans-serif', theme.conName, 3, 'center');
        }
      }
      ctx.restore();
    }

    function drawStars(theme) {
      const S = Astro.S, lim = cfg.magLimit + (zoom > 1 ? Math.min(2.4, Math.log2(zoom) * 1.6) : 0);
      const base = 0.62 * Math.min(1.9, Math.pow(zoom, 0.35));
      for (let i = 0; i < Astro.N; i++) {
        const s = S[i];
        if (s[2] > lim) break;                       /* catalogue is sorted by magnitude */
        Astro.starHorizon(frame, i, pair);
        if (pair[0] < -0.2) continue;
        const p = project(pair[0], pair[1], false);
        if (!onScreen(p)) continue;
        const r = Math.max(0.55, (lim - s[2]) * base);
        ctx.beginPath();
        ctx.fillStyle = Astro.bvColor(s[3]);
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fill();
        if (r > 2.4) {                                /* a soft halo on the bright ones */
          ctx.globalAlpha = 0.18;
          ctx.beginPath(); ctx.arc(p[0], p[1], r * 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (s[2] < 8) hits.push({ x: p[0], y: p[1], r: Math.max(9, r + 6), obj: { type: 'star', i: i } });
        if (cfg.showLabels && s[7] && s[2] < (zoom > 1.6 ? 3.6 : 2.6)) {
          /* brighter stars get first claim on the space */
          label(s[7], p[0] + r + 5, p[1], '500 11.5px "IBM Plex Sans", sans-serif',
                theme.starName, 1 + s[2] / 10);
        }
      }
    }

    function drawDSOs(theme) {
      if (!cfg.showDSO) return;
      ctx.save();
      ctx.strokeStyle = theme.dso; ctx.lineWidth = 1.1;
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (let i = 0; i < window.DSOS.length; i++) {
        const d = window.DSOS[i];
        const h = Astro.raDecToHorizon(frame, d[6], d[7]);
        if (h.alt < 0) continue;
        const p = project(h.alt, h.az, false);
        if (!onScreen(p)) continue;
        const t = d[3], rr = 3.4;
        ctx.beginPath();
        if (t === 's' || t === 'e' || t === 'i') {            /* galaxies: ellipse */
          ctx.ellipse(p[0], p[1], rr * 1.5, rr * 0.75, -0.4, 0, Math.PI * 2);
        } else if (t === 'gc' || t === 'oc') {                /* clusters: circle */
          ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
        } else {                                              /* nebulae: square */
          ctx.rect(p[0] - rr, p[1] - rr, rr * 2, rr * 2);
        }
        ctx.stroke();
        hits.push({ x: p[0], y: p[1], r: 11, obj: { type: 'dso', i: i } });
        if (cfg.showLabels && (zoom > 1.4 || d[4] < 7)) {
          label(d[0], p[0] + rr + 4, p[1], '500 11px "IBM Plex Mono", monospace', theme.dso, 2.5);
        }
      }
      ctx.restore();
    }

    function drawMoon(b, p, theme) {
      const rr = Math.max(7, 9 * Math.min(1.6, zoom));
      const limb = Astro.moonLimbAngle(frame);
      const k = b.phase == null ? 1 : b.phase;              /* illuminated fraction */
      ctx.save();
      ctx.translate(p[0], p[1]); ctx.rotate(-limb);
      ctx.fillStyle = theme.moonDark;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      /* lit region: a half disc plus an ellipse of the terminator */
      const waxing = (b.phaseAngle != null) ? true : true;
      ctx.fillStyle = '#F2EDE0';
      ctx.beginPath();
      ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(0, 0, rr * Math.abs(1 - 2 * k), rr, 0, Math.PI / 2, -Math.PI / 2, k > 0.5);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = theme.moonEdge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.stroke();
      return rr;
    }

    function drawBodies(theme) {
      const bodies = Astro.solarSystem(frame);
      for (const b of bodies) {
        if (b.alt < -0.5) continue;
        const p = project(b.alt, b.az, false);
        if (!onScreen(p)) continue;
        let rr;
        if (b.name === 'Moon') {
          rr = drawMoon(b, p, theme);
        } else if (b.name === 'Sun') {
          rr = Math.max(8, 10 * Math.min(1.6, zoom));
          const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr * 2.6);
          g.addColorStop(0, 'rgba(255,215,110,.95)'); g.addColorStop(1, 'rgba(255,190,70,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p[0], p[1], rr * 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#FFD65C';
          ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
        } else {
          rr = Math.max(2.6, 5.2 - b.mag * 0.55) * Math.min(1.5, Math.pow(zoom, .3));
          ctx.globalAlpha = 0.22; ctx.fillStyle = b.tone;
          ctx.beginPath(); ctx.arc(p[0], p[1], rr * 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = b.tone;
          ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
        }
        hits.push({ x: p[0], y: p[1], r: Math.max(14, rr + 8), obj: { type: 'body', name: b.name } });
        if (cfg.showLabels) {
          label(b.name, p[0] + rr + 6, p[1], '600 13px "IBM Plex Sans", sans-serif',
                theme.bodyName, 0);
        }
      }
    }

    function drawSelection(theme) {
      if (!sel) return;
      const h = selHorizon();
      if (!h || h.alt < 0) return;
      const p = project(h.alt, h.az, false);
      if (!p) return;
      ctx.save();
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], 15, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p[0] - 22, p[1]); ctx.lineTo(p[0] - 17, p[1]);
      ctx.moveTo(p[0] + 17, p[1]); ctx.lineTo(p[0] + 22, p[1]);
      ctx.moveTo(p[0], p[1] - 22); ctx.lineTo(p[0], p[1] - 17);
      ctx.moveTo(p[0], p[1] + 17); ctx.lineTo(p[0], p[1] + 22);
      ctx.stroke();
      ctx.restore();
    }

    function selHorizon() {
      if (!sel || !frame) return null;
      if (sel.type === 'star') { Astro.starHorizon(frame, sel.i, pair); return { alt: pair[0], az: pair[1] }; }
      if (sel.type === 'dso') { const d = window.DSOS[sel.i]; return Astro.raDecToHorizon(frame, d[6], d[7]); }
      if (sel.type === 'body') {
        try {
          const eq = Astronomy.Equator(sel.name, frame.time, frame.obs, true, true);
          const h = Astronomy.Horizon(frame.time, frame.obs, eq.ra, eq.dec, 'normal');
          return { alt: h.altitude, az: h.azimuth };
        } catch (e) { return null; }
      }
      return null;
    }

    function themeColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = n => cs.getPropertyValue(n).trim();
      return {
        sky: v('--sky-ground'), grid: v('--sky-grid'), horizon: v('--sky-horizon'),
        conLine: v('--sky-conline'), conName: v('--sky-conname'), starName: v('--sky-starname'),
        dso: v('--sky-dso'), bodyName: v('--sky-bodyname'), accent: v('--brass'),
        cardinal: v('--sky-cardinal'), cardinalMajor: v('--brass'),
        moonDark: v('--sky-moondark'), moonEdge: v('--sky-moonedge')
      };
    }

    function render(f) {
      if (f) frame = f;
      if (!frame) return;
      if (!W) resize();
      hits = []; labels = [];
      const theme = themeColors();
      ctx.clearRect(0, 0, W, H);

      /* the sky disc itself */
      ctx.save();
      ctx.beginPath(); ctx.arc(cx + panX, cy + panY, R * zoom, 0, Math.PI * 2);
      ctx.fillStyle = theme.sky; ctx.fill();
      ctx.clip();
      drawMilkyWay();
      drawConstellations(theme);
      drawDSOs(theme);
      drawStars(theme);
      drawBodies(theme);
      flushLabels();
      drawSelection(theme);
      ctx.restore();

      drawGrid(theme);
      drawCardinals(theme);
    }

    function pick(sx, sy) {
      let best = null, bd = Infinity;
      for (const h of hits) {
        const d = Math.hypot(h.x - sx, h.y - sy);
        if (d < h.r && d < bd) { bd = d; best = h.obj; }
      }
      return best;
    }

    return {
      resize: resize, render: render, pick: pick, unproject: unproject, project: project,
      get frame() { return frame; },
      set selection(v) { sel = v; },
      get selection() { return sel; },
      get zoom() { return zoom; },
      setView(z, px, py) {
        zoom = Math.max(1, Math.min(9, z));
        const lim = R * (zoom - 1) + 40;
        panX = Math.max(-lim, Math.min(lim, px)); panY = Math.max(-lim, Math.min(lim, py));
      },
      get pan() { return [panX, panY]; },
      resetView() { zoom = 1; panX = 0; panY = 0; },
      cfg: cfg
    };
  }

  return { create: create };
})();
