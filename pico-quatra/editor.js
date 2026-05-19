// ============================================================
//  ÉDITEUR D'ANNOTATION DE PHOTOS — v3
//  Permet de poser des PNG (mâts, antennes, supports), du texte
//  stylé et des flèches type Excel sur une photo, avec
//  déplacement / redimensionnement / rotation / retournement.
//  À la sauvegarde, exporte en PNG via <canvas>.
// ============================================================

const Editor = (function () {
  // État de l'éditeur
  let currentPhotoKey = null;     // clé du photoStore en cours d'édition
  let stageEl = null;             // élément .editor-stage
  let bgPhotoEl = null;           // <img> de fond
  let elements = [];              // [{el, data}]
  let selectedEl = null;
  let stageW = 0, stageH = 0;     // taille naturelle de la photo (px)
  let scale = 1;                  // facteur d'échelle d'affichage

  // ---- Initialisation des miniatures de la barre d'outils ----
  function initThumbnails() {
    Object.keys(ANNOTATION_ASSETS).forEach(key => {
      const img = document.getElementById("thumb_" + key);
      if (img) img.src = ANNOTATION_ASSETS[key];
    });
  }

  // ---- Ouvrir l'éditeur ----
  function open(photoKey, label) {
    currentPhotoKey = photoKey;
    document.getElementById("editorTitle").textContent = label;

    stageEl = document.getElementById("editorStage");
    bgPhotoEl = document.getElementById("editorBgPhoto");

    // Réinitialiser l'éditeur
    elements = [];
    selectedEl = null;
    [...stageEl.querySelectorAll(".editor-element")].forEach(e => e.remove());
    hideSelectionPanel();

    // Charger la photo de fond
    const photo = photoStore[photoKey];
    if (!photo) return;

    // Si la photo a déjà été annotée, on repart de la photo ORIGINALE en bg
    // et on recréera les annotations par-dessus depuis photo.annotations
    const srcUrl = photo.originalDataUrl || photo.dataUrl;

    bgPhotoEl.onload = () => {
      stageW = bgPhotoEl.naturalWidth;
      stageH = bgPhotoEl.naturalHeight;
      fitStage();

      // ⭐ Restaurer les annotations sauvegardées (si présentes)
      if (photo.annotations && Array.isArray(photo.annotations) && photo.annotations.length > 0) {
        photo.annotations.forEach(d => recreateElementFromData(d));
      }
    };
    bgPhotoEl.src = srcUrl;

    document.getElementById("editorOverlay").classList.add("shown");
  }

  // Recréer un élément à partir de son data (pour la ré-édition)
  function recreateElementFromData(d) {
    if (!d || !d.type) return;
    const data = JSON.parse(JSON.stringify(d)); // clone

    if (data.type === "image") {
      const wrapper = document.createElement("div");
      wrapper.className = "editor-element";
      const img = document.createElement("img");
      img.src = data.src;
      img.draggable = false;
      wrapper.appendChild(img);
      wrapper.dataset.uid = uid();
      wrapper._data = data;
      stageEl.appendChild(wrapper);
      elements.push({ el: wrapper, data });
      attachHandlers(wrapper);
      applyTransform(wrapper, data);
    }
    else if (data.type === "text") {
      const wrapper = document.createElement("div");
      wrapper.className = "editor-element text-element";
      wrapper.textContent = data.text;
      applyTextStyle(wrapper, data);
      wrapper.dataset.uid = uid();
      wrapper._data = data;
      stageEl.appendChild(wrapper);
      elements.push({ el: wrapper, data });
      attachHandlers(wrapper);
      applyTransform(wrapper, data);
      wrapper.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const newText = prompt("Modifier le texte :", data.text);
        if (newText !== null && newText.trim() !== "") {
          data.text = newText;
          wrapper.textContent = newText;
        }
      });
    }
    else if (data.type === "arrow") {
      const wrapper = document.createElement("div");
      wrapper.className = "editor-element arrow-element";
      wrapper.dataset.uid = uid();
      wrapper._data = data;
      stageEl.appendChild(wrapper);
      elements.push({ el: wrapper, data });
      renderArrow(wrapper, data);
      attachHandlers(wrapper);
    }
  }

  // Adapter la taille d'affichage au conteneur
  function fitStage() {
    const wrap = document.getElementById("editorCanvasWrap");
    const padding = 40;
    const availW = wrap.clientWidth - padding;
    const availH = wrap.clientHeight - padding;
    const sW = availW / stageW;
    const sH = availH / stageH;
    scale = Math.min(sW, sH, 1.5); // jamais au-delà de 1.5x
    stageEl.style.width = (stageW * scale) + "px";
    stageEl.style.height = (stageH * scale) + "px";
    bgPhotoEl.style.width = "100%";
    bgPhotoEl.style.height = "100%";
  }

  // ---- Fermer ----
  function close() {
    document.getElementById("editorOverlay").classList.remove("shown");
    currentPhotoKey = null;
  }

  // ============================================================
  //  AJOUT D'ÉLÉMENTS
  // ============================================================

  // ---- Ajouter un asset image (PNG mât/antenne/etc.) ----
  function addAsset(assetKey) {
    const src = ANNOTATION_ASSETS[assetKey];
    if (!src) return;

    const wrapper = document.createElement("div");
    wrapper.className = "editor-element";

    const img = document.createElement("img");
    img.src = src;
    img.draggable = false;
    wrapper.appendChild(img);

    // Taille initiale : largeur = 25% de la photo (en coords naturelles)
    const initialNatW = stageW * 0.25;

    const data = {
      type: "image",
      src: src,
      assetKey: assetKey,
      x: stageW * 0.4,
      y: stageH * 0.4,
      w: initialNatW,
      h: initialNatW,    // recalculé après onload
      rotation: 0,
      flipH: false,
      flipV: false,
    };

    img.onload = () => {
      const ratio = img.naturalHeight / img.naturalWidth;
      data.h = data.w * ratio;
      applyTransform(wrapper, data);
    };

    wrapper.dataset.uid = uid();
    wrapper._data = data;
    stageEl.appendChild(wrapper);
    elements.push({ el: wrapper, data });

    attachHandlers(wrapper);
    select(wrapper);
    applyTransform(wrapper, data);
  }

  // ---- Ajouter un texte (style "WordArt") ----
  function addText() {
    const text = document.getElementById("textInput").value.trim();
    if (!text) {
      alert("Tapez d'abord un texte dans le champ.");
      return;
    }
    const font = document.getElementById("textFont").value;
    const size = parseInt(document.getElementById("textSize").value, 10) || 20;
    const color = document.getElementById("textColor").value;
    const stroke = document.getElementById("textStroke").value;
    const bold = document.getElementById("textBold").checked;
    const shadow = document.getElementById("textShadow").checked;

    const wrapper = document.createElement("div");
    wrapper.className = "editor-element text-element";
    wrapper.textContent = text;
    applyTextStyle(wrapper, { font, size, color, stroke, bold, shadow });

    const data = {
      type: "text",
      text, font, size, color, stroke, bold, shadow,
      x: stageW * 0.3,
      y: stageH * 0.5,
      rotation: 0,
    };

    wrapper.dataset.uid = uid();
    wrapper._data = data;
    stageEl.appendChild(wrapper);
    elements.push({ el: wrapper, data });

    attachHandlers(wrapper);
    select(wrapper);
    applyTransform(wrapper, data);

    // double-clic pour éditer le texte
    wrapper.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const newText = prompt("Modifier le texte :", data.text);
      if (newText !== null && newText.trim() !== "") {
        data.text = newText;
        wrapper.textContent = newText;
      }
    });
  }

  // ---- Ajouter une flèche ----
  function addArrow() {
    // Récupération sécurisée — fallback si les inputs n'existent pas dans le HTML
    const colorEl = document.getElementById("arrowColor");
    const thickEl = document.getElementById("arrowThickness");
    const headEl  = document.getElementById("arrowHeadSize");
    // Si l'élément sélectionné est déjà une flèche, on reprend ses derniers paramètres
    const lastArrow = elements.slice().reverse().find(e => e.data && e.data.type === "arrow");
    const color     = (colorEl && colorEl.value) || (lastArrow ? lastArrow.data.color : "#FF0000");
    const thickness = parseInt(thickEl && thickEl.value, 10) || (lastArrow ? lastArrow.data.thickness : 6);
    const headSize  = parseInt(headEl  && headEl.value,  10) || (lastArrow ? lastArrow.data.headSize  : 18);

    const wrapper = document.createElement("div");
    wrapper.className = "editor-element arrow-element";

    // Coordonnées initiales en pixels naturels de la photo
    // Flèche horizontale qui occupe ~30% de la largeur, centrée
    const x1 = stageW * 0.35;
    const y1 = stageH * 0.5;
    const x2 = stageW * 0.65;
    const y2 = stageH * 0.5;

    const data = {
      type: "arrow",
      x1, y1, x2, y2,
      color,
      thickness,
      headSize,
      // Pas de flip ni rotation séparés : on les obtient en bougeant les extrémités
    };

    // SVG sera construit/mis à jour par renderArrow()
    wrapper.dataset.uid = uid();
    wrapper._data = data;
    stageEl.appendChild(wrapper);
    elements.push({ el: wrapper, data });

    renderArrow(wrapper, data);
    attachHandlers(wrapper);
    select(wrapper);
  }

  // ---- Ajouter un cercle (rouge, transparent au centre) ----
  let circleColorIdx = 0;
  function addCircle() {
    // Cercle SVG inline (rouge épais par défaut, fond transparent)
    const colors = ["#FF0000", "#FFFF00", "#00B050", "#0070C0", "#FFFFFF", "#000000"];
    const color = colors[0]; // rouge par défaut, on peut changer ensuite via swatch
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

    const initialNatW = stageW * 0.20;
    const data = {
      type: "image",
      src: dataUrl,
      assetKey: "_circle",
      x: stageW * 0.4,
      y: stageH * 0.4,
      w: initialNatW,
      h: initialNatW,
      rotation: 0,
      flipH: false,
      flipV: false,
    };

    wrapper.dataset.uid = uid();
    wrapper._data = data;
    stageEl.appendChild(wrapper);
    elements.push({ el: wrapper, data });

    attachHandlers(wrapper);
    select(wrapper);
    applyTransform(wrapper, data);
  }

  // ---- Ajouter un point de mesure (dot rouge + label P1, P2...) ----
  let measurePointCounter = 0;
  function addMeasurePoint() {
    measurePointCounter++;
    const label = "P" + measurePointCounter;

    // SVG : dot rouge + label numéroté au-dessus
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140">
      <rect x="32" y="0" width="56" height="34" rx="6" ry="6" fill="white" stroke="#1F4E79" stroke-width="2"/>
      <text x="60" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="#1F4E79">${label}</text>
      <line x1="60" y1="34" x2="60" y2="80" stroke="#1F4E79" stroke-width="3"/>
      <circle cx="60" cy="100" r="22" fill="#DC2626" stroke="white" stroke-width="6"/>
      <circle cx="60" cy="100" r="22" fill="none" stroke="#7F1D1D" stroke-width="2"/>
    </svg>`;
    const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));

    const wrapper = document.createElement("div");
    wrapper.className = "editor-element";

    const img = document.createElement("img");
    img.src = dataUrl;
    img.draggable = false;
    wrapper.appendChild(img);

    // Largeur initiale ~10% de la photo (140 de haut, ratio 120/140)
    const initialNatW = stageW * 0.10;
    const ratio = 140 / 120; // hauteur / largeur du SVG

    const data = {
      type: "image",
      src: dataUrl,
      assetKey: "_measurePoint",
      label: label,
      x: stageW * 0.5,
      y: stageH * 0.5,
      w: initialNatW,
      h: initialNatW * ratio,
      rotation: 0,
      flipH: false,
      flipV: false,
    };

    wrapper.dataset.uid = uid();
    wrapper._data = data;
    stageEl.appendChild(wrapper);
    elements.push({ el: wrapper, data });

    attachHandlers(wrapper);
    select(wrapper);
    applyTransform(wrapper, data);
  }

  function applyTextStyle(el, s) {
    el.style.fontFamily = s.font;
    el.style.fontSize = (s.size * scale) + "px";
    el.style.color = s.color;
    el.style.fontWeight = s.bold ? "900" : "400";
    el.dataset.naturalSize = s.size;
    const strokes = [
      `-1px -1px 0 ${s.stroke}`,
      `1px -1px 0 ${s.stroke}`,
      `-1px 1px 0 ${s.stroke}`,
      `1px 1px 0 ${s.stroke}`,
      `0 -1px 0 ${s.stroke}`,
      `0 1px 0 ${s.stroke}`,
      `-1px 0 0 ${s.stroke}`,
      `1px 0 0 ${s.stroke}`,
    ];
    if (s.shadow) strokes.push(`2px 2px 4px rgba(0,0,0,0.6)`);
    el.style.textShadow = strokes.join(", ");
  }

  // ============================================================
  //  RENDU DES TRANSFORMATIONS
  // ============================================================

  // ---- Application du transform (position + taille + rotation + flip) ----
  function applyTransform(el, data) {
    if (data.type === "arrow") {
      // les flèches gèrent leur propre rendu via renderArrow()
      renderArrow(el, data);
      return;
    }
    el.style.left = (data.x * scale) + "px";
    el.style.top = (data.y * scale) + "px";
    if (data.type === "image") {
      el.style.width = (data.w * scale) + "px";
      el.style.height = (data.h * scale) + "px";
    } else {
      el.style.fontSize = (data.size * scale) + "px";
    }
    // Compose rotation + flip (uniquement pour images)
    let transform = `rotate(${data.rotation || 0}deg)`;
    if (data.type === "image") {
      const sx = data.flipH ? -1 : 1;
      const sy = data.flipV ? -1 : 1;
      if (sx !== 1 || sy !== 1) {
        transform += ` scale(${sx}, ${sy})`;
      }
    }
    el.style.transform = transform;
  }

  // ---- Rendu d'une flèche : SVG positionné sur la stage ----
  function renderArrow(wrapper, d) {
    // On place le wrapper à 0,0 et il a la taille de la stage,
    // le SVG dedans dessine la flèche en coords naturelles → on le met à l'échelle
    wrapper.style.left = "0";
    wrapper.style.top = "0";
    wrapper.style.width = (stageW * scale) + "px";
    wrapper.style.height = (stageH * scale) + "px";
    wrapper.style.transform = "none";
    wrapper.style.pointerEvents = "none"; // le SVG seul reçoit les events

    // (Re)construire ou mettre à jour le SVG
    let svg = wrapper.querySelector("svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.position = "absolute";
      svg.style.left = "0";
      svg.style.top = "0";
      svg.style.overflow = "visible";
      svg.style.pointerEvents = "none";
      wrapper.appendChild(svg);
    }
    svg.setAttribute("viewBox", `0 0 ${stageW} ${stageH}`);
    svg.innerHTML = ""; // on régénère

    // Ligne (le tronc de la flèche) — on s'arrête avant la pointe
    const dx = d.x2 - d.x1;
    const dy = d.y2 - d.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    // Géométrie de la pointe en triangle
    const head = Math.max(d.thickness * 1.8, d.headSize);
    // On rétrécit la ligne pour ne pas dépasser dans la pointe
    const shrink = Math.min(head * 0.6, len * 0.3);
    const tx = d.x1 + dx * (1 - shrink / len);
    const ty = d.y1 + dy * (1 - shrink / len);

    // Tronc
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", d.x1);
    line.setAttribute("y1", d.y1);
    line.setAttribute("x2", tx);
    line.setAttribute("y2", ty);
    line.setAttribute("stroke", d.color);
    line.setAttribute("stroke-width", d.thickness);
    line.setAttribute("stroke-linecap", "round");
    line.style.pointerEvents = "stroke";
    line.style.cursor = "grab";
    svg.appendChild(line);

    // Triangle de la pointe
    const ang = Math.atan2(dy, dx);
    const halfBase = head * 0.55;
    const baseX = d.x2 - Math.cos(ang) * head;
    const baseY = d.y2 - Math.sin(ang) * head;
    const px1 = baseX + Math.cos(ang + Math.PI / 2) * halfBase;
    const py1 = baseY + Math.sin(ang + Math.PI / 2) * halfBase;
    const px2 = baseX - Math.cos(ang + Math.PI / 2) * halfBase;
    const py2 = baseY - Math.sin(ang + Math.PI / 2) * halfBase;

    const tri = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    tri.setAttribute("points", `${d.x2},${d.y2} ${px1},${py1} ${px2},${py2}`);
    tri.setAttribute("fill", d.color);
    tri.style.pointerEvents = "auto";
    tri.style.cursor = "grab";
    svg.appendChild(tri);

    // Si sélectionnée, on dessine une zone de hit "fat" invisible le long de la ligne
    // pour faciliter le clic
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", d.x1);
    hit.setAttribute("y1", d.y1);
    hit.setAttribute("x2", d.x2);
    hit.setAttribute("y2", d.y2);
    hit.setAttribute("stroke", "transparent");
    // /// AMÉLIORATION TACTILE : zone de capture beaucoup plus large
    // Détecte si on est sur un appareil tactile pour augmenter encore la zone
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const touchMultiplier = isTouchDevice ? 6 : 4;
    const touchMin = isTouchDevice ? 44 : 30;
    hit.setAttribute("stroke-width", Math.max(touchMin, d.thickness * touchMultiplier));
    hit.setAttribute("stroke-linecap", "round");
    hit.style.pointerEvents = "stroke";
    hit.style.cursor = "grab";
    svg.appendChild(hit);

    // sélection visuelle (cadre pointillé)
    if (wrapper.classList.contains("selected")) {
      const minX = Math.min(d.x1, d.x2) - head;
      const minY = Math.min(d.y1, d.y2) - head;
      const maxX = Math.max(d.x1, d.x2) + head;
      const maxY = Math.max(d.y1, d.y2) + head;
      const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
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
  }

  // ============================================================
  //  SÉLECTION + POIGNÉES
  // ============================================================

  function select(el) {
    if (selectedEl) {
      selectedEl.classList.remove("selected");
      [...selectedEl.querySelectorAll(".handle")].forEach(h => h.remove());
      // Pour les flèches : redessiner sans le cadre de sélection
      if (selectedEl._data && selectedEl._data.type === "arrow") {
        renderArrow(selectedEl, selectedEl._data);
      }
    }
    selectedEl = el;
    if (!el) {
      hideSelectionPanel();
      return;
    }
    el.classList.add("selected");
    if (el._data.type === "arrow") {
      renderArrow(el, el._data); // redessiner avec cadre
      addArrowHandles(el);
    } else {
      addHandles(el);
    }
    showSelectionPanel(el._data);
  }

  function addHandles(el) {
    // Resize (bottom-right)
    const r = document.createElement("div");
    r.className = "handle resize";
    el.appendChild(r);
    r.addEventListener("pointerdown", startResize);

    // Rotate (top center)
    const rot = document.createElement("div");
    rot.className = "handle rotate";
    rot.title = "Pivoter";
    el.appendChild(rot);
    rot.addEventListener("pointerdown", startRotate);

    // Delete (top right)
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

  // ---- Poignées spécifiques aux flèches : 2 extrémités ----
  function addArrowHandles(el) {
    const data = el._data;
    // Poignée à chaque extrémité
    const h1 = document.createElement("div");
    h1.className = "handle arrow-end";
    h1.style.background = "#fff";
    h1.style.border = "2px solid #2e75b6";
    el.appendChild(h1);

    const h2 = document.createElement("div");
    h2.className = "handle arrow-end";
    h2.style.background = "#2e75b6";
    h2.style.border = "2px solid #fff";
    h2.title = "Pointe de la flèche";
    el.appendChild(h2);

    // Bouton supprimer (au milieu, légèrement décalé)
    const del = document.createElement("div");
    del.className = "handle delete arrow-delete";
    del.textContent = "✕";
    del.title = "Supprimer";
    el.appendChild(del);
    del.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      deleteElement(el);
    });

    function placeHandles() {
      h1.style.left = (data.x1 * scale - 8) + "px";
      h1.style.top  = (data.y1 * scale - 8) + "px";
      h2.style.left = (data.x2 * scale - 8) + "px";
      h2.style.top  = (data.y2 * scale - 8) + "px";
      // bouton supprimer : juste au-dessus du milieu de la flèche
      const mx = (data.x1 + data.x2) / 2;
      const my = Math.min(data.y1, data.y2);
      del.style.left = (mx * scale - 8) + "px";
      del.style.top  = (my * scale - 28) + "px";
    }
    placeHandles();
    el._placeArrowHandles = placeHandles;

    h1.addEventListener("pointerdown", (e) => startArrowEndDrag(e, el, "p1"));
    h2.addEventListener("pointerdown", (e) => startArrowEndDrag(e, el, "p2"));
  }

  function startArrowEndDrag(e, el, which) {
    e.stopPropagation();
    e.preventDefault();
    const data = el._data;
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = which === "p1" ? data.x1 : data.x2;
    const oy = which === "p1" ? data.y1 : data.y2;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const nx = Math.max(0, Math.min(stageW, ox + dx));
      const ny = Math.max(0, Math.min(stageH, oy + dy));
      if (which === "p1") { data.x1 = nx; data.y1 = ny; }
      else                { data.x2 = nx; data.y2 = ny; }
      renderArrow(el, data);
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
  //  PANEL DE SÉLECTION (flip H/V, couleur de flèche, etc.)
  // ============================================================

  function showSelectionPanel(data) {
    const panel = document.getElementById("selectionPanel");
    if (!panel) return;
    // Sections distinctes selon le type
    const imgPanel = document.getElementById("selPanelImage");
    const arrPanel = document.getElementById("selPanelArrow");
    panel.style.display = "block";
    imgPanel.style.display = (data.type === "image") ? "block" : "none";
    arrPanel.style.display = (data.type === "arrow") ? "block" : "none";

    if (data.type === "image") {
      document.getElementById("flipHBtn").classList.toggle("active", !!data.flipH);
      document.getElementById("flipVBtn").classList.toggle("active", !!data.flipV);
    } else if (data.type === "arrow") {
      document.getElementById("selArrowColor").value = data.color;
      document.getElementById("selArrowThickness").value = data.thickness;
      document.getElementById("selArrowHeadSize").value = data.headSize;
    }
  }

  function hideSelectionPanel() {
    const panel = document.getElementById("selectionPanel");
    if (panel) panel.style.display = "none";
  }

  // ============================================================
  //  DRAG / RESIZE / ROTATE (images & textes)
  // ============================================================

  function attachHandlers(el) {
    el.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("handle")) return;
      if (e.target.tagName === "polygon" || e.target.tagName === "line") {
        // c'est une flèche : on sélectionne et on drag (translation entière)
        e.stopPropagation();
        e.preventDefault();
        select(el);
        if (el._data.type === "arrow") startArrowDrag(e, el);
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      select(el);
      if (el._data.type !== "arrow") startDrag(e, el);
    });
  }

  function startDrag(e, el) {
    const data = el._data;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = data.x;
    const origY = data.y;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      data.x = origX + dx;
      data.y = origY + dy;
      applyTransform(el, data);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startArrowDrag(e, el) {
    const data = el._data;
    const startX = e.clientX;
    const startY = e.clientY;
    const ox1 = data.x1, oy1 = data.y1, ox2 = data.x2, oy2 = data.y2;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      data.x1 = ox1 + dx; data.y1 = oy1 + dy;
      data.x2 = ox2 + dx; data.y2 = oy2 + dy;
      renderArrow(el, data);
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
    const startX = e.clientX;
    const startY = e.clientY;

    if (data.type === "image") {
      const origW = data.w;
      const origH = data.h;
      const ratio = origH / origW;
      function onMove(ev) {
        const dx = (ev.clientX - startX) / scale;
        const newW = Math.max(20, origW + dx);
        data.w = newW;
        data.h = newW * ratio;
        applyTransform(el, data);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    } else {
      const origSize = data.size;
      function onMove(ev) {
        const dx = (ev.clientX - startX) / scale;
        const newSize = Math.max(10, origSize + dx * 0.5);
        data.size = newSize;
        applyTransform(el, data);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }
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
    const origRot = data.rotation;
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

  // ---- Désélection au clic sur la stage ----
  function setupStageClick() {
    document.getElementById("editorStage").addEventListener("pointerdown", (e) => {
      if (e.target === stageEl || e.target === bgPhotoEl) {
        select(null);
      }
    });
  }

  // ---- Suppression au clavier ----
  function setupKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (!document.getElementById("editorOverlay").classList.contains("shown")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEl) {
        if (["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) return;
        e.preventDefault();
        deleteElement(selectedEl);
      }
      if (e.key === "Escape") close();
    });
  }

  // ---- Aperçu du style de texte ----
  function updateTextPreview() {
    const prev = document.getElementById("textPreview");
    const txt = document.getElementById("textInput");
    const font = document.getElementById("textFont");
    const size = document.getElementById("textSize");
    const color = document.getElementById("textColor");
    const stroke = document.getElementById("textStroke");
    const bold = document.getElementById("textBold");
    const shadow = document.getElementById("textShadow");
    // Vérification robuste : si un élément manque, on ne fait rien (pas d'erreur)
    if (!prev || !txt || !font || !size || !color || !stroke || !bold || !shadow) return;
    const val = txt.value || "Aperçu";
    const fontVal = font.value;
    const sizeVal = parseInt(size.value, 10) || 20;
    const colorVal = color.value;
    const strokeVal = stroke.value;
    const boldVal = bold.checked;
    const shadowVal = shadow.checked;
    prev.textContent = val;
    applyTextStyle(prev, { font: fontVal, size: sizeVal, color: colorVal, stroke: strokeVal, bold: boldVal, shadow: shadowVal });
    prev.style.fontSize = Math.min(sizeVal, 30) + "px";
  }

  // ============================================================
  //  EXPORT — rendu canvas haute résolution
  // ============================================================

  async function exportAnnotated() {
    const canvas = document.createElement("canvas");
    canvas.width = stageW;
    canvas.height = stageH;
    const ctx = canvas.getContext("2d");

    // 1) Photo de fond
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, stageW, stageH);
        resolve();
      };
      img.src = bgPhotoEl.src;
    });

    // 2) Chaque élément, dans l'ordre du DOM (=> z-order correct)
    for (const it of elements) {
      const d = it.data;
      if (d.type === "image") {
        await drawImageEl(ctx, d);
      } else if (d.type === "text") {
        drawTextEl(ctx, d);
      } else if (d.type === "arrow") {
        drawArrowEl(ctx, d);
      }
    }

    return canvas;
  }

  function drawImageEl(ctx, d) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        const cx = d.x + d.w / 2;
        const cy = d.y + d.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate((d.rotation || 0) * Math.PI / 180);
        const sx = d.flipH ? -1 : 1;
        const sy = d.flipV ? -1 : 1;
        if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
        ctx.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = d.src;
    });
  }

  function drawTextEl(ctx, d) {
    ctx.save();
    const fontWeight = d.bold ? "900" : "400";
    ctx.font = `${fontWeight} ${d.size}px ${d.font}`;
    ctx.textBaseline = "top";
    const metrics = ctx.measureText(d.text);
    const textW = metrics.width;
    const textH = d.size * 1.1;
    const cx = d.x + textW / 2;
    const cy = d.y + textH / 2;
    ctx.translate(cx, cy);
    ctx.rotate(d.rotation * Math.PI / 180);

    if (d.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }
    ctx.lineWidth = Math.max(2, d.size / 12);
    ctx.strokeStyle = d.stroke;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(d.text, -textW / 2, -textH / 2);

    ctx.shadowColor = "transparent";
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, -textW / 2, -textH / 2);
    ctx.restore();
  }

  function drawArrowEl(ctx, d) {
    ctx.save();
    const dx = d.x2 - d.x1;
    const dy = d.y2 - d.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) { ctx.restore(); return; }

    const head = Math.max(d.thickness * 1.8, d.headSize);
    const shrink = Math.min(head * 0.6, len * 0.3);
    const tx = d.x1 + dx * (1 - shrink / len);
    const ty = d.y1 + dy * (1 - shrink / len);

    // Tronc
    ctx.beginPath();
    ctx.moveTo(d.x1, d.y1);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.thickness;
    ctx.lineCap = "round";
    ctx.stroke();

    // Pointe
    const ang = Math.atan2(dy, dx);
    const halfBase = head * 0.55;
    const baseX = d.x2 - Math.cos(ang) * head;
    const baseY = d.y2 - Math.sin(ang) * head;
    const px1 = baseX + Math.cos(ang + Math.PI / 2) * halfBase;
    const py1 = baseY + Math.sin(ang + Math.PI / 2) * halfBase;
    const px2 = baseX - Math.cos(ang + Math.PI / 2) * halfBase;
    const py2 = baseY - Math.sin(ang + Math.PI / 2) * halfBase;

    ctx.beginPath();
    ctx.moveTo(d.x2, d.y2);
    ctx.lineTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.restore();
  }

  // ---- Sauvegarde (appelée depuis le bouton "Enregistrer") ----
  async function save() {
    if (!currentPhotoKey) return;
    const photo = photoStore[currentPhotoKey];
    if (!photo) return;

    const canvas = await exportAnnotated();
    const dataUrl = canvas.toDataURL("image/png");

    const u8 = await dataUrlToUint8Array(dataUrl);

    if (!photo.originalDataUrl) photo.originalDataUrl = photo.dataUrl;

    photo.data = u8;
    photo.type = "png";
    photo.dataUrl = dataUrl;
    photo.annotated = true;

    // ⭐ Sauvegarder les annotations pour une ré-édition future
    // On clone profondément les data pour qu'ils soient indépendants des éléments DOM
    photo.annotations = elements.map(e => JSON.parse(JSON.stringify(e.data)));

    const prev = document.getElementById("preview_" + currentPhotoKey);
    if (prev) {
      prev.src = dataUrl;
      prev.classList.add("shown");
    }

    close();
  }

  // ---- Helpers ----
  function uid() {
    return "el_" + Math.random().toString(36).slice(2, 9);
  }

  async function dataUrlToUint8Array(dataUrl) {
    const res = await fetch(dataUrl);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ============================================================
  //  INIT
  // ============================================================

  function init() {
    initThumbnails();
    setupStageClick();
    setupKeyboard();

    // Helper pour attacher un listener seulement si l'élément existe
    const on = (id, evt, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    };

    // Boutons "Ajouter" assets
    document.querySelectorAll("[data-add-asset]").forEach(btn => {
      btn.addEventListener("click", () => addAsset(btn.dataset.addAsset));
    });

    // Bouton "Ajouter texte" (gros bouton bleu en bas du panel texte)
    on("btnAddText", "click", addText);

    // Bouton "Ajouter flèche" (legacy, peut ne pas exister)
    on("btnAddArrow", "click", addArrow);

    // ---- BOUTONS SIDEBAR (toolAddXxx) ----
    on("toolAddArrow", "click", addArrow);
    on("toolAddCircle", "click", addCircle);
    on("toolAddText", "click", () => {
      // Met le focus sur le champ texte ; si l'utilisateur a déjà tapé qqch, on ajoute direct
      const txt = document.getElementById("textInput");
      if (txt && txt.value.trim()) {
        addText();
      } else if (txt) {
        txt.focus();
        txt.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    on("toolAddMeasurePoint", "click", addMeasurePoint);

    // Aperçu live texte
    ["textInput","textFont","textSize","textColor","textStroke","textBold","textShadow"].forEach(id => {
      on(id, "input", updateTextPreview);
    });

    // Swatches couleur (texte)
    document.querySelectorAll(".swatch").forEach(s => {
      s.addEventListener("click", () => {
        document.getElementById("textColor").value = s.dataset.color;
        updateTextPreview();
      });
    });

    // Swatches couleur (flèche par défaut + sélection)
    document.querySelectorAll(".arrow-swatch").forEach(s => {
      s.addEventListener("click", () => {
        document.getElementById("arrowColor").value = s.dataset.color;
      });
    });
    document.querySelectorAll(".sel-arrow-swatch").forEach(s => {
      s.addEventListener("click", () => {
        if (!selectedEl || selectedEl._data.type !== "arrow") return;
        selectedEl._data.color = s.dataset.color;
        document.getElementById("selArrowColor").value = s.dataset.color;
        renderArrow(selectedEl, selectedEl._data);
      });
    });

    // Boutons Flip H/V dans le panel de sélection
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

    // Édition live des flèches sélectionnées
    const selColor = document.getElementById("selArrowColor");
    const selThick = document.getElementById("selArrowThickness");
    const selHead  = document.getElementById("selArrowHeadSize");
    if (selColor) selColor.addEventListener("input", () => {
      if (!selectedEl || selectedEl._data.type !== "arrow") return;
      selectedEl._data.color = selColor.value;
      renderArrow(selectedEl, selectedEl._data);
    });
    if (selThick) selThick.addEventListener("input", () => {
      if (!selectedEl || selectedEl._data.type !== "arrow") return;
      selectedEl._data.thickness = parseInt(selThick.value, 10) || 6;
      renderArrow(selectedEl, selectedEl._data);
    });
    if (selHead) selHead.addEventListener("input", () => {
      if (!selectedEl || selectedEl._data.type !== "arrow") return;
      selectedEl._data.headSize = parseInt(selHead.value, 10) || 18;
      renderArrow(selectedEl, selectedEl._data);
    });

    // Met à jour l'aperçu initial si les champs existent
    if (document.getElementById("textPreview") && document.getElementById("textInput")) {
      updateTextPreview();
    }

    // Resize de la fenêtre → réajuster
    window.addEventListener("resize", () => {
      if (currentPhotoKey && stageW) {
        fitStage();
        elements.forEach(it => {
          if (it.data.type === "text") {
            applyTextStyle(it.el, it.data);
          }
          applyTransform(it.el, it.data);
          if (it.data.type === "arrow" && it.el === selectedEl && it.el._placeArrowHandles) {
            it.el._placeArrowHandles();
          }
        });
      }
    });
  }

  return { init, open, close, save };
})();

// =============================================
//  INITIALISATION ET EXPOSITION GLOBALE
// =============================================

// Initialisation immédiate (plus fiable car les scripts sont chargés à la fin)
if (typeof Editor !== "undefined" && typeof Editor.init === "function") {
    Editor.init();
}

// Fallback au cas où
document.addEventListener("DOMContentLoaded", () => {
    if (typeof Editor !== "undefined" && typeof Editor.init === "function") {
        Editor.init();
    }
});

// Exposer les fonctions pour le HTML et app.js
window.closeEditor = function() {
    if (Editor && typeof Editor.close === "function") Editor.close();
};

window.saveAnnotation = function() {
    if (Editor && typeof Editor.save === "function") Editor.save();
};

// Rendre l'objet Editor accessible globalement
window.Editor = Editor;
