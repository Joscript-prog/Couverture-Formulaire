// ============================================================
//  OUTIL « TRACÉ » — flèche à plusieurs points
//  Partagé par les éditeurs d'annotation de tous les formulaires.
//
//  Chaque éditeur crée son outil avec AnnotTrace.create({...}) en
//  lui donnant accès à sa scène (stage, échelle, taille de la photo)
//  et à ses fonctions (création d'élément, sélection).
//
//  Pose des points :
//   • un appui pose un point ; tant que le doigt reste posé, le point
//     suit le doigt (on voit le segment) et il est posé au relâcher ;
//   • deux doigts (zoom) ne posent rien ;
//   • un 2e appui au même endroit ne crée pas de doublon ; s'il est
//     rapide (double-clic / double-touche), il termine le tracé ;
//   • « Terminer », Entrée, ou un autre outil terminent aussi le tracé.
//
//  Tracé sélectionné :
//   • glisser un point le déplace ; glisser un « + » ajoute un point ;
//   • double-clic / double-touche sur un point le retire ;
//   • glisser le trait déplace tout le tracé (après quelques pixels,
//     pour qu'un simple appui ne le décale pas).
//
//  Données (inchangées) : { type: "polyline", points: [{x,y}…],
//  color, thickness, headSize, owner } en pixels de la photo d'origine.
// ============================================================

(function () {
  "use strict";
  if (window.AnnotTrace) return;

  const SVGNS = "http://www.w3.org/2000/svg";
  const MIN_GAP_PX = 10;        // écran : en dessous, c'est le même point
  const DOUBLE_MS = 450;        // double-clic / double-touche
  const MOVE_THRESHOLD_PX = 5;  // déplacement mini avant de bouger un tracé
  const MID_MIN_PX = 44;        // pas de « + » sur un segment plus court

  const isTouch = () => ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------
  //  GÉOMÉTRIE
  // ------------------------------------------------------------
  function cleanPoints(points) {
    const out = [];
    (points || []).forEach(p => {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
      const last = out[out.length - 1];
      if (!last || dist(last, p) > 0.5) out.push({ x: p.x, y: p.y });
    });
    return out;
  }

  function headLength(d) {
    const t = d.thickness || 6;
    return Math.max(t * 1.8, d.headSize || Math.round(t * 3.2));
  }

  // Corps du trait + triangle de la pointe.
  // La pointe est orientée selon la fin du tracé (on remonte le tracé
  // sur la longueur de la pointe), ce qui reste propre même si le
  // dernier segment est très court.
  function geometry(d) {
    const pts = cleanPoints(d.points);
    if (pts.length < 2) return null;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
    if (total < 1) return null;

    const head = Math.min(headLength(d), total * 0.8);
    const tip = pts[pts.length - 1];

    let remain = head, B = pts[0], prefix = [];
    for (let k = pts.length - 1; k > 0; k--) {
      const a = pts[k - 1], b = pts[k], L = dist(a, b);
      if (L >= remain) {
        const t = L > 0 ? remain / L : 0;
        B = { x: b.x + (a.x - b.x) * t, y: b.y + (a.y - b.y) * t };
        prefix = pts.slice(0, k);
        break;
      }
      remain -= L;
    }

    let dx = tip.x - B.x, dy = tip.y - B.y, dl = Math.hypot(dx, dy);
    if (dl < 0.01) {
      const a = pts[pts.length - 2];
      dx = tip.x - a.x; dy = tip.y - a.y; dl = Math.hypot(dx, dy) || 1;
    }
    const ux = dx / dl, uy = dy / dl;
    const cut = head * 0.6;
    const E = { x: tip.x - ux * cut, y: tip.y - uy * cut };
    const half = head * 0.55;
    const bx = tip.x - ux * head, by = tip.y - uy * head;
    return {
      pts, head,
      body: prefix.concat([B, E]),
      tri: [[tip.x, tip.y], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]]
    };
  }

  // Rendu canvas (export de la photo annotée)
  function drawCanvas(c, d) {
    const g = geometry(d);
    if (!g) return;
    c.save();
    c.beginPath();
    c.moveTo(g.body[0].x, g.body[0].y);
    for (let i = 1; i < g.body.length; i++) c.lineTo(g.body[i].x, g.body[i].y);
    c.strokeStyle = d.color;
    c.lineWidth = d.thickness;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke();
    c.beginPath();
    c.moveTo(g.tri[0][0], g.tri[0][1]);
    c.lineTo(g.tri[1][0], g.tri[1][1]);
    c.lineTo(g.tri[2][0], g.tri[2][1]);
    c.closePath();
    c.fillStyle = d.color;
    c.fill();
    c.restore();
  }

  // ------------------------------------------------------------
  //  STYLES (injectés une seule fois)
  // ------------------------------------------------------------
  function injectCss() {
    if (document.getElementById("annot-trace-css")) return;
    const css = `
      .editor-stage.drawing { cursor: crosshair; touch-action: none; }
      .editor-element.polyline-element { pointer-events: none; outline: none !important; }
      .editor-element.polyline-element .handle { pointer-events: auto; }
      .editor-element.polyline-element .handle.arrow-end { cursor: move; }
      .handle.trace-mid {
        width: 16px; height: 16px; border-radius: 50%;
        background: rgba(255,255,255,0.92); border: 2px solid #2e75b6; color: #2e75b6;
        font: 700 14px/12px Arial, sans-serif; text-align: center; cursor: copy;
        box-sizing: border-box; user-select: none;
      }
      .handle.trace-mid::before { content: "+"; }
      .tool-btn.trace-on { background: #1f4e79 !important; color: #fff !important; border-color: #1f4e79 !important; }
      .trace-bar {
        display: none; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap;
        padding: 10px 20px; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        background: #fff6db; border-top: 3px solid #f2b705;
      }
      .editor-modal.trace-active .editor-footer { display: none !important; }
      .editor-modal.trace-active .trace-bar { display: flex; }
      .trace-bar .trace-info { font-size: 0.9rem; font-weight: 600; color: #5a4300; }
      .trace-bar .trace-btns { display: flex; gap: 8px; flex-wrap: wrap; }
      .trace-bar button {
        min-height: 40px; padding: 8px 14px; border-radius: 6px; cursor: pointer;
        border: 1px solid #c9d3df; background: #fff; color: #1f4e79;
        font: inherit; font-size: 0.9rem; font-weight: 600; touch-action: manipulation;
      }
      .trace-bar button.trace-ok { background: #16a34a; border-color: #16a34a; color: #fff; }
      .trace-bar button:disabled { opacity: 0.45; cursor: not-allowed; }
      @media (max-width: 700px) {
        .trace-bar { padding: 8px 10px; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
        /* hauteur fixe (2 lignes) : la photo ne bouge pas quand le texte change */
        .trace-bar .trace-info { width: 100%; font-size: 0.85rem; line-height: 1.25; min-height: 2.5em; display: flex; align-items: center; }
        .trace-bar .trace-btns { width: 100%; }
        .trace-bar .trace-btns button { flex: 1; padding: 8px 4px; white-space: nowrap; }
        .trace-bar .trace-long, .trace-bar .trace-sym { display: none; }
        .handle.trace-mid { width: 22px; height: 22px; font-size: 18px; line-height: 17px; border-width: 2px; }
      }`;
    const st = document.createElement("style");
    st.id = "annot-trace-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------
  //  FABRIQUE : un outil par éditeur
  // ------------------------------------------------------------
  function create(host) {
    injectCss();

    const stage = () => host.stage();
    const scale = () => host.scale() || 1;
    const size = () => host.size();

    let draw = null;     // tracé en cours
    let bar = null;      // barre « Tracé » (remplace le pied de l'éditeur)
    let bound = false;

    // ---------- Utilitaires SVG ----------
    function node(svg, tag, role) {
      let n = svg.querySelector(`[data-role="${role}"]`);
      if (!n) {
        n = document.createElementNS(SVGNS, tag);
        n.setAttribute("data-role", role);
        svg.appendChild(n);
      }
      return n;
    }

    // Enveloppe couvrant toute la photo + SVG en coordonnées naturelles.
    // Les nœuds SVG sont réutilisés (jamais recréés) : un nœud touché
    // reste en place pendant le glisser, même sur iPhone / iPad.
    function prepare(wrapper) {
      const { w, h } = size();
      const s = scale();
      wrapper.style.left = "0";
      wrapper.style.top = "0";
      wrapper.style.width = (w * s) + "px";
      wrapper.style.height = (h * s) + "px";
      wrapper.style.transform = "none";
      wrapper.style.pointerEvents = "none";
      wrapper.style.outline = "none";
      let svg = wrapper.querySelector("svg.trace-svg");
      if (!svg) {
        svg = document.createElementNS(SVGNS, "svg");
        svg.setAttribute("class", "trace-svg");
        Object.assign(svg.style, {
          position: "absolute", left: "0", top: "0", width: "100%", height: "100%",
          overflow: "visible", pointerEvents: "none"
        });
        wrapper.insertBefore(svg, wrapper.firstChild);
      }
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      return svg;
    }

    function hitWidth(thickness) {
      const t = isTouch();
      return Math.max((t ? 44 : 30) / Math.max(scale(), 0.05), thickness * (t ? 6 : 4));
    }

    function paintTrace(svg, d, opts) {
      const g = geometry(d);
      const body = node(svg, "polyline", "body");
      const tri = node(svg, "polygon", "head");
      const hit = node(svg, "polyline", "hit");
      const box = node(svg, "rect", "box");
      // ordre d'empilement : trait, pointe, zone de clic, cadre
      [body, tri, hit, box].forEach(n => svg.appendChild(n));

      if (!g) {
        [body, tri, hit, box].forEach(n => n.setAttribute("display", "none"));
        return null;
      }
      [body, tri].forEach(n => n.removeAttribute("display"));

      body.setAttribute("points", g.body.map(p => `${p.x},${p.y}`).join(" "));
      body.setAttribute("fill", "none");
      body.setAttribute("stroke", d.color);
      body.setAttribute("stroke-width", d.thickness);
      body.setAttribute("stroke-linecap", "round");
      body.setAttribute("stroke-linejoin", "round");
      tri.setAttribute("points", g.tri.map(p => p.join(",")).join(" "));
      tri.setAttribute("fill", d.color);

      const interactive = !!opts.interactive;
      body.style.pointerEvents = interactive ? "stroke" : "none";
      tri.style.pointerEvents = interactive ? "auto" : "none";
      body.style.cursor = tri.style.cursor = interactive ? "grab" : "";

      if (interactive) {
        hit.removeAttribute("display");
        hit.setAttribute("points", g.pts.map(p => `${p.x},${p.y}`).join(" "));
        hit.setAttribute("fill", "none");
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute("stroke-width", hitWidth(d.thickness));
        hit.setAttribute("stroke-linecap", "round");
        hit.setAttribute("stroke-linejoin", "round");
        hit.style.pointerEvents = "stroke";
        hit.style.cursor = "grab";
      } else {
        hit.setAttribute("display", "none");
      }

      if (opts.selected) {
        const s = scale();
        const xs = g.pts.map(p => p.x), ys = g.pts.map(p => p.y);
        const pad = g.head;
        box.removeAttribute("display");
        box.setAttribute("x", Math.min(...xs) - pad);
        box.setAttribute("y", Math.min(...ys) - pad);
        box.setAttribute("width", Math.max(...xs) - Math.min(...xs) + pad * 2);
        box.setAttribute("height", Math.max(...ys) - Math.min(...ys) + pad * 2);
        box.setAttribute("fill", "none");
        box.setAttribute("stroke", "#2e75b6");
        box.setAttribute("stroke-width", 2 / s);
        box.setAttribute("stroke-dasharray", `${6 / s},${4 / s}`);
        box.style.pointerEvents = "none";
      } else {
        box.setAttribute("display", "none");
      }
      return g;
    }

    // ---------- Rendu d'un tracé posé ----------
    function render(wrapper, d) {
      const svg = prepare(wrapper);
      paintTrace(svg, d, { interactive: true, selected: wrapper.classList.contains("selected") });
      wrapper.style.zIndex = wrapper.classList.contains("selected") ? "5" : "";
    }

    // ---------- Poignées d'un tracé sélectionné ----------
    function addHandles(el) {
      [...el.querySelectorAll(".handle")].forEach(h => h.remove());
      const data = el._data;
      const n = data.points.length;

      // « + » au milieu de chaque segment (insérés avant les points : les
      // points restent au-dessus)
      const mids = [];
      for (let i = 0; i < n - 1; i++) {
        const m = document.createElement("div");
        m.className = "handle trace-mid";
        m.title = "Ajouter un point ici";
        el.appendChild(m);
        m.addEventListener("pointerdown", (e) => insertPoint(e, el, i));
        mids.push(m);
      }

      const pts = data.points.map((p, i) => {
        const h = document.createElement("div");
        h.className = "handle arrow-end";
        const last = i === n - 1;
        // la pointe : anneau (la pointe de flèche reste visible dessous)
        h.style.background = last ? "transparent" : "#fff";
        h.style.border = last ? "3px solid #2e75b6" : "2px solid #2e75b6";
        if (last) h.style.boxShadow = "0 0 0 2px #fff, inset 0 0 0 1px #fff";
        h.title = i === 0 ? "Départ du tracé" : (last ? "Pointe du tracé" : "Point du tracé");
        el.appendChild(h);
        h.addEventListener("pointerdown", (e) => onPointHandle(e, el, i, h));
        return h;
      });

      const del = document.createElement("div");
      del.className = "handle delete arrow-delete";
      del.textContent = "✕";
      del.title = "Supprimer le tracé";
      el.appendChild(del);
      del.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (host.remove) host.remove(el);
      });

      function place() {
        const sc = scale();
        const at = (h, x, y) => {
          const half = (h.offsetWidth || 16) / 2;
          h.style.left = (x * sc - half) + "px";
          h.style.top = (y * sc - half) + "px";
        };
        data.points.forEach((p, i) => pts[i] && at(pts[i], p.x, p.y));
        mids.forEach((m, i) => {
          const a = data.points[i], b = data.points[i + 1];
          if (!a || !b) return;
          const show = dist(a, b) * sc >= MID_MIN_PX;
          m.style.display = show ? "" : "none";
          at(m, (a.x + b.x) / 2, (a.y + b.y) / 2);
        });
        // bouton supprimer : au-dessus du point de départ, côté opposé au 2e point
        const p0 = data.points[0], p1 = data.points[1] || p0;
        const side = p1.x >= p0.x ? -1 : 1;
        const dw = del.offsetWidth || 16;
        del.style.left = (p0.x * sc + side * 26 - dw / 2) + "px";
        del.style.top = (p0.y * sc - 30 - dw / 2) + "px";
        del.style.right = "auto";
      }
      place();
      el._placeArrowHandles = place;
    }

    function refresh(el) {
      render(el, el._data);
      if (el._placeArrowHandles) el._placeArrowHandles();
    }

    // ---------- Glisser (capture sur la scène : fiable au doigt) ----------
    function track(e, onMove, onEnd) {
      const st = stage();
      const id = e.pointerId;
      try { st.setPointerCapture(id); } catch (_) { /* rien */ }
      function move(ev) { if (ev.pointerId === id) onMove(ev); }
      function end(ev) {
        if (ev.pointerId !== id) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        try { st.releasePointerCapture(id); } catch (_) { /* rien */ }
        if (onEnd) onEnd(ev);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    }

    function dragPoint(e, el, i) {
      const data = el._data;
      const { w, h } = size();
      const sx = e.clientX, sy = e.clientY;
      const ox = data.points[i].x, oy = data.points[i].y;
      track(e, (ev) => {
        const sc = scale();
        data.points[i].x = clamp(ox + (ev.clientX - sx) / sc, 0, w);
        data.points[i].y = clamp(oy + (ev.clientY - sy) / sc, 0, h);
        refresh(el);
      });
    }

    function onPointHandle(e, el, i, h) {
      e.stopPropagation();
      e.preventDefault();
      const now = performance.now();
      const data = el._data;
      if (h._lastDown && now - h._lastDown < DOUBLE_MS && data.points.length > 2) {
        data.points.splice(i, 1);
        render(el, data);
        addHandles(el);
        return;
      }
      h._lastDown = now;
      dragPoint(e, el, i);
    }

    function insertPoint(e, el, i) {
      e.stopPropagation();
      e.preventDefault();
      const data = el._data;
      const a = data.points[i], b = data.points[i + 1];
      data.points.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      render(el, data);
      addHandles(el);
      dragPoint(e, el, i + 1);
    }

    // Déplacement du tracé entier (appelé par l'éditeur au pointerdown sur le trait)
    function startMove(e, el) {
      const data = el._data;
      const sx = e.clientX, sy = e.clientY;
      const orig = data.points.map(p => ({ x: p.x, y: p.y }));
      let moving = false;
      track(e, (ev) => {
        const ddx = ev.clientX - sx, ddy = ev.clientY - sy;
        if (!moving && Math.hypot(ddx, ddy) < MOVE_THRESHOLD_PX) return;
        moving = true;
        const sc = scale();
        data.points.forEach((p, k) => { p.x = orig[k].x + ddx / sc; p.y = orig[k].y + ddy / sc; });
        refresh(el);
      });
    }

    // ------------------------------------------------------------
    //  MODE DESSIN
    // ------------------------------------------------------------
    function toolButton() { return document.getElementById("toolAddPolyline"); }
    function modal() { const st = stage(); return st ? st.closest(".editor-modal") : null; }

    function ensureBar() {
      if (bar && document.body.contains(bar)) return bar;
      const m = modal();
      if (!m) return null;
      bar = document.createElement("div");
      bar.className = "trace-bar";
      bar.setAttribute("role", "status");
      bar.setAttribute("aria-live", "polite");
      bar.innerHTML =
        '<span class="trace-info"></span>' +
        '<span class="trace-btns">' +
        '<button type="button" data-trace="undo"><span class="trace-sym" aria-hidden="true">↶ </span>Retirer<span class="trace-long"> le dernier point</span></button>' +
        '<button type="button" data-trace="cancel"><span class="trace-sym" aria-hidden="true">✕ </span>Abandonner</button>' +
        '<button type="button" data-trace="ok" class="trace-ok"><span class="trace-sym" aria-hidden="true">✓ </span>Terminer</button>' +
        '</span>';
      const footer = m.querySelector(".editor-footer");
      if (footer) m.insertBefore(bar, footer); else m.appendChild(bar);
      bar.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-trace]");
        if (!b) return;
        const a = b.dataset.trace;
        if (a === "undo") undo();
        else if (a === "cancel") cancel();
        else if (a === "ok") finish();
      });
      return bar;
    }

    function updateBar() {
      const m = modal();
      const btn = toolButton();
      if (btn) btn.classList.toggle("trace-on", !!draw);
      if (!draw) { if (m) m.classList.remove("trace-active"); return; }
      const b = ensureBar();
      if (m) m.classList.add("trace-active");
      if (!b) return;
      const n = draw.points.length;
      const touch = isTouch();
      const info = b.querySelector(".trace-info");
      info.textContent = n === 0
        ? (touch ? "Tracé : touchez la photo pour poser le départ." : "Tracé : cliquez sur la photo pour poser le départ.")
        : n === 1
          ? "Tracé : posez le point suivant."
          : (touch ? `Tracé : ${n} points. Touchez deux fois le dernier pour finir.`
                   : `Tracé : ${n} points. Double-cliquez sur le dernier (ou Entrée) pour finir.`);
      b.querySelector('[data-trace="undo"]').disabled = n === 0;
      b.querySelector('[data-trace="ok"]').disabled = n < 2;
    }

    function stagePoint(ev) {
      const st = stage();
      const r = st.getBoundingClientRect();
      const { w, h } = size();
      const sc = scale();
      return { x: clamp((ev.clientX - r.left) / sc, 0, w), y: clamp((ev.clientY - r.top) / sc, 0, h) };
    }

    function renderPreview() {
      if (!draw) return;
      const svg = prepare(draw.el);
      const s = scale();
      const pts = draw.points;
      const ghost = draw.pending || draw.hover;
      const style = draw.style;

      paintTrace(svg, { points: pts, color: style.color, thickness: style.thickness, headSize: style.headSize },
        { interactive: false, selected: false });

      // segment en attente (pointillés) vers le doigt / la souris
      const rubber = node(svg, "line", "rubber");
      const last = pts[pts.length - 1];
      if (ghost && last) {
        rubber.removeAttribute("display");
        rubber.setAttribute("x1", last.x); rubber.setAttribute("y1", last.y);
        rubber.setAttribute("x2", ghost.x); rubber.setAttribute("y2", ghost.y);
        rubber.setAttribute("stroke", style.color);
        rubber.setAttribute("stroke-width", Math.max(style.thickness * 0.6, 2 / s));
        rubber.setAttribute("stroke-dasharray", `${8 / s},${6 / s}`);
        rubber.setAttribute("stroke-linecap", "round");
        rubber.setAttribute("opacity", draw.pending ? "0.9" : "0.55");
      } else {
        rubber.setAttribute("display", "none");
      }

      // repères des points (pas sur la pointe : elle doit rester visible)
      let dots = svg.querySelector('[data-role="dots"]');
      if (!dots) {
        dots = document.createElementNS(SVGNS, "g");
        dots.setAttribute("data-role", "dots");
      }
      svg.appendChild(dots);
      dots.innerHTML = "";
      const r = Math.max(style.thickness * 0.75, 5 / s);
      const sw = Math.max(2 / s, style.thickness * 0.35);
      pts.forEach((p, i) => {
        const isTip = i === pts.length - 1 && pts.length >= 2;
        if (isTip) return;
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
        c.setAttribute("r", i === 0 ? r * 1.25 : r);
        c.setAttribute("fill", i === 0 ? "#ffffff" : style.color);
        c.setAttribute("stroke", style.color);
        c.setAttribute("stroke-width", sw);
        dots.appendChild(c);
      });
      if (ghost) {
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", ghost.x); c.setAttribute("cy", ghost.y);
        c.setAttribute("r", r * 1.4);
        c.setAttribute("fill", "rgba(255,255,255,0.5)");
        c.setAttribute("stroke", style.color);
        c.setAttribute("stroke-width", sw);
        c.setAttribute("opacity", draw.pending ? "1" : "0.6");
        dots.appendChild(c);
      }
    }

    function start() {
      if (draw) { commit(); return; }          // le bouton sert aussi à terminer
      const st = stage();
      if (!st || !size().w) return;
      bindStage();
      if (host.select) host.select(null);
      const el = document.createElement("div");
      el.className = "editor-element polyline-element trace-preview";
      st.appendChild(el);
      draw = {
        el, points: [], pending: null, hover: null, multi: false,
        pointers: new Set(), lastAt: 0,
        style: Object.assign({ color: "#FF0000", thickness: 6, headSize: 19, owner: null }, host.style ? host.style() : {})
      };
      if (!draw.style.headSize) draw.style.headSize = Math.round(draw.style.thickness * 3.2);
      st.classList.add("drawing");
      updateBar();
      renderPreview();
    }

    function setStyle(s) {
      if (!draw || !s) return;
      Object.assign(draw.style, s);
      renderPreview();
    }

    function commitPoint(p) {
      const pts = draw.points;
      const last = pts[pts.length - 1];
      const now = performance.now();
      if (last && dist(last, p) * scale() < MIN_GAP_PX) {
        // même endroit : pas de doublon ; si c'est rapide → on termine
        if (now - draw.lastAt < DOUBLE_MS && pts.length >= 2) finish();
        return;
      }
      pts.push({ x: p.x, y: p.y });
      draw.lastAt = now;
      updateBar();
    }

    function undo() {
      if (!draw || !draw.points.length) return;
      draw.points.pop();
      updateBar();
      renderPreview();
    }

    function finish() {
      if (!draw || draw.points.length < 2) return;
      const d = draw;
      end();
      const data = {
        type: "polyline",
        points: d.points.map(p => ({ x: p.x, y: p.y })),
        color: d.style.color,
        thickness: d.style.thickness,
        headSize: d.style.headSize,
        owner: d.style.owner || null
      };
      host.create(data);
    }

    function end() {
      if (draw && draw.el) draw.el.remove();
      const st = stage();
      if (st) st.classList.remove("drawing");
      draw = null;
      updateBar();
    }

    function cancel() { end(); }

    // Termine proprement (si au moins 2 points) ou abandonne
    function commit() {
      if (!draw) return;
      if (draw.points.length >= 2) finish(); else end();
    }

    // ---------- Événements de la scène (posés une seule fois) ----------
    function bindStage() {
      if (bound) return;
      const st = stage();
      if (!st) return;
      bound = true;

      st.addEventListener("pointerdown", (e) => {
        if (!draw) return;
        e.stopPropagation();
        e.preventDefault();
        draw.pointers.add(e.pointerId);
        if (draw.pointers.size > 1) {        // deux doigts : on ne pose rien
          draw.multi = true;
          draw.pending = null;
          renderPreview();
          return;
        }
        draw.multi = false;
        try { st.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
        draw.pending = Object.assign(stagePoint(e), { id: e.pointerId });
        draw.hover = null;
        renderPreview();
      }, true);

      st.addEventListener("pointermove", (e) => {
        if (!draw) return;
        if (draw.pending && e.pointerId === draw.pending.id) {
          Object.assign(draw.pending, stagePoint(e));
          renderPreview();
        } else if (e.pointerType === "mouse" && !e.buttons) {
          draw.hover = stagePoint(e);
          renderPreview();
        }
      });

      const release = (e, ok) => {
        if (!draw) return;
        draw.pointers.delete(e.pointerId);
        const p = draw.pending;
        if (p && p.id === e.pointerId) {
          draw.pending = null;
          if (ok && !draw.multi) {
            if (isFinite(e.clientX) && (e.clientX || e.clientY)) Object.assign(p, stagePoint(e));
            commitPoint(p);
            if (!draw) return;               // double-touche : le tracé est terminé
          }
        }
        if (!draw.pointers.size) draw.multi = false;
        renderPreview();
      };
      // sur window : le relâcher est vu même hors de la photo
      window.addEventListener("pointerup", (e) => release(e, true));
      window.addEventListener("pointercancel", (e) => release(e, false));
      st.addEventListener("pointerleave", (e) => {
        if (draw && e.pointerType === "mouse" && !draw.pending) { draw.hover = null; renderPreview(); }
      });
      // pas de menu contextuel (appui long) pendant le tracé
      st.addEventListener("contextmenu", (e) => { if (draw) e.preventDefault(); });
    }

    // Clavier : Entrée = terminer, Échap = abandonner, Retour arrière = retirer le dernier point.
    // En phase de capture pour passer avant les raccourcis de l'éditeur (Échap = fermer…).
    window.addEventListener("keydown", (e) => {
      if (!draw) return;
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Enter" && !typing) { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if ((e.key === "Backspace" || e.key === "Delete") && !typing) { e.preventDefault(); e.stopPropagation(); undo(); }
    }, true);

    // Un autre outil de la barre latérale termine le tracé en cours
    document.addEventListener("click", (e) => {
      if (!draw) return;
      const b = e.target.closest && e.target.closest(".editor-toolbar button, .editor-toolbar .tool-btn, .editor-toolbar [data-add-asset]");
      if (!b || b.id === "toolAddPolyline") return;
      commit();
    }, true);

    window.addEventListener("resize", () => { if (draw) renderPreview(); });

    // Texte d'aide du panneau « Élément sélectionné »
    function syncPanel(data) {
      const help = document.querySelector("#selPanelArrow .small-help");
      if (!help) return;
      if (help.dataset.arrowHelp === undefined) help.dataset.arrowHelp = help.textContent;
      help.textContent = (data && data.type === "polyline")
        ? (isTouch()
          ? "Glissez un point pour le déplacer, un « + » pour ajouter un point. Touchez deux fois un point pour le retirer."
          : "Glissez un point pour le déplacer, un « + » pour ajouter un point. Double-cliquez sur un point pour le retirer.")
        : help.dataset.arrowHelp;
    }

    // Branchement du bouton « Tracé »
    function bindButton() {
      const btn = toolButton();
      if (btn && !btn._traceBound) {
        btn._traceBound = true;
        btn.addEventListener("click", start);
      }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindButton);
    else bindButton();

    return {
      start, cancel, commit, finish, setStyle,
      isDrawing: () => !!draw,
      render, addHandles, startMove, syncPanel,
      drawCanvas
    };
  }

  window.AnnotTrace = { create, geometry, drawCanvas };
})();
