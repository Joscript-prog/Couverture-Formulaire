// ============================================================
//  FORMULAIRE CÂBLAGE WI-FI — IPKONEKT
//  Cheminement pour la pose de bornes Wi-Fi.
//  Construit sur la même base que le formulaire CÂBLAGE :
//  photoStore, éditeur d'annotation (editor.js), client-config.js
//  (donneurs d'ordre), rapport Word style Starlink, autosave
//  IndexedDB, export / import JSON.
//
//  Spécificités :
//   • Plusieurs NIVEAUX, chacun avec un ou plusieurs PLANS
//     d'évacuation et une ou plusieurs BORNES.
//   • Chaque borne a un nom (proposé automatiquement) et une
//     couleur unique, utilisée automatiquement sur les plans.
//   • Synthèse par borne générée automatiquement dans le compte rendu.
//   • Pas d'envoi serveur : uniquement la génération du Word.
// ============================================================

const photoStore = {};

// ---------- Galeries « simples » (hors bornes) ----------
const galleryCounters = { baie_fermee: 0, blocage: 0, solution: 0 };
const GALLERIES = {
    baie_fermee: { containerId: "baieFermeeContainer", label: "Baie fermée",       withComment: false, commentPlaceholder: "" },
    blocage:     { containerId: "blocagesContainer",   label: "Blocage",           withComment: true,  commentPlaceholder: "Commentaire du blocage (nature, impact, localisation...)" },
    solution:    { containerId: "solutionsContainer",  label: "Solution proposée", withComment: true,  commentPlaceholder: "Commentaire de la solution proposée..." }
};

// ---------- Photos fixes ----------
const FIXED_PHOTOS = {
    photo_devanture:        { title: "Devanture" },
    photo_travaux_hauteur:  { title: "Travaux en hauteur" },
    photo_baie_ouverte:     { title: "Baie ouverte" },
    photo_emplacement_baie: { title: "Emplacement prévu pour la baie" },
    photo_prise_baie:       { title: "Prise électrique d'alimentation de la baie" }
};

// ---------- Couleurs du rapport (identiques aux autres formulaires) ----------
const COLOR_TITLE        = "1F3864";
const COLOR_SUBTITLE     = "2E75B6";
const COLOR_TABLE_LABEL  = "F2F2F2";
const COLOR_PHOTO_BG     = "DEEBF7";
const COLOR_PHOTO_BORDER = "BDD7EE";
const COLOR_BORDER       = "BFBFBF";
const COLOR_FOOTER       = "808080";
const COLOR_WHITE        = "FFFFFF";
const COLOR_OK           = "16A34A";
const COLOR_KO           = "C0392B";

// ---------- Couleurs des bornes (attribuées automatiquement) ----------
const WIFI_PALETTE = [
    { hex: "#E6194B", nom: "Rouge" },
    { hex: "#0072CE", nom: "Bleu" },
    { hex: "#2E9E3E", nom: "Vert" },
    { hex: "#F58231", nom: "Orange" },
    { hex: "#911EB4", nom: "Violet" },
    { hex: "#00A6B8", nom: "Turquoise" },
    { hex: "#E022C9", nom: "Magenta" },
    { hex: "#8B5A2B", nom: "Marron" },
    { hex: "#C9A400", nom: "Jaune" },
    { hex: "#1B2A8A", nom: "Bleu marine" },
    { hex: "#7CB518", nom: "Vert clair" },
    { hex: "#FF6F91", nom: "Rose" }
];
const COMMUN = { id: "commun", nom: "Cheminement commun", hex: "#5F6B7A", colorName: "Gris" };

const POSE_TYPES = {
    plafond:      { label: "Plafond",       phrase: "pose au plafond" },
    faux_plafond: { label: "Faux plafond",  phrase: "pose en faux plafond" },
    mur:          { label: "Mur",           phrase: "pose murale" },
    autre:        { label: "Autre",         phrase: "autre type de pose" }
};

let baieConformeManuel = false;
let syntheseManuel = false;

// ============================================================
//  ÉTAT DES NIVEAUX / PLANS / BORNES
// ============================================================
let WIFI = newWifiState();

function newWifiState() {
    return { niveaux: [], bornes: {}, seq: { niveau: 0, borne: 0, photo: 0 } };
}

function wifiNewKey(prefix) {
    WIFI.seq.photo++;
    return `${prefix}_${WIFI.seq.photo}`;
}

function wifiNiveau(id) { return WIFI.niveaux.find(n => n.id === id) || null; }
function wifiNiveauIndex(id) { return WIFI.niveaux.findIndex(n => n.id === id); }

function wifiNiveauLabel(n) {
    if (!n) return "";
    const nom = (n.nom || "").trim();
    return nom || `Niveau ${wifiNiveauIndex(n.id) + 1}`;
}

function borneColor(b) { return WIFI_PALETTE[(b.colorIdx || 0) % WIFI_PALETTE.length].hex; }
function borneColorName(b) { return WIFI_PALETTE[(b.colorIdx || 0) % WIFI_PALETTE.length].nom; }

// Liste des bornes dans l'ordre du site (niveau par niveau)
function wifiOrderedBornes() {
    const out = [];
    WIFI.niveaux.forEach(n => {
        n.bornes.forEach(id => {
            const b = WIFI.bornes[id];
            if (b) out.push({ b, n });
        });
    });
    return out;
}

function wifiPickColor() {
    const used = new Set(Object.values(WIFI.bornes).map(b => b.colorIdx));
    for (let i = 0; i < WIFI_PALETTE.length; i++) {
        if (!used.has(i)) return i;
    }
    return Object.keys(WIFI.bornes).length % WIFI_PALETTE.length;
}

function wifiAutoNames() {
    WIFI.niveaux.forEach(n => {
        const lbl = wifiNiveauLabel(n);
        n.bornes.forEach((id, i) => {
            const b = WIFI.bornes[id];
            if (b && !b.nomManuel) b.nom = `Borne ${i + 1} ${lbl}`;
        });
    });
}

function wifiDefaultNiveauName() {
    const idx = WIFI.niveaux.length;
    return idx === 0 ? "RDC" : `R+${idx}`;
}

function wifiAddNiveau() {
    WIFI.seq.niveau++;
    const n = {
        id: "n" + WIFI.seq.niveau,
        nom: wifiDefaultNiveauName(),
        collapsed: false,
        plans: [{ key: wifiNewKey("plan"), comment: "" }],
        bornes: []
    };
    WIFI.niveaux.push(n);
    wifiAddBorne(n.id);
    return n;
}

function wifiAddBorne(niveauId) {
    const n = wifiNiveau(niveauId);
    if (!n) return null;
    WIFI.seq.borne++;
    const b = {
        id: "b" + WIFI.seq.borne,
        niveauId,
        nom: "",
        nomManuel: false,
        colorIdx: wifiPickColor(),
        emplacement: "",
        pose: "",
        hauteur: "",
        metrage: "",
        sameAs: "",
        cheminement: "",
        collapsed: false,
        empKey: wifiNewKey("bemp"),
        chem: [],
        perc: []
    };
    WIFI.bornes[b.id] = b;
    n.bornes.push(b.id);
    wifiAutoNames();
    return b;
}

function wifiBornePhotoKeys(b) {
    return [b.empKey, ...b.chem.map(i => i.key), ...b.perc.map(i => i.key)];
}

async function wifiDeleteBorne(id) {
    const b = WIFI.bornes[id];
    if (!b) return;
    wifiBornePhotoKeys(b).forEach(k => delete photoStore[k]);
    const n = wifiNiveau(b.niveauId);
    if (n) n.bornes = n.bornes.filter(x => x !== id);
    delete WIFI.bornes[id];
    Object.values(WIFI.bornes).forEach(o => { if (o.sameAs === id) o.sameAs = ""; });
    wifiAutoNames();
    await wifiPurgeOwner(id);
}

async function wifiDeleteNiveau(id) {
    const n = wifiNiveau(id);
    if (!n) return;
    for (const bid of n.bornes.slice()) await wifiDeleteBorne(bid);
    n.plans.forEach(p => delete photoStore[p.key]);
    WIFI.niveaux = WIFI.niveaux.filter(x => x.id !== id);
    wifiAutoNames();
}

// Retrouve à quoi correspond une clé photo (plan / photo de borne)
function wifiPhotoInfo(key) {
    for (let ni = 0; ni < WIFI.niveaux.length; ni++) {
        const n = WIFI.niveaux[ni];
        const pi = n.plans.findIndex(p => p.key === key);
        if (pi >= 0) return { kind: "plan", niveauId: n.id, label: wifiPlanLabel(key) };
    }
    for (const b of Object.values(WIFI.bornes)) {
        if (b.empKey === key) return { kind: "borne", borneId: b.id, label: `${b.nom} — Emplacement` };
        const ci = b.chem.findIndex(i => i.key === key);
        if (ci >= 0) return { kind: "borne", borneId: b.id, label: `${b.nom} — Cheminement ${ci + 1}` };
        const pi = b.perc.findIndex(i => i.key === key);
        if (pi >= 0) return { kind: "borne", borneId: b.id, label: `${b.nom} — Percement ${pi + 1}` };
    }
    return null;
}

function wifiPlanLabel(key) {
    for (const n of WIFI.niveaux) {
        const i = n.plans.findIndex(p => p.key === key);
        if (i >= 0) return `Plan ${i + 1} — ${wifiNiveauLabel(n)}`;
    }
    return "Plan";
}

function wifiAllPlanKeys() {
    const out = [];
    WIFI.niveaux.forEach(n => n.plans.forEach(p => out.push(p.key)));
    return out;
}

// Bornes / cheminement commun dessinés sur un plan (dans l'ordre du site)
function wifiPlanOwners(key) {
    const p = photoStore[key];
    if (!p || !Array.isArray(p.annotations)) return [];
    const set = new Set();
    p.annotations.forEach(d => {
        if (!d || !d.owner) return;
        if (d.type === "borne" || d.type === "arrow" || d.type === "polyline") set.add(d.owner);
    });
    const out = [];
    wifiOrderedBornes().forEach(({ b }) => { if (set.has(b.id)) out.push(b.id); });
    if (set.has("commun")) out.push("commun");
    return out;
}

function wifiFindPlacement(borneId, excludeKey) {
    for (const key of wifiAllPlanKeys()) {
        if (key === excludeKey) continue;
        const p = photoStore[key];
        if (p && Array.isArray(p.annotations) &&
            p.annotations.some(d => d && d.type === "borne" && d.owner === borneId)) {
            return { key, label: wifiPlanLabel(key) };
        }
    }
    return null;
}

function wifiIsBorneEmpty(b) {
    const hasPhoto = wifiBornePhotoKeys(b).some(k => photoStore[k]);
    const hasComment = [...b.chem, ...b.perc].some(i => (i.comment || "").trim());
    return !b.emplacement.trim() && !b.pose && !String(b.hauteur).trim() && !String(b.metrage).trim() &&
        !b.sameAs && !b.cheminement.trim() && !hasPhoto && !hasComment && !wifiFindPlacement(b.id, null);
}

// ---------- Mise à jour des photos annotées ----------
async function wifiRerenderPhoto(key) {
    const p = photoStore[key];
    if (!p || !p.annotations || !window.Editor || !window.Editor.renderPhoto) return;
    try {
        const r = await window.Editor.renderPhoto(p);
        p.dataUrl = r.dataUrl;
        p.data = dataUrlToUint8Array(r.dataUrl);
        p.type = "jpg";
        p.naturalWidth = r.width;
        p.naturalHeight = r.height;
        const prev = document.getElementById("preview_" + key);
        if (prev) prev.src = r.dataUrl;
    } catch (err) {
        console.warn("Rendu de la photo impossible (" + key + ") :", err);
    }
}

// Photos portant une étiquette de borne → à régénérer quand un nom change
async function wifiRerenderMarkerPhotos() {
    const keys = Object.keys(photoStore).filter(k => {
        const p = photoStore[k];
        return p && Array.isArray(p.annotations) && p.annotations.some(d => d && d.type === "borne");
    });
    for (const k of keys) await wifiRerenderPhoto(k);
}

let _markerTimer = null;
function wifiScheduleMarkerRerender() {
    clearTimeout(_markerTimer);
    _markerTimer = setTimeout(() => { wifiRerenderMarkerPhotos(); }, 1200);
}

// Retire d'une photo tout ce qui appartient à une borne supprimée
async function wifiPurgeOwner(borneId) {
    for (const key of Object.keys(photoStore)) {
        const p = photoStore[key];
        if (!p || !Array.isArray(p.annotations)) continue;
        const kept = p.annotations.filter(d => !(d && d.owner === borneId &&
            (d.type === "borne" || d.type === "arrow" || d.type === "polyline")));
        if (kept.length !== p.annotations.length) {
            p.annotations = kept;
            await wifiRerenderPhoto(key);
        }
    }
}

// ---------- Pont avec l'éditeur d'annotation ----------
window.WifiBridge = {
    getOwners() {
        return wifiOrderedBornes().map(({ b, n }) => ({
            id: b.id, nom: b.nom, color: borneColor(b), niveauNom: wifiNiveauLabel(n)
        }));
    },
    getOwner(id) {
        if (id === "commun") return { id, nom: COMMUN.nom, color: COMMUN.hex };
        const b = WIFI.bornes[id];
        return b ? { id, nom: b.nom, color: borneColor(b) } : null;
    },
    defaultOwner(ctx, last) {
        if (ctx && ctx.kind === "borne" && WIFI.bornes[ctx.borneId]) return ctx.borneId;
        if (ctx && ctx.kind === "plan") {
            const n = wifiNiveau(ctx.niveauId);
            if (last && this.getOwner(last)) return last;
            if (n && n.bornes.length) return n.bornes[0];
        }
        const all = wifiOrderedBornes();
        return all.length ? all[0].b.id : "commun";
    },
    findPlanPlacement(borneId, excludeKey) { return wifiFindPlacement(borneId, excludeKey); },
    async removeBorneMarker(key, borneId) {
        const p = photoStore[key];
        if (!p || !Array.isArray(p.annotations)) return;
        p.annotations = p.annotations.filter(d => !(d && d.type === "borne" && d.owner === borneId));
        await wifiRerenderPhoto(key);
        wifiRefreshDerived();
    },
    afterSave() { wifiRefreshDerived(); }
};

// ============================================================
//  CLIENT FINAL — surcouche « sans donneur d'ordre »
// ============================================================
function isSansDonneurOrdre() {
    const sel = document.getElementById("client_final");
    return !sel || !sel.value || sel.value === "aucun";
}
function wifiFooterText() {
    if (isSansDonneurOrdre()) return "Document confidentiel — Usage interne IPKONEKT";
    return clientFooterText();
}
function wifiBannerText(separator) {
    if (isSansDonneurOrdre()) return "IPKONEKT";
    return clientBannerText(separator);
}
function wifiClientLogoBytes() {
    if (isSansDonneurOrdre()) return null;
    return clientLogoBytes();
}

function waitForLibs() {
    return new Promise((resolve) => {
        const check = () => {
            if (typeof window.docx !== "undefined" && typeof window.saveAs !== "undefined") resolve();
            else setTimeout(check, 100);
        };
        check();
    });
}

function escapeHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function schedule() { if (window.__autosaveSchedule) window.__autosaveSchedule(); }

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    await waitForLibs();

    const today = new Date().toISOString().slice(0, 10);
    const dateAudit = document.getElementById("date_audit");
    const sigDate = document.getElementById("signataire_date");
    if (dateAudit && !dateAudit.value) dateAudit.value = today;
    if (sigDate && !sigDate.value) sigDate.value = today;

    document.body.addEventListener("click", handleGlobalClick);
    document.body.setAttribute("data-mode", "audit");

    bindGalleryButton("addBaieFermeeBtn", "baie_fermee");
    bindGalleryButton("addBlocageBtn", "blocage");
    bindGalleryButton("addSolutionBtn", "solution");

    // Photos fixes
    document.querySelectorAll("input[data-photo-input]").forEach(input => {
        input.addEventListener("change", async (e) => {
            const key = input.dataset.photoInput;
            const file = e.target.files[0];
            if (!file) return;
            await processPhoto(file, key);
            const annBtn = document.querySelector(`[data-annotate="${key}"]`);
            if (annBtn) annBtn.disabled = false;
            e.target.value = "";
        });
    });

    // Blocage
    const blocageCb = document.getElementById("blocageEnabled");
    if (blocageCb) blocageCb.addEventListener("change", () => {
        applyBlocageVisibility(blocageCb.checked);
        schedule();
    });

    // Baie existante ou à installer
    document.querySelectorAll('input[name="baie_existante"]').forEach(r => {
        r.addEventListener("change", () => {
            applyBaieVisibility();
            scheduleSynthese();
        });
    });

    // Conformité de la baie
    ["nb_u_dispo", "nb_prises_baie"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => updateBaieConformite(false));
    });
    document.querySelectorAll('input[name="baie_conforme"]').forEach(r => {
        r.addEventListener("click", () => {
            baieConformeManuel = true;
            updateConfBadge();
        });
    });
    const confAutoBtn = document.getElementById("confAutoBtn");
    if (confAutoBtn) confAutoBtn.addEventListener("click", () => {
        baieConformeManuel = false;
        updateBaieConformite(true);
    });

    // Niveaux / plans / bornes
    setupWifiEvents();
    const addNiveauBtn = document.getElementById("addNiveauBtn");
    if (addNiveauBtn) addNiveauBtn.addEventListener("click", () => {
        const n = wifiAddNiveau();
        renderWifi();
        scrollToEl(`[data-niveau="${n.id}"]`);
        scheduleSynthese();
        schedule();
    });

    // Synthèse automatique
    const synth = document.getElementById("synthese_bornes");
    if (synth) synth.addEventListener("input", () => {
        syntheseManuel = true;
        updateSyntheseBadge();
    });
    const regen = document.getElementById("syntheseRegenBtn");
    if (regen) regen.addEventListener("click", () => {
        if (syntheseManuel && !confirm("Remplacer le texte modifié à la main par la synthèse générée automatiquement ?")) return;
        syntheseManuel = false;
        refreshSynthese(true);
        schedule();
    });

    const restored = await AUTOSAVE.restore();
    if (!restored) {
        addGalleryItem("baie_fermee");
        WIFI = newWifiState();
        wifiAddNiveau();
        renderWifi();
    }

    AUTOSAVE.attach();
    applyBaieVisibility();
    updateBaieConformite(false);
    refreshSynthese(false);
});

function bindGalleryButton(btnId, kind) {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener("click", () => {
        addGalleryItem(kind);
        schedule();
    });
}

function scrollToEl(selector) {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- MODE AUDIT / TRAVAUX ----------
window.setMode = function (mode) {
    const hidden = document.getElementById("modeIntervention");
    if (hidden) hidden.value = mode;
    const ba = document.getElementById("modeAuditBtn");
    const bt = document.getElementById("modeTravauxBtn");
    if (ba && bt) {
        ba.classList.toggle("active", mode === "audit");
        bt.classList.toggle("active", mode === "travaux");
    }
    document.body.setAttribute("data-mode", mode);
    scheduleSynthese();
    schedule();
};

function getMode() {
    return (document.getElementById("modeIntervention")?.value) === "travaux" ? "travaux" : "audit";
}

// ---------- BLOCAGE ----------
function applyBlocageVisibility(enabled) {
    document.body.setAttribute("data-blocage", enabled ? "on" : "off");
    if (enabled) {
        if (!document.querySelector("#blocagesContainer .cheminement-item")) addGalleryItem("blocage");
        if (!document.querySelector("#solutionsContainer .cheminement-item")) addGalleryItem("solution");
    }
}
function isBlocageEnabled() {
    const cb = document.getElementById("blocageEnabled");
    return !!(cb && cb.checked);
}

// ---------- BAIE ----------
function getBaieExistante() {
    const r = document.querySelector('input[name="baie_existante"]:checked');
    return r ? r.value : "";
}
function applyBaieVisibility() {
    const v = getBaieExistante();
    document.body.setAttribute("data-baie", v === "Oui" ? "oui" : (v === "Non" ? "non" : ""));
}
function computeBaieConformite() {
    const u = parseInt(document.getElementById("nb_u_dispo")?.value, 10);
    const p = parseInt(document.getElementById("nb_prises_baie")?.value, 10);
    if (isNaN(u) && isNaN(p)) return null;
    return (u >= 2 && p >= 2) ? "Oui" : "Non";
}
function updateBaieConformite(force) {
    if (baieConformeManuel && !force) { updateConfBadge(); return; }
    const auto = computeBaieConformite();
    if (auto !== null) {
        const radio = document.querySelector(`input[name="baie_conforme"][value="${auto}"]`);
        if (radio) radio.checked = true;
    }
    updateConfBadge();
}
function getBaieConformeValue() {
    const checked = document.querySelector('input[name="baie_conforme"]:checked');
    return checked ? checked.value : "";
}
function updateConfBadge() {
    const badge = document.getElementById("confBadge");
    const autoBtn = document.getElementById("confAutoBtn");
    const v = getBaieConformeValue();
    if (badge) {
        if (v) {
            badge.style.display = "inline-block";
            badge.textContent = baieConformeManuel ? `${v} (manuel)` : `${v} (auto)`;
            badge.className = "conf-badge " + (v === "Oui" ? "ok" : "ko");
        } else {
            badge.style.display = "none";
        }
    }
    if (autoBtn) autoBtn.style.display = baieConformeManuel ? "inline" : "none";
}

// ============================================================
//  CLICS GLOBAUX (annoter / effacer / supprimer)
// ============================================================
function handleGlobalClick(e) {
    const annBtn = e.target.closest("[data-annotate]");
    if (annBtn) {
        const key = annBtn.dataset.annotate;
        if (!photoStore[key]) {
            alert("Importez d'abord une photo.");
            return;
        }
        if (!window.Editor || !window.Editor.open) {
            alert("L'éditeur d'annotation n'est pas chargé.");
            return;
        }
        const info = wifiPhotoInfo(key);
        if (info) {
            window.Editor.open(key, info.label, { kind: info.kind, niveauId: info.niveauId, borneId: info.borneId, key });
        } else {
            const title = (FIXED_PHOTOS[key] && FIXED_PHOTOS[key].title) || annBtn.dataset.label || "Photo";
            window.Editor.open(key, title, { kind: "other", key });
        }
        return;
    }

    const clearBtn = e.target.closest("[data-clear]");
    if (clearBtn) {
        const key = clearBtn.dataset.clear;
        delete photoStore[key];
        const preview = document.getElementById("preview_" + key);
        if (preview) {
            preview.removeAttribute("src");
            preview.classList.remove("shown");
        }
        const ann = document.querySelector(`[data-annotate="${key}"]`);
        if (ann) ann.disabled = true;
        wifiRefreshDerived();
        schedule();
        return;
    }

    const delItem = e.target.closest("[data-del-gallery]");
    if (delItem) {
        const item = delItem.closest(".cheminement-item");
        if (item && confirm("Supprimer cette photo ?")) {
            delete photoStore[item.dataset.photoKey];
            const kind = item.dataset.kind;
            item.remove();
            if (kind) renumberGallery(kind);
            schedule();
        }
    }
}

// ============================================================
//  GALERIES SIMPLES (baie fermée, blocages, solutions)
// ============================================================
function addGalleryItem(kind, opts = {}) {
    const cfg = GALLERIES[kind];
    if (!cfg) return null;
    const container = document.getElementById(cfg.containerId);
    if (!container) return null;

    let idx;
    if (opts.idx != null) {
        idx = parseInt(opts.idx, 10);
        if (idx > galleryCounters[kind]) galleryCounters[kind] = idx;
    } else {
        galleryCounters[kind]++;
        idx = galleryCounters[kind];
    }
    const key = `${kind}_${idx}`;
    const num = container.querySelectorAll(".cheminement-item").length + 1;

    const div = document.createElement("div");
    div.className = "cheminement-item";
    div.dataset.idx = idx;
    div.dataset.kind = kind;
    div.dataset.photoKey = key;
    div.innerHTML = `
        <div class="chem-header">
            <strong>📷 ${cfg.label} ${num}</strong>
            <button type="button" class="btn-delete" data-del-gallery title="Supprimer">🗑</button>
        </div>
        <input type="file" accept="image/*">
        <img class="photo-preview" id="preview_${key}" alt="">
        <div class="chem-actions">
            <button type="button" class="annotate-btn" data-annotate="${key}" data-label="${cfg.label} ${num}" disabled>✏ Annoter</button>
            <button type="button" class="clear-btn" data-clear="${key}">🗑 Effacer</button>
        </div>
        ${cfg.withComment ? `<textarea class="cheminement-comment" placeholder="${cfg.commentPlaceholder}"></textarea>` : ""}
    `;
    container.appendChild(div);

    div.querySelector('input[type="file"]').addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await processPhoto(file, key);
        const annBtn = div.querySelector(".annotate-btn");
        if (annBtn) annBtn.disabled = false;
        e.target.value = "";
    });
    return div;
}

function renumberGallery(kind) {
    const cfg = GALLERIES[kind];
    const container = document.getElementById(cfg.containerId);
    if (!container) return;
    container.querySelectorAll(".cheminement-item").forEach((item, i) => {
        const strong = item.querySelector(".chem-header strong");
        if (strong) strong.textContent = `📷 ${cfg.label} ${i + 1}`;
    });
}

// ============================================================
//  RENDU DES NIVEAUX / PLANS / BORNES
// ============================================================
function photoBlockHtml(key, opts = {}) {
    const has = !!photoStore[key];
    const src = has ? photoStore[key].dataUrl : "";
    return `
        <input type="file" accept="image/*" data-wifi-photo="${key}">
        <img class="photo-preview${has ? " shown" : ""}" id="preview_${key}" alt=""${has ? ` src="${src}"` : ""}>
        <div class="chem-actions">
            <button type="button" class="annotate-btn" data-annotate="${key}"${has ? "" : " disabled"}>${opts.annotateLabel || "✏ Annoter"}</button>
            <button type="button" class="clear-btn" data-clear="${key}">🗑 Effacer</button>
        </div>`;
}

function itemHtml(title, key, list, comment, placeholder, extra = "") {
    return `
        <div class="cheminement-item" data-photo-key="${key}" data-list="${list}">
            <div class="chem-header">
                <strong>${title}</strong>
                <button type="button" class="btn-delete" data-wifi-act="del-item" title="Supprimer">🗑</button>
            </div>
            ${photoBlockHtml(key, extra ? { annotateLabel: extra } : {})}
            <textarea class="cheminement-comment" data-wifi-field="item-comment" placeholder="${escapeHtml(placeholder)}">${escapeHtml(comment || "")}</textarea>
        </div>`;
}

function sameAsOptionsHtml(b) {
    let html = `<option value="">— Non, cheminement propre à cette borne —</option>`;
    wifiOrderedBornes().forEach(({ b: o }) => {
        if (o.id === b.id) return;
        html += `<option value="${o.id}"${b.sameAs === o.id ? " selected" : ""}>${escapeHtml(o.nom)}</option>`;
    });
    return html;
}

function poseOptionsHtml(b) {
    let html = `<option value="">— Choisir —</option>`;
    Object.keys(POSE_TYPES).forEach(k => {
        html += `<option value="${k}"${b.pose === k ? " selected" : ""}>${POSE_TYPES[k].label}</option>`;
    });
    return html;
}

function buildBorneCard(b) {
    const color = borneColor(b);
    const sameAs = b.sameAs && WIFI.bornes[b.sameAs] ? WIFI.bornes[b.sameAs] : null;
    const div = document.createElement("div");
    div.className = "wifi-borne" + (b.collapsed ? " collapsed" : "");
    div.dataset.borne = b.id;
    div.style.setProperty("--borne-color", color);
    div.innerHTML = `
        <div class="wifi-borne-head">
            <button type="button" class="wifi-toggle" data-wifi-act="toggle-borne" aria-label="Replier / déplier">▾</button>
            <span class="wifi-dot" title="Couleur sur les plans : ${borneColorName(b)}"></span>
            <input type="text" class="wifi-borne-nom" data-wifi-field="nom" value="${escapeHtml(b.nom)}" aria-label="Nom de la borne">
            <span class="wifi-color-name">${borneColorName(b)}</span>
            <button type="button" class="btn-delete" data-wifi-act="del-borne" title="Supprimer la borne">🗑</button>
        </div>
        <div class="wifi-borne-body">
            <div class="wifi-placement"></div>
            <div class="wifi-grid">
                <label>Emplacement
                    <input type="text" data-wifi-field="emplacement" value="${escapeHtml(b.emplacement)}" placeholder="Ex : accueil, salle de réunion…">
                </label>
                <label>Type de pose
                    <select data-wifi-field="pose">${poseOptionsHtml(b)}</select>
                </label>
                <label>Hauteur de pose (m)
                    <input type="number" inputmode="decimal" step="0.1" min="0" data-wifi-field="hauteur" value="${escapeHtml(b.hauteur)}">
                </label>
                <label>Métrage de câble baie → borne (m)
                    <input type="number" inputmode="decimal" step="1" min="0" data-wifi-field="metrage" value="${escapeHtml(b.metrage)}">
                </label>
            </div>
            <label class="wifi-full">Même cheminement que
                <select data-wifi-field="sameAs">${sameAsOptionsHtml(b)}</select>
            </label>
            <label class="wifi-full"><span class="wifi-chem-label">${sameAs ? "Partie du cheminement propre à cette borne" : "Résumé du cheminement"}</span>
                <textarea data-wifi-field="cheminement" placeholder="${sameAs ? "Ex : descente en goulotte dans la salle" : "Ex : faux plafond du couloir, puis goulotte jusqu'à l'accueil"}">${escapeHtml(b.cheminement)}</textarea>
            </label>

            <div class="photo-cat-title small">📷 Emplacement de la borne</div>
            <div class="mp-photo-block wifi-single-photo">${photoBlockHtml(b.empKey)}</div>

            <div class="photo-cat-title small">📷 Photos du cheminement</div>
            <p class="photo-cat-note wifi-sameas-note"${sameAs ? "" : " hidden"}>Cheminement identique à « ${escapeHtml(sameAs ? sameAs.nom : "")} » : ajoutez seulement les photos de la partie propre à cette borne.</p>
            <div class="gallery-grid" data-list-container="chem">
                ${b.chem.map((it, i) => itemHtml(`📷 Cheminement ${i + 1}`, it.key, "chem", it.comment, "Commentaire (passage de câble, support, traversée…)")).join("")}
            </div>
            <button type="button" class="btn-secondary" data-wifi-act="add-chem">➕ Ajouter une photo de cheminement</button>

            <div class="photo-cat-title small">📷 Percements</div>
            <div class="gallery-grid" data-list-container="perc">
                ${b.perc.map((it, i) => itemHtml(`📷 Percement ${i + 1}`, it.key, "perc", it.comment, "Commentaire (emplacement, diamètre, rebouchage…)")).join("")}
            </div>
            <button type="button" class="btn-secondary" data-wifi-act="add-perc">➕ Ajouter une photo de percement</button>
        </div>`;
    return div;
}

function buildNiveauCard(n) {
    const div = document.createElement("div");
    div.className = "wifi-niveau" + (n.collapsed ? " collapsed" : "");
    div.dataset.niveau = n.id;
    const nb = n.bornes.length;
    div.innerHTML = `
        <div class="wifi-niveau-head">
            <button type="button" class="wifi-toggle" data-wifi-act="toggle-niveau" aria-label="Replier / déplier">▾</button>
            <label class="wifi-niveau-label">Niveau
                <input type="text" class="wifi-niveau-nom" data-wifi-field="niveau-nom" value="${escapeHtml(n.nom)}" placeholder="Ex : RDC, R+1, sous-sol, bâtiment B…">
            </label>
            <span class="wifi-niveau-count">${nb} borne${nb > 1 ? "s" : ""}</span>
            <button type="button" class="btn-delete" data-wifi-act="del-niveau" title="Supprimer le niveau">🗑</button>
        </div>
        <div class="wifi-niveau-body">
            <div class="photo-cat-title">🗺️ Plan(s) d'évacuation du niveau</div>
            <p class="photo-cat-note">Sur chaque plan : posez la baie et les bornes, puis tracez le cheminement de chaque borne. La couleur de chaque borne est appliquée automatiquement. Si plusieurs bornes suivent le même chemin, un seul trait suffit (couleur « Cheminement commun »).</p>
            <div class="gallery-grid" data-list-container="plans">
                ${n.plans.map((p, i) => `
                    <div class="cheminement-item" data-photo-key="${p.key}" data-list="plans">
                        <div class="chem-header">
                            <strong>🗺️ Plan ${i + 1} — ${escapeHtml(wifiNiveauLabel(n))}</strong>
                            <button type="button" class="btn-delete" data-wifi-act="del-item" title="Supprimer ce plan">🗑</button>
                        </div>
                        ${photoBlockHtml(p.key, { annotateLabel: "✏ Annoter / tracer" })}
                        <div class="wifi-legend" data-legend="${p.key}"></div>
                        <textarea class="cheminement-comment" data-wifi-field="item-comment" placeholder="Commentaire du plan (optionnel)">${escapeHtml(p.comment || "")}</textarea>
                    </div>`).join("")}
            </div>
            <button type="button" class="btn-secondary" data-wifi-act="add-plan">➕ Ajouter un plan pour ce niveau</button>

            <div class="photo-cat-title">📶 Bornes Wi-Fi du niveau</div>
            <div class="wifi-bornes"></div>
            <button type="button" class="btn-secondary" data-wifi-act="add-borne">➕ Ajouter une borne sur ce niveau</button>
        </div>`;
    const list = div.querySelector(".wifi-bornes");
    n.bornes.forEach(id => {
        const b = WIFI.bornes[id];
        if (b) list.appendChild(buildBorneCard(b));
    });
    return div;
}

function renderWifi() {
    const root = document.getElementById("wifiNiveaux");
    if (!root) return;
    root.innerHTML = "";
    WIFI.niveaux.forEach(n => root.appendChild(buildNiveauCard(n)));
    const empty = document.getElementById("wifiEmpty");
    if (empty) empty.hidden = WIFI.niveaux.length > 0;
    wifiRefreshDerived();
}

// Éléments qui dépendent des noms / annotations, mis à jour sans tout reconstruire
function wifiRefreshDerived() {
    // Légendes sous les plans
    document.querySelectorAll(".wifi-legend[data-legend]").forEach(el => {
        const owners = wifiPlanOwners(el.dataset.legend);
        if (!owners.length) {
            el.innerHTML = "";
            el.hidden = true;
            return;
        }
        el.hidden = false;
        el.innerHTML = `<span class="wifi-legend-title">Sur ce plan :</span>` + owners.map(id => {
            const o = window.WifiBridge.getOwner(id);
            return o ? `<span class="wifi-chip" style="--chip:${o.color}">${escapeHtml(o.nom)}</span>` : "";
        }).join("");
    });
    // Position de chaque borne sur les plans
    document.querySelectorAll(".wifi-borne[data-borne]").forEach(card => {
        const el = card.querySelector(".wifi-placement");
        if (!el) return;
        const pl = wifiFindPlacement(card.dataset.borne, null);
        el.textContent = pl ? `📍 Posée sur : ${pl.label}` : "📍 Pas encore posée sur un plan (bouton « ✏ Annoter / tracer » d'un plan).";
        el.classList.toggle("placed", !!pl);
    });
    scheduleSynthese();
}

// Met à jour les noms affichés (sans reconstruire les cartes)
function wifiSyncNames() {
    wifiAutoNames();
    document.querySelectorAll(".wifi-borne[data-borne]").forEach(card => {
        const b = WIFI.bornes[card.dataset.borne];
        if (!b) return;
        const inp = card.querySelector(".wifi-borne-nom");
        if (inp && document.activeElement !== inp && inp.value !== b.nom) inp.value = b.nom;
        const sel = card.querySelector('select[data-wifi-field="sameAs"]');
        if (sel) {
            const v = b.sameAs;
            sel.innerHTML = sameAsOptionsHtml(b);
            sel.value = v;
        }
        const note = card.querySelector(".wifi-sameas-note");
        const ref = b.sameAs && WIFI.bornes[b.sameAs];
        if (note) {
            note.hidden = !ref;
            if (ref) note.textContent = `Cheminement identique à « ${ref.nom} » : ajoutez seulement les photos de la partie propre à cette borne.`;
        }
    });
    document.querySelectorAll(".wifi-niveau[data-niveau]").forEach(card => {
        const n = wifiNiveau(card.dataset.niveau);
        if (!n) return;
        card.querySelectorAll('[data-list="plans"] .chem-header strong').forEach((s, i) => {
            s.textContent = `🗺️ Plan ${i + 1} — ${wifiNiveauLabel(n)}`;
        });
    });
    wifiRefreshDerived();
    wifiScheduleMarkerRerender();
}

function setupWifiEvents() {
    const root = document.getElementById("wifiNiveaux");
    if (!root) return;

    root.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-wifi-act]");
        if (!btn) return;
        const act = btn.dataset.wifiAct;
        const nCard = btn.closest(".wifi-niveau");
        const bCard = btn.closest(".wifi-borne");
        const n = nCard ? wifiNiveau(nCard.dataset.niveau) : null;
        const b = bCard ? WIFI.bornes[bCard.dataset.borne] : null;

        if (act === "toggle-niveau" && n) {
            n.collapsed = !n.collapsed;
            nCard.classList.toggle("collapsed", n.collapsed);
        } else if (act === "toggle-borne" && b) {
            b.collapsed = !b.collapsed;
            bCard.classList.toggle("collapsed", b.collapsed);
        } else if (act === "del-niveau" && n) {
            const nb = n.bornes.length;
            if (!confirm(`Supprimer le niveau « ${wifiNiveauLabel(n)} », ses plans et ${nb > 1 ? `ses ${nb} bornes` : (nb === 1 ? "sa borne" : "son contenu")} ?`)) return;
            await wifiDeleteNiveau(n.id);
            renderWifi();
        } else if (act === "del-borne" && b) {
            if (!confirm(`Supprimer « ${b.nom} », ses photos et ses tracés sur les plans ?`)) return;
            await wifiDeleteBorne(b.id);
            renderWifi();
            wifiScheduleMarkerRerender();
        } else if (act === "add-plan" && n) {
            n.plans.push({ key: wifiNewKey("plan"), comment: "" });
            renderWifi();
        } else if (act === "add-borne" && n) {
            const nb = wifiAddBorne(n.id);
            n.collapsed = false;
            renderWifi();
            scrollToEl(`[data-borne="${nb.id}"]`);
        } else if ((act === "add-chem" || act === "add-perc") && b) {
            const list = act === "add-chem" ? b.chem : b.perc;
            list.push({ key: wifiNewKey(act === "add-chem" ? "bchem" : "bperc"), comment: "" });
            renderWifi();
        } else if (act === "del-item") {
            const item = btn.closest(".cheminement-item");
            if (!item) return;
            const key = item.dataset.photoKey;
            const listName = item.dataset.list;
            const what = listName === "plans" ? "ce plan (et ses tracés)" : "cette photo";
            if (!confirm(`Supprimer ${what} ?`)) return;
            delete photoStore[key];
            if (listName === "plans" && n) n.plans = n.plans.filter(p => p.key !== key);
            else if (b && listName === "chem") b.chem = b.chem.filter(p => p.key !== key);
            else if (b && listName === "perc") b.perc = b.perc.filter(p => p.key !== key);
            renderWifi();
        } else {
            return;
        }
        scheduleSynthese();
        schedule();
    });

    const onField = (e, isChange) => {
        const t = e.target;
        const field = t.dataset ? t.dataset.wifiField : null;
        if (!field) return;
        const nCard = t.closest(".wifi-niveau");
        const bCard = t.closest(".wifi-borne");
        const n = nCard ? wifiNiveau(nCard.dataset.niveau) : null;
        const b = bCard ? WIFI.bornes[bCard.dataset.borne] : null;

        if (field === "niveau-nom" && n) {
            n.nom = t.value;
            wifiSyncNames();
        } else if (field === "nom" && b) {
            if (isChange && !t.value.trim()) {
                b.nomManuel = false;
                wifiAutoNames();
                t.value = b.nom;
            } else if (!isChange) {
                b.nom = t.value;
                b.nomManuel = true;
            }
            wifiSyncNames();
        } else if (field === "item-comment") {
            const item = t.closest(".cheminement-item");
            if (!item) return;
            const key = item.dataset.photoKey;
            const list = item.dataset.list === "plans" && n ? n.plans
                : (b ? (item.dataset.list === "chem" ? b.chem : b.perc) : null);
            const entry = list ? list.find(p => p.key === key) : null;
            if (entry) entry.comment = t.value;
            scheduleSynthese();
        } else if (b && ["emplacement", "pose", "hauteur", "metrage", "sameAs", "cheminement"].includes(field)) {
            b[field] = t.value;
            if (field === "sameAs") {
                const ref = b.sameAs && WIFI.bornes[b.sameAs];
                const lbl = bCard.querySelector(".wifi-chem-label");
                if (lbl) lbl.textContent = ref ? "Partie du cheminement propre à cette borne" : "Résumé du cheminement";
                const ta = bCard.querySelector('textarea[data-wifi-field="cheminement"]');
                if (ta) ta.placeholder = ref ? "Ex : descente en goulotte dans la salle" : "Ex : faux plafond du couloir, puis goulotte jusqu'à l'accueil";
                const note = bCard.querySelector(".wifi-sameas-note");
                if (note) {
                    note.hidden = !ref;
                    if (ref) note.textContent = `Cheminement identique à « ${ref.nom} » : ajoutez seulement les photos de la partie propre à cette borne.`;
                }
            }
            scheduleSynthese();
        }
    };
    root.addEventListener("input", (e) => onField(e, false));
    root.addEventListener("change", async (e) => {
        const t = e.target;
        if (t.matches && t.matches('input[type="file"][data-wifi-photo]')) {
            const key = t.dataset.wifiPhoto;
            const file = t.files && t.files[0];
            if (!file) return;
            await processPhoto(file, key);
            const annBtn = document.querySelector(`[data-annotate="${key}"]`);
            if (annBtn) annBtn.disabled = false;
            t.value = "";
            wifiRefreshDerived();
            return;
        }
        onField(e, true);
    });
}

// ============================================================
//  SYNTHÈSE AUTOMATIQUE PAR BORNE
// ============================================================
function fmtNum(v) { return String(v).trim().replace(".", ","); }

function lcFirst(s) {
    if (!s) return s;
    if (s.length > 1 && s[0] === s[0].toUpperCase() && s[1] === s[1].toLowerCase() && s[0] !== s[0].toLowerCase()) {
        return s[0].toLowerCase() + s.slice(1);
    }
    return s;
}

function ucFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function oneLine(s) { return String(s || "").replace(/\s*\n+\s*/g, " ").trim(); }

function bornePercements(b) {
    const items = b.perc.filter(i => photoStore[i.key] || (i.comment || "").trim());
    const comments = items.map(i => oneLine(i.comment)).filter(Boolean);
    return { count: items.length, comments };
}

function borneCheminementText(b) {
    const spec = oneLine(b.cheminement);
    const ref = b.sameAs && WIFI.bornes[b.sameAs];
    if (ref) return `identique à ${ref.nom}` + (spec ? `, puis ${lcFirst(spec)}` : "");
    return spec;
}

function borneHeadText(b) {
    const parts = [];
    if (b.emplacement.trim()) parts.push(oneLine(b.emplacement));
    let pose = POSE_TYPES[b.pose] ? POSE_TYPES[b.pose].phrase : "";
    if (String(b.hauteur).trim()) pose = (pose || "pose") + ` à ${fmtNum(b.hauteur)} m`;
    if (pose) parts.push(pose);
    return parts.length ? ucFirst(parts.join(", ")) : "";
}

function buildSynthese() {
    const travaux = getMode() === "travaux";
    const baieFuture = getBaieExistante() === "Non";
    const src = baieFuture ? "depuis la future baie de brassage" : "depuis la baie de brassage";
    const blocks = [];

    wifiOrderedBornes().forEach(({ b }) => {
        if (wifiIsBorneEmpty(b)) return;
        const head = borneHeadText(b);
        const lines = [head ? `${b.nom} — ${head}` : b.nom];

        if (String(b.metrage).trim()) {
            const m = fmtNum(b.metrage);
            lines.push(travaux ? `   • ${m} m de câble tirés ${src}` : `   • Prévoir ${m} m de câble ${src}`);
        } else {
            lines.push("   • Métrage de câble non renseigné");
        }

        const chem = borneCheminementText(b);
        if (chem) lines.push(`   • Cheminement : ${chem}`);

        const perc = bornePercements(b);
        if (perc.count) {
            const s = perc.count > 1 ? "s" : "";
            lines.push(`   • ${perc.count} percement${s}` + (perc.comments.length ? ` : ${perc.comments.join(" ; ")}` : " (voir photos)"));
        }
        blocks.push(lines.join("\n"));
    });

    return blocks.length ? blocks.join("\n\n") : "(Aucune borne renseignée.)";
}

function refreshSynthese(force) {
    const ta = document.getElementById("synthese_bornes");
    if (!ta) return;
    if (!syntheseManuel || force) ta.value = buildSynthese();
    updateSyntheseBadge();
}

let _synthTimer = null;
function scheduleSynthese() {
    clearTimeout(_synthTimer);
    _synthTimer = setTimeout(() => refreshSynthese(false), 250);
}

function updateSyntheseBadge() {
    const badge = document.getElementById("syntheseBadge");
    const btn = document.getElementById("syntheseRegenBtn");
    if (badge) {
        badge.textContent = syntheseManuel ? "Modifiée à la main" : "Mise à jour automatique";
        badge.className = "conf-badge " + (syntheseManuel ? "ko" : "ok");
    }
    if (btn) btn.style.display = syntheseManuel ? "inline-flex" : "none";
}

// ============================================================
//  NORMALISATION D'IMAGE (identique aux formulaires Couverture)
// ============================================================
async function normalizeImageFile(file, opts = {}) {
    const maxEdge = opts.maxEdge || 2000;
    const quality = opts.quality || 0.9;
    if (!file) throw new Error("no-file");

    const rawDataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("decode"));
        i.src = rawDataUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("decode");
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
        const r = maxEdge / longest;
        w = Math.round(w * r);
        h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d");
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, w, h);
    c.drawImage(img, 0, 0, w, h);
    const cleanDataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl: cleanDataUrl, bytes: dataUrlToUint8Array(cleanDataUrl), type: "jpg", width: w, height: h };
}

function _imageErrorMessage(err) {
    if (err && err.message === "decode") {
        return "Format d'image non supporté par ce navigateur (par exemple HEIC produit par certains iPhones).\n\n" +
               "Solution : sur l'iPhone, allez dans Réglages → Appareil photo → Formats et cochez « Le plus compatible » (JPG).\n" +
               "Ou convertissez la photo en JPG/PNG avant de l'ajouter.";
    }
    if (err && err.message === "read") return "Impossible de lire ce fichier image.";
    return "Erreur lors du traitement de cette image : " + (err && err.message ? err.message : err);
}

async function processPhoto(file, key) {
    if (!file) return;
    try {
        const n = await normalizeImageFile(file);
        photoStore[key] = {
            data: n.bytes,
            type: "jpg",
            dataUrl: n.dataUrl,
            naturalWidth: n.width,
            naturalHeight: n.height,
            originalDataUrl: null,
            annotations: null,
            annotated: false
        };
        const preview = document.getElementById("preview_" + key);
        if (preview) {
            preview.src = n.dataUrl;
            preview.classList.add("shown");
        }
        schedule();
    } catch (err) {
        console.error("Erreur photo :", err);
        alert(_imageErrorMessage(err));
    }
}

function dataUrlToUint8Array(dataUrl) {
    const binary = atob(dataUrl.split(",")[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function _renormalizeDataUrl(dataUrl, maxEdge = 2000, quality = 0.9) {
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("decode"));
        i.src = dataUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("decode");
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
        const r = maxEdge / longest;
        w = Math.round(w * r);
        h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d");
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, w, h);
    c.drawImage(img, 0, 0, w, h);
    const cleanDataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl: cleanDataUrl, bytes: dataUrlToUint8Array(cleanDataUrl), type: "jpg", width: w, height: h };
}

// ============================================================
//  COLLECTE / APPLICATION DES DONNÉES (export, import, autosave)
// ============================================================
function collectFormData() {
    const data = {
        version: "cablage-wifi-v1",
        exportedAt: new Date().toISOString(),
        fields: {},
        radios: {},
        checkboxes: {},
        galleries: {},
        galleryCounters: { ...galleryCounters },
        blocageEnabled: isBlocageEnabled(),
        baieConformeManuel,
        syntheseManuel,
        wifi: JSON.parse(JSON.stringify(WIFI)),
        photos: {}
    };

    // Champs fixes (les champs des niveaux / bornes n'ont pas d'id : ils sont dans « wifi »)
    document.querySelectorAll("input[id], textarea[id], select[id]").forEach(el => {
        if (el.type === "file" || el.type === "radio" || el.type === "password") return;
        if (el.closest("#editorOverlay")) return;
        if (el.type === "checkbox") {
            data.checkboxes[el.id] = el.checked;
            return;
        }
        data.fields[el.id] = el.value;
    });
    document.querySelectorAll('input[type="radio"]:checked').forEach(el => {
        if (el.name) data.radios[el.name] = el.value;
    });

    Object.keys(GALLERIES).forEach(kind => {
        const container = document.getElementById(GALLERIES[kind].containerId);
        if (!container) return;
        data.galleries[kind] = [];
        container.querySelectorAll(".cheminement-item").forEach(item => {
            data.galleries[kind].push({
                idx: item.dataset.idx,
                comment: item.querySelector(".cheminement-comment")?.value || ""
            });
        });
    });

    Object.keys(photoStore).forEach(k => {
        const p = photoStore[k];
        data.photos[k] = {
            type: p.type,
            dataUrl: p.dataUrl,
            originalDataUrl: p.originalDataUrl || null,
            annotations: p.annotations || null,
            annotated: !!p.annotated
        };
    });
    return data;
}

function normalizeWifi(w) {
    const s = newWifiState();
    if (!w || typeof w !== "object") return s;
    s.seq = Object.assign(s.seq, w.seq || {});
    s.bornes = {};
    Object.values(w.bornes || {}).forEach(b => {
        if (!b || !b.id) return;
        s.bornes[b.id] = Object.assign({
            nom: "", nomManuel: false, colorIdx: 0, emplacement: "", pose: "", hauteur: "",
            metrage: "", sameAs: "", cheminement: "", collapsed: false, empKey: `bemp_x${b.id}`,
            chem: [], perc: []
        }, b);
    });
    s.niveaux = (w.niveaux || []).map(n => ({
        id: n.id, nom: n.nom || "", collapsed: !!n.collapsed,
        plans: Array.isArray(n.plans) ? n.plans : [],
        bornes: (n.bornes || []).filter(id => s.bornes[id])
    }));
    return s;
}

async function applyFormData(data) {
    if (!data || typeof data !== "object") return;

    if (data.fields) {
        Object.keys(data.fields).forEach(id => {
            const el = document.getElementById(id);
            if (el && el.type !== "file") el.value = data.fields[id];
        });
    }
    if (data.checkboxes) {
        Object.keys(data.checkboxes).forEach(id => {
            const el = document.getElementById(id);
            if (el && el.type === "checkbox") el.checked = !!data.checkboxes[id];
        });
    }
    if (data.radios) {
        Object.keys(data.radios).forEach(name => {
            const el = document.querySelector(`input[type="radio"][name="${name}"][value="${data.radios[name]}"]`);
            if (el) el.checked = true;
        });
    }

    const mode = data.fields && data.fields.modeIntervention === "travaux" ? "travaux" : "audit";
    window.setMode(mode);

    baieConformeManuel = !!data.baieConformeManuel;
    syntheseManuel = !!data.syntheseManuel;

    // Galeries simples
    Object.keys(GALLERIES).forEach(kind => {
        const container = document.getElementById(GALLERIES[kind].containerId);
        if (!container) return;
        container.innerHTML = "";
        galleryCounters[kind] = 0;
        const items = (data.galleries && data.galleries[kind]) || [];
        items.forEach(it => {
            const div = addGalleryItem(kind, { idx: it.idx });
            if (div && it.comment) {
                const ta = div.querySelector(".cheminement-comment");
                if (ta) ta.value = it.comment;
            }
        });
        renumberGallery(kind);
    });
    if (data.galleryCounters) {
        Object.keys(data.galleryCounters).forEach(k => {
            if (data.galleryCounters[k] > (galleryCounters[k] || 0)) galleryCounters[k] = data.galleryCounters[k];
        });
    }

    applyBlocageVisibility(!!data.blocageEnabled || !!(data.checkboxes && data.checkboxes.blocageEnabled));
    applyBaieVisibility();

    // Niveaux / bornes
    WIFI = normalizeWifi(data.wifi);
    if (!WIFI.niveaux.length) wifiAddNiveau();

    // Photos
    Object.keys(photoStore).forEach(k => delete photoStore[k]);
    if (data.photos) {
        await Promise.all(Object.entries(data.photos).map(async ([k, p]) => {
            if (!p || !p.dataUrl) return;
            try {
                const n = await _renormalizeDataUrl(p.dataUrl);
                photoStore[k] = {
                    data: n.bytes, type: "jpg", dataUrl: n.dataUrl,
                    naturalWidth: n.width, naturalHeight: n.height,
                    originalDataUrl: p.originalDataUrl || null,
                    annotations: p.annotations || null,
                    annotated: !!p.annotated
                };
            } catch (err) {
                console.warn("Photo non re-normalisable (" + k + ") :", err);
                photoStore[k] = {
                    data: dataUrlToUint8Array(p.dataUrl), type: p.type || "jpg", dataUrl: p.dataUrl,
                    originalDataUrl: p.originalDataUrl || null,
                    annotations: p.annotations || null,
                    annotated: !!p.annotated
                };
            }
            const preview = document.getElementById("preview_" + k);
            if (preview) {
                preview.src = photoStore[k].dataUrl;
                preview.classList.add("shown");
            }
            const ann = document.querySelector(`[data-annotate="${k}"]`);
            if (ann) ann.disabled = false;
        }));
    }

    renderWifi();
    updateConfBadge();
    refreshSynthese(false);
}

// ---------- EXPORT / IMPORT JSON ----------
window.exportJSON = function () {
    try {
        const data = collectFormData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const safeName = (document.getElementById("raison_sociale")?.value || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
        const date = document.getElementById("date_audit")?.value || new Date().toISOString().slice(0, 10);
        saveAs(blob, `CablageWifi_${safeName}_${date}.json`);
    } catch (err) {
        console.error("Erreur export JSON :", err);
        alert("Impossible d'exporter le formulaire.");
    }
};

window.importJSON = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.version !== "cablage-wifi-v1" &&
                !confirm("Ce fichier ne provient pas du formulaire Câblage Wi-Fi.\nSeuls les champs communs (en-tête, client, baie…) seront repris.\n\nImporter quand même ?")) {
                return;
            }
            await applyFormData(data);
            schedule();
            alert("✅ Données importées.");
        } catch (err) {
            console.error("Erreur import JSON :", err);
            alert("Le fichier n'est pas un export valide.");
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsText(file);
};

// ============================================================
//  GÉNÉRATION DU RAPPORT WORD
// ============================================================
async function generateDocument() {
    const btn = document.getElementById("btnGenerateWord");
    const status = document.getElementById("status");
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = "⏳ Génération…"; }
    if (status) { status.textContent = "Génération du rapport Word…"; status.className = "status loading"; }
    try {
        // Noms des bornes à jour sur les plans annotés
        await wifiRerenderMarkerPhotos();
        await buildAndSaveDocx();
        if (status) { status.textContent = "✅ Rapport Word généré."; status.className = "status success"; }
    } catch (err) {
        console.error("Erreur génération Word :", err);
        if (status) { status.textContent = "❌ Erreur lors de la génération : " + (err.message || err); status.className = "status error"; }
        alert("Erreur lors de la génération du rapport Word :\n" + (err.message || err));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || "📄 Générer le rapport Word"; }
    }
}

async function buildAndSaveDocx() {
    const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        ImageRun, Header, Footer, AlignmentType, WidthType, BorderStyle,
        VerticalAlign, ShadingType
    } = window.docx;

    const b64 = (s) => {
        const bin = atob(s);
        const res = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) res[i] = bin.charCodeAt(i);
        return res;
    };
    const val = (id) => {
        const el = document.getElementById(id);
        return el && el.value ? el.value : "";
    };
    const hex = (c) => String(c || "").replace("#", "").toUpperCase();

    // ---------- helpers de style ----------
    const stdBorder = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER };
    const stdBorders = {
        top: stdBorder, bottom: stdBorder, left: stdBorder, right: stdBorder,
        insideHorizontal: stdBorder, insideVertical: stdBorder
    };
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const noBorders = {
        top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
        insideHorizontal: noBorder, insideVertical: noBorder
    };
    const photoBorder = { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER };

    const P = (txt, opts = {}) => new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: opts.spacing || { before: 60, after: 60 },
        keepNext: !!opts.keepNext,
        children: [new TextRun({
            text: txt || "",
            bold: opts.bold || false,
            italics: opts.italics || false,
            size: opts.size || 20,
            color: opts.color || "000000",
            font: "Calibri"
        })]
    });
    const spacer = () => P("", { spacing: { before: 80, after: 80 } });

    const sectionTitle = (num, txt) => new Paragraph({
        spacing: { before: 360, after: 120 },
        keepNext: true,
        keepLines: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR_TITLE, space: 4 } },
        children: [
            new TextRun({ text: `${num}.   `, bold: true, size: 28, color: COLOR_TITLE, font: "Calibri" }),
            new TextRun({ text: txt, bold: true, size: 28, color: COLOR_TITLE, font: "Calibri" })
        ]
    });
    const subTitle = (num, txt) => new Paragraph({
        spacing: { before: 240, after: 80 },
        keepNext: true,
        keepLines: true,
        children: [new TextRun({ text: `${num} - ${txt}`, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" })]
    });
    const levelTitle = (num, txt) => new Paragraph({
        spacing: { before: 320, after: 120 },
        keepNext: true,
        keepLines: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_SUBTITLE, space: 4 } },
        children: [
            new TextRun({ text: `${num} - `, bold: true, size: 24, color: COLOR_TITLE, font: "Calibri" }),
            new TextRun({ text: `Niveau : ${txt}`, bold: true, size: 24, color: COLOR_TITLE, font: "Calibri" })
        ]
    });
    const borneTitle = (num, b) => new Paragraph({
        spacing: { before: 240, after: 80 },
        keepNext: true,
        keepLines: true,
        children: [
            new TextRun({ text: `${num} - `, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" }),
            new TextRun({ text: "● ", bold: true, size: 26, color: hex(borneColor(b)), font: "Calibri" }),
            new TextRun({ text: b.nom, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" })
        ]
    });

    const labelCell = (txt, width, keepNext = false) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: COLOR_TABLE_LABEL, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: stdBorders,
        children: [new Paragraph({ keepNext, children: [new TextRun({ text: txt, bold: true, size: 20, font: "Calibri" })] })]
    });
    const valueCell = (txt, width, opts = {}) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: stdBorders,
        children: [new Paragraph({
            keepNext: !!opts.keepNext,
            children: [new TextRun({
                text: txt || "", size: opts.size || 20, font: "Calibri",
                color: opts.color || "000000", bold: opts.bold || false
            })]
        })]
    });
    const swatchCell = (color, width) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: hex(color), type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 80, right: 80 },
        borders: stdBorders,
        children: [new Paragraph({ children: [] })]
    });
    // Tableau clé / valeur. keepTogether : le tableau reste d'un seul tenant
    // (et avec le titre qui le précède) au lieu d'être coupé en bas de page.
    const kvTable = (rows, keepTogether = false) => new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: rows.map((r, i) => {
            const kn = keepTogether && i < rows.length - 1;
            return new TableRow({
                cantSplit: true,
                children: [labelCell(r[0], 3120, kn), valueCell(r[1], 6240, Object.assign({}, r[2] || {}, { keepNext: kn }))]
            });
        })
    });
    const textBlock = (label, text, emptyText) => {
        const paras = String(text || "").trim()
            ? String(text).split("\n").map(line => new Paragraph({
                spacing: { before: 20, after: 20 },
                children: [new TextRun({ text: line, size: 20, font: "Calibri" })]
            }))
            : [new Paragraph({ children: [new TextRun({ text: emptyText, italics: true, size: 20, color: "888888", font: "Calibri" })] })];
        return new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [
                new TableRow({ cantSplit: true, children: [labelCell(label, 9360)] }),
                new TableRow({
                    children: [new TableCell({
                        width: { size: 9360, type: WidthType.DXA },
                        margins: { top: 160, bottom: 160, left: 200, right: 200 },
                        borders: stdBorders,
                        children: paras
                    })]
                })
            ]
        });
    };

    const photoDims = (photo, maxW, maxH) => {
        const w = photo.naturalWidth || 4;
        const h = photo.naturalHeight || 3;
        const r = Math.min(maxW / w, maxH / h);
        return { width: Math.max(1, Math.round(w * r)), height: Math.max(1, Math.round(h * r)) };
    };

    const photoBanner = (title, photoKey, opts = {}) => {
        const w = 8400;
        const photo = photoStore[photoKey];
        const titleCell = new TableCell({
            width: { size: w, type: WidthType.DXA },
            shading: { fill: COLOR_PHOTO_BG, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 100, bottom: 100, left: 200, right: 200 },
            borders: { top: photoBorder, bottom: photoBorder, left: photoBorder, right: photoBorder },
            children: [new Paragraph({
                keepNext: true,
                children: [new TextRun({ text: `📷 ${title}`, bold: true, size: 22, color: COLOR_TITLE, font: "Calibri" })]
            })]
        });
        const dims = photo ? photoDims(photo, opts.imgW || 400, opts.imgH || 300) : null;
        const photoCell = new TableCell({
            width: { size: w, type: WidthType.DXA },
            margins: { top: 200, bottom: 200, left: 200, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            borders: { top: noBorder, bottom: photoBorder, left: photoBorder, right: photoBorder },
            children: photo ? [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new ImageRun({ data: photo.data, transformation: dims, type: photo.type })]
            })] : [new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 600, after: 600 },
                children: [new TextRun({ text: "(Photo non fournie)", italics: true, size: 18, color: "999999", font: "Calibri" })]
            })]
        });
        const rows = [
            new TableRow({ cantSplit: true, children: [titleCell] }),
            new TableRow({ cantSplit: true, children: [photoCell] })
        ];
        if (opts.comment && opts.comment.trim()) {
            rows.push(new TableRow({
                cantSplit: true,
                children: [new TableCell({
                    width: { size: w, type: WidthType.DXA },
                    margins: { top: 100, bottom: 100, left: 200, right: 200 },
                    borders: { top: noBorder, bottom: photoBorder, left: photoBorder, right: photoBorder },
                    children: [new Paragraph({
                        children: [
                            new TextRun({ text: "Commentaire : ", bold: true, size: 20, font: "Calibri" }),
                            new TextRun({ text: opts.comment.trim(), size: 20, font: "Calibri", italics: true })
                        ]
                    })]
                })]
            }));
        }
        return new Table({ width: { size: w, type: WidthType.DXA }, columnWidths: [w], rows });
    };

    // Légende couleur → borne sous un plan
    const legendTable = (owners) => new Table({
        width: { size: 8400, type: WidthType.DXA },
        columnWidths: [700, 7700],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("", 700), labelCell("Légende du plan", 7700)] }),
            ...owners.map(id => {
                if (id === "commun") {
                    return new TableRow({
                        cantSplit: true,
                        children: [swatchCell(COMMUN.hex, 700), valueCell(`${COMMUN.nom} (${COMMUN.colorName.toLowerCase()}) — tronçon emprunté par plusieurs bornes`, 7700)]
                    });
                }
                const b = WIFI.bornes[id];
                return new TableRow({
                    cantSplit: true,
                    children: [swatchCell(borneColor(b), 700), valueCell(`${b.nom} (${borneColorName(b).toLowerCase()})`, 7700)]
                });
            })
        ]
    });

    const galleryItems = (kind) => {
        const cfg = GALLERIES[kind];
        const container = document.getElementById(cfg.containerId);
        if (!container) return [];
        const out = [];
        container.querySelectorAll(".cheminement-item").forEach(item => {
            const key = item.dataset.photoKey;
            if (photoStore[key]) out.push({ key, comment: item.querySelector(".cheminement-comment")?.value || "" });
        });
        return out;
    };
    const pushGallery = (children, kind) => {
        const cfg = GALLERIES[kind];
        const items = galleryItems(kind);
        if (!items.length) {
            children.push(P(`(Aucune photo « ${cfg.label} » fournie.)`, { italics: true, color: "888888" }));
            return;
        }
        items.forEach((it, i) => {
            children.push(photoBanner(`${cfg.label} ${i + 1}`, it.key, { comment: it.comment }));
            children.push(spacer());
        });
    };

    // ---------- CONSTRUCTION DU DOCUMENT ----------
    const children = [];
    const isTravaux = getMode() === "travaux";

    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({
            children: [new TableCell({
                width: { size: 9360, type: WidthType.DXA },
                shading: { fill: COLOR_TITLE, type: ShadingType.CLEAR, color: "auto" },
                margins: { top: 240, bottom: 80, left: 200, right: 200 },
                borders: stdBorders,
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({
                            text: isTravaux ? "RAPPORT DE TRAVAUX - CÂBLAGE BORNES WI-FI" : "RAPPORT D'AUDIT - CÂBLAGE BORNES WI-FI",
                            bold: true, size: 32, color: COLOR_WHITE, font: "Calibri"
                        })]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 60, after: 240 },
                        children: [new TextRun({ text: wifiBannerText("│"), size: 22, color: COLOR_WHITE, font: "Calibri" })]
                    })
                ]
            })]
        })]
    }));
    children.push(P("", { spacing: { before: 120, after: 60 } }));

    // === 1. INFORMATIONS GÉNÉRALES ===
    children.push(sectionTitle(1, "Informations générales"));
    children.push(kvTable([
        ["Numéro de ticket", val("numero_ticket")],
        ["OT / Référence commande", val("numero_ot")],
        ["Numéro de dossier", val("numero_dossier")],
        ["Technicien / Intervenant", val("auditeur")],
        ["Date d'intervention", val("date_audit")],
        ["Raison sociale", val("raison_sociale")],
        ["Adresse", [val("adresse"), val("code_postal"), val("ville")].filter(Boolean).join(" — ")],
        ["Horaire d'ouverture", val("horaire")],
        ["Procédure d'accès", val("procedure_acces")],
        ["Téléphone du site", val("tel_site")],
        ["Contact sur site", [val("contact_nom"), val("contact_fonction")].filter(Boolean).join(" — ")],
        ["Téléphone du contact", val("contact_tel")],
        ["Mail du contact", val("contact_mail")]
    ]));

    // === 2. BAIE DE BRASSAGE ===
    children.push(sectionTitle(2, "Baie de brassage"));
    const baie = getBaieExistante();
    const baieRows = [[
        "Baie existante sur site",
        baie === "Oui" ? "Oui" : (baie === "Non" ? "Non — baie à installer" : "Non renseigné"),
        { bold: true }
    ]];
    if (baie === "Oui") {
        baieRows.push(["Nombre de U disponibles", val("nb_u_dispo")]);
        baieRows.push(["Nombre de prises électriques disponibles", val("nb_prises_baie")]);
        const conf = getBaieConformeValue();
        baieRows.push(["Baie conforme", conf || "Non renseigné", {
            bold: true, color: conf === "Oui" ? COLOR_OK : (conf === "Non" ? COLOR_KO : "888888")
        }]);
        baieRows.push(["Règle appliquée", "Conforme si au moins 2 U disponibles et au moins 2 prises électriques disponibles" +
            (baieConformeManuel ? " (résultat ajusté manuellement par le technicien)" : " (calcul automatique)")]);
    } else if (baie === "Non") {
        baieRows.push(["Emplacement proposé pour la baie", val("emplacement_baie")]);
    }
    children.push(kvTable(baieRows, true));
    if (val("commentaire_baie").trim()) {
        children.push(spacer());
        children.push(textBlock("Commentaire sur la baie", val("commentaire_baie"), ""));
    }
    if (baie === "Oui") {
        children.push(subTitle("2.1", "Baie ouverte"));
        children.push(photoBanner("Baie ouverte", "photo_baie_ouverte"));
        children.push(subTitle("2.2", "Baie fermée"));
        pushGallery(children, "baie_fermee");
    } else if (baie === "Non") {
        children.push(subTitle("2.1", "Emplacement prévu pour la baie"));
        children.push(photoBanner("Emplacement prévu pour la baie", "photo_emplacement_baie"));
        children.push(subTitle("2.2", "Prise électrique d'alimentation de la baie"));
        children.push(photoBanner("Prise électrique d'alimentation", "photo_prise_baie"));
    }

    // === 3. PHOTOS GÉNÉRALES ===
    children.push(sectionTitle(3, "Photos générales"));
    children.push(subTitle("3.1", "Devanture"));
    children.push(photoBanner("Devanture", "photo_devanture"));
    children.push(subTitle("3.2", "Travaux en hauteur"));
    children.push(photoBanner("Travaux en hauteur", "photo_travaux_hauteur"));

    // === 4. BORNES WI-FI ===
    children.push(sectionTitle(4, "Bornes Wi-Fi : niveaux, plans et cheminements"));
    const allBornes = wifiOrderedBornes().filter(({ b }) => !wifiIsBorneEmpty(b));
    const levels = WIFI.niveaux.filter(n =>
        n.plans.some(p => photoStore[p.key]) || n.bornes.some(id => WIFI.bornes[id] && !wifiIsBorneEmpty(WIFI.bornes[id])));

    children.push(subTitle("4.1", "Récapitulatif des bornes"));
    if (!allBornes.length) {
        children.push(P("(Aucune borne renseignée.)", { italics: true, color: "888888" }));
    } else {
        const W = [700, 1900, 1260, 2400, 1500, 1600];
        children.push(new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W,
            rows: [
                new TableRow({
                    cantSplit: true,
                    tableHeader: true,
                    children: [labelCell("", W[0]), labelCell("Borne", W[1]), labelCell("Niveau", W[2]),
                        labelCell("Emplacement", W[3]), labelCell("Pose", W[4]), labelCell("Métrage câble", W[5])]
                }),
                ...allBornes.map(({ b, n }) => {
                    let pose = POSE_TYPES[b.pose] ? POSE_TYPES[b.pose].label : "";
                    if (String(b.hauteur).trim()) pose = (pose ? pose + " — " : "") + `${fmtNum(b.hauteur)} m`;
                    return new TableRow({
                        cantSplit: true,
                        children: [
                            swatchCell(borneColor(b), W[0]),
                            valueCell(b.nom, W[1], { bold: true }),
                            valueCell(wifiNiveauLabel(n), W[2]),
                            valueCell(oneLine(b.emplacement), W[3]),
                            valueCell(pose, W[4]),
                            valueCell(String(b.metrage).trim() ? `${fmtNum(b.metrage)} m` : "—", W[5])
                        ]
                    });
                })
            ]
        }));
        children.push(P(`${levels.length} niveau${levels.length > 1 ? "x" : ""} — ${allBornes.length} borne${allBornes.length > 1 ? "s" : ""}. ` +
            "Le métrage indiqué est la distance de câble entre la baie de brassage et chaque borne.",
            { italics: true, size: 18, color: "555555" }));
    }

    levels.forEach((n, li) => {
        const lnum = `4.${li + 2}`;
        children.push(levelTitle(lnum, wifiNiveauLabel(n)));

        // Plans du niveau
        const plans = n.plans.filter(p => photoStore[p.key]);
        plans.forEach((p, pi) => {
            children.push(photoBanner(`Plan ${pi + 1} — ${wifiNiveauLabel(n)}`, p.key, {
                comment: p.comment, imgW: 520, imgH: 620
            }));
            const owners = wifiPlanOwners(p.key);
            if (owners.length) {
                children.push(P("", { spacing: { before: 40, after: 40 } }));
                children.push(legendTable(owners));
            }
            children.push(spacer());
        });

        // Fiches bornes
        let bi = 0;
        n.bornes.forEach(id => {
            const b = WIFI.bornes[id];
            if (!b || wifiIsBorneEmpty(b)) return;
            bi++;
            children.push(borneTitle(`${lnum}.${bi}`, b));

            const ref = b.sameAs && WIFI.bornes[b.sameAs];
            const rows = [["Couleur sur les plans", `● ${borneColorName(b)}`, { bold: true, color: hex(borneColor(b)) }]];
            if (b.emplacement.trim()) rows.push(["Emplacement", oneLine(b.emplacement)]);
            let pose = POSE_TYPES[b.pose] ? POSE_TYPES[b.pose].label : "";
            if (String(b.hauteur).trim()) pose = (pose ? pose + " — " : "") + `hauteur ${fmtNum(b.hauteur)} m`;
            if (pose) rows.push(["Type de pose", pose]);
            rows.push(["Métrage de câble (baie → borne)", String(b.metrage).trim() ? `${fmtNum(b.metrage)} m` : "Non renseigné",
                { bold: !!String(b.metrage).trim() }]);
            const chem = borneCheminementText(b);
            rows.push(["Cheminement", chem ? ucFirst(chem) : "Non renseigné"]);
            const perc = bornePercements(b);
            if (perc.count) {
                rows.push(["Percements", `${perc.count}` + (perc.comments.length ? ` — ${perc.comments.join(" ; ")}` : "")]);
            }
            const pl = wifiFindPlacement(b.id, null);
            rows.push(["Position sur les plans", pl ? pl.label : "Non positionnée sur un plan"]);
            children.push(kvTable(rows, true));
            children.push(spacer());

            if (photoStore[b.empKey]) {
                children.push(photoBanner(`${b.nom} — Emplacement de la borne`, b.empKey));
                children.push(spacer());
            }
            const chemItems = b.chem.filter(i => photoStore[i.key]);
            if (chemItems.length) {
                chemItems.forEach((it, i) => {
                    children.push(photoBanner(`${b.nom} — Cheminement ${i + 1}`, it.key, { comment: it.comment }));
                    children.push(spacer());
                });
            } else if (ref) {
                children.push(P(`Cheminement identique à ${ref.nom} : voir les photos de cette borne.`, { italics: true, color: "555555" }));
            } else {
                children.push(P("(Aucune photo de cheminement.)", { italics: true, color: "888888" }));
            }
            b.perc.filter(i => photoStore[i.key]).forEach((it, i) => {
                children.push(photoBanner(`${b.nom} — Percement ${i + 1}`, it.key, { comment: it.comment }));
                children.push(spacer());
            });
        });
    });

    // === 5. BLOCAGE (optionnel) ===
    let nextSection = 5;
    if (isBlocageEnabled()) {
        children.push(sectionTitle(5, "Blocage"));
        children.push(subTitle("5.1", "Photos des blocages"));
        pushGallery(children, "blocage");
        children.push(subTitle("5.2", "Photos de la solution proposée"));
        pushGallery(children, "solution");
        nextSection = 6;
    }

    // === COMPTE RENDU ===
    children.push(sectionTitle(nextSection, "Compte rendu"));
    children.push(textBlock("Synthèse par borne", val("synthese_bornes"), "(Aucune borne renseignée.)"));
    children.push(spacer());
    children.push(textBlock("Compte rendu global de l'intervention", val("compte_rendu_global"), "(Aucun compte rendu renseigné.)"));

    // === SIGNATURE ===
    children.push(P("", { spacing: { before: 240, after: 60 } }));
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("Signature technicien / intervenant", 9360)] }),
            new TableRow({ cantSplit: true, children: [valueCell(
                `Nom : ${val("signataire_nom") || "_______________________________"}      Date : ${val("signataire_date")}`, 9360)] })
        ]
    }));

    // ---------- DOCUMENT FINAL ----------
    const clientLogo = wifiClientLogoBytes();
    const doc = new Document({
        styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
        sections: [{
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1080, left: 1440 }
                }
            },
            headers: {
                default: new Header({
                    children: [new Table({
                        width: { size: 9360, type: WidthType.DXA },
                        columnWidths: [3120, 3120, 3120],
                        borders: noBorders,
                        rows: [new TableRow({
                            children: [
                                new TableCell({
                                    width: { size: 3120, type: WidthType.DXA },
                                    verticalAlign: VerticalAlign.CENTER,
                                    borders: noBorders,
                                    children: [new Paragraph({
                                        children: [new ImageRun({ data: b64(LOGO_IPKONEKT_B64), transformation: { width: 60, height: 54 }, type: "png" })]
                                    })]
                                }),
                                new TableCell({
                                    width: { size: 3120, type: WidthType.DXA },
                                    verticalAlign: VerticalAlign.CENTER,
                                    borders: noBorders,
                                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })]
                                }),
                                new TableCell({
                                    width: { size: 3120, type: WidthType.DXA },
                                    verticalAlign: VerticalAlign.CENTER,
                                    borders: noBorders,
                                    children: [new Paragraph({
                                        alignment: AlignmentType.RIGHT,
                                        children: clientLogo ? [new ImageRun({ data: clientLogo, transformation: clientLogoSize(60) })] : []
                                    })]
                                })
                            ]
                        })]
                    })]
                })
            },
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: [new TextRun({ text: wifiFooterText(), italics: true, size: 16, color: COLOR_FOOTER, font: "Calibri" })]
                    })]
                })
            },
            children
        }]
    });

    const blob = await Packer.toBlob(doc);
    const safeName = (val("raison_sociale") || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
    const prefix = isTravaux ? "Travaux" : "Audit";
    saveAs(blob, `${prefix}_CablageWifi_${safeName}_${val("date_audit")}.docx`);
}

// ---------- EXPOSITION GLOBALE ----------
window.generateDocument = generateDocument;
window.resetForm = async () => {
    if (!confirm("Réinitialiser tout le formulaire ?\nLa sauvegarde automatique de cette session sera également effacée.")) return;
    try { await AUTOSAVE.clear(); } catch (_) {}
    location.reload();
};

// ============================================================
//  SAUVEGARDE AUTOMATIQUE DANS LE NAVIGATEUR (IndexedDB)
//  Base dédiée « cablage_wifi » (indépendante des autres formulaires).
// ============================================================
const AUTOSAVE = (() => {
    const DB_NAME = "cablage_wifi";
    const STORE = "autosave";
    const KEY = "current";
    const DEBOUNCE_MS = 1200;

    let _dbPromise = null;
    let _timer = null;
    let _suspended = false;

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
            req.onerror = () => reject(req.error || new Error("idb-open"));
        });
        return _dbPromise;
    }
    async function _put(value) {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(value, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("idb-put"));
        });
    }
    async function _get() {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const r = tx.objectStore(STORE).get(KEY);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror = () => reject(r.error || new Error("idb-get"));
        });
    }
    async function _clear() {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("idb-clear"));
        });
    }

    // Garde-fou : ne jamais remplacer une sauvegarde pleine par un formulaire vide
    function _isEmptyData(d) {
        if (!d) return true;
        const hasField = d.fields && Object.entries(d.fields).some(([k, v]) =>
            !["date_audit", "signataire_date", "modeIntervention", "client_final", "synthese_bornes"].includes(k) &&
            String(v || "").trim() !== "");
        const hasPhoto = d.photos && Object.keys(d.photos).length > 0;
        const hasBorne = d.wifi && Object.values(d.wifi.bornes || {}).some(b =>
            b && (b.emplacement || b.metrage || b.cheminement || b.pose || b.hauteur || b.nomManuel));
        return !hasField && !hasPhoto && !hasBorne;
    }

    async function _saveNow() {
        if (_suspended) return;
        try {
            const data = collectFormData();
            if (_isEmptyData(data)) {
                let existing = null;
                try { existing = await _get(); } catch (_) {}
                if (existing && !_isEmptyData(existing)) return;
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
        if (!data) return false;
        _suspended = true;
        try {
            await applyFormData(data);
        } catch (err) {
            console.error("Restauration autosave échouée :", err);
        } finally {
            setTimeout(() => { _suspended = false; }, 1500);
        }
        return true;
    }

    function attach() {
        ["input", "change"].forEach(evt => document.body.addEventListener(evt, schedule, true));
        window.addEventListener("beforeunload", () => { _saveNow(); });
        window.addEventListener("pagehide", () => { _saveNow(); });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") _saveNow();
        });
        setInterval(_saveNow, 30000);
    }

    async function clear() {
        clearTimeout(_timer);
        _suspended = true;
        try { await _clear(); } catch (_) {}
    }

    return { attach, restore, schedule, clear, saveNow: _saveNow };
})();

window.__autosaveSchedule = () => AUTOSAVE.schedule();
