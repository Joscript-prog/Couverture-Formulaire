// ============================================================
//  FORMULAIRE CAMÉRAS & ALARME — IPKONEKT
//  Audit ou travaux de pose de caméras, d'alarme et d'équipements
//  associés (contrôle d'accès, interphonie…). Le matériel est fourni
//  par le client : on ne s'intéresse qu'à l'EMPLACEMENT prévu de
//  chaque équipement, au CHEMINEMENT de son câble jusqu'à la baie,
//  et aux PLANS pour situer le tout.
//
//  Construit sur la même base que le formulaire CÂBLAGE WI-FI :
//  photoStore, éditeur d'annotation (editor.js), client-config.js
//  (donneurs d'ordre), rapport Word, autosave IndexedDB,
//  export / import JSON.
//
//  Spécificités :
//   • Plusieurs NIVEAUX, chacun avec un ou plusieurs PLANS et des
//     ÉQUIPEMENTS (caméra, détecteur, contact d'ouverture, clavier…).
//   • Chaque équipement a un nom (« Caméra 1 »…, modifiable) et une
//     couleur, utilisée automatiquement sur les plans.
//   • Caméras / détecteurs : champ de vision orientable sur le plan.
//   • RAPPELS NON BLOQUANTS : équipement non placé sur un plan,
//     cheminement ou métrage non renseigné. Le rapport Word peut
//     toujours être généré (« Générer quand même »).
//   • Synthèse par équipement générée automatiquement.
// ============================================================

const photoStore = {};

// ---------- Galeries « simples » (hors équipements) ----------
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

// ---------- Couleurs des équipements (attribuées automatiquement) ----------
const EQ_PALETTE = [
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

// ---------- Types d'équipements ----------
//  cable : liaison câblée par défaut (câble jusqu'à la baie)
//  fov   : champ de vision orientable sur le plan
//  vue   : photo « vue souhaitée » (audit) / « image obtenue » (travaux)
const EQUIP_CATS = {
    video:  { label: "Vidéosurveillance",              titre: "VIDÉOSURVEILLANCE" },
    alarme: { label: "Alarme intrusion",               titre: "ALARME" },
    acces:  { label: "Contrôle d'accès / interphonie", titre: "CONTRÔLE D'ACCÈS" },
    autre:  { label: "Autres équipements",             titre: "" }
};
const EQUIP_TYPES = {
    camera:     { label: "Caméra", nom: "Caméra", one: "caméra", many: "caméras", cat: "video", cable: true, fov: true, vue: true,
                  empPh: "Ex : angle nord-est du bâtiment, au-dessus de l'entrée…",
                  zoneLabel: "Zone à filmer / angle de vue", zonePh: "Ex : parking et portail d'entrée, vue d'ensemble de la caisse…" },
    nvr:        { label: "Enregistreur (NVR)", nom: "Enregistreur", one: "enregistreur", many: "enregistreurs", cat: "video", cable: true,
                  empPh: "Ex : dans la baie, bureau de la direction…" },
    ecran:      { label: "Écran", nom: "Écran", one: "écran", many: "écrans", cat: "video", cable: true,
                  empPh: "Ex : comptoir de l'accueil, bureau…" },
    switch:     { label: "Switch", nom: "Switch", one: "switch", many: "switchs", cat: "video", cable: true,
                  empPh: "Ex : dans la baie, local technique…" },
    centrale:   { label: "Centrale d'alarme", nom: "Centrale", one: "centrale d'alarme", many: "centrales d'alarme", cat: "alarme", cable: true,
                  empPh: "Ex : local technique, réserve (à l'abri des regards)…" },
    clavier:    { label: "Clavier", nom: "Clavier", one: "clavier", many: "claviers", cat: "alarme", cable: false,
                  empPh: "Ex : à côté de la porte d'entrée principale…" },
    detecteur:  { label: "Détecteur de mouvement", nom: "Détecteur", one: "détecteur de mouvement", many: "détecteurs de mouvement", cat: "alarme", cable: false, fov: true,
                  empPh: "Ex : angle de la surface de vente…",
                  zoneLabel: "Zone couverte", zonePh: "Ex : surface de vente et accès à la réserve…" },
    contact:    { label: "Contact d'ouverture", nom: "Contact", one: "contact d'ouverture", many: "contacts d'ouverture", cat: "alarme", cable: false,
                  empLabel: "Ouvrant protégé", empPh: "Ex : porte d'entrée vitrée, fenêtre du bureau, porte de la réserve…" },
    sirene:     { label: "Sirène", nom: "Sirène", one: "sirène", many: "sirènes", cat: "alarme", cable: false,
                  empPh: "Ex : couloir central, façade au-dessus de l'entrée…" },
    acces:      { label: "Contrôle d'accès (lecteur, terminal)", nom: "Lecteur", one: "lecteur / terminal d'accès", many: "lecteurs / terminaux d'accès", cat: "acces", cable: true,
                  empPh: "Ex : porte d'entrée du personnel…" },
    interphone: { label: "Interphone / visiophone", nom: "Interphone", one: "interphone", many: "interphones", cat: "acces", cable: true,
                  empPh: "Ex : portail, entrée principale…" },
    autre:      { label: "Autre équipement", nom: "Équipement", one: "autre équipement", many: "autres équipements", cat: "autre", cable: true,
                  empPh: "Ex : local technique…" }
};
function typeOf(e) { return EQUIP_TYPES[e && e.type] || EQUIP_TYPES.autre; }
function empLabel(e) { return typeOf(e).empLabel || "Emplacement"; }
function zoneLabel(e) { return typeOf(e).zoneLabel || "Zone couverte"; }
function empPhotoTitle(e) { const l = typeOf(e).empLabel; return l ? `${l} (emplacement prévu)` : "Emplacement prévu"; }

const POSE_TYPES = {
    mur:          { label: "Mur",                            phrase: "pose murale" },
    plafond:      { label: "Plafond",                        phrase: "pose au plafond" },
    faux_plafond: { label: "Faux plafond",                   phrase: "pose en faux plafond" },
    angle:        { label: "Angle de bâtiment",              phrase: "pose en angle de bâtiment" },
    mat:          { label: "Mât / potence",                  phrase: "pose sur mât / potence" },
    ouvrant:      { label: "Sur l'ouvrant (porte, fenêtre)", phrase: "pose sur l'ouvrant" },
    autre:        { label: "Autre",                          phrase: "autre type de pose" }
};
const SITUATIONS = { interieur: "Intérieur", exterieur: "Extérieur" };

let baieConformeManuel = false;
let syntheseManuel = false;

// ============================================================
//  ÉTAT DES NIVEAUX / PLANS / ÉQUIPEMENTS
// ============================================================
let SITE = newSiteState();

function newSiteState() {
    return { niveaux: [], equips: {}, seq: { niveau: 0, equip: 0, photo: 0 } };
}

function newKey(prefix) {
    SITE.seq.photo++;
    return `${prefix}_${SITE.seq.photo}`;
}

function niveauById(id) { return SITE.niveaux.find(n => n.id === id) || null; }
function niveauIndex(id) { return SITE.niveaux.findIndex(n => n.id === id); }

function niveauLabel(n) {
    if (!n) return "";
    const nom = (n.nom || "").trim();
    return nom || `Niveau ${niveauIndex(n.id) + 1}`;
}

function eqColor(e) { return EQ_PALETTE[(e.colorIdx || 0) % EQ_PALETTE.length].hex; }
function eqColorName(e) { return EQ_PALETTE[(e.colorIdx || 0) % EQ_PALETTE.length].nom; }
function eqHasCable(e) { return e.liaison !== "sansfil"; }

// Liste des équipements dans l'ordre du site (niveau par niveau)
function orderedEquips() {
    const out = [];
    SITE.niveaux.forEach(n => {
        n.equips.forEach(id => {
            const e = SITE.equips[id];
            if (e) out.push({ e, n });
        });
    });
    return out;
}

function pickColor() {
    const used = new Set(Object.values(SITE.equips).map(e => e.colorIdx));
    for (let i = 0; i < EQ_PALETTE.length; i++) {
        if (!used.has(i)) return i;
    }
    return Object.keys(SITE.equips).length % EQ_PALETTE.length;
}

// Noms automatiques : numérotation par type sur tout le site (Caméra 1, Caméra 2…)
function autoNames() {
    const counters = {};
    orderedEquips().forEach(({ e }) => {
        counters[e.type] = (counters[e.type] || 0) + 1;
        if (!e.nomManuel) e.nom = `${typeOf(e).nom} ${counters[e.type]}`;
    });
}

function defaultNiveauName() {
    const idx = SITE.niveaux.length;
    return idx === 0 ? "RDC" : `R+${idx}`;
}

function addNiveau() {
    SITE.seq.niveau++;
    const n = {
        id: "n" + SITE.seq.niveau,
        nom: defaultNiveauName(),
        collapsed: false,
        addType: "camera",
        plans: [{ key: newKey("plan"), comment: "" }],
        equips: []
    };
    SITE.niveaux.push(n);
    return n;
}

function addEquip(niveauId, type) {
    const n = niveauById(niveauId);
    if (!n) return null;
    const t = EQUIP_TYPES[type] ? type : "camera";
    SITE.seq.equip++;
    const e = {
        id: "e" + SITE.seq.equip,
        niveauId,
        type: t,
        nom: "",
        nomManuel: false,
        colorIdx: pickColor(),
        situation: "",
        emplacement: "",
        zone: "",
        pose: "",
        hauteur: "",
        liaison: EQUIP_TYPES[t].cable ? "cable" : "sansfil",
        liaisonManuel: false,
        metrage: "",
        sameAs: "",
        cheminement: "",
        collapsed: false,
        empKey: newKey("eemp"),
        vueKey: newKey("evue"),
        chem: [],
        perc: []
    };
    SITE.equips[e.id] = e;
    n.equips.push(e.id);
    autoNames();
    return e;
}

function equipPhotoKeys(e) {
    return [e.empKey, e.vueKey, ...e.chem.map(i => i.key), ...e.perc.map(i => i.key)];
}

async function deleteEquip(id) {
    const e = SITE.equips[id];
    if (!e) return;
    equipPhotoKeys(e).forEach(k => delete photoStore[k]);
    const n = niveauById(e.niveauId);
    if (n) n.equips = n.equips.filter(x => x !== id);
    delete SITE.equips[id];
    Object.values(SITE.equips).forEach(o => { if (o.sameAs === id) o.sameAs = ""; });
    autoNames();
    await purgeOwner(id);
}

async function deleteNiveau(id) {
    const n = niveauById(id);
    if (!n) return;
    for (const eid of n.equips.slice()) await deleteEquip(eid);
    n.plans.forEach(p => delete photoStore[p.key]);
    SITE.niveaux = SITE.niveaux.filter(x => x.id !== id);
    autoNames();
}

// Retrouve à quoi correspond une clé photo (plan / photo d'équipement)
function photoInfo(key) {
    for (const n of SITE.niveaux) {
        if (n.plans.some(p => p.key === key)) return { kind: "plan", niveauId: n.id, label: planLabel(key) };
    }
    for (const e of Object.values(SITE.equips)) {
        if (e.empKey === key) return { kind: "equip", eqId: e.id, label: `${e.nom} — ${empPhotoTitle(e)}` };
        if (e.vueKey === key) return { kind: "equip", eqId: e.id, label: `${e.nom} — ${getMode() === "travaux" ? "Image obtenue" : "Vue souhaitée"}` };
        const ci = e.chem.findIndex(i => i.key === key);
        if (ci >= 0) return { kind: "equip", eqId: e.id, label: `${e.nom} — Cheminement ${ci + 1}` };
        const pi = e.perc.findIndex(i => i.key === key);
        if (pi >= 0) return { kind: "equip", eqId: e.id, label: `${e.nom} — Percement ${pi + 1}` };
    }
    return null;
}

function planLabel(key) {
    for (const n of SITE.niveaux) {
        const i = n.plans.findIndex(p => p.key === key);
        if (i >= 0) return `Plan ${i + 1} — ${niveauLabel(n)}`;
    }
    return "Plan";
}

function allPlanKeys() {
    const out = [];
    SITE.niveaux.forEach(n => n.plans.forEach(p => out.push(p.key)));
    return out;
}

// Équipements / cheminement commun dessinés sur un plan (dans l'ordre du site)
function planOwners(key) {
    const p = photoStore[key];
    if (!p || !Array.isArray(p.annotations)) return [];
    const set = new Set();
    p.annotations.forEach(d => {
        if (!d || !d.owner) return;
        if (d.type === "equip" || d.type === "arrow" || d.type === "polyline") set.add(d.owner);
    });
    const out = [];
    orderedEquips().forEach(({ e }) => { if (set.has(e.id)) out.push(e.id); });
    if (set.has("commun")) out.push("commun");
    return out;
}

function findPlacement(eqId, excludeKey) {
    for (const key of allPlanKeys()) {
        if (key === excludeKey) continue;
        const p = photoStore[key];
        if (p && Array.isArray(p.annotations) &&
            p.annotations.some(d => d && d.type === "equip" && d.owner === eqId)) {
            return { key, label: planLabel(key) };
        }
    }
    return null;
}

// Un tracé (flèche ou tracé multi-points) attribué à l'équipement existe-t-il ?
function hasDrawnPath(eqId) {
    return Object.values(photoStore).some(p => p && Array.isArray(p.annotations) &&
        p.annotations.some(d => d && d.owner === eqId && (d.type === "polyline" || d.type === "arrow")));
}

// Cheminement indiqué d'une façon ou d'une autre (tracé, « même que », texte, photos)
function hasCablePath(e) {
    if (hasDrawnPath(e.id)) return true;
    if (e.sameAs && SITE.equips[e.sameAs]) return true;
    if (String(e.cheminement || "").trim()) return true;
    return e.chem.some(i => photoStore[i.key] || (i.comment || "").trim());
}

// ---------- Mise à jour des photos annotées ----------
async function rerenderPhoto(key) {
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

// Photos portant un marqueur d'équipement → à régénérer quand un nom / type change
async function rerenderMarkerPhotos() {
    const keys = Object.keys(photoStore).filter(k => {
        const p = photoStore[k];
        return p && Array.isArray(p.annotations) && p.annotations.some(d => d && d.type === "equip");
    });
    for (const k of keys) await rerenderPhoto(k);
}

let _markerTimer = null;
function scheduleMarkerRerender() {
    clearTimeout(_markerTimer);
    _markerTimer = setTimeout(() => { rerenderMarkerPhotos(); }, 1200);
}

// Retire d'une photo tout ce qui appartient à un équipement supprimé
async function purgeOwner(eqId) {
    for (const key of Object.keys(photoStore)) {
        const p = photoStore[key];
        if (!p || !Array.isArray(p.annotations)) continue;
        const kept = p.annotations.filter(d => !(d && d.owner === eqId &&
            (d.type === "equip" || d.type === "arrow" || d.type === "polyline")));
        if (kept.length !== p.annotations.length) {
            p.annotations = kept;
            await rerenderPhoto(key);
        }
    }
}

// ---------- Pont avec l'éditeur d'annotation ----------
window.SiteBridge = {
    getOwners() {
        return orderedEquips().map(({ e, n }) => ({
            id: e.id, nom: e.nom, color: eqColor(e), niveauNom: niveauLabel(n), kind: e.type
        }));
    },
    getOwner(id) {
        if (id === "commun") return { id, nom: COMMUN.nom, color: COMMUN.hex, kind: null };
        const e = SITE.equips[id];
        return e ? { id, nom: e.nom, color: eqColor(e), kind: e.type } : null;
    },
    typeInfo(kind) {
        const t = EQUIP_TYPES[kind];
        return { fov: !!(t && t.fov), label: t ? t.label : "" };
    },
    defaultOwner(ctx, last) {
        if (ctx && ctx.focusOwner && SITE.equips[ctx.focusOwner]) return ctx.focusOwner;
        if (ctx && ctx.kind === "equip" && SITE.equips[ctx.eqId]) return ctx.eqId;
        if (ctx && ctx.kind === "plan") {
            const n = niveauById(ctx.niveauId);
            // En priorité : le premier équipement du niveau pas encore placé
            if (n) {
                const unplaced = n.equips.find(id => SITE.equips[id] && !findPlacement(id, null));
                if (unplaced) return unplaced;
            }
            if (last && this.getOwner(last)) return last;
            if (n && n.equips.length) return n.equips[0];
        }
        const all = orderedEquips();
        return all.length ? all[0].e.id : "commun";
    },
    findPlanPlacement(eqId, excludeKey) { return findPlacement(eqId, excludeKey); },
    async removeMarker(key, eqId) {
        const p = photoStore[key];
        if (!p || !Array.isArray(p.annotations)) return;
        p.annotations = p.annotations.filter(d => !(d && d.type === "equip" && d.owner === eqId));
        await rerenderPhoto(key);
        refreshDerived();
    },
    afterSave() { refreshDerived(); }
};

// ============================================================
//  CLIENT FINAL — surcouche « sans donneur d'ordre »
// ============================================================
function isSansDonneurOrdre() {
    const sel = document.getElementById("client_final");
    return !sel || !sel.value || sel.value === "aucun";
}
function siteFooterText() {
    if (isSansDonneurOrdre()) return "Document confidentiel — Usage interne IPKONEKT";
    return clientFooterText();
}
function siteBannerText(separator) {
    if (isSansDonneurOrdre()) return "IPKONEKT";
    return clientBannerText(separator);
}
function siteClientLogoBytes() {
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

    // Niveaux / plans / équipements
    setupSiteEvents();
    const addNiveauBtn = document.getElementById("addNiveauBtn");
    if (addNiveauBtn) addNiveauBtn.addEventListener("click", () => {
        const n = addNiveau();
        renderSite();
        scrollToEl(`[data-niveau="${n.id}"]`);
        scheduleSynthese();
        schedule();
    });

    // Synthèse automatique
    const synth = document.getElementById("synthese_equipements");
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

    // Modale de rappel
    const back = document.getElementById("rappelBackBtn");
    if (back) back.addEventListener("click", () => closeRappelModal(false));
    const go = document.getElementById("rappelGoBtn");
    if (go) go.addEventListener("click", () => closeRappelModal(true));
    const overlay = document.getElementById("rappelOverlay");
    if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeRappelModal(false); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay && overlay.classList.contains("shown")) closeRappelModal(false);
    });

    const restored = await AUTOSAVE.restore();
    if (!restored) {
        addGalleryItem("baie_fermee");
        SITE = newSiteState();
        addNiveau();
        renderSite();
    }

    AUTOSAVE.attach();
    applyBaieVisibility();
    updateBaieConformite(false);
    refreshSynthese(false);
    renderRappels();
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

function getRadio(name) {
    const r = document.querySelector(`input[name="${name}"]:checked`);
    return r ? r.value : "";
}

// ============================================================
//  CLICS GLOBAUX (annoter / effacer / supprimer / rappels)
// ============================================================
function handleGlobalClick(e) {
    const gotoBtn = e.target.closest("[data-goto-eq]");
    if (gotoBtn) {
        const overlay = document.getElementById("rappelOverlay");
        if (overlay && overlay.classList.contains("shown")) closeRappelModal(false);
        goToEquip(gotoBtn.dataset.gotoEq);
        return;
    }

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
        const info = photoInfo(key);
        if (info) {
            window.Editor.open(key, info.label, { kind: info.kind, niveauId: info.niveauId, eqId: info.eqId, key });
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
        refreshDerived();
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
//  RENDU DES NIVEAUX / PLANS / ÉQUIPEMENTS
// ============================================================
function photoBlockHtml(key, opts = {}) {
    const has = !!photoStore[key];
    const src = has ? photoStore[key].dataUrl : "";
    return `
        <input type="file" accept="image/*" data-site-photo="${key}">
        <img class="photo-preview${has ? " shown" : ""}" id="preview_${key}" alt=""${has ? ` src="${src}"` : ""}>
        <div class="chem-actions">
            <button type="button" class="annotate-btn" data-annotate="${key}"${has ? "" : " disabled"}>${opts.annotateLabel || "✏ Annoter"}</button>
            <button type="button" class="clear-btn" data-clear="${key}">🗑 Effacer</button>
        </div>`;
}

function itemHtml(title, key, list, comment, placeholder) {
    return `
        <div class="cheminement-item" data-photo-key="${key}" data-list="${list}">
            <div class="chem-header">
                <strong>${title}</strong>
                <button type="button" class="btn-delete" data-eq-act="del-item" title="Supprimer">🗑</button>
            </div>
            ${photoBlockHtml(key)}
            <textarea class="cheminement-comment" data-eq-field="item-comment" placeholder="${escapeHtml(placeholder)}">${escapeHtml(comment || "")}</textarea>
        </div>`;
}

function typeOptionsHtml(selected) {
    let html = "";
    Object.keys(EQUIP_CATS).forEach(cat => {
        const keys = Object.keys(EQUIP_TYPES).filter(k => EQUIP_TYPES[k].cat === cat);
        if (!keys.length) return;
        html += `<optgroup label="${escapeHtml(EQUIP_CATS[cat].label)}">`;
        keys.forEach(k => {
            html += `<option value="${k}"${selected === k ? " selected" : ""}>${escapeHtml(EQUIP_TYPES[k].label)}</option>`;
        });
        html += `</optgroup>`;
    });
    return html;
}

function sameAsOptionsHtml(e) {
    let html = `<option value="">— Non, cheminement propre à cet équipement —</option>`;
    orderedEquips().forEach(({ e: o }) => {
        if (o.id === e.id || !eqHasCable(o)) return;
        html += `<option value="${o.id}"${e.sameAs === o.id ? " selected" : ""}>${escapeHtml(o.nom)}</option>`;
    });
    return html;
}

function poseOptionsHtml(e) {
    let html = `<option value="">— Choisir —</option>`;
    Object.keys(POSE_TYPES).forEach(k => {
        html += `<option value="${k}"${e.pose === k ? " selected" : ""}>${POSE_TYPES[k].label}</option>`;
    });
    return html;
}

function situationOptionsHtml(e) {
    let html = `<option value="">— Choisir —</option>`;
    Object.keys(SITUATIONS).forEach(k => {
        html += `<option value="${k}"${e.situation === k ? " selected" : ""}>${SITUATIONS[k]}</option>`;
    });
    return html;
}

function buildEquipCard(e) {
    const color = eqColor(e);
    const t = typeOf(e);
    const sameAs = e.sameAs && SITE.equips[e.sameAs] ? SITE.equips[e.sameAs] : null;
    const cable = eqHasCable(e);
    const div = document.createElement("div");
    div.className = "eq-card" + (e.collapsed ? " collapsed" : "");
    div.dataset.eq = e.id;
    div.style.setProperty("--eq-color", color);
    div.innerHTML = `
        <div class="eq-head">
            <button type="button" class="card-toggle" data-eq-act="toggle-eq" aria-label="Replier / déplier">▾</button>
            <span class="eq-dot" title="Couleur sur les plans : ${eqColorName(e)}"></span>
            <input type="text" class="eq-nom" data-eq-field="nom" value="${escapeHtml(e.nom)}" aria-label="Nom de l'équipement">
            <span class="eq-type-badge">${escapeHtml(t.label)}</span>
            <button type="button" class="btn-delete" data-eq-act="del-eq" title="Supprimer l'équipement">🗑</button>
        </div>
        <div class="eq-body">
            <div class="eq-placement"></div>
            <div class="eq-grid">
                <label>Type d'équipement
                    <select data-eq-field="type">${typeOptionsHtml(e.type)}</select>
                </label>
                <label>Intérieur / extérieur
                    <select data-eq-field="situation">${situationOptionsHtml(e)}</select>
                </label>
                <label>${escapeHtml(empLabel(e))}
                    <input type="text" data-eq-field="emplacement" value="${escapeHtml(e.emplacement)}" placeholder="${escapeHtml(t.empPh || "")}">
                </label>
                <label>Type de pose
                    <select data-eq-field="pose">${poseOptionsHtml(e)}</select>
                </label>
                <label>Hauteur de pose (m)
                    <input type="number" inputmode="decimal" step="0.1" min="0" data-eq-field="hauteur" value="${escapeHtml(e.hauteur)}">
                </label>
                <label>Liaison
                    <select data-eq-field="liaison">
                        <option value="cable"${cable ? " selected" : ""}>Câblée (câble jusqu'à la baie)</option>
                        <option value="sansfil"${cable ? "" : " selected"}>Sans fil</option>
                    </select>
                </label>
            </div>
            <label class="eq-full eq-fov-only"${t.fov ? "" : " hidden"}>${escapeHtml(zoneLabel(e))}
                <textarea data-eq-field="zone" placeholder="${escapeHtml(t.zonePh || "")}">${escapeHtml(e.zone)}</textarea>
            </label>
            <p class="eq-wireless-note"${cable ? " hidden" : ""}>📡 Équipement sans fil : pas de câble à tirer. Placez-le simplement sur un plan.</p>
            <div class="eq-cable-only"${cable ? "" : " hidden"}>
                <div class="eq-grid" style="margin-top:10px;">
                    <label>Métrage de câble jusqu'à la baie (m)
                        <input type="number" inputmode="decimal" step="1" min="0" data-eq-field="metrage" value="${escapeHtml(e.metrage)}">
                    </label>
                </div>
                <label class="eq-full">Même cheminement que
                    <select data-eq-field="sameAs">${sameAsOptionsHtml(e)}</select>
                </label>
                <label class="eq-full"><span class="eq-chem-label">${sameAs ? "Partie du cheminement propre à cet équipement" : "Résumé du cheminement du câble jusqu'à la baie"}</span>
                    <textarea data-eq-field="cheminement" placeholder="${sameAs ? "Ex : descente en goulotte jusqu'à la caméra" : "Ex : faux plafond du couloir, traversée de façade, puis goulotte jusqu'à la caméra"}">${escapeHtml(e.cheminement)}</textarea>
                </label>
            </div>

            <div class="photo-cat-title small">📷 ${escapeHtml(empPhotoTitle(e))}</div>
            <div class="mp-photo-block eq-single-photo">${photoBlockHtml(e.empKey)}</div>

            <div class="eq-vue-block"${t.vue ? "" : " hidden"}>
                <div class="photo-cat-title small">
                    <span class="audit-only">📷 Vue souhaitée (photo prise depuis l'emplacement de la caméra)</span>
                    <span class="travaux-only">📷 Image obtenue (capture de la caméra)</span>
                </div>
                <div class="mp-photo-block eq-single-photo">${photoBlockHtml(e.vueKey)}</div>
            </div>

            <div class="eq-cable-only"${cable ? "" : " hidden"}>
                <div class="photo-cat-title small">📷 Photos du cheminement</div>
                <p class="photo-cat-note eq-sameas-note"${sameAs ? "" : " hidden"}>Cheminement identique à « ${escapeHtml(sameAs ? sameAs.nom : "")} » : ajoutez seulement les photos de la partie propre à cet équipement.</p>
                <div class="gallery-grid" data-list-container="chem">
                    ${e.chem.map((it, i) => itemHtml(`📷 Cheminement ${i + 1}`, it.key, "chem", it.comment, "Commentaire (passage de câble, support, traversée…)")).join("")}
                </div>
                <button type="button" class="btn-secondary" data-eq-act="add-chem">➕ Ajouter une photo de cheminement</button>

                <div class="photo-cat-title small">📷 Percements</div>
                <div class="gallery-grid" data-list-container="perc">
                    ${e.perc.map((it, i) => itemHtml(`📷 Percement ${i + 1}`, it.key, "perc", it.comment, "Commentaire (emplacement, diamètre, rebouchage…)")).join("")}
                </div>
                <button type="button" class="btn-secondary" data-eq-act="add-perc">➕ Ajouter une photo de percement</button>
            </div>
        </div>`;
    return div;
}

function buildNiveauCard(n) {
    const div = document.createElement("div");
    div.className = "niv-card" + (n.collapsed ? " collapsed" : "");
    div.dataset.niveau = n.id;
    const nb = n.equips.length;
    div.innerHTML = `
        <div class="niv-head">
            <button type="button" class="card-toggle" data-eq-act="toggle-niveau" aria-label="Replier / déplier">▾</button>
            <label class="niv-label">Niveau
                <input type="text" class="niv-nom" data-niv-field="nom" value="${escapeHtml(n.nom)}" placeholder="Ex : RDC, R+1, sous-sol, extérieur, bâtiment B…">
            </label>
            <span class="niv-count">${nb} équipement${nb > 1 ? "s" : ""}</span>
            <button type="button" class="btn-delete" data-eq-act="del-niveau" title="Supprimer le niveau">🗑</button>
        </div>
        <div class="niv-body">
            <div class="photo-cat-title">🗺️ Plan(s) d'évacuation du niveau</div>
            <p class="photo-cat-note">Sur chaque plan : posez la baie et les équipements, orientez le champ de vision des caméras, puis tracez le cheminement de chaque câble jusqu'à la baie. La couleur de chaque équipement est appliquée automatiquement.</p>
            <div class="gallery-grid" data-list-container="plans">
                ${n.plans.map((p, i) => `
                    <div class="cheminement-item" data-photo-key="${p.key}" data-list="plans">
                        <div class="chem-header">
                            <strong>🗺️ Plan ${i + 1} — ${escapeHtml(niveauLabel(n))}</strong>
                            <button type="button" class="btn-delete" data-eq-act="del-item" title="Supprimer ce plan">🗑</button>
                        </div>
                        ${photoBlockHtml(p.key, { annotateLabel: "✏ Annoter / placer / tracer" })}
                        <div class="plan-legend" data-legend="${p.key}"></div>
                        <textarea class="cheminement-comment" data-eq-field="item-comment" placeholder="Commentaire du plan (optionnel)">${escapeHtml(p.comment || "")}</textarea>
                    </div>`).join("")}
            </div>
            <button type="button" class="btn-secondary" data-eq-act="add-plan">➕ Ajouter un plan pour ce niveau</button>

            <div class="photo-cat-title">📍 Équipements du niveau</div>
            <p class="photo-cat-note niv-empty-note"${nb ? " hidden" : ""}>Aucun équipement sur ce niveau. Choisissez un type ci-dessous puis « Ajouter ».</p>
            <div class="eq-list"></div>
            <div class="eq-add-bar">
                <span>Ajouter :</span>
                <select data-niv-field="addType" aria-label="Type d'équipement à ajouter">${typeOptionsHtml(n.addType || "camera")}</select>
                <button type="button" class="btn-secondary" data-eq-act="add-eq">➕ Ajouter</button>
            </div>
        </div>`;
    const list = div.querySelector(".eq-list");
    n.equips.forEach(id => {
        const e = SITE.equips[id];
        if (e) list.appendChild(buildEquipCard(e));
    });
    return div;
}

function renderSite() {
    const root = document.getElementById("siteNiveaux");
    if (!root) return;
    root.innerHTML = "";
    SITE.niveaux.forEach(n => root.appendChild(buildNiveauCard(n)));
    const empty = document.getElementById("siteEmpty");
    if (empty) empty.hidden = SITE.niveaux.length > 0;
    refreshDerived();
}

// Éléments qui dépendent des noms / annotations, mis à jour sans tout reconstruire
function refreshDerived() {
    // Légendes sous les plans
    document.querySelectorAll(".plan-legend[data-legend]").forEach(el => {
        const owners = planOwners(el.dataset.legend);
        if (!owners.length) {
            el.innerHTML = "";
            el.hidden = true;
            return;
        }
        el.hidden = false;
        el.innerHTML = `<span class="plan-legend-title">Sur ce plan :</span>` + owners.map(id => {
            const o = window.SiteBridge.getOwner(id);
            return o ? `<span class="plan-chip" style="--chip:${o.color}">${escapeHtml(o.nom)}</span>` : "";
        }).join("");
    });
    // Position de chaque équipement sur les plans
    document.querySelectorAll(".eq-card[data-eq]").forEach(card => {
        const el = card.querySelector(".eq-placement");
        if (!el) return;
        const pl = findPlacement(card.dataset.eq, null);
        if (pl) {
            el.textContent = `📍 Placé sur : ${pl.label}`;
        } else {
            el.innerHTML = `⚠ Pas encore placé sur un plan.<button type="button" class="eq-place-btn" data-eq-act="place">✏ Placer sur un plan</button>`;
        }
        el.classList.toggle("placed", !!pl);
        el.classList.toggle("missing", !pl);
    });
    scheduleSynthese();
}

// Met à jour les noms affichés (sans reconstruire les cartes)
function syncNames() {
    autoNames();
    document.querySelectorAll(".eq-card[data-eq]").forEach(card => {
        const e = SITE.equips[card.dataset.eq];
        if (!e) return;
        const inp = card.querySelector(".eq-nom");
        if (inp && document.activeElement !== inp && inp.value !== e.nom) inp.value = e.nom;
        const sel = card.querySelector('select[data-eq-field="sameAs"]');
        if (sel) {
            const v = e.sameAs;
            sel.innerHTML = sameAsOptionsHtml(e);
            sel.value = v;
        }
        const note = card.querySelector(".eq-sameas-note");
        const ref = e.sameAs && SITE.equips[e.sameAs];
        if (note) {
            note.hidden = !ref;
            if (ref) note.textContent = `Cheminement identique à « ${ref.nom} » : ajoutez seulement les photos de la partie propre à cet équipement.`;
        }
    });
    document.querySelectorAll(".niv-card[data-niveau]").forEach(card => {
        const n = niveauById(card.dataset.niveau);
        if (!n) return;
        card.querySelectorAll('[data-list="plans"] .chem-header strong').forEach((s, i) => {
            s.textContent = `🗺️ Plan ${i + 1} — ${niveauLabel(n)}`;
        });
    });
    refreshDerived();
    scheduleMarkerRerender();
}

// Ouvre l'éditeur sur le premier plan du niveau, équipement présélectionné
function placeOnPlan(e) {
    const n = niveauById(e.niveauId);
    if (!n) return;
    const plan = n.plans.find(p => photoStore[p.key]);
    if (!plan) {
        alert(`Importez d'abord un plan d'évacuation pour le niveau « ${niveauLabel(n)} », puis placez « ${e.nom} » dessus.`);
        const card = document.querySelector(`[data-niveau="${n.id}"] [data-list-container="plans"]`);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    if (!window.Editor || !window.Editor.open) {
        alert("L'éditeur d'annotation n'est pas chargé.");
        return;
    }
    window.Editor.open(plan.key, planLabel(plan.key), { kind: "plan", niveauId: n.id, key: plan.key, focusOwner: e.id });
}

// Fait défiler jusqu'à un équipement (déplie le niveau et la carte)
function goToEquip(id) {
    if (!id || !SITE.equips[id]) {
        scrollToEl("#siteNiveaux");
        return;
    }
    const e = SITE.equips[id];
    const n = niveauById(e.niveauId);
    if (n && n.collapsed) {
        n.collapsed = false;
        const nc = document.querySelector(`[data-niveau="${n.id}"]`);
        if (nc) nc.classList.remove("collapsed");
    }
    if (e.collapsed) {
        e.collapsed = false;
        const c = document.querySelector(`[data-eq="${id}"]`);
        if (c) c.classList.remove("collapsed");
    }
    const card = document.querySelector(`[data-eq="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 2200);
}

// Affiche / masque les blocs « câble » et « champ de vision » d'une carte
function applyEquipCardVisibility(card, e) {
    const cable = eqHasCable(e);
    card.querySelectorAll(".eq-cable-only").forEach(el => { el.hidden = !cable; });
    const note = card.querySelector(".eq-wireless-note");
    if (note) note.hidden = cable;
}

function setupSiteEvents() {
    const root = document.getElementById("siteNiveaux");
    if (!root) return;

    root.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("[data-eq-act]");
        if (!btn) return;
        const act = btn.dataset.eqAct;
        const nCard = btn.closest(".niv-card");
        const eCard = btn.closest(".eq-card");
        const n = nCard ? niveauById(nCard.dataset.niveau) : null;
        const e = eCard ? SITE.equips[eCard.dataset.eq] : null;

        if (act === "toggle-niveau" && n) {
            n.collapsed = !n.collapsed;
            nCard.classList.toggle("collapsed", n.collapsed);
        } else if (act === "toggle-eq" && e) {
            e.collapsed = !e.collapsed;
            eCard.classList.toggle("collapsed", e.collapsed);
        } else if (act === "del-niveau" && n) {
            const nb = n.equips.length;
            if (!confirm(`Supprimer le niveau « ${niveauLabel(n)} », ses plans et ${nb > 1 ? `ses ${nb} équipements` : (nb === 1 ? "son équipement" : "son contenu")} ?`)) return;
            await deleteNiveau(n.id);
            renderSite();
        } else if (act === "del-eq" && e) {
            if (!confirm(`Supprimer « ${e.nom} », ses photos et ses tracés sur les plans ?`)) return;
            await deleteEquip(e.id);
            renderSite();
            scheduleMarkerRerender();
        } else if (act === "add-plan" && n) {
            n.plans.push({ key: newKey("plan"), comment: "" });
            renderSite();
        } else if (act === "add-eq" && n) {
            const sel = nCard.querySelector('select[data-niv-field="addType"]');
            const type = sel && sel.value ? sel.value : (n.addType || "camera");
            n.addType = type;
            const ne = addEquip(n.id, type);
            n.collapsed = false;
            renderSite();
            scheduleMarkerRerender();
            const card = document.querySelector(`[data-eq="${ne.id}"]`);
            if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (act === "place" && e) {
            placeOnPlan(e);
            return;
        } else if ((act === "add-chem" || act === "add-perc") && e) {
            const list = act === "add-chem" ? e.chem : e.perc;
            list.push({ key: newKey(act === "add-chem" ? "echem" : "eperc"), comment: "" });
            renderSite();
        } else if (act === "del-item") {
            const item = btn.closest(".cheminement-item");
            if (!item) return;
            const key = item.dataset.photoKey;
            const listName = item.dataset.list;
            const what = listName === "plans" ? "ce plan (et ses tracés)" : "cette photo";
            if (!confirm(`Supprimer ${what} ?`)) return;
            delete photoStore[key];
            if (listName === "plans" && n) n.plans = n.plans.filter(p => p.key !== key);
            else if (e && listName === "chem") e.chem = e.chem.filter(p => p.key !== key);
            else if (e && listName === "perc") e.perc = e.perc.filter(p => p.key !== key);
            renderSite();
        } else {
            return;
        }
        scheduleSynthese();
        schedule();
    });

    const onField = (ev, isChange) => {
        const t = ev.target;
        const nCard = t.closest ? t.closest(".niv-card") : null;
        const eCard = t.closest ? t.closest(".eq-card") : null;
        const n = nCard ? niveauById(nCard.dataset.niveau) : null;
        const e = eCard ? SITE.equips[eCard.dataset.eq] : null;
        const nivField = t.dataset ? t.dataset.nivField : null;
        const field = t.dataset ? t.dataset.eqField : null;

        if (nivField === "nom" && n) {
            n.nom = t.value;
            syncNames();
            return;
        }
        if (nivField === "addType" && n) {
            n.addType = t.value;
            return;
        }
        if (!field) return;

        if (field === "nom" && e) {
            if (isChange && !t.value.trim()) {
                e.nomManuel = false;
                autoNames();
                t.value = e.nom;
            } else if (!isChange) {
                e.nom = t.value;
                e.nomManuel = true;
            }
            syncNames();
        } else if (field === "item-comment") {
            const item = t.closest(".cheminement-item");
            if (!item) return;
            const key = item.dataset.photoKey;
            const list = item.dataset.list === "plans" && n ? n.plans
                : (e ? (item.dataset.list === "chem" ? e.chem : e.perc) : null);
            const entry = list ? list.find(p => p.key === key) : null;
            if (entry) entry.comment = t.value;
            scheduleSynthese();
        } else if (field === "type" && e) {
            if (!isChange) return;
            e.type = EQUIP_TYPES[t.value] ? t.value : "autre";
            if (!e.liaisonManuel) e.liaison = typeOf(e).cable ? "cable" : "sansfil";
            autoNames();
            renderSite();
            scheduleMarkerRerender();
        } else if (field === "liaison" && e) {
            e.liaison = t.value === "sansfil" ? "sansfil" : "cable";
            e.liaisonManuel = true;
            applyEquipCardVisibility(eCard, e);
            syncNames();
        } else if (e && ["situation", "emplacement", "zone", "pose", "hauteur", "metrage", "sameAs", "cheminement"].includes(field)) {
            e[field] = t.value;
            if (field === "sameAs") {
                const ref = e.sameAs && SITE.equips[e.sameAs];
                const lbl = eCard.querySelector(".eq-chem-label");
                if (lbl) lbl.textContent = ref ? "Partie du cheminement propre à cet équipement" : "Résumé du cheminement du câble jusqu'à la baie";
                const ta = eCard.querySelector('textarea[data-eq-field="cheminement"]');
                if (ta) ta.placeholder = ref ? "Ex : descente en goulotte jusqu'à la caméra" : "Ex : faux plafond du couloir, traversée de façade, puis goulotte jusqu'à la caméra";
                const note = eCard.querySelector(".eq-sameas-note");
                if (note) {
                    note.hidden = !ref;
                    if (ref) note.textContent = `Cheminement identique à « ${ref.nom} » : ajoutez seulement les photos de la partie propre à cet équipement.`;
                }
            }
            scheduleSynthese();
        }
    };
    root.addEventListener("input", (ev) => onField(ev, false));
    root.addEventListener("change", async (ev) => {
        const t = ev.target;
        if (t.matches && t.matches('input[type="file"][data-site-photo]')) {
            const key = t.dataset.sitePhoto;
            const file = t.files && t.files[0];
            if (!file) return;
            await processPhoto(file, key);
            const annBtn = document.querySelector(`[data-annotate="${key}"]`);
            if (annBtn) annBtn.disabled = false;
            t.value = "";
            refreshDerived();
            return;
        }
        onField(ev, true);
    });
}

// ============================================================
//  RAPPELS (non bloquants)
// ============================================================
function computeRappels() {
    const out = [];
    const all = orderedEquips();
    if (!all.length) {
        out.push({ eqId: null, color: "#f0ad4e", text: "Aucun équipement n'a été ajouté (section 4)." });
        return out;
    }
    all.forEach(({ e, n }) => {
        const nm = `« ${e.nom} » (${niveauLabel(n)})`;
        const color = eqColor(e);
        if (!findPlacement(e.id, null)) {
            out.push({ eqId: e.id, color, text: `Vous n'avez pas placé ${nm} sur un plan.` });
        }
        if (eqHasCable(e)) {
            if (!hasCablePath(e)) {
                out.push({ eqId: e.id, color, text: `Vous n'avez pas indiqué le cheminement du câble de ${nm} (tracé sur le plan ou description).` });
            }
            if (!String(e.metrage).trim()) {
                out.push({ eqId: e.id, color, text: `Vous n'avez pas renseigné le métrage de câble de ${nm}.` });
            }
        }
    });
    return out;
}

function rappelsHtml(list) {
    return list.map(r => `
        <li>
            <span class="rappel-dot" style="background:${r.color}"></span>
            <button type="button" data-goto-eq="${r.eqId || ""}">${escapeHtml(r.text)}</button>
        </li>`).join("");
}

function renderRappels() {
    const box = document.getElementById("rappelsBox");
    const ul = document.getElementById("rappelsList");
    if (!box || !ul) return;
    const list = computeRappels();
    box.hidden = !list.length;
    ul.innerHTML = rappelsHtml(list);
}

let _rappelResolve = null;
function askRappels(list) {
    const overlay = document.getElementById("rappelOverlay");
    const ul = document.getElementById("rappelModalList");
    if (!overlay || !ul) return Promise.resolve(true);
    ul.innerHTML = rappelsHtml(list);
    overlay.classList.add("shown");
    return new Promise(resolve => { _rappelResolve = resolve; });
}

function closeRappelModal(go) {
    const overlay = document.getElementById("rappelOverlay");
    if (overlay) overlay.classList.remove("shown");
    const r = _rappelResolve;
    _rappelResolve = null;
    if (r) r(!!go);
}

// ============================================================
//  SYNTHÈSE AUTOMATIQUE PAR ÉQUIPEMENT
// ============================================================
function fmtNum(v) { return String(v).trim().replace(".", ","); }
function toNum(v) { const n = parseFloat(String(v || "").replace(",", ".")); return isNaN(n) ? 0 : n; }

function lcFirst(s) {
    if (!s) return s;
    if (s.length > 1 && s[0] === s[0].toUpperCase() && s[1] === s[1].toLowerCase() && s[0] !== s[0].toLowerCase()) {
        return s[0].toLowerCase() + s.slice(1);
    }
    return s;
}

function ucFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function oneLine(s) { return String(s || "").replace(/\s*\n+\s*/g, " ").trim(); }

function equipPercements(e) {
    const items = e.perc.filter(i => photoStore[i.key] || (i.comment || "").trim());
    const comments = items.map(i => oneLine(i.comment)).filter(Boolean);
    return { count: items.length, comments };
}

function cheminementText(e) {
    const spec = oneLine(e.cheminement);
    const ref = e.sameAs && SITE.equips[e.sameAs];
    if (ref) return `identique à ${ref.nom}` + (spec ? `, puis ${lcFirst(spec)}` : "");
    return spec;
}

function poseText(e) {
    let pose = POSE_TYPES[e.pose] ? POSE_TYPES[e.pose].phrase : "";
    if (String(e.hauteur).trim()) pose = (pose || "pose") + ` à ${fmtNum(e.hauteur)} m`;
    return pose;
}

function equipHeadText(e) {
    const parts = [];
    if (SITUATIONS[e.situation]) parts.push(SITUATIONS[e.situation].toLowerCase());
    if (e.emplacement.trim()) parts.push(parts.length ? lcFirst(oneLine(e.emplacement)) : oneLine(e.emplacement));
    const pose = poseText(e);
    if (pose) parts.push(pose);
    return parts.length ? ucFirst(parts.join(", ")) : "";
}

// « 4 caméras (3 extérieur, 1 intérieur), 8 contacts d'ouverture »
function countText(equips) {
    const parts = [];
    Object.keys(EQUIP_TYPES).forEach(k => {
        const list = equips.filter(e => e.type === k);
        if (!list.length) return;
        const t = EQUIP_TYPES[k];
        let txt = `${list.length} ${list.length > 1 ? t.many : t.one}`;
        if (k === "camera") {
            const ext = list.filter(e => e.situation === "exterieur").length;
            const int = list.filter(e => e.situation === "interieur").length;
            const sub = [];
            if (ext) sub.push(`${ext} extérieur`);
            if (int) sub.push(`${int} intérieur`);
            if (sub.length) txt += ` (${sub.join(", ")})`;
        }
        parts.push(txt);
    });
    return parts.join(", ");
}

function totalCable() {
    const cabled = orderedEquips().filter(({ e }) => eqHasCable(e));
    const total = Math.round(cabled.reduce((s, { e }) => s + toNum(e.metrage), 0) * 10) / 10;
    return { total, count: cabled.length };
}

function buildSynthese() {
    const travaux = getMode() === "travaux";
    const baieFuture = getBaieExistante() === "Non";
    const src = baieFuture ? "depuis la future baie de brassage" : "depuis la baie de brassage";
    const all = orderedEquips();
    if (!all.length) return "(Aucun équipement renseigné.)";
    const blocks = [];

    Object.keys(EQUIP_CATS).forEach(cat => {
        const list = all.filter(({ e }) => typeOf(e).cat === cat);
        if (!list.length) return;
        const lines = [`${EQUIP_CATS[cat].label.toUpperCase()} — ${countText(list.map(x => x.e))}`];
        list.forEach(({ e }) => {
            lines.push("");
            const head = equipHeadText(e);
            lines.push(head ? `${e.nom} — ${head}` : e.nom);
            if (typeOf(e).fov && e.zone.trim()) lines.push(`   • ${zoneLabel(e)} : ${oneLine(e.zone)}`);
            if (eqHasCable(e)) {
                if (String(e.metrage).trim()) {
                    const m = fmtNum(e.metrage);
                    lines.push(travaux ? `   • ${m} m de câble tirés ${src}` : `   • Prévoir ${m} m de câble ${src}`);
                } else {
                    lines.push("   • Métrage de câble non renseigné");
                }
                const chem = cheminementText(e);
                if (chem) lines.push(`   • Cheminement : ${chem}`);
                const perc = equipPercements(e);
                if (perc.count) {
                    const s = perc.count > 1 ? "s" : "";
                    lines.push(`   • ${perc.count} percement${s}` + (perc.comments.length ? ` : ${perc.comments.join(" ; ")}` : " (voir photos)"));
                }
            } else {
                lines.push("   • Équipement sans fil (pas de câble à tirer)");
            }
        });
        blocks.push(lines.join("\n"));
    });

    const tc = totalCable();
    if (tc.total > 0) {
        blocks.push(`${travaux ? "Total de câble tiré" : "Total de câble à prévoir"} : ${fmtNum(tc.total)} m ` +
            `(${tc.count} équipement${tc.count > 1 ? "s" : ""} câblé${tc.count > 1 ? "s" : ""}).`);
    }
    return blocks.join("\n\n");
}

function refreshSynthese(force) {
    const ta = document.getElementById("synthese_equipements");
    if (ta && (!syntheseManuel || force)) ta.value = buildSynthese();
    updateSyntheseBadge();
    renderRappels();
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
        version: "camera-alarme-v1",
        exportedAt: new Date().toISOString(),
        fields: {},
        radios: {},
        checkboxes: {},
        galleries: {},
        galleryCounters: { ...galleryCounters },
        blocageEnabled: isBlocageEnabled(),
        baieConformeManuel,
        syntheseManuel,
        site: JSON.parse(JSON.stringify(SITE)),
        photos: {}
    };

    // Champs fixes (les champs des niveaux / équipements n'ont pas d'id : ils sont dans « site »)
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

function normalizeSite(w) {
    const s = newSiteState();
    if (!w || typeof w !== "object") return s;
    s.seq = Object.assign(s.seq, w.seq || {});
    s.equips = {};
    Object.values(w.equips || {}).forEach(e => {
        if (!e || !e.id) return;
        const o = Object.assign({
            type: "camera", nom: "", nomManuel: false, colorIdx: 0, situation: "", emplacement: "", zone: "",
            pose: "", hauteur: "", liaison: "", liaisonManuel: false, metrage: "", sameAs: "", cheminement: "",
            collapsed: false, empKey: `eemp_x${e.id}`, vueKey: `evue_x${e.id}`, chem: [], perc: []
        }, e);
        if (!EQUIP_TYPES[o.type]) o.type = "autre";
        if (o.liaison !== "cable" && o.liaison !== "sansfil") o.liaison = EQUIP_TYPES[o.type].cable ? "cable" : "sansfil";
        if (!Array.isArray(o.chem)) o.chem = [];
        if (!Array.isArray(o.perc)) o.perc = [];
        s.equips[o.id] = o;
    });
    s.niveaux = (w.niveaux || []).map(n => ({
        id: n.id, nom: n.nom || "", collapsed: !!n.collapsed,
        addType: EQUIP_TYPES[n.addType] ? n.addType : "camera",
        plans: Array.isArray(n.plans) ? n.plans : [],
        equips: (n.equips || []).filter(id => s.equips[id])
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

    // Niveaux / équipements
    SITE = normalizeSite(data.site);
    if (!SITE.niveaux.length) addNiveau();

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

    renderSite();
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
        saveAs(blob, `CamerasAlarme_${safeName}_${date}.json`);
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
            if (data.version !== "camera-alarme-v1" &&
                !confirm("Ce fichier ne provient pas du formulaire Caméras & Alarme.\nSeuls les champs communs (en-tête, client, baie…) seront repris.\n\nImporter quand même ?")) {
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
//  Jamais bloquée : s'il reste des rappels, on les affiche et le
//  technicien choisit « Compléter » ou « Générer quand même ».
// ============================================================
async function generateDocument() {
    const rappels = computeRappels();
    if (rappels.length) {
        const go = await askRappels(rappels);
        if (!go) return;
    }

    const btn = document.getElementById("btnGenerateWord");
    const status = document.getElementById("status");
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = "⏳ Génération…"; }
    if (status) { status.textContent = "Génération du rapport Word…"; status.className = "status loading"; }
    try {
        // Noms / types des équipements à jour sur les plans annotés
        await rerenderMarkerPhotos();
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

// Titre du rapport selon les équipements présents
function reportSubject() {
    const cats = new Set(orderedEquips().map(({ e }) => typeOf(e).cat));
    const parts = ["video", "alarme", "acces"].filter(c => cats.has(c)).map(c => EQUIP_CATS[c].titre);
    if (!parts.length) return "CAMÉRAS & ALARME";
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " & " + parts[parts.length - 1];
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
    const equipTitle = (num, e) => new Paragraph({
        spacing: { before: 240, after: 80 },
        keepNext: true,
        keepLines: true,
        children: [
            new TextRun({ text: `${num} - `, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" }),
            new TextRun({ text: "● ", bold: true, size: 26, color: hex(eqColor(e)), font: "Calibri" }),
            new TextRun({ text: e.nom, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" })
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
                color: opts.color || "000000", bold: opts.bold || false, italics: opts.italics || false
            })]
        })]
    });
    const swatchCell = (color, width, keepNext = false) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: hex(color), type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 80, right: 80 },
        borders: stdBorders,
        children: [new Paragraph({ keepNext, children: [] })]
    });
    // Tableau clé / valeur. keepTogether : le tableau reste d'un seul tenant.
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

    // Légende couleur → équipement sous un plan
    // (d'un seul tenant : chaque ligne reste avec la suivante)
    const legendTable = (owners) => new Table({
        width: { size: 8400, type: WidthType.DXA },
        columnWidths: [700, 7700],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("", 700, true), labelCell("Légende du plan", 7700, true)] }),
            ...owners.map((id, i) => {
                const kn = i < owners.length - 1;
                if (id === "commun") {
                    return new TableRow({
                        cantSplit: true,
                        children: [swatchCell(COMMUN.hex, 700, kn), valueCell(`${COMMUN.nom} (${COMMUN.colorName.toLowerCase()}) — tronçon emprunté par plusieurs câbles`, 7700, { keepNext: kn })]
                    });
                }
                const e = SITE.equips[id];
                return new TableRow({
                    cantSplit: true,
                    children: [swatchCell(eqColor(e), 700, kn), valueCell(`${e.nom} — ${typeOf(e).label} (${eqColorName(e).toLowerCase()})`, 7700, { keepNext: kn })]
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
    const subject = reportSubject();

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
                            text: (isTravaux ? "RAPPORT DE TRAVAUX - " : "RAPPORT D'AUDIT - ") + subject,
                            bold: true, size: 32, color: COLOR_WHITE, font: "Calibri"
                        })]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 60, after: 240 },
                        children: [new TextRun({ text: siteBannerText("│"), size: 22, color: COLOR_WHITE, font: "Calibri" })]
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
    children.push(sectionTitle(2, "Baie de brassage / point d'arrivée des câbles"));
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

    // === 3. PHOTOS GÉNÉRALES / ACCÈS EN HAUTEUR ===
    children.push(sectionTitle(3, "Photos générales et accès en hauteur"));
    children.push(subTitle("3.1", "Devanture"));
    children.push(photoBanner("Devanture", "photo_devanture"));
    children.push(subTitle("3.2", "Travaux en hauteur"));
    const nacelle = getRadio("nacelle");
    const hauteurRows = [["Nacelle nécessaire", nacelle || "Non renseigné", {
        bold: true, color: nacelle === "Oui" ? COLOR_KO : (nacelle === "Non" ? COLOR_OK : "000000")
    }]];
    if (val("commentaire_hauteur").trim()) hauteurRows.push(["Commentaire", oneLine(val("commentaire_hauteur"))]);
    children.push(kvTable(hauteurRows, true));
    children.push(spacer());
    children.push(photoBanner("Travaux en hauteur", "photo_travaux_hauteur"));

    // === 4. ÉQUIPEMENTS ===
    children.push(sectionTitle(4, "Équipements : niveaux, plans et cheminements"));
    const allEquips = orderedEquips();
    const levels = SITE.niveaux.filter(n => n.plans.some(p => photoStore[p.key]) || n.equips.length);

    children.push(subTitle("4.1", "Récapitulatif des équipements"));
    if (!allEquips.length) {
        children.push(P("(Aucun équipement renseigné.)", { italics: true, color: "888888" }));
    } else {
        const W = [560, 1600, 1500, 1050, 2350, 1300, 1000];
        children.push(new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W,
            rows: [
                new TableRow({
                    cantSplit: true,
                    tableHeader: true,
                    children: [labelCell("", W[0]), labelCell("Équipement", W[1]), labelCell("Type", W[2]), labelCell("Niveau", W[3]),
                        labelCell("Emplacement", W[4]), labelCell("Pose", W[5]), labelCell("Câble", W[6])]
                }),
                ...allEquips.map(({ e, n }) => {
                    let pose = POSE_TYPES[e.pose] ? POSE_TYPES[e.pose].label : "";
                    if (String(e.hauteur).trim()) pose = (pose ? pose + " — " : "") + `${fmtNum(e.hauteur)} m`;
                    let type = typeOf(e).label;
                    if (SITUATIONS[e.situation]) type += ` (${SITUATIONS[e.situation].toLowerCase()})`;
                    const cable = !eqHasCable(e) ? "Sans fil" : (String(e.metrage).trim() ? `${fmtNum(e.metrage)} m` : "—");
                    return new TableRow({
                        cantSplit: true,
                        children: [
                            swatchCell(eqColor(e), W[0]),
                            valueCell(e.nom, W[1], { bold: true }),
                            valueCell(type, W[2]),
                            valueCell(niveauLabel(n), W[3]),
                            valueCell(oneLine(e.emplacement), W[4]),
                            valueCell(pose, W[5]),
                            valueCell(cable, W[6], { italics: !eqHasCable(e) })
                        ]
                    });
                })
            ]
        }));
        const tc = totalCable();
        children.push(P(`${levels.length} niveau${levels.length > 1 ? "x" : ""} — ${allEquips.length} équipement${allEquips.length > 1 ? "s" : ""} : ` +
            `${countText(allEquips.map(x => x.e))}.` +
            (tc.total > 0 ? ` Câble total ${isTravaux ? "tiré" : "à prévoir"} : ${fmtNum(tc.total)} m.` : "") +
            " Le métrage indiqué est la longueur de câble entre la baie de brassage et chaque équipement.",
            { italics: true, size: 18, color: "555555" }));
    }

    levels.forEach((n, li) => {
        const lnum = `4.${li + 2}`;
        children.push(levelTitle(lnum, niveauLabel(n)));

        // Plans du niveau
        const plans = n.plans.filter(p => photoStore[p.key]);
        if (!plans.length) {
            children.push(P("(Aucun plan fourni pour ce niveau.)", { italics: true, color: "888888" }));
        }
        plans.forEach((p, pi) => {
            children.push(photoBanner(`Plan ${pi + 1} — ${niveauLabel(n)}`, p.key, {
                comment: p.comment, imgW: 520, imgH: 620
            }));
            const owners = planOwners(p.key);
            if (owners.length) {
                children.push(P("", { spacing: { before: 40, after: 40 } }));
                children.push(legendTable(owners));
            }
            children.push(spacer());
        });

        // Fiches équipements
        let ei = 0;
        n.equips.forEach(id => {
            const e = SITE.equips[id];
            if (!e) return;
            ei++;
            const t = typeOf(e);
            children.push(equipTitle(`${lnum}.${ei}`, e));

            const ref = e.sameAs && SITE.equips[e.sameAs];
            const rows = [["Couleur sur les plans", `● ${eqColorName(e)}`, { bold: true, color: hex(eqColor(e)) }]];
            rows.push(["Type d'équipement", t.label + (SITUATIONS[e.situation] ? ` — ${SITUATIONS[e.situation].toLowerCase()}` : "")]);
            rows.push([empLabel(e), e.emplacement.trim() ? oneLine(e.emplacement) : "Non renseigné"]);
            if (t.fov && e.zone.trim()) rows.push([zoneLabel(e), oneLine(e.zone)]);
            let pose = POSE_TYPES[e.pose] ? POSE_TYPES[e.pose].label : "";
            if (String(e.hauteur).trim()) pose = (pose ? pose + " — " : "") + `hauteur ${fmtNum(e.hauteur)} m`;
            if (pose) rows.push(["Type de pose", pose]);
            if (eqHasCable(e)) {
                rows.push(["Liaison", "Câblée (câble jusqu'à la baie)"]);
                rows.push(["Métrage de câble (baie → équipement)", String(e.metrage).trim() ? `${fmtNum(e.metrage)} m` : "Non renseigné",
                    { bold: !!String(e.metrage).trim() }]);
                const chem = cheminementText(e);
                rows.push(["Cheminement du câble", chem ? ucFirst(chem) : "Non renseigné"]);
                const perc = equipPercements(e);
                if (perc.count) {
                    rows.push(["Percements", `${perc.count}` + (perc.comments.length ? ` — ${perc.comments.join(" ; ")}` : "")]);
                }
            } else {
                rows.push(["Liaison", "Sans fil (pas de câble à tirer)"]);
            }
            const pl = findPlacement(e.id, null);
            rows.push(["Position sur les plans", pl ? pl.label : "Non positionné sur un plan", pl ? {} : { italics: true, color: "888888" }]);
            children.push(kvTable(rows, true));
            children.push(spacer());

            if (photoStore[e.empKey]) {
                children.push(photoBanner(`${e.nom} — ${empPhotoTitle(e)}`, e.empKey));
                children.push(spacer());
            }
            if (t.vue && photoStore[e.vueKey]) {
                children.push(photoBanner(`${e.nom} — ${isTravaux ? "Image obtenue (capture de la caméra)" : "Vue souhaitée depuis la caméra"}`, e.vueKey));
                children.push(spacer());
            }
            if (eqHasCable(e)) {
                const chemItems = e.chem.filter(i => photoStore[i.key]);
                if (chemItems.length) {
                    chemItems.forEach((it, i) => {
                        children.push(photoBanner(`${e.nom} — Cheminement ${i + 1}`, it.key, { comment: it.comment }));
                        children.push(spacer());
                    });
                } else if (ref) {
                    children.push(P(`Cheminement identique à ${ref.nom} : voir les photos de cet équipement.`, { italics: true, color: "555555" }));
                } else {
                    children.push(P("(Aucune photo de cheminement.)", { italics: true, color: "888888" }));
                }
                e.perc.filter(i => photoStore[i.key]).forEach((it, i) => {
                    children.push(photoBanner(`${e.nom} — Percement ${i + 1}`, it.key, { comment: it.comment }));
                    children.push(spacer());
                });
            }
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
    children.push(textBlock("Synthèse par équipement", val("synthese_equipements"), "(Aucun équipement renseigné.)"));
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
    const clientLogo = siteClientLogoBytes();
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
                        children: [new TextRun({ text: siteFooterText(), italics: true, size: 16, color: COLOR_FOOTER, font: "Calibri" })]
                    })]
                })
            },
            children
        }]
    });

    const blob = await Packer.toBlob(doc);
    const safeName = (val("raison_sociale") || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
    const prefix = isTravaux ? "Travaux" : "Audit";
    saveAs(blob, `${prefix}_CamerasAlarme_${safeName}_${val("date_audit")}.docx`);
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
//  Base dédiée « camera_alarme » (indépendante des autres formulaires).
// ============================================================
const AUTOSAVE = (() => {
    const DB_NAME = "camera_alarme";
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
            !["date_audit", "signataire_date", "modeIntervention", "client_final", "synthese_equipements"].includes(k) &&
            String(v || "").trim() !== "");
        const hasPhoto = d.photos && Object.keys(d.photos).length > 0;
        const hasEquip = d.site && Object.keys(d.site.equips || {}).length > 0;
        return !hasField && !hasPhoto && !hasEquip;
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
