(() => {
  const D = window.SPECTRA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Media slots: a <video> if the file exists, otherwise a labeled placeholder.
  // Videos load when near the viewport and only play while visible.
  // ---------------------------------------------------------------------------
  const playObserver = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!target.dataset.autoplay) return;
      if (isIntersecting) target.play().catch(() => {});
      else target.pause();
    });
  }, { threshold: 0.25 });

  const loadObserver = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      loadObserver.unobserve(target);
      target._load();
    });
  }, { rootMargin: '400px' });

  function placeholder(el, { video, poster, label }) {
    el.innerHTML = '';
    if (poster) {
      const img = document.createElement('img');
      img.className = 'poster'; img.src = poster; img.alt = '';
      el.appendChild(img);
    }
    const ph = document.createElement('div');
    ph.className = 'ph' + (poster ? ' has-poster' : '');
    ph.innerHTML = `<i class="fas fa-film"></i><span class="ph-label"></span>${video ? '<code></code>' : ''}`;
    ph.querySelector('.ph-label').textContent = label || 'Video coming soon';
    if (video) ph.querySelector('code').textContent = video;
    el.appendChild(ph);
  }

  // opts: { video, poster, label, autoplay = true, loop = true, controls = false, onReady(video) }
  function mountMedia(el, opts) {
    const o = Object.assign({ autoplay: true, loop: true }, opts);
    if (o.controls) Object.assign(o, { autoplay: false, loop: false });
    placeholder(el, o);
    if (!o.video) return;
    el._load = () => {
      // The <video> goes into the page right away: phones (iOS Safari in particular) do not buffer a video that is
      // not in the document, so waiting for 'loadeddata' before inserting it left them on the placeholder for good.
      // muted / playsinline / autoplay must be attributes, not just properties, for iOS to allow autoplay.
      const v = document.createElement('video');
      if (!o.controls) { v.muted = true; v.setAttribute('muted', ''); }
      v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.loop = o.loop; v.preload = o.controls ? 'metadata' : 'auto';
      if (o.poster) v.poster = o.poster;
      if (o.autoplay && !reduceMotion) { v.dataset.autoplay = '1'; v.autoplay = true; v.setAttribute('autoplay', ''); }
      v.addEventListener('error', () => placeholder(el, o), { once: true });   // missing file: back to the placeholder
      v.src = o.video;
      el.innerHTML = '';
      el.appendChild(v);
      if (o.controls) { v.controls = true; o.onReady && o.onReady(v); return; }
      const btn = document.createElement('button');
      btn.className = 'ctrl'; btn.setAttribute('aria-label', 'Play/pause');
      const sync = () => { btn.innerHTML = v.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>'; };
      btn.onclick = () => { v.paused ? v.play() : v.pause(); };
      v.addEventListener('play', sync); v.addEventListener('pause', sync); sync();
      el.appendChild(btn);
      playObserver.observe(v);
      if (o.onReady) v.addEventListener('loadedmetadata', () => o.onReady(v), { once: true });
    };
    loadObserver.observe(el);
  }

  $$('.media[data-video], .media[data-label]').forEach(el => {
    if (document.querySelector(`.chapters[data-for="${el.id}"]`)) return; // mounted with its chapters below
    mountMedia(el, { video: el.dataset.video, poster: el.dataset.poster, label: el.dataset.label,
                     controls: 'controls' in el.dataset });
  });

  // ---------------------------------------------------------------------------
  // Chaptered video
  // ---------------------------------------------------------------------------
  $$('.chapters').forEach(bar => {
    const target = document.getElementById(bar.dataset.for);
    const btns = $$('button', bar);
    const starts = btns.map(b => +b.dataset.t);
    mountMedia(target, {
      video: target.dataset.video, poster: target.dataset.poster, label: target.dataset.label,
      onReady(v) {
        btns.forEach((b, i) => b.onclick = () => { v.currentTime = starts[i] + 0.05; v.play(); });
        v.addEventListener('timeupdate', () => {
          const t = v.currentTime, dur = v.duration || 1;
          btns.forEach((b, i) => {
            const s = starts[i], e = starts[i + 1] ?? dur;
            const f = Math.max(0, Math.min(1, (t - s) / (e - s)));
            b.classList.toggle('on', t >= s && t < e);
            b.style.setProperty('--fill', (f * 100).toFixed(1) + '%');
          });
        });
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Trace explorer: c(t) and Q_path(t) along normalized progress
  // ---------------------------------------------------------------------------
  (function traceExplorer() {
    const svg = $('#trace-svg'), range = $('#trace-range'), playBtn = $('#trace-play');
    if (!svg) return;
    const W = 640, X0 = 44, X1 = 630;
    const C = { top: 34, bot: 140, max: 3 };    // cost panel
    const P = { top: 178, bot: 270 };           // Q_path panel
    const N = 400;
    let cur, video = null, anim = null, prog = 0;

    const lerpCost = (pts, p) => {
      for (let i = 1; i < pts.length; i++) {
        if (p <= pts[i][0]) {
          const [a, ca] = pts[i - 1], [b, cb] = pts[i];
          return ca + (cb - ca) * ((p - a) / (b - a || 1));
        }
      }
      return pts[pts.length - 1][1];
    };

    function prepare(tr) {
      const cost = [], cum = [];
      let s = 0;
      for (let i = 0; i <= N; i++) { const c = lerpCost(tr.cost, i / N); cost.push(c); s += c; cum.push(s); }
      const k = -Math.log(tr.finalQ) / s; // scale so Q_path(1) = reported Q
      tr._cost = cost; tr._q = cum.map(v => Math.exp(-k * v));
    }

    const px = p => X0 + p * (X1 - X0);
    const cy = c => C.bot - (c / C.max) * (C.bot - C.top);
    const qy = q => P.bot - q * (P.bot - P.top);

    function draw(tr) {
      svg.innerHTML = '';
      const phaseColors = ['--phase-1', '--phase-2', '--phase-3', '--phase-4'].map(cssVar);
      // grid + axes
      [0, 1, 2, 3].forEach(v => {
        svgEl('line', { x1: X0, x2: X1, y1: cy(v), y2: cy(v), class: 'gridl' }, svg);
        svgEl('text', { x: X0 - 8, y: cy(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(1);
      });
      [0, 0.5, 1].forEach(v => {
        svgEl('line', { x1: X0, x2: X1, y1: qy(v), y2: qy(v), class: 'gridl' }, svg);
        svgEl('text', { x: X0 - 8, y: qy(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(1);
      });
      svgEl('text', { x: X0, y: C.top - 20, 'font-weight': 600 }, svg).textContent = 'frame cost c(t)';
      svgEl('text', { x: X0, y: P.top - 10, 'font-weight': 600 }, svg).textContent = 'Qpath(t)';
      svgEl('text', { x: (X0 + X1) / 2, y: 296, 'text-anchor': 'middle' }, svg).textContent = 'normalized task progress';
      // phases
      tr.phases.forEach((name, i) => {
        const a = i / 4, b = (i + 1) / 4;
        svgEl('line', { x1: px(b), x2: px(b), y1: C.top - 4, y2: P.bot, stroke: phaseColors[i], 'stroke-width': 1.5, opacity: .55 }, svg);
        const t = svgEl('text', { x: px((a + b) / 2), y: C.top - 6, 'text-anchor': 'middle', 'font-style': 'italic', 'font-weight': 600, fill: phaseColors[i] }, svg);
        t.style.fill = phaseColors[i]; t.textContent = name;
      });
      // cost area + line
      const pts = tr._cost.map((c, i) => `${px(i / N).toFixed(1)},${cy(c).toFixed(1)}`);
      svgEl('path', { d: `M${px(0)},${cy(0)} L${pts.join(' L')} L${px(1)},${cy(0)} Z`, fill: cssVar('--cost-soft') }, svg);
      svgEl('path', { d: `M${pts.join(' L')}`, fill: 'none', stroke: cssVar('--cost'), 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
      // Q_path line
      const qpts = tr._q.map((q, i) => `${px(i / N).toFixed(1)},${qy(q).toFixed(1)}`);
      svgEl('path', { d: `M${qpts.join(' L')}`, fill: 'none', stroke: cssVar('--accent'), 'stroke-width': 2.25 }, svg);
      const qLbl = svgEl('text', { x: X1, y: qy(tr.finalQ) - 10, 'text-anchor': 'end', 'font-weight': 600 }, svg);
      qLbl.style.fill = cssVar('--ink'); qLbl.textContent = `final Q = ${tr.finalQ.toFixed(2)}`;
      // keyframe markers
      tr.keys.forEach((k, i) => {
        const g = svgEl('g', { class: 'kmark', cursor: 'pointer' }, svg);
        const x = px(k.p), y = cy(lerpCost(tr.cost, k.p)) - 16;
        svgEl('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 4, fill: cssVar('--surface'), stroke: cssVar('--cost'), 'stroke-width': 1.5 }, g);
        const t = svgEl('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-weight': 700 }, g);
        t.style.fill = cssVar('--ink'); t.textContent = i + 1;
        svgEl('title', {}, g).textContent = k.label;
        g.addEventListener('click', () => setProgress(k.p, true));
      });
      // cursor
      const cg = svgEl('g', { id: 'trace-cursor', 'pointer-events': 'none' }, svg);
      svgEl('line', { y1: C.top - 4, y2: P.bot, stroke: cssVar('--ink'), 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .6 }, cg);
      svgEl('circle', { r: 5, class: 'cdot', fill: cssVar('--cost'), stroke: cssVar('--surface'), 'stroke-width': 2 }, cg);
      svgEl('circle', { r: 5, class: 'qdot', fill: cssVar('--accent'), stroke: cssVar('--surface'), 'stroke-width': 2 }, cg);
      // pointer scrubbing on the chart (bigger hit target than the line)
      const hit = svgEl('rect', { x: X0, y: 0, width: X1 - X0, height: P.bot, fill: 'transparent', cursor: 'ew-resize' }, svg);
      svg.insertBefore(hit, svg.querySelector('.kmark'));
      const fromEvent = e => {
        const r = svg.getBoundingClientRect();
        return Math.max(0, Math.min(1, ((e.clientX - r.left) / r.width * W - X0) / (X1 - X0)));
      };
      let dragging = false;
      hit.addEventListener('pointerdown', e => { dragging = true; hit.setPointerCapture(e.pointerId); stop(); setProgress(fromEvent(e), true); });
      hit.addEventListener('pointermove', e => { if (dragging) setProgress(fromEvent(e), true); });
      hit.addEventListener('pointerup', () => { dragging = false; });
    }

    function renderKeys(tr) {
      const box = $('#trace-keys');
      box.innerHTML = '';
      tr.keys.forEach((k, i) => {
        const b = document.createElement('button');
        b.innerHTML = `<img src="${k.img}" alt=""><span class="n">${i + 1}</span>`;
        b.title = k.label; b.setAttribute('aria-label', `Keyframe ${i + 1}: ${k.label}`);
        b.onclick = () => { stop(); setProgress(k.p, true); };
        box.appendChild(b);
      });
    }

    // Without a rollout video, the large slot shows the nearest keyframe.
    function showStill(tr, p) {
      const slot = $('#trace-video');
      let idx = 0;
      tr.keys.forEach((k, i) => { if (p >= k.p - 0.04) idx = i; });
      let img = slot.querySelector('img.still');
      if (!img) {
        slot.innerHTML = `<img class="poster still" alt=""><div class="ph has-poster" style="justify-content:flex-end;padding-bottom:1.25rem">
          <span class="ph-label"></span><code></code></div>`;
        img = slot.querySelector('img.still');
        slot.querySelector('code').textContent = `video: ${tr.video}`;
      }
      if (img.getAttribute('src') !== tr.keys[idx].img) img.src = tr.keys[idx].img;
      slot.querySelector('.ph-label').textContent = `${idx + 1}. ${tr.keys[idx].label}`;
    }

    function setProgress(p, fromUser) {
      prog = p;
      const tr = cur, i = Math.round(p * N), c = tr._cost[i], q = tr._q[i];
      range.value = Math.round(p * 1000);
      const cg = $('#trace-cursor');
      cg.querySelector('line').setAttribute('x1', px(p)); cg.querySelector('line').setAttribute('x2', px(p));
      cg.querySelector('.cdot').setAttribute('cx', px(p)); cg.querySelector('.cdot').setAttribute('cy', cy(c));
      cg.querySelector('.qdot').setAttribute('cx', px(p)); cg.querySelector('.qdot').setAttribute('cy', qy(q));
      $('#ro-prog').textContent = Math.round(p * 100) + '%';
      $('#ro-phase').textContent = tr.phases[Math.min(3, Math.floor(p * 4))];
      $('#ro-cost').textContent = c.toFixed(2);
      $('#ro-q').textContent = q.toFixed(2);
      let active = -1;
      tr.keys.forEach((k, j) => { if (p >= k.p - 0.04) active = j; });
      $$('#trace-keys button').forEach((b, j) => b.classList.toggle('on', j === active));
      if (video) { if (fromUser && video.duration) video.currentTime = p * video.duration; }
      else showStill(tr, p);
    }

    function stop() {
      if (anim) cancelAnimationFrame(anim), anim = null;
      if (video) video.pause();
      playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    function play() {
      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      if (prog >= 0.999) setProgress(0, true);
      if (video) { video.play(); return; }
      let last = performance.now();
      const step = now => {
        const p = Math.min(1, prog + (now - last) / 9000); last = now;
        setProgress(p, false);
        if (p < 1) anim = requestAnimationFrame(step); else stop();
      };
      anim = requestAnimationFrame(step);
    }
    playBtn.onclick = () => (anim || (video && !video.paused)) ? stop() : play();
    range.addEventListener('input', () => { stop(); setProgress(range.value / 1000, true); });

    function select(id) {
      stop();
      cur = D.traces[id];
      if (!cur._cost) prepare(cur);
      $$('#trace-tabs button').forEach(b => b.classList.toggle('on', b.dataset.trace === id));
      video = null;
      draw(cur); renderKeys(cur);
      $('#trace-note').textContent = 'Curves traced from Fig. 3 (illustrative). Click a numbered marker to jump to that event.';
      setProgress(0, true);
      // Use the rollout video if it exists
      const slot = $('#trace-video');
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.addEventListener('loadeddata', () => {
        if (cur !== D.traces[id]) return;
        video = v; slot.innerHTML = ''; slot.appendChild(v);
        v.addEventListener('timeupdate', () => { if (!v.paused) setProgress(v.currentTime / v.duration, false); });
        v.addEventListener('ended', stop);
        setProgress(prog, true);
      }, { once: true });
      v.src = cur.video;
    }
    $$('#trace-tabs button').forEach(b => b.onclick = () => select(b.dataset.trace));
    select('place_sphere');
  })();

  // ---------------------------------------------------------------------------
  // Deviation dial (Table I)
  // ---------------------------------------------------------------------------
  (function deviationDial() {
    const dev = D.deviation, chips = $('#dev-tasks'), range = $('#dev-range'), svg = $('#dev-svg');
    if (!chips) return;
    let task = dev.tasks[3]; // PegInsertion
    const degSlug = ['clean', '5', '10', '25', '45'];
    const X0 = 34, X1 = 344, Y0 = 170, Y1 = 14, yMin = 0.4;
    const x = i => X0 + i * (X1 - X0) / 4;
    const y = q => Y0 - (q - yMin) / (1 - yMin) * (Y0 - Y1);

    dev.tasks.forEach(t => {
      const b = document.createElement('button');
      b.textContent = t.id;
      b.onclick = () => { task = t; update(); };
      chips.appendChild(b);
    });

    function drawChart(level) {
      svg.innerHTML = '';
      [0.4, 0.6, 0.8, 1.0].forEach(v => {
        svgEl('line', { x1: X0, x2: X1, y1: y(v), y2: y(v), class: 'gridl' }, svg);
        svgEl('text', { x: X0 - 6, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(1);
      });
      dev.levels.forEach((l, i) => svgEl('text', { x: x(i), y: 190, 'text-anchor': 'middle' }, svg).textContent = l);
      const others = dev.tasks.filter(t => t !== task);
      [...others, task].forEach(t => {
        const sel = t === task;
        const d = 'M' + t.q.map((q, i) => `${x(i)},${y(q)}`).join(' L');
        const g = svgEl('g', { cursor: 'pointer' }, svg);
        svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }, g); // hit target
        svgEl('path', { d, fill: 'none', stroke: sel ? cssVar('--accent') : cssVar('--base'), 'stroke-width': sel ? 2.5 : 1.25, opacity: sel ? 1 : .7 }, g);
        svgEl('title', {}, g).textContent = `${t.id}: ${t.q.map((q, i) => `${dev.levels[i]} ${q.toFixed(2)}`).join(', ')}`;
        g.addEventListener('click', () => { task = t; update(); });
        if (sel) {
          t.q.forEach((q, i) => svgEl('circle', { cx: x(i), cy: y(q), r: i === level ? 6 : 3.5, fill: cssVar('--accent'), stroke: cssVar('--surface'), 'stroke-width': 2 }, svg));
          const lbl = svgEl('text', { x: x(4) - 4, y: y(t.q[4]) + 16, 'text-anchor': 'end', 'font-weight': 600 }, svg);
          lbl.style.fill = cssVar('--ink'); lbl.textContent = t.id;
        }
      });
    }

    function update() {
      const i = +range.value, q = task.q[i];
      $$('button', chips).forEach(b => b.classList.toggle('on', b.textContent === task.id));
      $('#dev-q').textContent = q.toFixed(2);
      $('#dev-qbar').style.width = (q * 100) + '%';
      $('#dev-deg').textContent = dev.levels[i];
      $('#dev-axis').textContent = task.axis;
      drawChart(i);
      const path = dev.video.replace('{task}', task.id).replace('{deg}', degSlug[i]);
      const slot = $('#dev-video');
      if (slot && slot.dataset.src !== path) {
        slot.dataset.src = path;
        mountMedia(slot, { video: path, label: `${task.id}, ${i ? dev.levels[i] + ' ' + task.axis : 'clean execution'}` });
      }
    }
    range.addEventListener('input', update);
    update();
  })();

  // ---------------------------------------------------------------------------
  // Human agreement bars (Table III)
  // ---------------------------------------------------------------------------
  (function humanBars() {
    const H = D.human, sel = $('#hum-task'), box = $('#hum-bars');
    let subset = 'all';
    Object.keys(H.all.rows).forEach(t => { const o = document.createElement('option'); o.value = o.textContent = t; sel.appendChild(o); });
    const lo = -0.7, hi = 1;
    const pct = v => ((v - lo) / (hi - lo)) * 100;

    H.metrics.forEach(m => {
      const row = document.createElement('div');
      row.className = 'bar-row' + (m.id === 'Q' ? ' ours' : '');
      row.dataset.m = m.id;
      row.innerHTML = `<span class="name">${m.label}</span><div class="bar-track"><span class="zero" style="left:${pct(0)}%"></span><span class="bar-fill"></span><span class="bar-val"></span></div>`;
      box.appendChild(row);
    });

    function update() {
      const rows = H[subset].rows, r = rows[sel.value];
      $$('#hum-subset button').forEach(b => b.classList.toggle('on', b.dataset.subset === subset));
      H.metrics.forEach(m => {
        const row = box.querySelector(`[data-m="${m.id}"]`);
        const fill = row.querySelector('.bar-fill'), val = row.querySelector('.bar-val');
        const v = r[m.id];
        const na = v === undefined || Number.isNaN(v);
        row.classList.toggle('na', na);
        if (na) {
          fill.style.left = pct(0) + '%'; fill.style.width = '0%';
          val.style.left = `calc(${pct(0)}% + 8px)`;
          val.textContent = v === undefined ? 'n/a (ignores failure)' : 'undefined (constant score)';
          row.title = '';
          return;
        }
        const a = pct(Math.min(0, v)), b = pct(Math.max(0, v));
        fill.className = 'bar-fill ' + (v < 0 ? 'neg' : 'pos');
        fill.style.left = a + '%'; fill.style.width = (b - a) + '%';
        val.textContent = (v > 0 ? '' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
        val.style.left = v < 0 ? `calc(${a}% - 6px)` : `calc(${b}% + 8px)`;
        val.style.transform = v < 0 ? 'translate(-100%, -50%)' : 'translateY(-50%)';
        row.title = `${m.label}, ${sel.value}: ρ = ${v.toFixed(2)}`;
      });
      $('#hum-note').textContent = subset === 'all'
        ? `N = ${H.all.n} rollouts (81 successful, 24 failed). Path length and jerk don't account for task success, so they are compared on successes only.`
        : `N = ${H.succ.n} successful rollouts: telling good successes from bad ones is the hard part.`;
      // table view
      const ms = H.metrics.filter(m => Object.values(rows)[0][m.id] !== undefined);
      const fmt = v => v === undefined ? '' : Number.isNaN(v) ? '–' : v.toFixed(2);
      $('#hum-table').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Task</th>${ms.map(m => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>${
        Object.entries(rows).map(([t, rr]) => `<tr><td>${t}</td>${ms.map(m => `<td>${fmt(rr[m.id])}</td>`).join('')}</tr>`).join('')
      }</tbody></table></div>`;
    }
    // one rated rollout per task: all of them for "Overall", only the chosen task otherwise
    const vids = $('#hum-videos'), tiles = {};
    (D.rated || []).forEach(r => {
      const f = document.createElement('figure'); f.className = 'rated-item';
      f.innerHTML = `<div class="media"></div><figcaption><b>${r.task}</b><span>human ${r.human.toFixed(1)}/5</span><span class="rq">Q&nbsp;=&nbsp;${r.q.toFixed(2)}</span></figcaption>`;
      vids.appendChild(f);
      mountMedia(f.querySelector('.media'), { video: `static/videos/rated/${r.task}.mp4`, poster: `static/videos/rated/${r.task}.jpg`, label: r.task });
      tiles[r.task] = f;
    });
    const showVideos = () => {
      const one = sel.value !== 'Overall' && tiles[sel.value];
      vids.classList.toggle('single', !!one);
      Object.entries(tiles).forEach(([t, f]) => { f.hidden = !!one && t !== sel.value; });
    };
    $$('#hum-subset button').forEach(b => b.onclick = () => { subset = b.dataset.subset; update(); });
    sel.onchange = () => { update(); showVideos(); };
    update(); showVideos();
  })();

  // ---------------------------------------------------------------------------
  // Demo selection dots (RQ4)
  // ---------------------------------------------------------------------------
  (function selection() {
    const box = $('#selection');
    const dots = n => Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'ok' : ''}" style="transition-delay:${i * 45}ms"></i>`).join('');
    D.selection.forEach(s => {
      const c = document.createElement('div');
      c.className = 'sel-card';
      c.innerHTML = `<h3>${s.task}</h3>
        <div class="sel-row ours"><span>SPECTRA top-100</span><div class="dots">${dots(s.top)}</div><span class="frac">${s.top}/10</span></div>
        <div class="sel-row"><span>Random 100</span><div class="dots">${dots(s.random)}</div><span class="frac">${s.random}/10</span></div>`;
      box.appendChild(c);
    });
    new IntersectionObserver((es, obs) => es.forEach(e => {
      if (e.isIntersecting) { $$('.dots', box).forEach(d => d.classList.add('in')); obs.disconnect(); }
    }), { threshold: 0.4 }).observe(box);
  })();

  // ---------------------------------------------------------------------------
  // Video wall
  // ---------------------------------------------------------------------------
  (function wall() {
    const grid = $('#wall'), taskBox = $('#wall-tasks'), polBox = $('#wall-policy'), sortBox = $('#wall-sort');
    let task = 'All', policy = 'All';
    ['All', ...D.wallTasks].forEach(t => {
      const b = document.createElement('button'); b.textContent = t;
      b.onclick = () => { task = t; render(); }; taskBox.appendChild(b);
    });
    ['All', ...D.wallPolicies].forEach(p => {
      const b = document.createElement('button'); b.textContent = p;
      b.onclick = () => { policy = p; render(); }; polBox.appendChild(b);
    });
    sortBox.onchange = render;

    function render() {
      $$('button', taskBox).forEach(b => b.classList.toggle('on', b.textContent === task));
      $$('button', polBox).forEach(b => b.classList.toggle('on', b.textContent === policy));
      let items = D.wall.filter(w => (task === 'All' || w.task === task) && (policy === 'All' || w.policy === policy));
      if (sortBox.checked) items = [...items].sort((a, b) => (b.q ?? -1) - (a.q ?? -1));
      grid.innerHTML = '';
      items.forEach((w, i) => {
        const f = document.createElement('figure');
        f.className = 'vcard'; f.style.animationDelay = Math.min(i, 12) * 25 + 'ms';
        const q = w.q == null ? '<span class="qbadge empty">Q = ?</span>' : `<span class="qbadge">Q = ${w.q.toFixed(2)}</span>`;
        f.innerHTML = `<div class="media"></div><figcaption><span>${w.task} <span class="meta">· ${w.policy}</span></span>${q}</figcaption>`;
        grid.appendChild(f);
        mountMedia(f.querySelector('.media'), { video: w.video, label: `${w.task} · ${w.policy}` });
      });
    }
    render();
  })();

  // ---------------------------------------------------------------------------
  // Sim/hardware clips: frame cost and Q under each half of the video, cursor on the video's clock
  // ---------------------------------------------------------------------------
  (function simhwPlots() {
    const T = window.SIMHW; if (!T) return;
    const W = 460, H = 178, X0 = 30, X1 = W - 4;
    const C = { top: 22, bot: 74 }, Q = { top: 112, bot: 172 };
    const plots = [];
    $$('.tplots').forEach(box => {
      const d = T[box.dataset.trace]; if (!d) return;
      const cmax = Math.max(1, ...d.sc, ...d.hc);
      const x = i => X0 + (i / (d.sc.length - 1)) * (X1 - X0);
      const cy = v => C.bot - (v / cmax) * (C.bot - C.top);
      const qy = v => Q.bot - v * (Q.bot - Q.top);
      const cursors = [];
      [['sc', 'sq', 'simulation'], ['hc', 'hq', 'hardware']].forEach(([ck, qk, name]) => {
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Frame cost and Q over time, ${name}` }, box);
        [[C, 'frame cost c(t)', [0, cmax]], [Q, 'Q(t)', [0, 1]]].forEach(([P, lbl, [lo, hi]]) => {
          [lo, hi].forEach(v => {
            const y = P === C ? cy(v) : qy(v);
            svgEl('line', { x1: X0, x2: X1, y1: y, y2: y, class: 'gridl' }, svg);
            svgEl('text', { x: X0 - 5, y: y + 3.5, 'text-anchor': 'end' }, svg).textContent = P === C ? Math.round(v) : v.toFixed(1);
          });
          const t = svgEl('text', { x: X0, y: P.top - 8, 'font-weight': 600, class: 'tp-lbl' }, svg); t.textContent = lbl;
        });
        const cp = d[ck].map((v, i) => `${x(i).toFixed(1)},${cy(v).toFixed(1)}`);
        svgEl('path', { d: `M${X0},${cy(0)} L${cp.join(' L')} L${X1},${cy(0)} Z`, fill: cssVar('--cost-soft') }, svg);
        svgEl('path', { d: 'M' + cp.join(' L'), fill: 'none', stroke: cssVar('--cost'), 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, svg);
        const qp = d[qk].map((v, i) => `${x(i).toFixed(1)},${qy(v).toFixed(1)}`);
        svgEl('path', { d: 'M' + qp.join(' L'), fill: 'none', stroke: cssVar('--green'), 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, svg);
        const g = svgEl('g', { 'pointer-events': 'none' }, svg);
        svgEl('line', { y1: C.top - 2, y2: Q.bot, stroke: cssVar('--ink'), 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .55 }, g);
        const dot = svgEl('circle', { r: 4, fill: cssVar('--green'), stroke: cssVar('--surface'), 'stroke-width': 1.5 }, g);
        cursors.push({ g, dot, q: d[qk] });
      });
      plots.push({ d, cursors, x, qy, video: () => document.querySelector(`.media[data-trace-video="${box.dataset.trace}"] video`) });
    });
    const tick = () => {
      plots.forEach(p => {
        const v = p.video(), n = p.d.sc.length;
        const i = v ? Math.min(n - 1, Math.round(v.currentTime / p.d.dt)) : 0;
        p.cursors.forEach(c => {
          c.g.querySelector('line').setAttribute('x1', p.x(i)); c.g.querySelector('line').setAttribute('x2', p.x(i));
          c.dot.setAttribute('cx', p.x(i)); c.dot.setAttribute('cy', p.qy(c.q[i]));
        });
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();

  // ---------------------------------------------------------------------------
  // Page chrome: stats count-up, reveal, nav, BibTeX copy
  // ---------------------------------------------------------------------------
  const countObs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    countObs.unobserve(e.target);
    const el = e.target, to = +el.dataset.count, dec = +(el.dataset.decimals || 0), suf = el.dataset.suffix || '';
    if (reduceMotion) return;
    const t0 = performance.now(), dur = 1100;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * ease).toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: 0.6 });
  $$('[data-count]').forEach(el => countObs.observe(el));

  const revealObs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
  }), { threshold: 0.12 });
  $$('.block .wrap').forEach(el => { el.classList.add('reveal'); revealObs.observe(el); });

  const links = $$('.nav nav a'), sections = links.map(a => $(a.getAttribute('href')));
  const bar = $('.scroll-progress span');
  const onScroll = () => {
    const h = document.documentElement;
    bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
    let idx = -1;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < 120) idx = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === idx));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if ($('#bib-copy')) $('#bib-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('#bib-code').textContent);
      $('#bib-copy').innerHTML = '<i class="fas fa-check"></i> Copied';
    } catch { $('#bib-copy').textContent = 'Select & copy'; }
    setTimeout(() => $('#bib-copy').innerHTML = '<i class="far fa-copy"></i> Copy', 1600);
  };
})();
