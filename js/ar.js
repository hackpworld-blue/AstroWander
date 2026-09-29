/* Point-and-identify: live camera feed with the catalogue projected over it.
   Device orientation (W3C alpha/beta/gamma) gives a rotation from the device frame to the
   ENU world frame; the rear camera looks along device -Z. Compass error is real and
   unavoidable, so a manual azimuth nudge is part of the design, not a workaround. */
window.ARView = (function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function mul(a, b) {
    const o = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
    return o;
  }
  const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1]); };
  const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return new Float64Array([1, 0, 0, 0, c, -s, 0, s, c]); };
  const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return new Float64Array([c, 0, s, 0, 1, 0, -s, 0, c]); };

  function create(video, canvas, opts) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let stream = null, running = false, raf = 0;
    let alpha = 0, beta = 90, gamma = 0, screenAngle = 0;
    let haveOrientation = false, absolute = false, headingSource = 'none';
    let azOffset = 0;                 /* user calibration, degrees */
    let manual = { az: 180, alt: 30 };/* fallback when there are no sensors */
    let useManual = false;
    let hfov = 63;                    /* horizontal field of view, degrees */
    let target = null, frame = null, hits = [];
    const cb = Object.assign({ onStatus: function () {}, onReticle: function () {} }, opts || {});
    const pair = [0, 0];

    try { azOffset = parseFloat(localStorage.getItem('astrowander.azOffset')) || 0; } catch (e) {}
    try { hfov = parseFloat(localStorage.getItem('astrowander.hfov')) || 63; } catch (e) {}

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* --- orientation --- */
    function onOrient(e) {
      if (e.alpha == null && e.webkitCompassHeading == null) return;
      if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
        alpha = (360 - e.webkitCompassHeading);      /* iOS true heading -> alpha convention */
        absolute = true; headingSource = 'ios-compass';
      } else if (e.alpha != null) {
        alpha = e.alpha;
        if (e.absolute || e.type === 'deviceorientationabsolute') { absolute = true; headingSource = 'absolute'; }
        else if (!absolute) headingSource = 'relative';
      }
      if (e.beta != null) beta = e.beta;
      if (e.gamma != null) gamma = e.gamma;
      haveOrientation = true; useManual = false;
    }
    function onScreenRotate() {
      screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    }

    /* Rotation from screen frame to world (ENU). */
    function rotation() {
      if (useManual || !haveOrientation) {
        /* build the same basis from the manual az/alt, camera level-rolled */
        const az = (manual.az) * D2R, alt = manual.alt * D2R;
        const f = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
        let up = [-Math.sin(alt) * Math.sin(az), -Math.sin(alt) * Math.cos(az), Math.cos(alt)];
        const rt = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
        return { fwd: f, up: up, right: rt };
      }
      const a = (alpha + azOffset) * D2R, b = beta * D2R, g = gamma * D2R;
      let R = mul(mul(Rz(a), Rx(b)), Ry(g));
      R = mul(R, Rz(-screenAngle * D2R));
      /* columns of R are the device axes expressed in the world frame */
      const right = [R[0], R[3], R[6]];
      const up = [R[1], R[4], R[7]];
      const back = [R[2], R[5], R[8]];
      return { fwd: [-back[0], -back[1], -back[2]], up: up, right: right };
    }

    const enu = (alt, az) => {
      const ca = Math.cos(alt * D2R);
      return [ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R)];
    };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    function makeProjector() {
      const R = rotation();
      const focal = (W / 2) / Math.tan(hfov / 2 * D2R);
      const cx = W / 2, cy = H / 2;
      return {
        basis: R,
        project: function (alt, az) {
          const d = enu(alt, az);
          const f = dot(d, R.fwd);
          if (f <= 0.08) return null;
          return [cx + (dot(d, R.right) / f) * focal, cy - (dot(d, R.up) / f) * focal, f];
        },
        centre: function () {
          const f = R.fwd;
          return { alt: Math.asin(Math.max(-1, Math.min(1, f[2]))) * R2D,
                   az: (Math.atan2(f[0], f[1]) * R2D + 360) % 360 };
        }
      };
    }

    /* --- drawing --- */
    function theme() {
      const cs = getComputedStyle(document.documentElement);
      return {
        line: cs.getPropertyValue('--ar-line').trim(),
        text: cs.getPropertyValue('--ar-text').trim(),
        brass: cs.getPropertyValue('--brass').trim(),
        good: cs.getPropertyValue('--verdigris').trim()
      };
    }

    function draw() {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (!W) resize();
      frame = Astro.makeFrame(new Date());
      const P = makeProjector();
      const th = theme();
      hits = [];
      ctx.clearRect(0, 0, W, H);

      /* constellation lines */
      ctx.strokeStyle = th.line; ctx.lineWidth = 1;
      for (const abbr in window.CON_LINES) {
        ctx.beginPath();
        for (const seg of window.CON_LINES[abbr]) {
          let prev = null;
          for (let k = 0; k < seg.length; k++) {
            const h = Astro.raDecToHorizon(frame, seg[k][0], seg[k][1]);
            const p = P.project(h.alt, h.az);
            if (!p) { prev = null; continue; }
            if (prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); }
            prev = p;
          }
        }
        ctx.stroke();
      }

      /* stars */
      const S = Astro.S, lim = 4.8;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (let i = 0; i < Astro.N; i++) {
        const s = S[i];
        if (s[2] > lim) break;
        Astro.starHorizon(frame, i, pair);
        if (pair[0] < -2) continue;
        const p = P.project(pair[0], pair[1]);
        if (!p || p[0] < -40 || p[0] > W + 40 || p[1] < -40 || p[1] > H + 40) continue;
        const r = Math.max(1.4, (lim - s[2]) * 1.5);
        ctx.fillStyle = Astro.bvColor(s[3]);
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = .22;
        ctx.beginPath(); ctx.arc(p[0], p[1], r * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        hits.push({ x: p[0], y: p[1], r: 22, obj: { type: 'star', i: i } });
        if (s[7] && s[2] < 3.2) {
          ctx.font = '500 11px "IBM Plex Sans", sans-serif';
          ctx.fillStyle = th.text;
          ctx.fillText(s[7], p[0] + r + 5, p[1]);
        }
      }

      /* solar system */
      for (const b of Astro.solarSystem(frame)) {
        const p = P.project(b.alt, b.az);
        if (!p) continue;
        const rr = b.name === 'Sun' || b.name === 'Moon' ? 13 : Math.max(3.5, 6 - b.mag * .6);
        ctx.globalAlpha = .3; ctx.fillStyle = b.tone;
        ctx.beginPath(); ctx.arc(p[0], p[1], rr * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.tone;
        ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
        ctx.font = '600 12px "IBM Plex Sans", sans-serif';
        ctx.fillStyle = th.text;
        ctx.fillText(b.name, p[0] + rr + 6, p[1]);
        hits.push({ x: p[0], y: p[1], r: 26, obj: { type: 'body', name: b.name } });
      }

      /* deep-sky objects worth naming */
      ctx.strokeStyle = th.brass; ctx.lineWidth = 1;
      ctx.font = '400 10px "IBM Plex Mono", monospace';
      for (let i = 0; i < window.DSOS.length; i++) {
        const d = window.DSOS[i];
        if (d[4] > 7.5) continue;
        const h = Astro.raDecToHorizon(frame, d[6], d[7]);
        const p = P.project(h.alt, h.az);
        if (!p) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = th.brass;
        ctx.fillText(d[2] || d[0], p[0] + 9, p[1]);
        hits.push({ x: p[0], y: p[1], r: 20, obj: { type: 'dso', i: i } });
      }

      drawTarget(P, th);
      drawReticle(P, th);
      cb.onReticle(P.centre(), headingSource, hfov);
    }

    function targetHorizon() {
      if (!target || !frame) return null;
      if (target.type === 'star') { Astro.starHorizon(frame, target.i, pair); return { alt: pair[0], az: pair[1] }; }
      if (target.type === 'dso') { const d = window.DSOS[target.i]; return Astro.raDecToHorizon(frame, d[6], d[7]); }
      if (target.type === 'body') {
        try {
          const eq = Astronomy.Equator(target.name, frame.time, frame.obs, true, true);
          const h = Astronomy.Horizon(frame.time, frame.obs, eq.ra, eq.dec, 'normal');
          return { alt: h.altitude, az: h.azimuth };
        } catch (e) { return null; }
      }
      return null;
    }

    function drawTarget(P, th) {
      const h = targetHorizon();
      if (!h) return;
      const c = P.centre();
      /* angular separation between where we point and where the target is */
      const a = enu(c.alt, c.az), b = enu(h.alt, h.az);
      const sep = Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * R2D;
      const near = sep < hfov * 0.35;
      const p = P.project(h.alt, h.az);
      ctx.save();
      if (p) {
        ctx.strokeStyle = near ? th.good : th.brass;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], 26, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(p[0], p[1], 36, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        /* off screen: point an arrow from the centre toward it */
        const d = enu(h.alt, h.az), R = P.basis;
        const rx = dot(d, R.right), uy = dot(d, R.up);
        const ang = Math.atan2(rx, uy);
        ctx.translate(W / 2, H / 2); ctx.rotate(ang);
        ctx.fillStyle = th.brass;
        ctx.beginPath();
        ctx.moveTo(0, -Math.min(W, H) * 0.3);
        ctx.lineTo(-11, -Math.min(W, H) * 0.3 + 22);
        ctx.lineTo(11, -Math.min(W, H) * 0.3 + 22);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = near ? th.good : th.brass;
      const name = target.label || '';
      ctx.fillText(name + '  ' + sep.toFixed(sep < 10 ? 1 : 0) + '° ' +
        (h.alt < 0 ? '(below horizon)' : 'away'), W / 2, H - 78);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    }

    function drawReticle(P, th) {
      ctx.save();
      ctx.strokeStyle = th.text; ctx.globalAlpha = .5; ctx.lineWidth = 1;
      const x = W / 2, y = H / 2;
      ctx.beginPath();
      ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y);
      ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
      ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5);
      ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16);
      ctx.stroke();
      ctx.restore();
    }

    /* --- lifecycle --- */
    async function start() {
      cb.onStatus('Requesting camera…');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false
        });
        video.srcObject = stream;
        await video.play();
        cb.onStatus('');
      } catch (e) {
        cb.onStatus('Camera unavailable — the overlay still works, drag to look around.');
        useManual = true;
      }
      /* iOS needs an explicit permission request, from a user gesture */
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') { useManual = true; cb.onStatus('Motion access denied — drag to look around.'); }
        }
      } catch (e) { useManual = true; }
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
      window.addEventListener('orientationchange', onScreenRotate);
      if (screen.orientation) screen.orientation.addEventListener('change', onScreenRotate);
      onScreenRotate();
      setTimeout(function () {
        if (!haveOrientation) { useManual = true; cb.onStatus('No motion sensors here — drag to look around.'); }
      }, 1500);
      running = true; resize(); draw();
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
      window.removeEventListener('orientationchange', onScreenRotate);
      if (screen.orientation) screen.orientation.removeEventListener('change', onScreenRotate);
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      video.srcObject = null;
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
      start: start, stop: stop, resize: resize, pick: pick,
      get isManual() { return useManual || !haveOrientation; },
      nudge: function (dAz, dAlt) {
        if (useManual || !haveOrientation) {
          manual.az = ((manual.az + dAz) % 360 + 360) % 360;
          manual.alt = Math.max(-80, Math.min(88, manual.alt + dAlt));
        } else {
          azOffset += dAz;
          try { localStorage.setItem('astrowander.azOffset', String(azOffset)); } catch (e) {}
        }
      },
      get azOffset() { return azOffset; },
      resetCalibration: function () {
        azOffset = 0;
        try { localStorage.setItem('astrowander.azOffset', '0'); } catch (e) {}
      },
      get fov() { return hfov; },
      setFov: function (v) {
        hfov = Math.max(25, Math.min(110, v));
        try { localStorage.setItem('astrowander.hfov', String(hfov)); } catch (e) {}
      },
      set target(t) { target = t; },
      get target() { return target; },
      get headingSource() { return headingSource; }
    };
  }

  return { create: create };
})();
