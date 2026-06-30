// ============================================================
//  AUDIT STARLINK — Génération du rapport Word
//  IPKONEKT / Bouygues Telecom
//  v3 : alignement précis avec le template PDF d'origine
//       - logos aux bonnes proportions (Bouygues n'est plus étiré)
//       - titres de section avec tabulation (style "1.\tInfos...")
//       - tableaux sans fond bleu pâle sur la colonne libellé
//       - bordures gris clair (#CCC), cellules plus compactes
//  v4 : ajout du sélecteur AUDIT / TRAVAUX
// ============================================================

// ---- Mode d'intervention (AUDIT par défaut, ou TRAVAUX) ----
function getMode() {
  const el = document.getElementById("modeIntervention");
  return (el && el.value === "travaux") ? "travaux" : "audit";
}

// ---- Calcul automatique de la durée d'intervention (mode TRAVAUX) ----
// Calcule la différence entre heure_debut et heure_fin et affiche
// le résultat dans #duree_intervention sous la forme "Xh YYmin" (ou "YYmin" si < 1h).
// Gère le cas où l'heure de fin est le jour suivant (ex: 22:00 → 02:00 = 4h).
function updateDureeIntervention() {
  const out = document.getElementById("duree_intervention");
  if (!out) return;
  const hd = (document.getElementById("heure_debut") || {}).value || "";
  const hf = (document.getElementById("heure_fin")   || {}).value || "";
  if (!hd || !hf) { out.value = ""; return; }
  const [h1, m1] = hd.split(":").map(Number);
  const [h2, m2] = hf.split(":").map(Number);
  if ([h1, m1, h2, m2].some(v => isNaN(v))) { out.value = ""; return; }
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60; // passage minuit
  if (diff === 0) { out.value = "0min"; return; }
  const hh = Math.floor(diff / 60);
  const mm = diff % 60;
  const mmStr = String(mm).padStart(2, "0");
  out.value = hh > 0 ? (mm > 0 ? `${hh}h ${mmStr}min` : `${hh}h`)
                     : `${mm}min`;
}
function setMode(mode) {
  const m = (mode === "travaux") ? "travaux" : "audit";
  const hidden = document.getElementById("modeIntervention");
  if (hidden) hidden.value = m;
  const ba = document.getElementById("modeAuditBtn");
  const bt = document.getElementById("modeTravauxBtn");
  if (ba && bt) {
    ba.classList.toggle("active", m === "audit");
    bt.classList.toggle("active", m === "travaux");
  }
  // Pilotage de la visibilité conditionnelle via CSS (body[data-mode="..."])
  if (typeof document !== "undefined" && document.body) {
    document.body.setAttribute("data-mode", m);
  }
  // Recalculer la durée en mode travaux (au cas où des heures sont déjà saisies)
  if (m === "travaux") updateDureeIntervention();
  // Recalculer les numéros de section affichés (dépendent du mode)
  if (typeof updateSectionNumbers === "function") updateSectionNumbers();
}
// Exposer setMode globalement (appelé via onclick)
if (typeof window !== "undefined") {
  window.setMode = setMode;
  window.getMode = getMode;
}

// Stockage des photos en mémoire
// Chaque entrée : { data: Uint8Array, type: "png"|"jpg", name, dataUrl, originalDataUrl?, annotated? }
const photoStore = {};

// Liste des EPI
const EPI_LIST = [
  { key: "casque",       name: "Casque de protection",       desc: "Obligatoire si risque de chute d'objet ou travail en hauteur" },
  { key: "harnais",      name: "Harnais antichute + longe",  desc: "Obligatoire si intervention > 2,5 m sans nacelle" },
  { key: "chaussures",   name: "Chaussures de sécurité S3",  desc: "Port permanent sur chantier" },
  { key: "gants",        name: "Gants de manutention",       desc: "Manutention du matériel, câbles, supports" },
  { key: "gilet",        name: "Gilet haute visibilité",     desc: "Obligatoire en environnement circulation ou voie publique" },
  { key: "lunettes",     name: "Lunettes de protection",     desc: "Perçage, vissage, découpe goulotte" },
  { key: "nacelle",      name: "Nacelle TOUCAN indoor 10m",  desc: "Si intervention > 2,5m — location à la journée" },
  { key: "balisage",     name: "Balisage de zone",           desc: "Périmètre de sécurité autour de la zone d'intervention" },
];

// Mapping clé photo → libellé (pour l'éditeur)
const PHOTO_LABELS = {
  facade: "Vue Façade Extérieur",
  empl_general: "Vue générale de l'emplacement",
  empl_detail: "Vue détaillée du point de fixation",
  capture_obstruction: "Capture écran test obstruction",
  carte_couverture: "Carte de couverture / signal obtenu",
  pose_antenne: "Antenne posée sur support",
  cheminement_1: "Cheminement câble 1",
  cheminement_2: "Cheminement câble 2",
  cheminement_3: "Cheminement câble 3",
  penetration_facade: "Point de pénétration façade",
  routeur: "Emplacement du routeur Starlink",
  bw_satellite: "Vue satellite / plan de localisation",
};

// ============================================================
//  Init
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // Construire la liste EPI dynamiquement
  const epiList = document.getElementById("epi_list");
  EPI_LIST.forEach(epi => {
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.gridTemplateColumns = "240px 1fr 200px";
    row.innerHTML = `
      <label>${epi.name}</label>
      <span style="font-size:0.85rem;color:#555;">${epi.desc}</span>
      <div class="checkbox-group">
        <label><input type="radio" name="epi_${epi.key}" value="Oui"> Oui</label>
        <label><input type="radio" name="epi_${epi.key}" value="Non"> Non</label>
      </div>
    `;
    epiList.appendChild(row);
  });

  // Initialiser l'attribut data-mode du <body> selon le mode courant
  // (utile pour le CSS conditionnel mode-audit-only / mode-travaux-only)
  const initMode = document.getElementById("modeIntervention");
  document.body.setAttribute("data-mode",
    (initMode && initMode.value === "travaux") ? "travaux" : "audit");

  // Initialiser l'attribut data-client du <body> selon le client final courant
  // (utile pour le CSS conditionnel .bw-only — champs spécifiques Bluewireless)
  syncClientAttr();
  const selClientInit = document.getElementById("client_final");
  if (selClientInit) selClientInit.addEventListener("change", syncClientAttr);

  // Calcul automatique de la durée d'intervention (mode TRAVAUX)
  const hDebut = document.getElementById("heure_debut");
  const hFin   = document.getElementById("heure_fin");
  if (hDebut) hDebut.addEventListener("input", updateDureeIntervention);
  if (hFin)   hFin.addEventListener("input",   updateDureeIntervention);

  // Photo upload listeners (délégation pour gérer les blocs ajoutés dynamiquement)
  document.body.addEventListener("change", (e) => {
    if (e.target.matches('input[type="file"][data-photo-key]')) {
      handlePhotoUpload(e);
    }
  });

  // Boutons "Annoter" (délégation)
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-annotate]");
    if (btn && !btn.disabled) {
      const key = btn.dataset.annotate;
      if (!photoStore[key]) {
        alert("Importez d'abord une photo avant de l'annoter.");
        return;
      }
      Editor.open(key, PHOTO_LABELS[key] || key);
    }
  });

  // Boutons "Effacer photo" (délégation) — gère aussi la suppression de bloc cheminement vide
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-clear]");
    if (!btn) return;
    const key = btn.dataset.clear;
    delete photoStore[key];
    const prev = document.getElementById("preview_" + key);
    if (prev) {
      prev.src = "";
      prev.classList.remove("shown");
    }
    const fileInput = document.querySelector(`input[data-photo-key="${key}"]`);
    if (fileInput) fileInput.value = "";
    const annBtn = document.querySelector(`[data-annotate="${key}"]`);
    if (annBtn) annBtn.disabled = true;
  });

  // Bouton "+ Ajouter une photo de cheminement"
  const btnAddChem = document.getElementById("btnAddCheminementPhoto");
  if (btnAddChem) {
    btnAddChem.addEventListener("click", () => addCheminementBlock());
  }

  // Date par défaut
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("date_audit").value = today;
  document.getElementById("signataire_date").value = today;

  // Vérifier que les librairies docx et FileSaver sont bien chargées
  if (window.__libsLoaded) {
    window.__libsLoaded.then(results => {
      const allOK = results.every(r => r === true);
      if (!allOK) {
        showStatus("⚠ Impossible de charger les librairies docx/FileSaver. Vérifiez la console (F12).", "error");
      }
    });
  }
});

// ============================================================
//  Gestion des photos
// ============================================================
async function handlePhotoUpload(e) {
  const input = e.target;
  const key = input.dataset.photoKey;
  const file = input.files[0];
  if (!file) {
    delete photoStore[key];
    document.getElementById("preview_" + key).classList.remove("shown");
    return;
  }

  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);

  let imgType = "png";
  const mime = file.type.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) imgType = "jpg";
  else if (mime.includes("png")) imgType = "png";
  else if (mime.includes("gif")) imgType = "gif";
  else if (mime.includes("bmp")) imgType = "bmp";
  else if (mime.includes("webp")) imgType = "png";

  // Lire en dataURL pour l'aperçu et l'éditeur
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.readAsDataURL(file);
  });

  // Lire les dimensions naturelles pour préserver les proportions dans le Word
  const dims = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });

  photoStore[key] = {
    data: u8,
    type: imgType,
    name: file.name,
    dataUrl: dataUrl,
    naturalWidth: dims.w,
    naturalHeight: dims.h,
    annotated: false,
  };

  // Aperçu
  const preview = document.getElementById("preview_" + key);
  preview.src = dataUrl;
  preview.classList.add("shown");

  // Activer le bouton "Annoter"
  const annBtn = document.querySelector(`[data-annotate="${key}"]`);
  if (annBtn) annBtn.disabled = false;
}

// ============================================================
//  Cheminement câble — gestion dynamique des photos
// ============================================================

// Renvoie toutes les clés cheminement_N triées par numéro croissant
function getCheminementKeys() {
  const keys = new Set();
  // Depuis le DOM (blocs présents)
  document.querySelectorAll('[data-cheminement-block]').forEach(el => {
    keys.add(el.dataset.cheminementBlock);
  });
  // Depuis le photoStore (au cas où une photo existe sans bloc — sécurité)
  Object.keys(photoStore).forEach(k => {
    if (/^cheminement_\d+$/.test(k)) keys.add(k);
  });
  return [...keys].sort((a, b) => {
    const na = parseInt(a.split("_")[1], 10);
    const nb = parseInt(b.split("_")[1], 10);
    return na - nb;
  });
}

// Calcule le prochain numéro disponible (1, 2, 3...)
function nextCheminementNumber() {
  const keys = getCheminementKeys();
  let n = 1;
  while (keys.includes("cheminement_" + n)) n++;
  return n;
}

// Crée et insère un nouveau bloc cheminement dans la grille.
// Si `key` est fourni (ex: "cheminement_5" lors d'un import), utilise cette clé exacte.
// Retourne la clé utilisée.
function addCheminementBlock(key) {
  const container = document.getElementById("cheminementPhotosContainer");
  if (!container) return null;

  const num = key ? parseInt(key.split("_")[1], 10) : nextCheminementNumber();
  const finalKey = key || ("cheminement_" + num);

  // Si le bloc existe déjà (re-import), ne pas dupliquer
  if (document.querySelector(`[data-cheminement-block="${finalKey}"]`)) {
    return finalKey;
  }

  const block = document.createElement("div");
  block.className = "photo-upload";
  block.dataset.cheminementBlock = finalKey;
  block.innerHTML = `
    <div class="photo-upload-label">
      📷 Cheminement câble ${num}
      <input type="file" accept="image/*" data-photo-key="${finalKey}" style="margin-left:8px;">
      <button class="annotate-btn" data-annotate="${finalKey}" disabled>✏ Annoter</button>
      <button class="clear-photo" data-clear="${finalKey}">✕</button>
      <button type="button" class="clear-photo remove-cheminement-block" title="Retirer ce bloc" style="background:#777;">🗑 Retirer</button>
    </div>
    <img class="photo-preview" id="preview_${finalKey}">
  `;
  container.appendChild(block);

  // Listener pour retirer entièrement le bloc (sauf si c'est l'un des 3 premiers)
  const removeBtn = block.querySelector(".remove-cheminement-block");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      // Supprimer la photo du store si présente
      delete photoStore[finalKey];
      // Retirer le bloc du DOM
      block.remove();
      // Mettre à jour le mapping label
      delete PHOTO_LABELS[finalKey];
    });
  }

  // Mettre à jour le mapping de label pour l'éditeur
  PHOTO_LABELS[finalKey] = "Cheminement câble " + num;

  return finalKey;
}

function val(id) {
  const el = document.getElementById(id);
  return el ? (el.value || "").trim() : "";
}
function checkedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
}
function radioValue(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : "";
}

// Synchronise l'attribut data-client du <body> avec le <select id="client_final">.
// Permet d'afficher/masquer les champs spécifiques Bluewireless (.bw-only) via CSS.
function syncClientAttr() {
  const sel = document.getElementById("client_final");
  const key = sel && sel.value ? sel.value : "bouygues";
  document.body.setAttribute("data-client", key);
  updateSectionNumbers();
}

// Recalcule à l'écran les numéros des dernières sections (Bluewireless & Synthèse)
// en fonction du mode (EPI = section 5, présente en AUDIT uniquement) et de la
// présence ou non de la section Bluewireless.
//   AUDIT  + BW : BW = 6, Synthèse = 7
//   AUDIT  sans : Synthèse = 6
//   TRAVAUX + BW : BW = 5, Synthèse = 6
//   TRAVAUX sans : Synthèse = 5
function updateSectionNumbers() {
  const isTravaux = (getMode() === "travaux");
  const sel = document.getElementById("client_final");
  const isBW = !!(sel && sel.value === "bluewireless");

  let n = isTravaux ? 5 : 6; // 1er numéro après EPI (ou après la section 4 en TRAVAUX)

  const bwNumEl = document.getElementById("bwSectionNum");
  if (bwNumEl) {
    if (isBW) { bwNumEl.textContent = n + "."; n++; }
  }
  const synthNumEl = document.getElementById("syntheseSectionNum");
  if (synthNumEl) synthNumEl.textContent = n + ".";
}

function resetForm() {
  if (!confirm("Réinitialiser tout le formulaire ? Les photos importées seront perdues.\nLa sauvegarde automatique de cette session sera également effacée.")) return;
  // Effacer aussi la sauvegarde automatique (sinon elle re-remplirait le formulaire au prochain chargement)
  if (window.__AUTOSAVE) { try { window.__AUTOSAVE.clear(); } catch (_) {} }
  document.querySelectorAll("input, textarea, select").forEach(el => {
    if (el.id === "modeIntervention") return;
    if (el.type === "checkbox" || el.type === "radio") el.checked = false;
    else el.value = "";
  });
  // Client final : retour à la valeur par défaut
  const selClient = document.getElementById("client_final");
  if (selClient) selClient.value = "bouygues";
  syncClientAttr();
  // Remettre le mode par défaut sur AUDIT
  setMode("audit");
  Object.keys(photoStore).forEach(k => delete photoStore[k]);
  document.querySelectorAll(".photo-preview").forEach(p => {
    p.src = "";
    p.classList.remove("shown");
  });
  document.querySelectorAll(".annotate-btn").forEach(b => b.disabled = true);
  // Retirer les blocs cheminement_N pour N > 3 (créés dynamiquement)
  document.querySelectorAll('[data-cheminement-block]').forEach(block => {
    const key = block.dataset.cheminementBlock;
    const n = parseInt((key || "").split("_")[1], 10);
    if (n > 3) {
      delete PHOTO_LABELS[key];
      block.remove();
    }
  });
  showStatus("Formulaire réinitialisé.", "success");
}

function showStatus(msg, type) {
  const s = document.getElementById("status");
  s.textContent = msg;
  s.className = "status " + (type || "");
}

// ============================================================
//  Génération du document Word
// ============================================================
async function generateDocument() {
  showStatus("Génération du document en cours...", "loading");

  try {
    if (typeof window !== "undefined" && window.__libsLoaded) {
      const results = await Promise.race([
        window.__libsLoaded,
        new Promise(r => setTimeout(() => r([false]), 5000))
      ]);
      if (!results.every(r => r === true)) {
        throw new Error("Les librairies docx/FileSaver ne sont pas chargées.");
      }
    }

    if (typeof docx === "undefined" && typeof window !== "undefined" && typeof window.docx === "undefined") {
      throw new Error("La librairie docx n'a pas pu être chargée.");
    }
    const docxLib = (typeof docx !== "undefined") ? docx : window.docx;

    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType,
      ShadingType, VerticalAlign, HeadingLevel, PageOrientation, TabStopType
    } = docxLib;

    // ========== Constantes de mise en forme ==========
    // Couleurs alignées avec le template PDF d'origine
    const COLOR_PRIMARY = "1F3864";      // bleu titre (plus foncé que 1F4E79)
    const COLOR_ACCENT  = "2E75B6";      // bleu accent (sous-titres, traits)
    const COLOR_HEADER_BG = "2E5481";    // fond du bandeau "RAPPORT D'AUDIT" (bleu moyen, pas trop foncé)
    const COLOR_TABLE_HEADER = "DEEAF6"; // bleu très pâle (utilisé seulement pour Ville/Mail dans la ligne CP/Tel)
    const COLOR_BORDER  = "BFBFBF";      // gris clair (comme dans Word par défaut)
    const COLOR_TEXT    = "222222";
    const COLOR_GREY_FOOTER = "888888";

    const FONT = "Calibri";

    // ========== Langue du rapport ==========
    // Pour Bluewireless, l'utilisateur peut choisir FR/EN via #bw_lang.
    // Pour les autres clients, le rapport reste en français.
    const LANG = ((val("client_final") === "bluewireless") && (val("bw_lang") === "en")) ? "en" : "fr";
    // tr() : traduit un texte FR vers la langue du rapport (via i18n.js).
    // Sécurisé même si t() n'est pas chargé (renvoie le FR par défaut).
    const tr = (s) => (typeof t === "function" ? t(s, LANG) : s);

    const border = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER };
    const borders = { top: border, bottom: border, left: border, right: border };

    // ========== Helpers ==========
    function P(text, opts = {}) {
      return new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: opts.spacing || { before: 0, after: 80 },
        children: [
          new TextRun({
            text: text || "",
            bold: opts.bold || false,
            italics: opts.italics || false,
            size: opts.size || 20,
            color: opts.color || COLOR_TEXT,
            font: FONT
          })
        ]
      });
    }
    function emptyP() {
      return new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: 20 })] });
    }
    function cell(content, opts = {}) {
      const children = Array.isArray(content) ? content : [content];
      return new TableCell({
        borders,
        width: { size: opts.width || 4680, type: WidthType.DXA },
        shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        verticalAlign: opts.valign || VerticalAlign.CENTER,
        columnSpan: opts.columnSpan || undefined,
        children: children.map(c => typeof c === "string" ? P(c, opts.textOpts) : c)
      });
    }
    function cb(label, checked) {
      const symbol = checked ? "☒ " : "☐ ";
      return new TextRun({
        text: symbol + tr(label),
        bold: checked,
        size: 20,
        color: checked ? COLOR_PRIMARY : COLOR_TEXT,
        font: FONT
      });
    }
    function checkboxParagraph(items) {
      const children = [];
      items.forEach((it, idx) => {
        children.push(cb(it.label, it.checked));
        if (idx < items.length - 1) children.push(new TextRun({ text: "    ", font: FONT }));
      });
      return new Paragraph({ children, spacing: { before: 0, after: 60 } });
    }

    // ========== Logos ==========
    const logoIpkonekt = b64ToUint8Array(LOGO_IPKONEKT_B64);
    // Logo du CLIENT FINAL (Bouygues ou Bretagne Telecom) — voir client-config.js
    const logoClient     = clientLogoBytes();
    const logoClientSize = clientLogoSize(56);

    // -------------------------------------------------------
    //  HEADER (répété sur chaque page) — logos uniquement
    //  Dimensions calées sur le template PDF d'origine :
    //   - IPKONEKT : ~56×50 pt (ratio source 1.14, on respecte)
    //   - Bouygues : ~56×56 pt (logo carré à la source : ratio 1.0)
    //  Le précédent 80×50 sur Bouygues l'étirait horizontalement de +60% !
    // -------------------------------------------------------
    function makeRepeatingHeader() {
      // Table 2 colonnes : logo IPKONEKT à gauche, Bouygues à droite
      const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
      };

      return new Header({
        children: [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4680, 4680],
            borders: noBorders,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorders,
                    width: { size: 4680, type: WidthType.DXA },
                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.LEFT,
                        spacing: { before: 0, after: 0 },
                        children: [
                          new ImageRun({
                            data: logoIpkonekt,
                            transformation: { width: 56, height: 50 }, // ratio source 1.14
                            type: "png"
                          })
                        ]
                      })
                    ]
                  }),
                  new TableCell({
                    borders: noBorders,
                    width: { size: 4680, type: WidthType.DXA },
                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 0, after: 0 },
                        children: (logoClient ? [
                          new ImageRun({
                            data: logoClient,
                            transformation: logoClientSize, // dimensions calculées selon le ratio du logo — surtout PAS étirer
                            type: "png"
                          })
                        ] : [])
                      })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      });
    }

    // -------------------------------------------------------
    //  FOOTER (répété sur chaque page) — aligné à GAUCHE
    // -------------------------------------------------------
    function makeRepeatingFooter() {
      return new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: clientFooterText(),
                italics: true, size: 16, color: COLOR_GREY_FOOTER, font: FONT
              })
            ]
          })
        ]
      });
    }

    // Bandeau de titre (uniquement sur la 1ère page, dans le corps)
    function makeTitleBanner() {
      return new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 8, color: COLOR_HEADER_BG },
                  bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_HEADER_BG },
                  left: { style: BorderStyle.SINGLE, size: 8, color: COLOR_HEADER_BG },
                  right: { style: BorderStyle.SINGLE, size: 8, color: COLOR_HEADER_BG }
                },
                width: { size: 9360, type: WidthType.DXA },
                shading: { fill: COLOR_HEADER_BG, type: ShadingType.CLEAR },
                margins: { top: 200, bottom: 200, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({
                      text: tr(getMode() === "travaux"
                        ? "RAPPORT DE TRAVAUX - INSTALLATION STARLINK"
                        : "RAPPORT D'AUDIT - INSTALLATION STARLINK"),
                      bold: true, size: 32, color: "FFFFFF", font: FONT
                    })]
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: clientBannerText("|"), size: 22, color: "FFFFFF", font: FONT })]
                  })
                ]
              })
            ]
          })
        ]
      });
    }

    function makeRefTable() {
      const refValue = val("ref_commande");
      const auditeurValue = "IPKONEKT / " + val("auditeur");
      const dateValue = formatDateFR(val("date_audit"));
      return new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell(tr("Référence commande"), { width: 3120, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
              cell(tr("Auditeur / Intervenant"), { width: 3120, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
              cell(tr("Date d'audit"),          { width: 3120, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } })
            ]
          }),
          new TableRow({
            children: [
              cell(refValue,      { width: 3120 }),
              cell(auditeurValue, { width: 3120 }),
              cell(dateValue,     { width: 3120 })
            ]
          })
        ]
      });
    }

    function sectionHeading(numText, titleText) {
      // Pour reproduire l'indentation Word "1.\tInformations..." du template :
      // on insère une tabulation après le point. Une vraie tab requiert un tabStop.
      return new Paragraph({
        spacing: { before: 320, after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT, space: 4 } },
        tabStops: [{ type: TabStopType.LEFT, position: 360 }], // ~0.25" comme Word
        children: [
          new TextRun({ text: `${numText}.`, bold: true, size: 26, color: COLOR_PRIMARY, font: FONT }),
          new TextRun({ text: "\t", font: FONT }),
          new TextRun({ text: tr(titleText), bold: true, size: 26, color: COLOR_PRIMARY, font: FONT })
        ]
      });
    }
    function subHeading(text) {
      return new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({ text: tr(text), bold: true, italics: true, size: 22, color: COLOR_ACCENT, font: FONT })
        ]
      });
    }

    // ========== SECTION 1 ==========
    const tableInfosClient = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3120, 1560, 1560, 3120],
      rows: [
        new TableRow({ children: [
          cell(tr("Raison sociale du site audité"), { width: 3120, textOpts: { bold: true } }),
          cell(val("raison_sociale"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Adresse"), { width: 3120, textOpts: { bold: true } }),
          cell(val("adresse"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Code postal"), { width: 3120, textOpts: { bold: true } }),
          cell(tr("CP : ") + val("code_postal"), { width: 1560 }),
          cell(tr("Ville"), { width: 1560, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
          cell(val("ville"), { width: 3120 })
        ]}),
        new TableRow({ children: [
          cell(tr("Horaire d'ouverture du site"), { width: 3120, textOpts: { bold: true } }),
          cell(val("horaire"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Procédure d'accès"), { width: 3120, textOpts: { bold: true } }),
          cell(val("procedure_acces"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Téléphone site"), { width: 3120, textOpts: { bold: true } }),
          cell(val("tel_site"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Nom du contact client sur site"), { width: 3120, textOpts: { bold: true } }),
          cell(val("contact_nom"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Fonction"), { width: 3120, textOpts: { bold: true } }),
          cell(val("contact_fonction"), { width: 6240, columnSpan: 3 })
        ]}),
        new TableRow({ children: [
          cell(tr("Téléphone / Mail contact"), { width: 3120, textOpts: { bold: true } }),
          cell(val("contact_tel"), { width: 1560 }),
          cell(tr("Mail"), { width: 1560, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
          cell(val("contact_mail"), { width: 3120 })
        ]})
      ]
    });

    // ========== SECTION 2.1 ==========
    const typesEmpl = checkedValues("type_empl");
    const accessVals = checkedValues("access");
    const degagementVals = checkedValues("degagement");

    const tableEmpl = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3120, 6240],
      rows: [
        new TableRow({ children: [
          cell(tr("Type d'emplacement"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [ checkboxParagraph([
              { label: "Toiture plate",         checked: typesEmpl.includes("Toiture plate") },
              { label: "Façade",                checked: typesEmpl.includes("Façade") },
              { label: "Balcon / Garde-corps",  checked: typesEmpl.includes("Balcon / Garde-corps") },
              { label: "Acrotère",              checked: typesEmpl.includes("Acrotère") }
            ]) ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Description détaillée"), { width: 3120, textOpts: { bold: true } }),
          cell(val("empl_description"), { width: 6240 })
        ]}),
        new TableRow({ children: [
          cell(tr("Hauteur depuis le sol"), { width: 3120, textOpts: { bold: true } }),
          cell(val("empl_hauteur"), { width: 6240 })
        ]}),
        new TableRow({ children: [
          cell(tr("Accessibilité"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [ checkboxParagraph([
              { label: "Accessible sans moyen", checked: accessVals.includes("Accessible sans moyen") },
              { label: "Echelle Requise",       checked: accessVals.includes("Echelle Requise") },
              { label: "Nacelle Requise",       checked: accessVals.includes("Nacelle Requise") }
            ]) ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Dégagement vers le ciel"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [ checkboxParagraph([
              { label: "Suffisant (≥ 100°)",            checked: degagementVals.includes("Suffisant (≥ 100°)") },
              { label: "Insuffisant - voir obstruction", checked: degagementVals.includes("Insuffisant - voir obstruction") }
            ]) ]
          })
        ]})
      ]
    });

    // ========== SECTION 2.3 ==========
    const obstrVals = checkedValues("obstruction");
    const tableObstr = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3120, 6240],
      rows: [
        new TableRow({ children: [
          cell(tr("Résultat du test d'obstruction"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              checkboxParagraph([
                { label: "Aucune obstruction",    checked: obstrVals.includes("Aucune obstruction") },
                { label: "Obstruction mineure",   checked: obstrVals.includes("Obstruction mineure") }
              ]),
              checkboxParagraph([
                { label: "Obstruction bloquante", checked: obstrVals.includes("Obstruction bloquante") }
              ])
            ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Commentaire"), { width: 3120, textOpts: { bold: true } }),
          cell(val("obstr_commentaire") || " ", { width: 6240 })
        ]})
      ]
    });

    // ========== SECTION 3.1 ==========
    const supportVals = checkedValues("support");
    const cheminementVals = checkedValues("cheminement");
    const penetrationVals = checkedValues("penetration");
    const etancheiteVals = checkedValues("etancheite");
    const tablePose = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3120, 6240],
      rows: [
        new TableRow({ children: [
          cell(tr("Type de support installé"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              checkboxParagraph([
                { label: "Trépied",            checked: supportVals.includes("Trépied") },
                { label: "Mât auto stable 1m", checked: supportVals.includes("Mât auto stable 1m") },
                { label: "Mât en drapeau",     checked: supportVals.includes("Mât en drapeau") }
              ]),
              checkboxParagraph([
                { label: "Déport coudé",                   checked: supportVals.includes("Déport coudé") },
                { label: "Mât droit 1m (garde-corps)",     checked: supportVals.includes("Mât droit 1m (garde-corps)") }
              ])
            ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Longueur de câble à prévoir"), { width: 3120, textOpts: { bold: true } }),
          cell((val("cable_longueur") || "__") + " M  (câble fourni ≤25m / prolongateur 25-50m)", { width: 6240 })
        ]}),
        new TableRow({ children: [
          cell(tr("Type de cheminement câble"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              checkboxParagraph([
                { label: "Goulotte extérieure",         checked: cheminementVals.includes("Goulotte extérieure") },
                { label: "Faux plafond amovible (Tonga)", checked: cheminementVals.includes("Faux plafond amovible (Tonga)") }
              ]),
              checkboxParagraph([
                { label: "Sous conduit encastré",       checked: cheminementVals.includes("Sous conduit encastré") },
                { label: "Mixte",                        checked: cheminementVals.includes("Mixte") }
              ])
            ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Point de pénétration"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              checkboxParagraph([
                { label: "Passage de façade",   checked: penetrationVals.includes("Passage de façade") },
                { label: "Menuiserie / joint",  checked: penetrationVals.includes("Menuiserie / joint") }
              ]),
              checkboxParagraph([
                { label: "Fourreaux existants", checked: penetrationVals.includes("Fourreaux existants") },
                { label: "Percement réalisé",   checked: penetrationVals.includes("Percement réalisé") }
              ])
            ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Étanchéité du passage"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [ checkboxParagraph([
              { label: "Mastic appliqué",         checked: etancheiteVals.includes("Mastic appliqué") },
              { label: "Passe-câble étanche",      checked: etancheiteVals.includes("Passe-câble étanche") },
              { label: "Non traité (à compléter)", checked: etancheiteVals.includes("Non traité (à compléter)") }
            ]) ]
          })
        ]}),
        new TableRow({ children: [
          cell(tr("Hauteur maximale d'intervention"), { width: 3120, textOpts: { bold: true } }),
          cell((val("hauteur_max") || "__") + " m  (max 2,5m sans sécurité spécifique)", { width: 6240 })
        ]})
      ]
    });

    // ========== SECTION 4 - Référence supports ==========
    const tableSupportRef = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2000, 4000, 3360],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell(tr("Support"),            { width: 2000, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
            cell(tr("Situation d'usage"),  { width: 4000, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
            cell(tr("Conditions / Contraintes"), { width: 3360, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } })
          ]
        }),
        new TableRow({ children: [
          cell(tr("Trépied"), { width: 2000, textOpts: { bold: true } }),
          cell(tr("Toiture plate, dégagement ciel suffisant au ras du toit"), { width: 4000 }),
          cell(tr("Semelle résiliente obligatoire. Dalles gravillonnées."), { width: 3360 })
        ]}),
        new TableRow({ children: [
          cell(tr("Mât auto stable 1m"), { width: 2000, textOpts: { bold: true } }),
          cell(tr("Toiture plate avec obstacles proches nécessitant de rehausser l'antenne pour le pointage"), { width: 4000 }),
          cell(tr("Semelle résiliente obligatoire. Dalles gravillonnées."), { width: 3360 })
        ]}),
        new TableRow({ children: [
          cell(tr("Mât en drapeau"), { width: 2000, textOpts: { bold: true } }),
          cell(tr("Façade béton / brique / agglo, ou sur tube / mât existant (adaptateur)"), { width: 4000 }),
          cell(tr("PAS de fixation sur bardage ou paroi métallique."), { width: 3360, textOpts: { color: "C00000", bold: true } })
        ]}),
        new TableRow({ children: [
          cell(tr("Déport coudé"), { width: 2000, textOpts: { bold: true } }),
          cell(tr("Acrotère ou muret en bord de toit"), { width: 4000 }),
          cell(tr("Étanchéité préservée — aucun perçage du revêtement de toit."), { width: 3360 })
        ]}),
        new TableRow({ children: [
          cell(tr("Mât droit 1m (garde-corps)"), { width: 2000, textOpts: { bold: true } }),
          cell(tr("Balcon ou terrasse avec garde-corps en bon état"), { width: 4000 }),
          cell(tr("Colliers de serrage sur garde-corps. Pas de perçage façade."), { width: 3360 })
        ]})
      ]
    });

    const rappelBox = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({ children: [
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: "F0AD4E" },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "F0AD4E" },
              left: { style: BorderStyle.SINGLE, size: 18, color: "F0AD4E" },
              right: { style: BorderStyle.SINGLE, size: 6, color: "F0AD4E" }
            },
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: "FFF8E6", type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "⚠ " + tr("Rappel : "), bold: true, color: "C77700", size: 20, font: FONT }),
                  new TextRun({ text: tr("Toute intervention à plus de 2,5 m du sol nécessite un moyen de sécurité (nacelle ou harnais antichute). À déclencher dès la visite de site."), size: 20, color: COLOR_TEXT, font: FONT })
                ]
              })
            ]
          })
        ]})
      ]
    });

    // ========== SECTION 5 EPI ==========
    const epiRows = [
      new TableRow({ tableHeader: true, children: [
        cell(tr("EPI"),              { width: 2400, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
        cell(tr("Précision / Usage"), { width: 4560, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
        cell(tr("Présent sur intervention"), { width: 2400, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } })
      ]})
    ];
    EPI_LIST.forEach(epi => {
      const choix = radioValue("epi_" + epi.key);
      epiRows.push(
        new TableRow({ children: [
          cell(tr(epi.name), { width: 2400, textOpts: { bold: true } }),
          cell(tr(epi.desc), { width: 4560 }),
          new TableCell({
            borders, width: { size: 2400, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [ checkboxParagraph([
              { label: "Oui", checked: choix === "Oui" },
              { label: "Non", checked: choix === "Non" }
            ]) ]
          })
        ]})
      );
    });
    const tableEPI = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2400, 4560, 2400],
      rows: epiRows
    });
    const tableEPIRemarques = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({ children: [
          cell(tr("Remarques EPI / Sécurité :"), { width: 9360, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } })
        ]}),
        new TableRow({ children: [
          new TableCell({
            borders, width: { size: 9360, type: WidthType.DXA },
            margins: { top: 120, bottom: 800, left: 120, right: 120 },
            children: (val("epi_remarques") || "").split("\n").map(l => P(l))
          })
        ]})
      ]
    });

    // ========== SECTION 6 Synthèse ==========
    const isTravaux = (getMode() === "travaux");
    const isBW = (val("client_final") === "bluewireless");

    // Libellés et valeurs qui changent selon le mode
    const labelDuree   = isTravaux ? "Durée de l'intervention"  : "Durée totale à prévoir";
    const valueDuree   = isTravaux ? val("duree_intervention")  : val("duree_totale");
    const labelNacelle = isTravaux ? "Nacelle utilisée"         : "Nacelle à prévoir";
    const nacelleRadio = isTravaux ? radioValue("nacelle_utilisee") : radioValue("nacelle_prevoir");
    const echelleRadio = radioValue("echelle_echafaud");

    const syntheseRows = [
      new TableRow({ children: [
        cell(tr("Heure de début d'intervention"), { width: 3120, textOpts: { bold: true } }),
        cell(val("heure_debut"), { width: 6240 })
      ]}),
      new TableRow({ children: [
        cell(tr("Heure de fin d'intervention"), { width: 3120, textOpts: { bold: true } }),
        cell(val("heure_fin"), { width: 6240 })
      ]}),
      new TableRow({ children: [
        cell(labelDuree, { width: 3120, textOpts: { bold: true } }),
        cell(valueDuree, { width: 6240 })
      ]}),
      new TableRow({ children: [
        cell(tr("Nombre de techniciens"), { width: 3120, textOpts: { bold: true } }),
        cell(val("nb_techniciens"), { width: 6240 })
      ]}),
      new TableRow({ children: [
        cell(labelNacelle, { width: 3120, textOpts: { bold: true } }),
        new TableCell({
          borders, width: { size: 6240, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [ checkboxParagraph([
            { label: "Oui", checked: nacelleRadio === "Oui" },
            { label: "Non", checked: nacelleRadio === "Non" }
          ]) ]
        })
      ]})
    ];

    // Ligne supplémentaire « Échelle / Échafaud utilisé » : mode TRAVAUX uniquement
    if (isTravaux) {
      syntheseRows.push(
        new TableRow({ children: [
          cell(tr("Échelle / Échafaud utilisé"), { width: 3120, textOpts: { bold: true } }),
          new TableCell({
            borders, width: { size: 6240, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [ checkboxParagraph([
              { label: "Oui", checked: echelleRadio === "Oui" },
              { label: "Non", checked: echelleRadio === "Non" }
            ]) ]
          })
        ]})
      );
    }

    syntheseRows.push(
      new TableRow({ children: [
        cell(tr("Câblage supplémentaire"), { width: 3120, textOpts: { bold: true } }),
        new TableCell({
          borders, width: { size: 6240, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [ checkboxParagraph([
            { label: "Oui", checked: radioValue("cablage_supp") === "Oui" },
            { label: "Non", checked: radioValue("cablage_supp") === "Non" }
          ]) ]
        })
      ]})
    );

    const tableSynthese = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3120, 6240],
      rows: syntheseRows
    });

    const labelObservations = isTravaux
      ? "Commentaire sur l'intervention"
      : "Observations / Réserves / Points à lever";
    const tableObservations = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({ children: [
          cell(labelObservations, { width: 9360, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } })
        ]}),
        new TableRow({ children: [
          new TableCell({
            borders, width: { size: 9360, type: WidthType.DXA },
            margins: { top: 120, bottom: 1200, left: 120, right: 120 },
            children: (val("observations") || "").split("\n").map(l => P(l))
          })
        ]})
      ]
    });
    const tableSignature = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({ children: [
          cell(tr("Signature technicien / auditeur"), { width: 9360, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } })
        ]}),
        new TableRow({ children: [
          new TableCell({
            borders, width: { size: 9360, type: WidthType.DXA },
            margins: { top: 200, bottom: 800, left: 120, right: 120 },
            children: [
              emptyP(),
              P(tr("Nom : ") + (val("signataire_nom") || "_______________________________")),
              emptyP(),
              P(tr("Date : ") + (formatDateFR(val("signataire_date")) || "_______________________________"))
            ]
          })
        ]})
      ]
    });

    // ========== Photo blocks ==========
    function makePhotoBlock(label, photoKey, opts = {}) {
      const photo = photoStore[photoKey];
      if (!photo) return null;
      const maxW = opts.width || 240;
      const maxH = opts.height || 180;
      const tableWidth = opts.tableWidth || 4400;

      // Calculer les dimensions finales en respectant les proportions naturelles
      // de la photo (logique "contain" : la photo entre dans la box maxW×maxH
      // sans être déformée, et sans dépasser).
      const natW = photo.naturalWidth || maxW;
      const natH = photo.naturalHeight || maxH;
      const ratio = Math.min(maxW / natW, maxH / natH);
      const drawW = Math.round(natW * ratio);
      const drawH = Math.round(natH * ratio);

      return new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: [tableWidth],
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                borders: {
                  top:    { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT },
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT },
                  left:   { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT },
                  right:  { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT }
                },
                width: { size: tableWidth, type: WidthType.DXA },
                shading: { fill: "F4F8FC", type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 80 },
                    children: [
                      new TextRun({ text: "📷 ", size: 20, color: COLOR_PRIMARY, font: FONT }),
                      new TextRun({ text: tr(label), bold: true, size: 20, color: COLOR_PRIMARY, font: FONT })
                    ]
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0 },
                    children: [
                      new ImageRun({
                        data: photo.data,
                        transformation: { width: drawW, height: drawH },
                        type: photo.type
                      })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      });
    }

    function makePhotoRow(p1Label, p1Key, p2Label, p2Key) {
      const has1 = !!photoStore[p1Key];
      const has2 = !!photoStore[p2Key];
      if (!has1 && !has2) return [];
      if (has1 !== has2) {
        const key = has1 ? p1Key : p2Key;
        const lab = has1 ? p1Label : p2Label;
        return [ makePhotoBlock(lab, key, { tableWidth: 9360, width: 380, height: 260 }), emptyP() ];
      }
      const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
      };
      return [
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4680, 4680],
          borders: noBorders,
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  borders: noBorders, width: { size: 4680, type: WidthType.DXA },
                  margins: { top: 0, bottom: 0, left: 0, right: 60 },
                  children: [ makePhotoBlock(p1Label, p1Key, { tableWidth: 4500, width: 230, height: 170 }) ]
                }),
                new TableCell({
                  borders: noBorders, width: { size: 4680, type: WidthType.DXA },
                  margins: { top: 0, bottom: 0, left: 60, right: 0 },
                  children: [ makePhotoBlock(p2Label, p2Key, { tableWidth: 4500, width: 230, height: 170 }) ]
                })
              ]
            })
          ]
        }),
        emptyP()
      ];
    }

    function makeSinglePhoto(label, key) {
      if (!photoStore[key]) return [];
      return [ makePhotoBlock(label, key, { tableWidth: 9360, width: 400, height: 260 }), emptyP() ];
    }

    // ========== SECTIONS BLUEWIRELESS (générées seulement si client = Bluewireless) ==========
    // Construit une table clé/valeur simple à 2 colonnes à partir d'une liste [label, valeur].
    // Les lignes dont la valeur est vide sont ignorées (rapport plus propre).
    function bwKvTable(rows) {
      const filtered = rows.filter(([, v]) => (v || "").toString().trim() !== "");
      if (filtered.length === 0) return null;
      return new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3744, 5616],
        rows: filtered.map(([label, value]) =>
          new TableRow({ children: [
            cell(tr(label), { width: 3744, shading: COLOR_TABLE_HEADER, textOpts: { bold: true } }),
            cell(tr((value || "").toString()), { width: 5616 })
          ]})
        )
      });
    }

    function buildBluewirelessChildren(numText) {
      const out = [];
      out.push(sectionHeading(numText, "Conclusions, équipement & périmètre (Bluewireless)"));

      // Conclusion & recommandations
      const tConcl = bwKvTable([
        ["Solution techniquement faisable ?", radioValue("bw_faisable")],
        ["Emplacement retenu", val("bw_emplacement_retenu")],
        ["Équipement recommandé & considérations", val("bw_reco")],
        ["Type de bâtiment", radioValue("bw_building_type")],
        ["Matériau de construction", val("bw_building_material")],
        ["Propriété du bâtiment", radioValue("bw_ownership")],
        ["Coordonnées GPS du site", val("bw_gps")],
      ]);
      if (tConcl) { out.push(subHeading("Conclusion & recommandations")); out.push(tConcl); out.push(emptyP()); }

      // Image satellite / plan
      if (photoStore["bw_satellite"]) {
        out.push(...makeSinglePhoto("Vue satellite / plan de localisation", "bw_satellite"));
      }

      // Contacts multi-rôles
      const tContacts = bwKvTable([
        ["Gestion bâtiment / Bailleur", val("bw_contact_landlord")],
        ["Approbation travaux civils", val("bw_contact_civils")],
        ["Responsable Facilities (client)", val("bw_contact_facilities")],
        ["Accès / escorte sur site", val("bw_contact_escort")],
      ]);
      if (tContacts) { out.push(subHeading("Contacts — rôles & responsabilités")); out.push(tContacts); out.push(emptyP()); }

      // Pénétration / indoor / alimentation
      const tTech = bwKvTable([
        ["Ingress existant ?", radioValue("bw_ingress_exist")],
        ["Si nouvel ingress : emplacement & matériau", val("bw_ingress_detail")],
        ["Emplacement équipement indoor", val("bw_indoor_placement")],
        ["Liaison RJ-45 alim Starlink ↔ routeur", radioValue("bw_rj45")],
        ["2 prises électriques disponibles ?", radioValue("bw_power_2sockets")],
        ["Type de prise & voltage", val("bw_power_type")],
        ["Problèmes d'alimentation", val("bw_power_issues")],
        ["Onduleur / UPS disponible ?", radioValue("bw_ups")],
      ]);
      if (tTech) { out.push(subHeading("Pénétration, équipement indoor & alimentation")); out.push(tTech); out.push(emptyP()); }

      // Bill of Materials Blue Wireless
      const tBom = bwKvTable([
        ["Dish Starlink (type)", val("bw_bom_dish")],
        ["Routeur (modèle)", val("bw_bom_router")],
        ["Câble antenne Starlink", val("bw_bom_cable_ant")],
        ["Câble Starlink → Ethernet", val("bw_bom_cable_eth")],
        ["Type de mât / support", val("bw_bom_mount")],
        ["Infra pôle / sol / fixations", val("bw_bom_infra")],
        ["Consommables d'installation", val("bw_bom_consumables")],
      ]);
      if (tBom) { out.push(subHeading("Bill of Materials — Blue Wireless")); out.push(tBom); out.push(emptyP()); }

      // Scope of Work / Risques / Client / Next Steps
      const tScope = bwKvTable([
        ["Scope of Work — Blue Wireless", val("bw_sow_bw")],
        ["Risques & mitigations", val("bw_risques")],
        ["BoM client", val("bw_bom_customer")],
        ["Travaux préparatoires client (SoW)", val("bw_sow_customer")],
        ["Approbation / clearance requise", val("bw_approbation")],
        ["Prochaines étapes (Next Steps)", val("bw_next_steps")],
      ]);
      if (tScope) { out.push(subHeading("Périmètre, risques & prochaines étapes")); out.push(tScope); out.push(emptyP()); }

      return out;
    }

    // ========== Construction du document ==========
    const children = [];

    // Bandeau de titre principal (uniquement page 1, dans le corps)
    children.push(makeTitleBanner());
    children.push(emptyP());
    children.push(makeRefTable());

    // SECTION 1
    children.push(sectionHeading("1", "Informations administratives du client"));
    children.push(tableInfosClient);
    children.push(emptyP());
    children.push(...makeSinglePhoto("Vue Façade Extérieur", "facade"));

    // SECTION 2
    children.push(sectionHeading("2", "Choix de l'emplacement de l'antenne"));
    children.push(subHeading("2.1 - Description de l'emplacement retenu"));
    children.push(tableEmpl);
    children.push(emptyP());

    children.push(subHeading("2.2 - Photos de l'emplacement"));
    children.push(...makePhotoRow("Vue générale de l'emplacement", "empl_general", "Vue détaillée du point de fixation", "empl_detail"));

    children.push(subHeading("2.3 - Test de positionnement - Application Starlink"));
    children.push(tableObstr);
    children.push(emptyP());
    children.push(...makePhotoRow("Capture écran test obstruction (app Starlink)", "capture_obstruction", "Carte de couverture / signal obtenu", "carte_couverture"));

    // SECTION 3
    children.push(sectionHeading("3", "Pose de l'antenne — Cheminement câble & point de pénétration"));
    children.push(subHeading("3.1 - Informations de pose"));
    children.push(tablePose);
    children.push(emptyP());

    children.push(subHeading("3.2 - Photos de pose et cheminement"));

    // Récupérer toutes les clés cheminement_N qui ont une photo, triées par numéro
    const cheminementKeysWithPhotos = Object.keys(photoStore)
      .filter(k => /^cheminement_\d+$/.test(k))
      .sort((a, b) => {
        const na = parseInt(a.split("_")[1], 10);
        const nb = parseInt(b.split("_")[1], 10);
        return na - nb;
      });

    // Construire la liste des paires (label, key) à afficher : antenne + toutes les photos cheminement
    const photoPairs = [];
    if (photoStore["pose_antenne"]) {
      photoPairs.push(["Antenne posée sur support", "pose_antenne"]);
    }
    cheminementKeysWithPhotos.forEach(k => {
      const num = parseInt(k.split("_")[1], 10);
      photoPairs.push([tr("Cheminement câble ") + num, k]);
    });

    // Afficher 2 par ligne via makePhotoRow
    for (let i = 0; i < photoPairs.length; i += 2) {
      const [label1, key1] = photoPairs[i];
      const second = photoPairs[i + 1];
      if (second) {
        const [label2, key2] = second;
        children.push(...makePhotoRow(label1, key1, label2, key2));
      } else {
        // Photo seule à la fin (nombre impair)
        children.push(...makePhotoRow(label1, key1, "", "__none__"));
      }
    }

    // Pénétration façade + routeur sur une ligne propre
    children.push(...makePhotoRow("Point de pénétration façade", "penetration_facade", "Emplacement du routeur Starlink", "routeur"));

    // SECTION 4
    children.push(sectionHeading("4", "Type de support installé - Fiche de référence"));
    children.push(tableSupportRef);
    children.push(emptyP());
    children.push(rappelBox);

    // SECTION 5 EPI — mode AUDIT uniquement
    // (en mode TRAVAUX, la section EPI est entièrement supprimée du rapport)
    if (!isTravaux) {
      children.push(sectionHeading("5", "EPI requis - Équipements de Protection Individuelle"));
      children.push(tableEPI);
      children.push(emptyP());
      children.push(tableEPIRemarques);
    }

    // Numérotation dynamique des dernières sections.
    // EPI = 5 (mode AUDIT uniquement). Puis viennent, dans l'ordre :
    //   - la section Bluewireless (si client = Bluewireless)
    //   - la Synthèse de l'intervention
    // Le compteur démarre après la section 4, +1 si EPI est présent.
    let nextNum = isTravaux ? 5 : 6; // 1er numéro disponible après EPI (ou après la 4 en TRAVAUX)

    // SECTION BLUEWIRELESS — uniquement si client final = Bluewireless
    // Placée AVANT la synthèse pour que « Synthèse de l'intervention » et la
    // signature restent les derniers éléments du rapport.
    if (isBW) {
      children.push(...buildBluewirelessChildren(String(nextNum)));
      nextNum++;
    }

    // Synthèse de l'intervention (numéro qui suit la section BW si présente)
    const syntheseNum = String(nextNum);
    children.push(sectionHeading(syntheseNum, "Synthèse de l'intervention"));
    children.push(tableSynthese);
    children.push(emptyP());
    children.push(tableObservations);
    children.push(emptyP());
    children.push(tableSignature);

    // ========== Document final ==========
    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: 20 } } } },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },  // A4
            margin: { top: 1440, right: 1080, bottom: 1080, left: 1080, header: 360, footer: 360 }
          }
        },
        headers: { default: makeRepeatingHeader() },
        footers: { default: makeRepeatingFooter() },
        children: children
      }]
    });

    const blob = await Packer.toBlob(doc);
    const filename = buildFilename();
    saveAs(blob, filename);
    showStatus("✅ Rapport généré : " + filename, "success");
  } catch (err) {
    console.error(err);
    showStatus("❌ Erreur lors de la génération : " + err.message, "error");
  }
}

// ============================================================
//  Utilitaires
// ============================================================
function formatDateFR(isoDate) {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}
function buildFilename() {
  const ref = (val("ref_commande") || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const raison = (val("raison_sociale") || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  const date = val("date_audit") || new Date().toISOString().slice(0, 10);
  const prefix = (getMode() === "travaux") ? "TRAVAUX_STARLINK" : "AUDIT_STARLINK";
  let parts = [prefix];
  if (ref) parts.push(ref);
  if (raison) parts.push(raison);
  parts.push(date);
  return parts.join("_") + ".docx";
}

// ============================================================
//  EXPORT / IMPORT JSON COMPLET (formulaire + photos + annotations)
// ============================================================

function buildJsonFilename() {
  const ref = (val("ref_commande") || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const raison = (val("raison_sociale") || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  const date = val("date_audit") || new Date().toISOString().slice(0, 10);
  const prefix = (getMode() === "travaux") ? "TRAVAUX_STARLINK_BACKUP" : "AUDIT_STARLINK_BACKUP";
  let parts = [prefix];
  if (ref) parts.push(ref);
  if (raison) parts.push(raison);
  parts.push(date);
  return parts.join("_") + ".json";
}

// Exporter tout en JSON (formulaire + photos + annotations)
// Construit l'objet de sauvegarde complet (réutilisé par l'export JSON
// ET par la sauvegarde automatique — voir module AUTOSAVE plus bas).
function buildExportData() {
    // Récupérer toutes les valeurs du formulaire
    const formData = {
      // Champs texte
      numero_ticket: val("numero_ticket"),   // FIX : était perdu à l'export/import !
      client_final: val("client_final") || "bouygues",  // client final (Bouygues / Bretagne)
      bw_lang: val("bw_lang") || "fr",  // langue du rapport Word (Bluewireless)
      ref_commande: val("ref_commande"),
      auditeur: val("auditeur"),
      date_audit: val("date_audit"),
      raison_sociale: val("raison_sociale"),
      adresse: val("adresse"),
      code_postal: val("code_postal"),
      ville: val("ville"),
      horaire: val("horaire"),
      procedure_acces: val("procedure_acces"),
      tel_site: val("tel_site"),
      contact_nom: val("contact_nom"),
      contact_fonction: val("contact_fonction"),
      contact_tel: val("contact_tel"),
      contact_mail: val("contact_mail"),
      empl_description: val("empl_description"),
      empl_hauteur: val("empl_hauteur"),
      obstr_commentaire: val("obstr_commentaire"),
      cable_longueur: val("cable_longueur"),
      hauteur_max: val("hauteur_max"),
      heure_debut: val("heure_debut"),
      heure_fin: val("heure_fin"),
      duree_totale: val("duree_totale"),
      duree_intervention: val("duree_intervention"),
      nb_techniciens: val("nb_techniciens"),
      epi_remarques: val("epi_remarques"),
      observations: val("observations"),
      signataire_nom: val("signataire_nom"),
      signataire_date: val("signataire_date"),
      // Groupes de checkboxes
      type_empl: checkedValues("type_empl"),
      access: checkedValues("access"),
      degagement: checkedValues("degagement"),
      obstruction: checkedValues("obstruction"),
      support: checkedValues("support"),
      cheminement: checkedValues("cheminement"),
      penetration: checkedValues("penetration"),
      etancheite: checkedValues("etancheite"),
      // Radios
      nacelle_prevoir: radioValue("nacelle_prevoir"),
      nacelle_utilisee: radioValue("nacelle_utilisee"),
      echelle_echafaud: radioValue("echelle_echafaud"),
      cablage_supp: radioValue("cablage_supp"),
      // EPI (radios dynamiques)
      epi: EPI_LIST.map(epi => ({ key: epi.key, value: radioValue("epi_" + epi.key) })),

      // ===== Champs spécifiques BLUEWIRELESS =====
      bw_gps: val("bw_gps"),
      bw_building_type: radioValue("bw_building_type"),
      bw_building_material: val("bw_building_material"),
      bw_ownership: radioValue("bw_ownership"),
      bw_contact_landlord: val("bw_contact_landlord"),
      bw_contact_civils: val("bw_contact_civils"),
      bw_contact_facilities: val("bw_contact_facilities"),
      bw_contact_escort: val("bw_contact_escort"),
      bw_ingress_exist: radioValue("bw_ingress_exist"),
      bw_ingress_detail: val("bw_ingress_detail"),
      bw_indoor_placement: val("bw_indoor_placement"),
      bw_rj45: radioValue("bw_rj45"),
      bw_power_2sockets: radioValue("bw_power_2sockets"),
      bw_power_type: val("bw_power_type"),
      bw_power_issues: val("bw_power_issues"),
      bw_ups: radioValue("bw_ups"),
      bw_faisable: radioValue("bw_faisable"),
      bw_emplacement_retenu: val("bw_emplacement_retenu"),
      bw_reco: val("bw_reco"),
      bw_bom_dish: val("bw_bom_dish"),
      bw_bom_router: val("bw_bom_router"),
      bw_bom_cable_ant: val("bw_bom_cable_ant"),
      bw_bom_cable_eth: val("bw_bom_cable_eth"),
      bw_bom_mount: val("bw_bom_mount"),
      bw_bom_infra: val("bw_bom_infra"),
      bw_bom_consumables: val("bw_bom_consumables"),
      bw_sow_bw: val("bw_sow_bw"),
      bw_risques: val("bw_risques"),
      bw_bom_customer: val("bw_bom_customer"),
      bw_sow_customer: val("bw_sow_customer"),
      bw_approbation: val("bw_approbation"),
      bw_next_steps: val("bw_next_steps"),
    };

    // Photos : on stocke les dataUrl (déjà en base64) + métadonnées + annotations
    const photos = {};
    for (const [key, photo] of Object.entries(photoStore)) {
      photos[key] = {
        dataUrl: photo.dataUrl,
        originalDataUrl: photo.originalDataUrl || null,
        annotated: photo.annotated || false,
        annotations: photo.annotations || null,
        naturalWidth: photo.naturalWidth || null,
        naturalHeight: photo.naturalHeight || null,
        type: photo.type || "png",
        name: photo.name || null,
      };
    }

    const fullExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      mode: getMode(),
      formData,
      photos,
    };

    return fullExport;
}

async function exportToJSON() {
  try {
    const fullExport = buildExportData();
    const jsonStr = JSON.stringify(fullExport, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const filename = buildJsonFilename();
    saveAs(blob, filename);
    showStatus("✅ Sauvegarde JSON exportée : " + filename, "success");
  } catch (err) {
    console.error(err);
    showStatus("❌ Erreur lors de l'export JSON : " + err.message, "error");
  }
}

// Importer depuis JSON
async function importFromJSON(file) {
  if (!file) return;
  if (!confirm("Importer ce fichier va remplacer toutes les données actuelles du formulaire. Continuer ?")) {
    // Réinitialiser l'input pour permettre un nouvel import du même fichier ensuite
    const input = document.getElementById("importJsonInput");
    if (input) input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await applyImportedData(data);
      if (window.__autosaveSchedule) window.__autosaveSchedule(); // resynchroniser la sauvegarde auto
      const input = document.getElementById("importJsonInput");
      if (input) input.value = "";
      showStatus("✅ Sauvegarde importée avec succès.", "success");
    } catch (err) {
      console.error(err);
      showStatus("❌ Erreur lors de l'import : " + err.message, "error");
    }
  };
  reader.readAsText(file);
}

// Applique un objet de sauvegarde au formulaire (réutilisé par l'import
// JSON fichier ET par la restauration automatique — module AUTOSAVE).
async function applyImportedData(data) {
      const formData = data.formData || {};
      const photos = data.photos || {};

      // 1) Réinitialiser tous les champs sans confirmation
      // (on exclut le hidden modeIntervention qui sera géré juste après)
      document.querySelectorAll("input, textarea, select").forEach(el => {
        if (el.id === "modeIntervention") return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = false;
        else if (el.type !== "file") el.value = "";
      });
      // Le sélecteur de client revient à sa valeur par défaut (Bouygues)
      const selClient = document.getElementById("client_final");
      if (selClient) selClient.value = formData.client_final || "bouygues";
      const selLang = document.getElementById("bw_lang");
      if (selLang && formData.bw_lang) selLang.value = formData.bw_lang;
      syncClientAttr();

      // Restaurer le mode AUDIT/TRAVAUX si présent (par défaut: audit)
      setMode(data.mode === "travaux" ? "travaux" : "audit");
      Object.keys(photoStore).forEach(k => delete photoStore[k]);
      document.querySelectorAll(".photo-preview").forEach(p => {
        p.src = "";
        p.classList.remove("shown");
      });
      document.querySelectorAll(".annotate-btn").forEach(b => b.disabled = true);

      // 1b) Retirer les blocs cheminement_N créés dynamiquement (n > 3)
      document.querySelectorAll('[data-cheminement-block]').forEach(block => {
        const key = block.dataset.cheminementBlock;
        const n = parseInt((key || "").split("_")[1], 10);
        if (n > 3) {
          delete PHOTO_LABELS[key];
          block.remove();
        }
      });

      // 1c) Re-créer les blocs cheminement_N nécessaires (présents dans le JSON et n > 3)
      Object.keys(photos).forEach(k => {
        if (/^cheminement_\d+$/.test(k)) {
          const n = parseInt(k.split("_")[1], 10);
          if (n > 3 && !document.querySelector(`[data-cheminement-block="${k}"]`)) {
            addCheminementBlock(k);
          }
        }
      });

      // 2) Restaurer les champs texte / date / etc.
      const TEXT_FIELDS = [
        "numero_ticket",
        "ref_commande","auditeur","date_audit","raison_sociale","adresse",
        "code_postal","ville","horaire","procedure_acces","tel_site",
        "contact_nom","contact_fonction","contact_tel","contact_mail",
        "empl_description","empl_hauteur","obstr_commentaire","cable_longueur",
        "hauteur_max","heure_debut","heure_fin","duree_totale","duree_intervention","nb_techniciens",
        "epi_remarques","observations","signataire_nom","signataire_date",
        // ===== Champs spécifiques BLUEWIRELESS (texte / textarea) =====
        "bw_gps","bw_building_material","bw_contact_landlord","bw_contact_civils",
        "bw_contact_facilities","bw_contact_escort","bw_ingress_detail","bw_indoor_placement",
        "bw_power_type","bw_power_issues","bw_emplacement_retenu","bw_reco",
        "bw_bom_dish","bw_bom_router","bw_bom_cable_ant","bw_bom_cable_eth",
        "bw_bom_mount","bw_bom_infra","bw_bom_consumables","bw_sow_bw","bw_risques",
        "bw_bom_customer","bw_sow_customer","bw_approbation","bw_next_steps"
      ];
      TEXT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && formData[id] !== undefined && formData[id] !== null) {
          el.value = formData[id];
        }
      });

      // 3) Restaurer les groupes de checkboxes
      restoreCheckGroup("type_empl",   formData.type_empl);
      restoreCheckGroup("access",      formData.access);
      restoreCheckGroup("degagement",  formData.degagement);
      restoreCheckGroup("obstruction", formData.obstruction);
      restoreCheckGroup("support",     formData.support);
      restoreCheckGroup("cheminement", formData.cheminement);
      restoreCheckGroup("penetration", formData.penetration);
      restoreCheckGroup("etancheite",  formData.etancheite);

      // 4) Restaurer les radios
      if (formData.nacelle_prevoir)  setRadio("nacelle_prevoir",  formData.nacelle_prevoir);
      if (formData.nacelle_utilisee) setRadio("nacelle_utilisee", formData.nacelle_utilisee);
      if (formData.echelle_echafaud) setRadio("echelle_echafaud", formData.echelle_echafaud);
      if (formData.cablage_supp)     setRadio("cablage_supp",     formData.cablage_supp);

      // 4-bis) Restaurer les radios spécifiques BLUEWIRELESS
      [
        "bw_building_type","bw_ownership","bw_ingress_exist","bw_rj45",
        "bw_power_2sockets","bw_ups","bw_faisable"
      ].forEach(name => {
        if (formData[name]) setRadio(name, formData[name]);
      });

      // 4b) Recalculer la durée à partir des heures restaurées (mode TRAVAUX)
      updateDureeIntervention();

      // 5) Restaurer les EPI
      if (Array.isArray(formData.epi)) {
        formData.epi.forEach(({ key, value }) => {
          if (value) setRadio("epi_" + key, value);
        });
      }

      // 6) Restaurer les photos + annotations
      for (const [key, photoData] of Object.entries(photos)) {
        if (!photoData || !photoData.dataUrl) continue;

        // Convertir dataUrl (base64) en Uint8Array
        const u8 = await dataUrlToUint8ArrayApp(photoData.dataUrl);

        photoStore[key] = {
          data: u8,
          type: photoData.type || "png",
          name: photoData.name || null,
          dataUrl: photoData.dataUrl,
          originalDataUrl: photoData.originalDataUrl || null,
          annotated: !!photoData.annotated,
          annotations: photoData.annotations || null,
          naturalWidth: photoData.naturalWidth || null,
          naturalHeight: photoData.naturalHeight || null,
        };

        // Mettre à jour l'aperçu
        const preview = document.getElementById("preview_" + key);
        if (preview) {
          preview.src = photoData.dataUrl;
          preview.classList.add("shown");
        }
        const annotateBtn = document.querySelector(`[data-annotate="${key}"]`);
        if (annotateBtn) annotateBtn.disabled = false;
      }
}
window.applyImportedData = applyImportedData;

// Helper : restaurer un groupe de checkboxes
function restoreCheckGroup(name, values) {
  const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
  checkboxes.forEach(cb => {
    cb.checked = Array.isArray(values) && values.includes(cb.value);
  });
}

// Helper : sélectionner un radio
function setRadio(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

// Helper : dataUrl base64 → Uint8Array (version locale pour app.js)
async function dataUrlToUint8ArrayApp(dataUrl) {
  try {
    const res = await fetch(dataUrl);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    // Fallback : décodage manuel (au cas où fetch refuserait l'URL)
    const base64 = dataUrl.split(",")[1] || "";
    const binary = atob(base64);
    const u8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
    return u8;
  }
}

// ============================================================
//  SAUVEGARDE AUTOMATIQUE DANS LE NAVIGATEUR (IndexedDB)
//  Si le technicien recharge accidentellement la page, toutes
//  les données (champs, radios, EPI, photos annotées...) sont
//  restaurées automatiquement.
//
//  • IndexedDB plutôt que localStorage : les photos en base64
//    satureraient la limite (~5 Mo) de localStorage.
//  • On RÉUTILISE buildExportData() / applyImportedData() :
//    exactement la même logique que l'export/import JSON.
//  • Garde-fou anti-écrasement : un formulaire vide n'écrase
//    JAMAIS une sauvegarde remplie.
//  • Sauvegarde aussi sur "pagehide" / "visibilitychange"
//    (beforeunload n'est pas fiable sur mobile/tablette).
// ============================================================
const AUTOSAVE = (() => {
  const DB_NAME = "auditStarlink";
  const STORE   = "autosave";
  const KEY     = "current";
  const DEBOUNCE_MS = 1200;

  let _dbPromise = null;
  let _timer = null;
  let _suspended = false; // true pendant une restauration

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("no-indexeddb")); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error || new Error("idb-open"));
    });
    return _dbPromise;
  }

  function _put(value) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error || new Error("idb-put"));
    }));
  }

  function _get() {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r  = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror   = () => reject(r.error || new Error("idb-get"));
    }));
  }

  function _del() {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error || new Error("idb-clear"));
    }));
  }

  // Jeu de données "essentiellement vide" ? (garde-fou anti-écrasement)
  function _isEmptyData(d) {
    if (!d) return true;
    const fd = d.formData || {};
    const hasField = Object.values(fd).some(v => {
      if (Array.isArray(v)) return v.length > 0 && v.some(x => x && (x.value || typeof x === "string"));
      return String(v || "").trim() !== "" && v !== "bouygues";
    });
    const hasPhoto = d.photos && Object.keys(d.photos).length > 0;
    return !hasField && !hasPhoto;
  }

  async function _saveNow() {
    if (_suspended) return;
    try {
      const data = buildExportData();
      if (_isEmptyData(data)) {
        let existing = null;
        try { existing = await _get(); } catch (_) {}
        if (existing && !_isEmptyData(existing)) {
          console.warn("Autosave ignoré : formulaire vide, sauvegarde existante conservée.");
          return;
        }
      }
      data.__autosavedAt = new Date().toISOString();
      await _put(data);
    } catch (err) {
      console.warn("Autosave échoué :", err);
    }
  }

  function schedule() {
    if (_suspended) return;
    clearTimeout(_timer);
    _timer = setTimeout(_saveNow, DEBOUNCE_MS);
  }

  async function restore() {
    let data = null;
    try { data = await _get(); } catch (err) { console.warn("Lecture autosave impossible :", err); }
    if (!data || _isEmptyData(data)) return false;
    _suspended = true;
    try {
      await applyImportedData(data);
      console.log("🔄 Session restaurée (sauvegarde du " + (data.__autosavedAt || "?") + ")");
    } catch (err) {
      console.error("Restauration autosave échouée :", err);
    } finally {
      // Délai large : l'application des photos base64 peut être longue sur mobile.
      setTimeout(() => { _suspended = false; }, 1500);
    }
    return true;
  }

  function attach() {
    ["input", "change"].forEach(evt => {
      document.body.addEventListener(evt, schedule, true);
    });
    // Filets de sécurité fiables sur mobile ET desktop
    window.addEventListener("beforeunload", () => { _saveNow(); });
    window.addEventListener("pagehide", () => { _saveNow(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") _saveNow();
    });
    // Sauvegarde périodique de sécurité : couvre les mutations
    // programmatiques (annotations photo...) qui ne déclenchent
    // pas d'évènement input/change.
    setInterval(_saveNow, 30000);
  }

  async function clear() {
    clearTimeout(_timer);
    try { await _del(); } catch (_) {}
  }

  return { attach, restore, schedule, clear, saveNow: _saveNow };
})();

// Déclencheur exposé pour les mutations programmatiques (annotation photo,
// ajout de bloc cheminement...) qui ne génèrent pas d'évènement input/change.
window.__autosaveSchedule = () => AUTOSAVE.schedule();
window.__AUTOSAVE = AUTOSAVE;

// Branchement : restaurer la session PUIS activer les écouteurs (ordre
// important pour ne pas écraser la sauvegarde au chargement).
document.addEventListener("DOMContentLoaded", async () => {
  try { await AUTOSAVE.restore(); }
  catch (err) { console.warn("Restauration auto impossible :", err); }
  AUTOSAVE.attach();
});
