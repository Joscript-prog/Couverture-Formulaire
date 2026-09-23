// ============================================================
//  ÉDITEUR D'ANNOTATION DE PHOTOS — version CÂBLAGE WI-FI
//  Même base que l'éditeur v3 des autres formulaires (flèches,
//  cercles, textes, déplacement / redimensionnement / rotation),
//  avec en plus :
//   • « Je trace pour » : chaque borne a sa couleur. Les flèches et
//     les tracés prennent automatiquement la couleur de la borne
//     active (ou le gris pour un cheminement commun).
//   • Outil TRACÉ multi-points (pointe de flèche au dernier point).
//   • Asset BORNE Wi-Fi : pastille + nom de la borne (toujours à jour).
//   • Asset BAIE : rectangle plein = existante, pointillés = à installer.
//   • Export JPEG (bien plus léger que PNG) + rendu « à froid »
//     (renderPhoto) pour remettre à jour les noms des bornes.
//
//  Le lien avec le formulaire passe par window.WifiBridge (app.js).
// ============================================================

const Editor = (function () {
  // ---- État de l'éditeur ----
  let currentPhotoKey = null;
  let stageEl = null;
  let bgPhotoEl = null;
  let elements = [];              // [{el, data}]
  let selectedEl = null;
  let stageW = 0, stageH = 0;     // taille naturelle de la photo (px)
  let scale = 1;
  let ctx = { kind: "other" };    // contexte : plan | borne | other
  let activeOwner = null;         // id de borne, "commun" ou null
  let draw = null;                // tracé en cours { points, el, owner, color, thickness }
  let pendingRemovals = [];       // bornes à retirer d'autres plans (appliqué à l'enregistrement)

  const SVGNS = "http://www.w3.org/2000/svg";
  const FREE_COLOR = "#FF0000";
  const BAIE_COLOR = "#1F3864";

  // ---- Lien avec le formulaire ----
  function bridge() { return window.WifiBridge || null; }
  function ownerInfo(id) {
    const b = bridge();
    return (b && id) ? b.getOwner(id) : null;
  }
  function usesOwners() { return !!bridge() && (ctx.kind === "plan" || ctx.kind === "borne"); }
  function activeColor() {
    const o = ownerInfo(activeOwner);
    return o ? o.color : FREE_COLOR;
  }
  function defaultThickness() {
    return Math.max(4, Math.round(Math.max(stageW, stageH) / 250));
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---- Miniatures des assets PNG (s'il y en a) ----
  function initThumbnails() {
    if (typeof ANNOTATION_ASSETS === "undefined") return;
    Object.keys(ANNOTATION_ASSETS).forEach(key => {
      const img = document.getElementById("thumb_" + key);
      if (img) img.src = ANNOTATION_ASSETS[key];
    });
  }

  // ============================================================
  //  OUVERTURE / FERMETURE
  // ============================================================
  function open(photoKey, label, context) {
    currentPhotoKey = photoKey;
    ctx = context || { kind: "other" };
    pendingRemovals = [];
    document.getElementById("editorTitle").textContent = label;

    stageEl = document.getElementById("editorStage");
    bgPhotoEl = document.getElementById("editorBgPhoto");

    cancelDraw();
    elements = [];
    selectedEl = null;
    [...stageEl.querySelectorAll(".editor-element")].forEach(e => e.remove());
    hideSelectionPanel();

    const photo = photoStore[photoKey];
    if (!photo) return;

    setupOwnerPanel();

    const srcUrl = photo.originalDataUrl || photo.dataUrl;
    bgPhotoEl.onload = () => {
      stageW = bgPhotoEl.naturalWidth;
      stageH = bgPhotoEl.naturalHeight;
      fitStage();
      if (Array.isArray(photo.annotations)) {
        photo.annotations.forEach(d => recreateElementFromData(d));
      }
    };
    bgPhotoEl.src = srcUrl;

    document.getElementById("editorOverlay").classList.add("shown");
  }

  function close() {
    cancelDraw();
    document.getElementById("editorOverlay").classList.remove("shown");
    currentPhotoKey = null;
    pendingRemovals = [];
  }

  function fitStage() {
    const wrap = document.getElementById("editorCanvasWrap");
    const padding = 40;
    const availW = wrap.clientWidth - padding;
    const availH = wrap.clientHeight - padding;
    scale = Math.min(availW / stageW, availH / stageH, 1.5);
    stageEl.style.width = (stageW * scale) + "px";
    stageEl.style.height = (stageH * scale) + "px";
    bgPhotoEl.style.width = "100%";
    bgPhotoEl.style.height = "100%";
  }

  // ============================================================
  //  « JE TRACE POUR » — borne active
  // ============================================================
  function setupOwnerPanel() {
    const panel = document.getElementById("ownerPanel");
    const toolBorne = document.getElementById("toolAddBorne");
    if (!panel) return;
    if (!usesOwners()) {
      panel.style.display = "none";
      if (toolBorne) toolBorne.style.display = "none";
      activeOwner = null;
      return;
    }
    panel.style.display = "block";
    if (toolBorne) toolBorne.style.display = "";
    fillOwnerSelect(document.getElementById("ownerSelect"), { withPlacement: ctx.kind === "plan" });
    setActiveOwner(bridge().defaultOwner(ctx, activeOwner));
  }

  function fillOwnerSelect(sel, opts = {}) {
    if (!sel) return;
    sel.innerHTML = "";
    if (opts.withFree) {
      const f = document.createElement("option");
      f.value = "";
      f.textContent = "Couleur libre (non attribuée)";
      sel.appendChild(f);
    }
    const owners = bridge().getOwners();
    let lastGroup = null, group = null;
    owners.forEach(o => {
      if (o.niveauNom !== lastGroup) {
        group = document.createElement("optgroup");
        group.label = o.niveauNom;
        sel.appendChild(group);
        lastGroup = o.niveauNom;
      }
      const opt = document.createElement("option");
      opt.value = o.id;
      let txt = "● " + o.nom;
      if (opts.withPlacement) {
        const pl = bridge().findPlanPlacement(o.id, currentPhotoKey);
        if (pl && !pendingRemovals.some(r => r.borneId === o.id)) txt += "  (posée sur " + pl.label + ")";
      }
      opt.textContent = txt;
      opt.style.color = o.color;
      group.appendChild(opt);
    });
    const commun = bridge().getOwner("commun");
    const c = document.createElement("option");
    c.value = "commun";
    c.textContent = "● " + commun.nom + " (gris)";
    c.style.color = commun.color;
    sel.appendChild(c);
  }

  function setActiveOwner(id) {
    const valid = id && ownerInfo(id) ? id : "commun";
    activeOwner = valid;
    const sel = document.getElementById("ownerSelect");
    if (sel) sel.value = valid;
    const o = ownerInfo(valid);
    const chip = document.getElementById("ownerChip");
    if (chip && o) chip.style.background = o.color;
    const btn = document.getElementById("toolAddBorne");
    if (btn) {
      const isBorne = valid !== "commun";
      btn.disabled = !isBorne;
      btn.textContent = isBorne ? `📶 Poser « ${o.nom} »` : "📶 Poser la borne (choisissez une borne)";
    }
    if (draw) {
      draw.owner = valid;
      draw.color = o ? o.color : FREE_COLOR;
      renderDrawPreview();
    }
  }

  // ============================================================
  //  RECRÉATION DES ÉLÉMENTS (ré-édition)
  // ============================================================
  function registerElement(wrapper, data, doSelect) {
    wrapper.dataset.uid = uid();
    wrapper._data = data;
    stageEl.appendChild(wrapper);
    elements.push({ el: wrapper, data });
    attachHandlers(wrapper);
    applyTransform(wrapper, data);
    if (doSelect) select(wrapper);
  }

  function recreateElementFromData(d) {
    if (!d || !d.type) return;
    const data = JSON.parse(JSON.stringify(d));

    if (data.type === "image") {
      const wrapper = document.createElement("div");
      wrapper.className = "editor-element";
      const img = document.createElement("img");
      img.src = data.src;
      img.draggable = false;
      wrapper.appendChild(img);
      registerElement(wrapper, data, false);
    } else if (data.type === "text") {
      createTextElement(data, false);
    } else if (data.type === "arrow") {
      const wrapper = document.createElement("div");
      wrapper.className = "editor-element arrow-element";
      registerElement(wrapper, data, false);
    } else if (data.type === "polyline") {
      createPolylineElement(data, false);
    } else if (data.type === "borne") {
      createMarkerElement(data, false);
    } else if (data.type === "baie") {
      createBaieElement(data, false);
    }
  }

  // ============================================================
  //  AJOUT D'ÉLÉMENTS
  // ============================================================
  function addAsset(assetKey) {
    if (typeof ANNOTATION_ASSETS === "undefined") return;
    const src = ANNOTATION_ASSETS[assetKey];
    if (!src) return;
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element";
    const img = document.createElement("img");
    img.src = src;
    img.draggable = false;
    wrapper.appendChild(img);
    const initialNatW = stageW * 0.25;
    const data = {
      type: "image", src, assetKey,
      x: stageW * 0.4, y: stageH * 0.4,
      w: initialNatW, h: initialNatW,
      rotation: 0, flipH: false, flipV: false
    };
    img.onload = () => {
      data.h = data.w * (img.naturalHeight / img.naturalWidth);
      applyTransform(wrapper, data);
    };
    registerElement(wrapper, data, true);
  }

  // ---- Texte ----
  function createTextElement(data, doSelect) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element text-element";
    wrapper.textContent = data.text;
    applyTextStyle(wrapper, data);
    registerElement(wrapper, data, doSelect);
    wrapper.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const newText = prompt("Modifier le texte :", data.text);
      if (newText !== null && newText.trim() !== "") {
        data.text = newText;
        wrapper.textContent = newText;
        if (selectedEl === wrapper) addHandles(wrapper);
      }
    });
  }

  function addText() {
    const text = document.getElementById("textInput").value.trim();
    if (!text) {
      alert("Tapez d'abord un texte dans le champ.");
      return;
    }
    const data = {
      type: "text",
      text,
      font: document.getElementById("textFont").value,
      size: parseInt(document.getElementById("textSize").value, 10) || 20,
      color: document.getElementById("textColor").value,
      stroke: document.getElementById("textStroke").value,
      bold: document.getElementById("textBold").checked,
      shadow: document.getElementById("textShadow").checked,
      x: stageW * 0.3,
      y: stageH * 0.5,
      rotation: 0
    };
    createTextElement(data, true);
  }

  // ---- Flèche simple (2 points) ----
  function addArrow() {
    const lastArrow = elements.slice().reverse().find(e => e.data && e.data.type === "arrow");
    const owner = usesOwners() ? activeOwner : null;
    const color = owner ? activeColor() : (lastArrow ? lastArrow.data.color : FREE_COLOR);
    const thickness = lastArrow ? lastArrow.data.thickness : defaultThickness();
    const headSize = lastArrow ? lastArrow.data.headSize : Math.round(thickness * 3.2);

    const data = {
      type: "arrow",
      x1: stageW * 0.35, y1: stageH * 0.5,
      x2: stageW * 0.65, y2: stageH * 0.5,
      color, thickness, headSize, owner
    };
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element arrow-element";
    registerElement(wrapper, data, true);
  }

  // ---- Cercle ----
  function addCircle() {
    const color = usesOwners() ? activeColor() : FREE_COLOR;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-width="6"/>
    </svg>`;
    const dataUrl = "data:image/svg+xml;base64," + btoa(svg);
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element";
    const img = document.createElement("img");
    img.src = dataUrl;
    img.draggable = false;
    wrapper.appendChild(img);
    const initialNatW = stageW * 0.12;
    const data = {
      type: "image", src: dataUrl, assetKey: "_circle",
      x: stageW * 0.44, y: stageH * 0.44,
      w: initialNatW, h: initialNatW,
      rotation: 0, flipH: false, flipV: false
    };
    registerElement(wrapper, data, true);
  }

  // ---- Borne Wi-Fi (pastille + nom) ----
  function addBorneMarker() {
    if (!usesOwners() || !activeOwner || activeOwner === "commun") {
      alert("Choisissez d'abord une borne dans la liste « Je trace pour ».");
      return;
    }
    const o = ownerInfo(activeOwner);
    // Déjà posée sur ce plan ? → on la sélectionne
    const here = elements.find(it => it.data.type === "borne" && it.data.owner === activeOwner);
    if (here && ctx.kind === "plan") {
      select(here.el);
      alert(`« ${o.nom} » est déjà posée sur ce plan (elle vient d'être sélectionnée).`);
      return;
    }
    // Déjà posée sur un AUTRE plan ? → proposer de la déplacer
    if (ctx.kind === "plan") {
      const pl = bridge().findPlanPlacement(activeOwner, currentPhotoKey);
      if (pl && !pendingRemovals.some(r => r.borneId === activeOwner)) {
        const ok = confirm(`« ${o.nom} » est déjà posée sur « ${pl.label} ».\n\nLa déplacer sur ce plan ?\n(Elle sera retirée de l'autre plan à l'enregistrement.)`);
        if (!ok) return;
        pendingRemovals.push({ key: pl.key, borneId: activeOwner });
        fillOwnerSelect(document.getElementById("ownerSelect"), { withPlacement: true });
        document.getElementById("ownerSelect").value = activeOwner;
      }
    }
    const size = Math.max(44, Math.round(Math.max(stageW, stageH) * 0.05));
    const data = {
      type: "borne",
      owner: activeOwner,
      label: o.nom,
      color: o.color,
      x: stageW * 0.5,
      y: stageH * 0.5,
      size
    };
    createMarkerElement(data, true);
  }

  function createMarkerElement(data, doSelect) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element borne-marker";
    wrapper.innerHTML = `<svg class="bm-icon" viewBox="0 0 100 100" xmlns="${SVGNS}"></svg><div class="bm-label"></div>`;
    registerElement(wrapper, data, doSelect);
  }

  // ---- Baie (rectangle) ----
  function addBaie(existante) {
    const w = Math.round(stageW * 0.09);
    const h = Math.round(stageW * 0.06);
    const data = {
      type: "baie",
      existante: !!existante,
      x: stageW * 0.5 - w / 2,
      y: stageH * 0.5 - h / 2,
      w, h,
      lw: Math.max(3, Math.round(defaultThickness() * 0.7)),
      rotation: 0
    };
    createBaieElement(data, true);
  }

  function createBaieElement(data, doSelect) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element baie-element";
    wrapper.innerHTML = `<div class="baie-box"><span class="baie-title">BAIE</span><span class="baie-sub">à installer</span></div>`;
    registerElement(wrapper, data, doSelect);
  }

  // ============================================================
  //  OUTIL TRACÉ (multi-points)
  // ============================================================
  function startDraw() {
    if (draw) return;
    select(null);
    const el = document.createElement("div");
    el.className = "editor-element polyline-element draw-preview";
    stageEl.appendChild(el);
    const owner = usesOwners() ? activeOwner : null;
    draw = {
      points: [],
      el,
      owner,
      color: owner ? activeColor() : FREE_COLOR,
      thickness: defaultThickness()
    };
    stageEl.classList.add("drawing");
    updateDrawBar();
  }

  function addDrawPoint(clientX, clientY) {
    if (!draw) return;
    const r = stageEl.getBoundingClientRect();
    const x = clamp((clientX - r.left) / scale, 0, stageW);
    const y = clamp((clientY - r.top) / scale, 0, stageH);
    draw.points.push({ x, y });
    renderDrawPreview();
    updateDrawBar();
  }

  function undoDrawPoint() {
    if (!draw || !draw.points.length) return;
    draw.points.pop();
    renderDrawPreview();
    updateDrawBar();
  }

  function finishDraw() {
    if (!draw) return;
    if (draw.points.length < 2) {
      alert("Touchez le plan à au moins 2 endroits pour créer un tracé.");
      return;
    }
    const d = draw;
    cancelDraw();
    const data = {
      type: "polyline",
      points: d.points.map(p => ({ x: p.x, y: p.y })),
      color: d.color,
      thickness: d.thickness,
      headSize: Math.round(d.thickness * 3.2),
      owner: d.owner
    };
    createPolylineElement(data, true);
  }

  function cancelDraw() {
    if (draw && draw.el) draw.el.remove();
    draw = null;
    if (stageEl) stageEl.classList.remove("drawing");
    updateDrawBar();
  }

  function updateDrawBar() {
    const bar = document.getElementById("drawBar");
    if (!bar) return;
    if (!draw) { bar.classList.remove("shown"); return; }
    bar.classList.add("shown");
    const n = draw.points.length;
    const info = document.getElementById("drawBarInfo");
    if (info) {
      info.textContent = n === 0
        ? "Tracé : touchez le plan pour placer le premier point (départ côté baie)."
        : `Tracé : ${n} point${n > 1 ? "s" : ""} — continuez, puis « Terminer ».`;
    }
    const undo = document.getElementById("drawUndoBtn");
    if (undo) undo.disabled = n === 0;
    const fin = document.getElementById("drawFinishBtn");
    if (fin) fin.disabled = n < 2;
  }

  function renderDrawPreview() {
    if (!draw) return;
    const el = draw.el;
    const svg = prepareFullStageSvg(el);
    const pts = draw.points;
    if (pts.length >= 2) {
      drawPolylineSvg(svg, { points: pts, color: draw.color, thickness: draw.thickness, headSize: Math.round(draw.thickness * 3.2) }, false);
    }
    pts.forEach((p, i) => {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", Math.max(draw.thickness * 0.9, 6 / scale));
      c.setAttribute("fill", i === 0 ? "#ffffff" : draw.color);
      c.setAttribute("stroke", draw.color);
      c.setAttribute("stroke-width", Math.max(2, draw.thickness * 0.4));
      svg.appendChild(c);
    });
  }

  function createPolylineElement(data, doSelect) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-element polyline-element";
    registerElement(wrapper, data, doSelect);
  }

  // ============================================================
  //  RENDU DOM
  // ============================================================
  function applyTextStyle(el, s) {
    el.style.fontFamily = s.font;
    el.style.fontSize = (s.size * scale) + "px";
    el.style.color = s.color;
    el.style.fontWeight = s.bold ? "900" : "400";
    el.dataset.naturalSize = s.size;
    const strokes = [
      `-1px -1px 0 ${s.stroke}`, `1px -1px 0 ${s.stroke}`,
      `-1px 1px 0 ${s.stroke}`, `1px 1px 0 ${s.stroke}`,
      `0 -1px 0 ${s.stroke}`, `0 1px 0 ${s.stroke}`,
      `-1px 0 0 ${s.stroke}`, `1px 0 0 ${s.stroke}`
    ];
    if (s.shadow) strokes.push(`2px 2px 4px rgba(0,0,0,0.6)`);
    el.style.textShadow = strokes.join(", ");
  }

  function applyTransform(el, data) {
    switch (data.type) {
      case "arrow":    renderArrow(el, data); return;
      case "polyline": renderPolyline(el, data); return;
      case "borne":    renderMarker(el, data); return;
      case "baie":     renderBaie(el, data); return;
    }
    el.style.left = (data.x * scale) + "px";
    el.style.top = (data.y * scale) + "px";
    if (data.type === "image") {
      el.style.width = (data.w * scale) + "px";
      el.style.height = (data.h * scale) + "px";
    } else {
      el.style.fontSize = (data.size * scale) + "px";
    }
    let transform = `rotate(${data.rotation || 0}deg)`;
    if (data.type === "image") {
      const sx = data.flipH ? -1 : 1;
      const sy = data.flipV ? -1 : 1;
      if (sx !== 1 || sy !== 1) transform += ` scale(${sx}, ${sy})`;
    }
    el.style.transform = transform;
  }

  // Wrapper couvrant toute la scène + SVG en coordonnées naturelles
  function prepareFullStageSvg(wrapper) {
    wrapper.style.left = "0";
    wrapper.style.top = "0";
    wrapper.style.width = (stageW * scale) + "px";
    wrapper.style.height = (stageH * scale) + "px";
    wrapper.style.transform = "none";
    wrapper.style.pointerEvents = "none";
    let svg = wrapper.querySelector("svg.full-stage");
    if (!svg) {
      svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("class", "full-stage");
      svg.style.position = "absolute";
      svg.style.left = "0";
      svg.style.top = "0";
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.overflow = "visible";
      svg.style.pointerEvents = "none";
      wrapper.insertBefore(svg, wrapper.firstChild);
    }
    svg.setAttribute("viewBox", `0 0 ${stageW} ${stageH}`);
    svg.innerHTML = "";
    return svg;
  }

  // Géométrie d'une pointe de flèche entre (x1,y1) → (x2,y2)
  function headGeom(x1, y1, x2, y2, thickness, headSize) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const head = Math.max(thickness * 1.8, headSize);
    const shrink = Math.min(head * 0.6, len * 0.3);
    const tx = len > 0 ? x1 + dx * (1 - shrink / len) : x2;
    const ty = len > 0 ? y1 + dy * (1 - shrink / len) : y2;
    const ang = Math.atan2(dy, dx);
    const halfBase = head * 0.55;
    const baseX = x2 - Math.cos(ang) * head;
    const baseY = y2 - Math.sin(ang) * head;
    return {
      len, head, tx, ty,
      tri: [
        [x2, y2],
        [baseX + Math.cos(ang + Math.PI / 2) * halfBase, baseY + Math.sin(ang + Math.PI / 2) * halfBase],
        [baseX - Math.cos(ang + Math.PI / 2) * halfBase, baseY - Math.sin(ang + Math.PI / 2) * halfBase]
      ]
    };
  }

  function hitWidth(thickness) {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return Math.max((isTouch ? 44 : 30) / Math.max(scale, 0.05), thickness * (isTouch ? 6 : 4));
  }

  function selectionBox(svg, minX, minY, maxX, maxY) {
    const box = document.createElementNS(SVGNS, "rect");
    box.setAttribute("x", minX);
    box.setAttribute("y", minY);
    box.setAttribute("width", maxX - minX);
    box.setAttribute("height", maxY - minY);
    box.setAttribute("fill", "none");
    box.setAttribute("stroke", "#2e75b6");
    box.setAttribute("stroke-width", 2 / scale);
    box.setAttribute("stroke-dasharray", `${6 / scale},${4 / scale}`);
    box.style.pointerEvents = "none";
    svg.appendChild(box);
  }

  // ---- Flèche simple ----
  function renderArrow(wrapper, d) {
    const svg = prepareFullStageSvg(wrapper);
    const g = headGeom(d.x1, d.y1, d.x2, d.y2, d.thickness, d.headSize);
    if (g.len < 1) return;

    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("x1", d.x1);
    line.setAttribute("y1", d.y1);
    line.setAttribute("x2", g.tx);
    line.setAttribute("y2", g.ty);
    line.setAttribute("stroke", d.color);
    line.setAttribute("stroke-width", d.thickness);
    line.setAttribute("stroke-linecap", "round");
    line.style.pointerEvents = "stroke";
    line.style.cursor = "grab";
    svg.appendChild(line);

    const tri = document.createElementNS(SVGNS, "polygon");
    tri.setAttribute("points", g.tri.map(p => p.join(",")).join(" "));
    tri.setAttribute("fill", d.color);
    tri.style.pointerEvents = "auto";
    tri.style.cursor = "grab";
    svg.appendChild(tri);

    const hit = document.createElementNS(SVGNS, "line");
    hit.setAttribute("x1", d.x1);
    hit.setAttribute("y1", d.y1);
    hit.setAttribute("x2", d.x2);
    hit.setAttribute("y2", d.y2);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", hitWidth(d.thickness));
    hit.setAttribute("stroke-linecap", "round");
    hit.style.pointerEvents = "stroke";
    hit.style.cursor = "grab";
    svg.appendChild(hit);

    if (wrapper.classList.contains("selected")) {
      selectionBox(svg,
        Math.min(d.x1, d.x2) - g.head, Math.min(d.y1, d.y2) - g.head,
        Math.max(d.x1, d.x2) + g.head, Math.max(d.y1, d.y2) + g.head);
    }
  }

  // ---- Tracé multi-points ----
  function drawPolylineSvg(svg, d, interactive) {
    const pts = d.points;
    if (!pts || pts.length < 2) return;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const g = headGeom(a.x, a.y, b.x, b.y, d.thickness, d.headSize);
    const body = pts.slice(0, -1).map(p => `${p.x},${p.y}`);
    body.push(`${g.tx},${g.ty}`);

    const line = document.createElementNS(SVGNS, "polyline");
    line.setAttribute("points", body.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", d.color);
    line.setAttribute("stroke-width", d.thickness);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    if (interactive) {
      line.style.pointerEvents = "stroke";
      line.style.cursor = "grab";
    }
    svg.appendChild(line);

    if (g.len >= 1) {
      const tri = document.createElementNS(SVGNS, "polygon");
      tri.setAttribute("points", g.tri.map(p => p.join(",")).join(" "));
      tri.setAttribute("fill", d.color);
      if (interactive) {
        tri.style.pointerEvents = "auto";
        tri.style.cursor = "grab";
      }
      svg.appendChild(tri);
    }

    if (interactive) {
      const hit = document.createElementNS(SVGNS, "polyline");
      hit.setAttribute("points", pts.map(p => `${p.x},${p.y}`).join(" "));
      hit.setAttribute("fill", "none");
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", hitWidth(d.thickness));
      hit.setAttribute("stroke-linecap", "round");
      hit.setAttribute("stroke-linejoin", "round");
      hit.style.pointerEvents = "stroke";
      hit.style.cursor = "grab";
      svg.appendChild(hit);
    }
    return g;
  }

  function renderPolyline(wrapper, d) {
    const svg = prepareFullStageSvg(wrapper);
    const g = drawPolylineSvg(svg, d, true);
    if (wrapper.classList.contains("selected") && g) {
      const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);
      selectionBox(svg,
        Math.min(...xs) - g.head, Math.min(...ys) - g.head,
        Math.max(...xs) + g.head, Math.max(...ys) + g.head);
    }
  }

  // ---- Borne Wi-Fi ----
  function markerIconSvg(color) {
    const arc = (r) => {
      const c = Math.SQRT1_2;
      return `<path d="M ${50 - r * c} ${68 - r * c} A ${r} ${r} 0 0 1 ${50 + r * c} ${68 - r * c}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
    };
    return `<circle cx="50" cy="50" r="46" fill="#ffffff" stroke="${color}" stroke-width="7"/>` +
      arc(14) + arc(26) + arc(38) +
      `<circle cx="50" cy="68" r="6" fill="${color}"/>`;
  }

  function resolveMarker(d) {
    const o = ownerInfo(d.owner);
    return { color: o ? o.color : (d.color || FREE_COLOR), label: o ? o.nom : (d.label || "Borne") };
  }

  function renderMarker(el, d) {
    const { color, label } = resolveMarker(d);
    const s = d.size * scale;
    el.style.left = ((d.x - d.size / 2) * scale) + "px";
    el.style.top = ((d.y - d.size / 2) * scale) + "px";
    el.style.width = s + "px";
    el.style.height = s + "px";
    el.style.transform = "none";
    const icon = el.querySelector(".bm-icon");
    if (icon) icon.innerHTML = markerIconSvg(color);
    const lab = el.querySelector(".bm-label");
    if (lab) {
      const fs = Math.max(10, d.size * 0.42) * scale;
      lab.textContent = label;
      lab.style.background = color;
      lab.style.fontSize = fs + "px";
      lab.style.padding = `${fs * 0.25}px ${fs * 0.45}px`;
      lab.style.borderRadius = `${fs * 0.3}px`;
      lab.style.top = `${s + d.size * 0.08 * scale}px`;
    }
  }

  // ---- Baie ----
  function renderBaie(el, d) {
    el.style.left = (d.x * scale) + "px";
    el.style.top = (d.y * scale) + "px";
    el.style.width = (d.w * scale) + "px";
    el.style.height = (d.h * scale) + "px";
    el.style.transform = `rotate(${d.rotation || 0}deg)`;
    const box = el.querySelector(".baie-box");
    if (box) {
      box.style.borderWidth = Math.max(1, d.lw * scale) + "px";
      box.style.borderStyle = d.existante ? "solid" : "dashed";
    }
    const fs = baieFontSize(d);
    const title = el.querySelector(".baie-title");
    if (title) title.style.fontSize = (fs * scale) + "px";
    const sub = el.querySelector(".baie-sub");
    if (sub) {
      sub.style.display = d.existante ? "none" : "block";
      sub.style.fontSize = (fs * 0.45 * scale) + "px";
    }
  }

  function baieFontSize(d) {
    return Math.max(8, Math.min(d.w * 0.26, d.h * (d.existante ? 0.45 : 0.36)));
  }

  // ============================================================
  //  SÉLECTION + POIGNÉES
  // ============================================================
  function isLineType(t) { return t === "arrow" || t === "polyline"; }

  function select(el) {
    if (selectedEl) {
      selectedEl.classList.remove("selected");
      [...selectedEl.querySelectorAll(".handle")].forEach(h => h.remove());
      if (selectedEl._data && isLineType(selectedEl._data.type)) {
        applyTransform(selectedEl, selectedEl._data);
      }
    }
    selectedEl = el;
    if (!el) {
      hideSelectionPanel();
      return;
    }
    el.classList.add("selected");
    const t = el._data.type;
    if (t === "arrow") {
      renderArrow(el, el._data);
      addArrowHandles(el);
    } else if (t === "polyline") {
      renderPolyline(el, el._data);
      addPolylineHandles(el);
    } else {
      addHandles(el);
    }
    showSelectionPanel(el._data);
  }

  function addHandles(el) {
    [...el.querySelectorAll(".handle")].forEach(h => h.remove());
    const t = el._data.type;
    const r = document.createElement("div");
    r.className = "handle resize";
    el.appendChild(r);
    r.addEventListener("pointerdown", startResize);

    if (t !== "borne") {
      const rot = document.createElement("div");
      rot.className = "handle rotate";
      rot.title = "Pivoter";
      el.appendChild(rot);
      rot.addEventListener("pointerdown", startRotate);
    }

    const d = document.createElement("div");
    d.className = "handle delete";
    d.textContent = "✕";
    d.title = "Supprimer";
    el.appendChild(d);
    d.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      deleteElement(el);
    });
  }

  function makePointHandle(el, filled) {
    const h = document.createElement("div");
    h.className = "handle arrow-end";
    h.style.background = filled ? "#2e75b6" : "#fff";
    h.style.border = filled ? "2px solid #fff" : "2px solid #2e75b6";
    el.appendChild(h);
    return h;
  }

  function placeAt(h, x, y) {
    const half = (h.offsetWidth || 16) / 2;
    h.style.left = (x * scale - half) + "px";
    h.style.top = (y * scale - half) + "px";
  }

  function makeDeleteHandle(el) {
    const del = document.createElement("div");
    del.className = "handle delete arrow-delete";
    del.textContent = "✕";
    del.title = "Supprimer";
    el.appendChild(del);
    del.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      deleteElement(el);
    });
    return del;
  }

  function addArrowHandles(el) {
    const data = el._data;
    const h1 = makePointHandle(el, false);
    const h2 = makePointHandle(el, true);
    h2.title = "Pointe de la flèche";
    const del = makeDeleteHandle(el);
    function placeHandles() {
      placeAt(h1, data.x1, data.y1);
      placeAt(h2, data.x2, data.y2);
      const mx = (data.x1 + data.x2) / 2;
      const my = Math.min(data.y1, data.y2);
      del.style.left = (mx * scale - 8) + "px";
      del.style.top = (my * scale - 28) + "px";
    }
    placeHandles();
    el._placeArrowHandles = placeHandles;
    h1.addEventListener("pointerdown", (e) => startPointDrag(e, el, (x, y) => { data.x1 = x; data.y1 = y; }, [data.x1, data.y1]));
    h2.addEventListener("pointerdown", (e) => startPointDrag(e, el, (x, y) => { data.x2 = x; data.y2 = y; }, [data.x2, data.y2]));
  }

  function addPolylineHandles(el) {
    const data = el._data;
    const hs = data.points.map((p, i) => {
      const h = makePointHandle(el, i === data.points.length - 1);
      h.title = i === 0 ? "Départ du tracé" : (i === data.points.length - 1 ? "Arrivée (pointe)" : "Point du tracé");
      h.addEventListener("pointerdown", (e) => {
        startPointDrag(e, el, (x, y) => { data.points[i].x = x; data.points[i].y = y; }, [data.points[i].x, data.points[i].y]);
      });
      return h;
    });
    const del = makeDeleteHandle(el);
    function placeHandles() {
      data.points.forEach((p, i) => placeAt(hs[i], p.x, p.y));
      const p0 = data.points[0];
      del.style.left = (p0.x * scale + 12) + "px";
      del.style.top = (p0.y * scale - 34) + "px";
    }
    placeHandles();
    el._placeArrowHandles = placeHandles;
  }

  function startPointDrag(e, el, setter, origin) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const [ox, oy] = origin;
    function onMove(ev) {
      const nx = clamp(ox + (ev.clientX - startX) / scale, 0, stageW);
      const ny = clamp(oy + (ev.clientY - startY) / scale, 0, stageH);
      setter(nx, ny);
      applyTransform(el, el._data);
      if (el._placeArrowHandles) el._placeArrowHandles();
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function deleteElement(el) {
    elements = elements.filter(it => it.el !== el);
    el.remove();
    if (selectedEl === el) {
      selectedEl = null;
      hideSelectionPanel();
    }
  }

  // ============================================================
  //  PANNEAU « ÉLÉMENT SÉLECTIONNÉ »
  // ============================================================
  function showSelectionPanel(data) {
    const panel = document.getElementById("selectionPanel");
    if (!panel) return;
    const show = (id, on) => {
      const e = document.getElementById(id);
      if (e) e.style.display = on ? "block" : "none";
    };
    panel.style.display = "block";
    show("selPanelImage", data.type === "image");
    show("selPanelArrow", isLineType(data.type));
    show("selPanelBaie", data.type === "baie");
    show("selPanelBorne", data.type === "borne");
    show("selOwnerRow", isLineType(data.type) && usesOwners());

    if (data.type === "image") {
      document.getElementById("flipHBtn").classList.toggle("active", !!data.flipH);
      document.getElementById("flipVBtn").classList.toggle("active", !!data.flipV);
    } else if (isLineType(data.type)) {
      document.getElementById("selArrowColor").value = data.color;
      document.getElementById("selArrowThickness").value = data.thickness;
      document.getElementById("selArrowHeadSize").value = data.headSize;
      if (usesOwners()) {
        const sel = document.getElementById("selOwnerSelect");
        fillOwnerSelect(sel, { withFree: true });
        sel.value = (data.owner && ownerInfo(data.owner)) ? data.owner : "";
      }
    } else if (data.type === "baie") {
      document.getElementById("baieExistBtn").classList.toggle("active", !!data.existante);
      document.getElementById("baieNewBtn").classList.toggle("active", !data.existante);
    } else if (data.type === "borne") {
      const info = document.getElementById("selBorneInfo");
      if (info) info.textContent = resolveMarker(data).label;
    }
  }

  function hideSelectionPanel() {
    const panel = document.getElementById("selectionPanel");
    if (panel) panel.style.display = "none";
  }

  // ============================================================
  //  DRAG / RESIZE / ROTATE
  // ============================================================
  function attachHandlers(el) {
    el.addEventListener("pointerdown", (e) => {
      if (draw) return;
      if (e.target.classList && e.target.classList.contains("handle")) return;
      e.stopPropagation();
      e.preventDefault();
      select(el);
      if (isLineType(el._data.type)) startLineDrag(e, el);
      else startDrag(e, el);
    });
  }

  function startDrag(e, el) {
    const data = el._data;
    const startX = e.clientX, startY = e.clientY;
    const origX = data.x, origY = data.y;
    function onMove(ev) {
      data.x = origX + (ev.clientX - startX) / scale;
      data.y = origY + (ev.clientY - startY) / scale;
      applyTransform(el, data);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startLineDrag(e, el) {
    const data = el._data;
    const startX = e.clientX, startY = e.clientY;
    const orig = data.type === "arrow"
      ? { x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2 }
      : { points: data.points.map(p => ({ x: p.x, y: p.y })) };
    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (data.type === "arrow") {
        data.x1 = orig.x1 + dx; data.y1 = orig.y1 + dy;
        data.x2 = orig.x2 + dx; data.y2 = orig.y2 + dy;
      } else {
        data.points.forEach((p, i) => { p.x = orig.points[i].x + dx; p.y = orig.points[i].y + dy; });
      }
      applyTransform(el, data);
      if (el._placeArrowHandles) el._placeArrowHandles();
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startResize(e) {
    e.stopPropagation();
    e.preventDefault();
    const el = selectedEl;
    if (!el) return;
    const data = el._data;
    const startX = e.clientX, startY = e.clientY;
    const orig = JSON.parse(JSON.stringify(data));

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (data.type === "image") {
        const ratio = orig.h / orig.w;
        data.w = Math.max(20, orig.w + dx);
        data.h = data.w * ratio;
      } else if (data.type === "borne") {
        data.size = Math.max(20, orig.size + dx * 2);
        data.x = orig.x;
        data.y = orig.y;
      } else if (data.type === "baie") {
        data.w = Math.max(20, orig.w + dx);
        data.h = Math.max(14, orig.h + dy);
      } else {
        data.size = Math.max(10, orig.size + dx * 0.5);
      }
      applyTransform(el, data);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startRotate(e) {
    e.stopPropagation();
    e.preventDefault();
    const el = selectedEl;
    if (!el) return;
    const data = el._data;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const origRot = data.rotation || 0;
    function onMove(ev) {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
      data.rotation = origRot + (a - startAngle);
      applyTransform(el, data);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ---- Clic sur la scène : désélection, ou ajout d'un point de tracé ----
  function setupStageClick() {
    const stage = document.getElementById("editorStage");
    // Phase de capture : en mode tracé, tout appui ajoute un point
    // (même par-dessus un élément existant).
    stage.addEventListener("pointerdown", (e) => {
      if (!draw) return;
      e.stopPropagation();
      e.preventDefault();
      addDrawPoint(e.clientX, e.clientY);
    }, true);
    stage.addEventListener("pointerdown", (e) => {
      if (draw) return;
      if (e.target === stageEl || e.target === bgPhotoEl) select(null);
    });
  }

  function setupKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (!document.getElementById("editorOverlay").classList.contains("shown")) return;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      if (draw) {
        if (e.key === "Escape") { e.preventDefault(); cancelDraw(); }
        else if (e.key === "Enter") { e.preventDefault(); finishDraw(); }
        else if ((e.key === "Backspace" || e.key === "Delete") && !typing) { e.preventDefault(); undoDrawPoint(); }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEl) {
        if (typing) return;
        e.preventDefault();
        deleteElement(selectedEl);
      }
      if (e.key === "Escape") close();
    });
  }

  function updateTextPreview() {
    const prev = document.getElementById("textPreview");
    if (!prev) return;
    const txt = document.getElementById("textInput").value || "Aperçu";
    const s = {
      font: document.getElementById("textFont").value,
      size: parseInt(document.getElementById("textSize").value, 10) || 20,
      color: document.getElementById("textColor").value,
      stroke: document.getElementById("textStroke").value,
      bold: document.getElementById("textBold").checked,
      shadow: document.getElementById("textShadow").checked
    };
    prev.textContent = txt;
    const keepScale = scale;
    scale = 1;
    applyTextStyle(prev, s);
    scale = keepScale;
    prev.style.fontSize = Math.min(s.size, 30) + "px";
  }

  // ============================================================
  //  RENDU CANVAS (export et rendu « à froid »)
  // ============================================================
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image"));
      img.src = src;
    });
  }

  async function drawAll(c, anns) {
    for (const d of anns) {
      if (!d || !d.type) continue;
      if (d.type === "image") await drawImageEl(c, d);
      else if (d.type === "text") drawTextEl(c, d);
      else if (d.type === "arrow") drawArrowEl(c, d);
      else if (d.type === "polyline") drawPolylineEl(c, d);
      else if (d.type === "borne") drawMarkerEl(c, d);
      else if (d.type === "baie") drawBaieEl(c, d);
    }
  }

  async function renderToCanvas(bgSrc, w, h, anns) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d");
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, w, h);
    const img = await loadImage(bgSrc);
    c.drawImage(img, 0, 0, w, h);
    await drawAll(c, anns);
    return canvas;
  }

  async function exportAnnotated() {
    const anns = elements.map(it => it.data);
    return renderToCanvas(bgPhotoEl.src, stageW, stageH, anns);
  }

  function drawImageEl(c, d) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        c.save();
        c.translate(d.x + d.w / 2, d.y + d.h / 2);
        c.rotate((d.rotation || 0) * Math.PI / 180);
        const sx = d.flipH ? -1 : 1;
        const sy = d.flipV ? -1 : 1;
        if (sx !== 1 || sy !== 1) c.scale(sx, sy);
        c.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
        c.restore();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = d.src;
    });
  }

  function drawTextEl(c, d) {
    c.save();
    c.font = `${d.bold ? "900" : "400"} ${d.size}px ${d.font}`;
    c.textBaseline = "top";
    const textW = c.measureText(d.text).width;
    const textH = d.size * 1.1;
    c.translate(d.x + textW / 2, d.y + textH / 2);
    c.rotate((d.rotation || 0) * Math.PI / 180);
    if (d.shadow) {
      c.shadowColor = "rgba(0,0,0,0.6)";
      c.shadowBlur = 4;
      c.shadowOffsetX = 2;
      c.shadowOffsetY = 2;
    }
    c.lineWidth = Math.max(2, d.size / 12);
    c.strokeStyle = d.stroke;
    c.lineJoin = "round";
    c.miterLimit = 2;
    c.strokeText(d.text, -textW / 2, -textH / 2);
    c.shadowColor = "transparent";
    c.fillStyle = d.color;
    c.fillText(d.text, -textW / 2, -textH / 2);
    c.restore();
  }

  function fillTriangle(c, tri, color) {
    c.beginPath();
    c.moveTo(tri[0][0], tri[0][1]);
    c.lineTo(tri[1][0], tri[1][1]);
    c.lineTo(tri[2][0], tri[2][1]);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }

  function drawArrowEl(c, d) {
    const g = headGeom(d.x1, d.y1, d.x2, d.y2, d.thickness, d.headSize);
    if (g.len < 1) return;
    c.save();
    c.beginPath();
    c.moveTo(d.x1, d.y1);
    c.lineTo(g.tx, g.ty);
    c.strokeStyle = d.color;
    c.lineWidth = d.thickness;
    c.lineCap = "round";
    c.stroke();
    fillTriangle(c, g.tri, d.color);
    c.restore();
  }

  function drawPolylineEl(c, d) {
    const pts = d.points || [];
    if (pts.length < 2) return;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const g = headGeom(a.x, a.y, b.x, b.y, d.thickness, d.headSize);
    c.save();
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) c.lineTo(pts[i].x, pts[i].y);
    c.lineTo(g.tx, g.ty);
    c.strokeStyle = d.color;
    c.lineWidth = d.thickness;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke();
    if (g.len >= 1) fillTriangle(c, g.tri, d.color);
    c.restore();
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function drawMarkerEl(c, d) {
    const { color, label } = resolveMarker(d);
    const r = d.size / 2;
    const k = d.size / 100;
    c.save();
    c.translate(d.x - r, d.y - r);
    c.scale(k, k);
    c.beginPath();
    c.arc(50, 50, 46, 0, Math.PI * 2);
    c.fillStyle = "#FFFFFF";
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = color;
    c.stroke();
    c.lineCap = "round";
    [14, 26, 38].forEach(rad => {
      c.beginPath();
      c.arc(50, 68, rad, -3 * Math.PI / 4, -Math.PI / 4);
      c.stroke();
    });
    c.beginPath();
    c.arc(50, 68, 6, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.restore();

    // Étiquette avec le nom de la borne
    const fs = Math.max(10, d.size * 0.42);
    c.save();
    c.font = `bold ${fs}px Arial, sans-serif`;
    const tw = c.measureText(label).width;
    const padX = fs * 0.45, padY = fs * 0.25;
    const bw = tw + padX * 2, bh = fs + padY * 2;
    const bx = d.x - bw / 2;
    const by = d.y + r + d.size * 0.08;
    roundRectPath(c, bx, by, bw, bh, fs * 0.3);
    c.fillStyle = color;
    c.fill();
    c.fillStyle = "#FFFFFF";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, d.x, by + bh / 2 + fs * 0.04);
    c.restore();
  }

  function drawBaieEl(c, d) {
    c.save();
    c.translate(d.x + d.w / 2, d.y + d.h / 2);
    c.rotate((d.rotation || 0) * Math.PI / 180);
    const x = -d.w / 2, y = -d.h / 2;
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillRect(x, y, d.w, d.h);
    c.lineWidth = d.lw;
    c.strokeStyle = BAIE_COLOR;
    if (!d.existante) c.setLineDash([d.lw * 2.5, d.lw * 1.6]);
    c.strokeRect(x + d.lw / 2, y + d.lw / 2, d.w - d.lw, d.h - d.lw);
    c.setLineDash([]);
    const fs = baieFontSize(d);
    c.fillStyle = BAIE_COLOR;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `bold ${fs}px Arial, sans-serif`;
    if (d.existante) {
      c.fillText("BAIE", 0, fs * 0.04);
    } else {
      const sub = fs * 0.45;
      const total = fs + sub * 1.1;
      c.fillText("BAIE", 0, -total / 2 + fs / 2);
      c.font = `italic ${sub}px Arial, sans-serif`;
      c.fillText("à installer", 0, total / 2 - sub / 2);
    }
    c.restore();
  }

  // ---- Rendu « à froid » d'une photo annotée (sans ouvrir l'éditeur) ----
  async function renderPhoto(photo) {
    const src = photo.originalDataUrl || photo.dataUrl;
    const img = await loadImage(src);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = await renderToCanvas(src, w, h, photo.annotations || []);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), width: w, height: h };
  }

  // ============================================================
  //  ENREGISTREMENT
  // ============================================================
  async function save() {
    if (!currentPhotoKey) return;
    if (draw) {
      if (draw.points.length >= 2) finishDraw();
      else cancelDraw();
    }
    const key = currentPhotoKey;
    const photo = photoStore[key];
    if (!photo) return;

    // Libellés à jour dans les données (repli si la borne est supprimée plus tard)
    elements.forEach(it => {
      if (it.data.type === "borne") {
        const r = resolveMarker(it.data);
        it.data.label = r.label;
        it.data.color = r.color;
      }
    });

    const canvas = await exportAnnotated();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    if (!photo.originalDataUrl) photo.originalDataUrl = photo.dataUrl;
    photo.data = dataUrlToBytes(dataUrl);
    photo.type = "jpg";
    photo.dataUrl = dataUrl;
    photo.naturalWidth = stageW;
    photo.naturalHeight = stageH;
    photo.annotated = true;
    photo.annotations = elements.map(e => JSON.parse(JSON.stringify(e.data)));

    const prev = document.getElementById("preview_" + key);
    if (prev) {
      prev.src = dataUrl;
      prev.classList.add("shown");
    }

    const removals = pendingRemovals.slice();
    close();

    const b = bridge();
    for (const r of removals) {
      if (b && b.removeBorneMarker) await b.removeBorneMarker(r.key, r.borneId);
    }
    if (b && b.afterSave) b.afterSave(key);
    if (window.__autosaveSchedule) window.__autosaveSchedule();
  }

  function uid() {
    return "el_" + Math.random().toString(36).slice(2, 9);
  }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(",")[1] || "");
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ============================================================
  //  INIT
  // ============================================================
  let _initDone = false;
  function init() {
    if (_initDone) return;
    if (!document.getElementById("editorStage")) return;
    _initDone = true;

    initThumbnails();
    setupStageClick();
    setupKeyboard();

    const on = (id, evt, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    };

    document.querySelectorAll("[data-add-asset]").forEach(btn => {
      btn.addEventListener("click", () => addAsset(btn.dataset.addAsset));
    });

    on("btnAddText", "click", addText);
    on("toolAddArrow", "click", addArrow);
    on("toolAddPolyline", "click", startDraw);
    on("toolAddCircle", "click", addCircle);
    on("toolAddBorne", "click", addBorneMarker);
    on("toolAddBaieExist", "click", () => addBaie(true));
    on("toolAddBaieNew", "click", () => addBaie(false));
    on("toolAddText", "click", () => {
      const txt = document.getElementById("textInput");
      if (txt && txt.value.trim()) addText();
      else if (txt) {
        txt.focus();
        txt.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    // Barre du tracé
    on("drawUndoBtn", "click", undoDrawPoint);
    on("drawFinishBtn", "click", finishDraw);
    on("drawCancelBtn", "click", cancelDraw);

    // Borne active
    on("ownerSelect", "change", (e) => setActiveOwner(e.target.value));

    // Attribution d'une flèche / d'un tracé sélectionné à une borne
    on("selOwnerSelect", "change", (e) => {
      if (!selectedEl || !isLineType(selectedEl._data.type)) return;
      const v = e.target.value;
      selectedEl._data.owner = v || null;
      if (v) {
        const o = ownerInfo(v);
        if (o) {
          selectedEl._data.color = o.color;
          document.getElementById("selArrowColor").value = o.color;
        }
      }
      applyTransform(selectedEl, selectedEl._data);
    });

    // Baie existante / à installer
    const setBaieState = (existante) => {
      if (!selectedEl || selectedEl._data.type !== "baie") return;
      selectedEl._data.existante = existante;
      applyTransform(selectedEl, selectedEl._data);
      showSelectionPanel(selectedEl._data);
    };
    on("baieExistBtn", "click", () => setBaieState(true));
    on("baieNewBtn", "click", () => setBaieState(false));

    // Aperçu live du texte
    ["textInput", "textFont", "textSize", "textColor", "textStroke", "textBold", "textShadow"].forEach(id => {
      on(id, "input", updateTextPreview);
    });
    document.querySelectorAll(".swatch:not(.sel-arrow-swatch)").forEach(s => {
      s.addEventListener("click", () => {
        document.getElementById("textColor").value = s.dataset.color;
        updateTextPreview();
      });
    });

    // Couleur libre d'une flèche / d'un tracé (détache la borne)
    const applyFreeColor = (color) => {
      if (!selectedEl || !isLineType(selectedEl._data.type)) return;
      selectedEl._data.color = color;
      selectedEl._data.owner = null;
      document.getElementById("selArrowColor").value = color;
      const so = document.getElementById("selOwnerSelect");
      if (so) so.value = "";
      applyTransform(selectedEl, selectedEl._data);
    };
    document.querySelectorAll(".sel-arrow-swatch").forEach(s => {
      s.addEventListener("click", () => applyFreeColor(s.dataset.color));
    });
    on("selArrowColor", "input", (e) => applyFreeColor(e.target.value));
    on("selArrowThickness", "input", (e) => {
      if (!selectedEl || !isLineType(selectedEl._data.type)) return;
      selectedEl._data.thickness = parseInt(e.target.value, 10) || 6;
      applyTransform(selectedEl, selectedEl._data);
    });
    on("selArrowHeadSize", "input", (e) => {
      if (!selectedEl || !isLineType(selectedEl._data.type)) return;
      selectedEl._data.headSize = parseInt(e.target.value, 10) || 18;
      applyTransform(selectedEl, selectedEl._data);
    });

    // Miroirs (images)
    const flipH = document.getElementById("flipHBtn");
    const flipV = document.getElementById("flipVBtn");
    if (flipH) flipH.addEventListener("click", () => {
      if (!selectedEl || selectedEl._data.type !== "image") return;
      selectedEl._data.flipH = !selectedEl._data.flipH;
      flipH.classList.toggle("active", selectedEl._data.flipH);
      applyTransform(selectedEl, selectedEl._data);
    });
    if (flipV) flipV.addEventListener("click", () => {
      if (!selectedEl || selectedEl._data.type !== "image") return;
      selectedEl._data.flipV = !selectedEl._data.flipV;
      flipV.classList.toggle("active", selectedEl._data.flipV);
      applyTransform(selectedEl, selectedEl._data);
    });

    updateTextPreview();

    window.addEventListener("resize", () => {
      if (!currentPhotoKey || !stageW) return;
      fitStage();
      elements.forEach(it => {
        if (it.data.type === "text") applyTextStyle(it.el, it.data);
        applyTransform(it.el, it.data);
        if (it.el === selectedEl) {
          if (it.el._placeArrowHandles) it.el._placeArrowHandles();
        }
      });
      if (draw) renderDrawPreview();
    });
  }

  return { init, open, close, save, renderPhoto };
})();

// =============================================
//  INITIALISATION ET EXPOSITION GLOBALE
// =============================================
if (typeof Editor !== "undefined" && typeof Editor.init === "function") {
  Editor.init();
}
document.addEventListener("DOMContentLoaded", () => {
  if (typeof Editor !== "undefined" && typeof Editor.init === "function") Editor.init();
});

window.closeEditor = function () {
  if (Editor && typeof Editor.close === "function") Editor.close();
};
window.saveAnnotation = function () {
  if (Editor && typeof Editor.save === "function") Editor.save();
};
window.Editor = Editor;
