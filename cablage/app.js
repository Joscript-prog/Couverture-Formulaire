// ============================================================
//  FORMULAIRE CÂBLAGE — IPKONEKT
//  Formulaire indépendant des formulaires "Couverture"
//  (4g-5g / starlink / pico-quatra), mais construit avec les
//  MÊMES composants : photoStore, éditeur d'annotation
//  (editor.js), client-config.js (donneurs d'ordre), génération
//  Word style Starlink, autosave IndexedDB, export/import JSON,
//  envoi serveur via auth-upload.js.
//
//  Cas particulier : le donneur d'ordre peut être "aucun"
//  → seul le logo et le pied de page IPKONEKT sont utilisés.
// ============================================================

const photoStore = {};

// Compteurs des galeries dynamiques (clé du photoStore = `${kind}_${idx}`)
const galleryCounters = {
    cheminement: 0,
    percement: 0,
    baie_fermee: 0,
    blocage: 0,
    solution: 0
};

// Configuration des galeries : conteneur, libellé, commentaire individuel ?
const GALLERIES = {
    cheminement: { containerId: "cheminementContainer", label: "Cheminement",  withComment: true,  commentPlaceholder: "Commentaire du cheminement (passage de câble, support, longueur estimée...)" },
    percement:   { containerId: "percementsContainer",  label: "Percement",    withComment: true,  commentPlaceholder: "Commentaire du percement (emplacement, diamètre, rebouchage...)" },
    baie_fermee: { containerId: "baieFermeeContainer",  label: "Baie fermée",  withComment: false, commentPlaceholder: "" },
    blocage:     { containerId: "blocagesContainer",    label: "Blocage",      withComment: true,  commentPlaceholder: "Commentaire du blocage (nature, impact, localisation...)" },
    solution:    { containerId: "solutionsContainer",   label: "Solution proposée", withComment: true, commentPlaceholder: "Commentaire de la solution proposée..." }
};

// Photos "fixes" (une seule photo par catégorie)
// annotable:false → pas de bouton "Annoter" (cas de la devanture)
const FIXED_PHOTOS = [
    { key: "photo_devanture",        title: "Devanture",           annotable: false },
    { key: "photo_chambre_ext",      title: "Chambre extérieure",  annotable: true  },
    { key: "photo_baie_ouverte",     title: "Baie ouverte",        annotable: true  },
    { key: "photo_adduction",        title: "Adduction",           annotable: true  },
    { key: "photo_adduction_client", title: "Adduction client",    annotable: true  },
    { key: "photo_travaux_hauteur",  title: "Travaux en hauteur",  annotable: true  },
    { key: "photo_plan_evac",        title: "Plan d'évacuation",   annotable: true  }
];

// ---------- Couleurs / constantes du style Starlink (identiques aux autres formulaires) ----------
const COLOR_TITLE        = "1F3864"; // bleu marine titres
const COLOR_SUBTITLE     = "2E75B6"; // bleu sous-titres
const COLOR_TABLE_LABEL  = "F2F2F2"; // gris clair (libellés)
const COLOR_PHOTO_BG     = "DEEBF7"; // bleu pâle (bandeau photo)
const COLOR_PHOTO_BORDER = "BDD7EE";
const COLOR_BORDER       = "BFBFBF";
const COLOR_FOOTER       = "808080";
const COLOR_WHITE        = "FFFFFF";
const COLOR_OK           = "16A34A"; // vert (conforme)
const COLOR_KO           = "C0392B"; // rouge (non conforme)

// Conformité de la baie : true si l'utilisateur a modifié manuellement le résultat
let baieConformeManuel = false;

// ---------- CLIENT FINAL — surcouche "sans donneur d'ordre" ----------
// client-config.js n'est PAS modifié : getClientFinal() retombe sur Bouygues
// pour toute valeur inconnue. On intercepte donc ici le cas "aucun".
function isSansDonneurOrdre() {
    const sel = document.getElementById("client_final");
    return !sel || !sel.value || sel.value === "aucun";
}

function cablageFooterText() {
    if (isSansDonneurOrdre()) return "Document confidentiel — Usage interne IPKONEKT";
    return clientFooterText(); // client-config.js
}

function cablageBannerText(separator) {
    if (isSansDonneurOrdre()) return "IPKONEKT";
    return clientBannerText(separator); // client-config.js
}

function cablageClientLogoBytes() {
    if (isSansDonneurOrdre()) return null; // aucun autre logo que IPKONEKT
    return clientLogoBytes(); // client-config.js
}

function cablageClientLogoSize(targetHeight) {
    return clientLogoSize(targetHeight); // client-config.js
}

// ---------- ATTENTE DES LIBRAIRIES ----------
function waitForLibs() {
    return new Promise((resolve) => {
        const check = () => {
            if (typeof window.docx !== 'undefined' && typeof window.saveAs !== 'undefined') {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", async () => {
    await waitForLibs();

    const today = new Date().toISOString().slice(0, 10);
    const dateAudit = document.getElementById("date_audit");
    const sigDate = document.getElementById("signataire_date");
    if (dateAudit && !dateAudit.value) dateAudit.value = today;
    if (sigDate && !sigDate.value) sigDate.value = today;

    document.body.addEventListener("click", handleGlobalClick);
    document.body.setAttribute("data-mode", "audit");

    // Boutons d'ajout des galeries dynamiques
    bindGalleryButton("addCheminementBtn", "cheminement");
    bindGalleryButton("addPercementBtn",  "percement");
    bindGalleryButton("addBaieFermeeBtn", "baie_fermee");
    bindGalleryButton("addBlocageBtn",    "blocage");
    bindGalleryButton("addSolutionBtn",   "solution");

    // Inputs des photos fixes
    document.querySelectorAll("input[data-photo-input]").forEach(input => {
        input.addEventListener("change", async (e) => {
            const key = input.dataset.photoInput;
            const file = e.target.files[0];
            if (!file) return;
            await processPhoto(file, key);
            const annBtn = document.querySelector(`[data-annotate="${key}"]`);
            if (annBtn) annBtn.disabled = false;
        });
    });

    // Section BLOCAGE : affichage / masquage
    const blocageCb = document.getElementById("blocageEnabled");
    if (blocageCb) {
        blocageCb.addEventListener("change", () => {
            applyBlocageVisibility(blocageCb.checked);
            if (window.__autosaveSchedule) window.__autosaveSchedule();
        });
    }

    // Conformité de la baie : recalcul auto quand U / prises changent
    ["nb_u_dispo", "nb_prises_baie"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => updateBaieConformite(false));
    });
    // Clic manuel sur les radios → on fige la valeur (mode manuel)
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

    // Restauration de la sauvegarde automatique (si présente),
    // sinon un item par défaut dans les galeries principales pour l'ergonomie.
    const restored = await AUTOSAVE.restore();
    if (!restored) {
        if (!document.querySelector("#cheminementContainer .cheminement-item")) addGalleryItem("cheminement");
        if (!document.querySelector("#percementsContainer .cheminement-item"))  addGalleryItem("percement");
        if (!document.querySelector("#baieFermeeContainer .cheminement-item"))  addGalleryItem("baie_fermee");
    }

    AUTOSAVE.attach();
    updateBaieConformite(false);
});

function bindGalleryButton(btnId, kind) {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener("click", () => {
        addGalleryItem(kind);
        if (window.__autosaveSchedule) window.__autosaveSchedule();
    });
}

// ---------- MODE AUDIT / TRAVAUX ----------
// (compteRendu.js n'est pas utilisé ici → on définit setMode localement)
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
    if (window.__autosaveSchedule) window.__autosaveSchedule();
};

// ---------- SECTION BLOCAGE ----------
function applyBlocageVisibility(enabled) {
    document.body.setAttribute("data-blocage", enabled ? "on" : "off");
    if (enabled) {
        // Ergonomie : un item vierge par galerie si elles sont vides
        if (!document.querySelector("#blocagesContainer .cheminement-item")) addGalleryItem("blocage");
        if (!document.querySelector("#solutionsContainer .cheminement-item")) addGalleryItem("solution");
    }
}

function isBlocageEnabled() {
    const cb = document.getElementById("blocageEnabled");
    return !!(cb && cb.checked);
}

// ---------- CONFORMITÉ DE LA BAIE ----------
function computeBaieConformite() {
    const u = parseInt(document.getElementById("nb_u_dispo")?.value, 10);
    const p = parseInt(document.getElementById("nb_prises_baie")?.value, 10);
    if (isNaN(u) && isNaN(p)) return null; // rien de saisi → pas de calcul
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

// ---------- GESTION GLOBALE DES CLICS (annoter / effacer / supprimer) ----------
function handleGlobalClick(e) {
    const annBtn = e.target.closest("[data-annotate]");
    if (annBtn) {
        const key = annBtn.dataset.annotate;
        if (!photoStore[key]) {
            alert("Importez d'abord une photo.");
            return;
        }
        if (typeof window.Editor !== "undefined" && window.Editor.open) {
            window.Editor.open(key, "Photo " + key);
        } else {
            alert("L'éditeur d'annotation n'est pas chargé.");
        }
        return;
    }

    const clearBtn = e.target.closest("[data-clear]");
    if (clearBtn) {
        const key = clearBtn.dataset.clear;
        delete photoStore[key];
        const preview = document.getElementById("preview_" + key);
        if (preview) {
            preview.src = "";
            preview.classList.remove("shown");
        }
        const ann = document.querySelector(`[data-annotate="${key}"]`);
        if (ann) ann.disabled = true;
        if (window.__autosaveSchedule) window.__autosaveSchedule();
        return;
    }

    const delItem = e.target.closest("[data-del-gallery]");
    if (delItem) {
        const item = delItem.closest(".cheminement-item");
        if (item && confirm("Supprimer cette photo ?")) {
            const key = item.dataset.photoKey;
            delete photoStore[key];
            item.remove();
            if (window.__autosaveSchedule) window.__autosaveSchedule();
        }
        return;
    }
}

// ---------- GALERIES DYNAMIQUES ----------
// Réutilise le composant visuel .cheminement-item existant dans le CSS partagé.
function addGalleryItem(kind, opts = {}) {
    const cfg = GALLERIES[kind];
    if (!cfg) return null;
    const container = document.getElementById(cfg.containerId);
    if (!container) return null;

    // idx explicite lors d'une restauration, sinon compteur incrémental
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
            <button class="btn-delete" data-del-gallery title="Supprimer">🗑</button>
        </div>
        <input type="file" accept="image/*">
        <img class="photo-preview" id="preview_${key}">
        <div class="chem-actions">
            <button class="annotate-btn" data-annotate="${key}" disabled>✏ Annoter</button>
            <button class="clear-btn" data-clear="${key}">🗑 Effacer</button>
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
    });

    return div;
}

// Renumérote l'affichage des items d'une galerie (après suppression / restauration)
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
//  NORMALISATION D'IMAGE (identique aux formulaires Couverture)
//  Ré-encode chaque photo via <canvas> en JPEG propre :
//  format 100 % compatible Word, rotation EXIF appliquée,
//  redimensionnement (max 2000 px) → docx léger et fiable.
// ============================================================
async function normalizeImageFile(file, opts = {}) {
    const maxEdge = opts.maxEdge || 2000;
    const quality = opts.quality || 0.9;

    if (!file) throw new Error("no-file");

    const rawDataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload  = () => resolve(i);
        i.onerror = () => reject(new Error("decode"));
        i.src = rawDataUrl;
    });

    let w = img.naturalWidth  || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("decode");
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
        const r = maxEdge / longest;
        w = Math.round(w * r);
        h = Math.round(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const cleanDataUrl = canvas.toDataURL("image/jpeg", quality);
    const bytes = dataUrlToUint8Array(cleanDataUrl);

    return { dataUrl: cleanDataUrl, bytes, type: "jpg", width: w, height: h };
}

function _imageErrorMessage(err) {
    if (err && err.message === "decode") {
        return "Format d'image non supporté par ce navigateur (par exemple HEIC produit par certains iPhones).\n\n" +
               "Solution : sur l'iPhone, allez dans Réglages → Appareil photo → Formats et cochez « Le plus compatible » (JPG).\n" +
               "Ou convertissez la photo en JPG/PNG avant de l'ajouter.";
    }
    if (err && err.message === "read") {
        return "Impossible de lire ce fichier image.";
    }
    return "Erreur lors du traitement de cette image : " + (err && err.message ? err.message : err);
}

// ---------- TRAITEMENT PHOTO (centralisé) ----------
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
        if (window.__autosaveSchedule) window.__autosaveSchedule();
    } catch (err) {
        console.error("Erreur photo :", err);
        alert(_imageErrorMessage(err));
    }
}

// Helper : dataUrl → Uint8Array
function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Re-passe un dataUrl à travers un canvas pour garantir un JPEG propre (import JSON)
async function _renormalizeDataUrl(dataUrl, maxEdge = 2000, quality = 0.9) {
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload  = () => resolve(i);
        i.onerror = () => reject(new Error("decode"));
        i.src = dataUrl;
    });
    let w = img.naturalWidth  || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("decode");
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
        const r = maxEdge / longest;
        w = Math.round(w * r);
        h = Math.round(h * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const cleanDataUrl = canvas.toDataURL("image/jpeg", quality);
    return {
        dataUrl: cleanDataUrl,
        bytes:   dataUrlToUint8Array(cleanDataUrl),
        type:    "jpg",
        width:   w,
        height:  h
    };
}

// ============================================================
//  COLLECTE / APPLICATION DES DONNÉES (export, import, autosave)
// ============================================================
function collectFormData() {
    const data = {
        version: "cablage-v1",
        exportedAt: new Date().toISOString(),
        fields: {},
        radios: {},
        checkboxes: {},
        galleries: {},          // kind -> [{idx, comment}]
        galleryCounters: { ...galleryCounters },
        blocageEnabled: isBlocageEnabled(),
        baieConformeManuel: baieConformeManuel,
        photos: {}
    };

    // Tous les inputs / textareas / selects avec un id
    document.querySelectorAll("input[id], textarea[id], select[id]").forEach(el => {
        if (el.type === "file") return;
        if (el.type === "radio") return;
        if (el.type === "checkbox") {
            data.checkboxes[el.id] = el.checked;
            return;
        }
        data.fields[el.id] = el.value;
    });

    // Radios groupés par name
    document.querySelectorAll('input[type="radio"]:checked').forEach(el => {
        if (el.name) data.radios[el.name] = el.value;
    });

    // Galeries dynamiques (ordre + commentaires)
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

    // Photos (dataUrl + annotations ré-éditables)
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

async function applyFormData(data) {
    if (!data || typeof data !== "object") return;

    // Champs simples
    if (data.fields) {
        Object.keys(data.fields).forEach(id => {
            const el = document.getElementById(id);
            if (el && el.type !== "file") el.value = data.fields[id];
        });
    }

    // Cases à cocher (équipements, blocage...)
    if (data.checkboxes) {
        Object.keys(data.checkboxes).forEach(id => {
            const el = document.getElementById(id);
            if (el && el.type === "checkbox") el.checked = !!data.checkboxes[id];
        });
    }

    // Radios
    if (data.radios) {
        Object.keys(data.radios).forEach(name => {
            const v = data.radios[name];
            const el = document.querySelector(`input[type="radio"][name="${name}"][value="${v}"]`);
            if (el) el.checked = true;
        });
    }

    // Mode AUDIT / TRAVAUX
    const mode = data.fields && data.fields.modeIntervention === "travaux" ? "travaux" : "audit";
    if (typeof window.setMode === "function") window.setMode(mode);

    // État manuel de la conformité de la baie
    baieConformeManuel = !!data.baieConformeManuel;

    // Reconstruction des galeries dynamiques
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
            if (data.galleryCounters[k] > (galleryCounters[k] || 0)) {
                galleryCounters[k] = data.galleryCounters[k];
            }
        });
    }

    // Section blocage
    applyBlocageVisibility(!!data.blocageEnabled ||
        !!(data.checkboxes && data.checkboxes.blocageEnabled));

    // Photos (restauration + re-normalisation JPEG pour un docx toujours valide)
    Object.keys(photoStore).forEach(k => delete photoStore[k]);
    if (data.photos) {
        const photoEntries = Object.entries(data.photos);
        await Promise.all(photoEntries.map(async ([k, p]) => {
            if (!p || !p.dataUrl) return;
            try {
                const n = await _renormalizeDataUrl(p.dataUrl);
                photoStore[k] = {
                    data: n.bytes,
                    type: "jpg",
                    dataUrl: n.dataUrl,
                    naturalWidth: n.width,
                    naturalHeight: n.height,
                    originalDataUrl: p.originalDataUrl || null,
                    annotations: p.annotations || null,
                    annotated: !!p.annotated
                };
            } catch (err) {
                console.warn("Photo non re-normalisable (" + k + ") :", err);
                photoStore[k] = {
                    data: dataUrlToUint8Array(p.dataUrl),
                    type: p.type || "jpg",
                    dataUrl: p.dataUrl,
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

    updateConfBadge();
}

// ---------- EXPORT / IMPORT JSON ----------
window.exportJSON = function () {
    try {
        const data = collectFormData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const safeName = (document.getElementById("raison_sociale")?.value || "Cablage").replace(/[^a-zA-Z0-9_-]/g, "_");
        const date = document.getElementById("date_audit")?.value || new Date().toISOString().slice(0, 10);
        if (typeof saveAs !== "undefined") {
            saveAs(blob, `Cablage_${safeName}_${date}.json`);
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Cablage_${safeName}_${date}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
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
            await applyFormData(data);
            alert("✅ Données importées avec succès.");
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
//  GÉNÉRATION DU RAPPORT WORD (style Starlink, moteur docx.umd.js)
//  Réutilise : logos.js (LOGO_IPKONEKT_B64), client-config.js
//  (logos / pied de page des donneurs d'ordre), photoStore.
// ============================================================
async function generateDocument() {
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

    // ---------- helpers de style (identiques aux formulaires Couverture) ----------
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

    const P = (txt, opts = {}) => new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: opts.spacing || { before: 60, after: 60 },
        children: [new TextRun({
            text: txt || "",
            bold: opts.bold || false,
            italics: opts.italics || false,
            size: opts.size || 20,
            color: opts.color || "000000",
            font: "Calibri"
        })]
    });

    const sectionTitle = (num, txt) => new Paragraph({
        spacing: { before: 360, after: 120 },
        keepNext: true,
        keepLines: true,
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR_TITLE, space: 4 }
        },
        children: [
            new TextRun({ text: `${num}.   `, bold: true, size: 28, color: COLOR_TITLE, font: "Calibri" }),
            new TextRun({ text: txt, bold: true, size: 28, color: COLOR_TITLE, font: "Calibri" })
        ]
    });

    const subTitle = (num, txt) => new Paragraph({
        spacing: { before: 240, after: 80 },
        keepNext: true,
        keepLines: true,
        children: [
            new TextRun({ text: `${num} - ${txt}`, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" })
        ]
    });

    const labelCell = (txt, width) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: COLOR_TABLE_LABEL, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: stdBorders,
        children: [new Paragraph({
            children: [new TextRun({ text: txt, bold: true, size: 20, font: "Calibri" })]
        })]
    });

    const valueCell = (txt, width, opts = {}) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: stdBorders,
        children: [new Paragraph({
            children: [new TextRun({
                text: txt || "",
                size: 20,
                font: "Calibri",
                color: opts.color || "000000",
                bold: opts.bold || false
            })]
        })]
    });

    const kvTable = (rows) => new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: rows.map(r => new TableRow({
            children: [labelCell(r[0], 3120), valueCell(r[1], 6240, r[2] || {})]
        }))
    });

    // Dimensions d'affichage d'une photo dans le Word (ratio conservé)
    const photoDims = (photo, maxW = 400, maxH = 300) => {
        const w = photo.naturalWidth || 4;
        const h = photo.naturalHeight || 3;
        const r = Math.min(maxW / w, maxH / h);
        return { width: Math.max(1, Math.round(w * r)), height: Math.max(1, Math.round(h * r)) };
    };

    // Bandeau photo (titre bleu pâle + image centrée + commentaire optionnel)
    const photoBanner = (title, photoKey, opts = {}) => {
        const w = opts.width || 8400;
        const photo = photoStore[photoKey];
        const titleCell = new TableCell({
            width: { size: w, type: WidthType.DXA },
            shading: { fill: COLOR_PHOTO_BG, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 100, bottom: 100, left: 200, right: 200 },
            borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                left: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER }
            },
            children: [new Paragraph({
                children: [new TextRun({ text: `📷 ${title}`, bold: true, size: 22, color: COLOR_TITLE, font: "Calibri" })]
            })]
        });
        const dims = photo ? photoDims(photo, opts.imgW || 400, opts.imgH || 300) : null;
        const photoCell = new TableCell({
            width: { size: w, type: WidthType.DXA },
            margins: { top: 200, bottom: 200, left: 200, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                left: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER }
            },
            children: photo ? [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new ImageRun({
                        data: photo.data,
                        transformation: dims,
                        type: photo.type
                    })]
                })
            ] : [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 600, after: 600 },
                    children: [new TextRun({ text: "(Photo non fournie)", italics: true, size: 18, color: "999999", font: "Calibri" })]
                })
            ]
        });
        const rows = [
            new TableRow({ children: [titleCell] }),
            new TableRow({ children: [photoCell] })
        ];
        // Commentaire individuel de la photo (galeries)
        if (opts.comment && opts.comment.trim()) {
            rows.push(new TableRow({
                children: [new TableCell({
                    width: { size: w, type: WidthType.DXA },
                    margins: { top: 100, bottom: 100, left: 200, right: 200 },
                    borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                        left: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                        right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER }
                    },
                    children: [new Paragraph({
                        children: [
                            new TextRun({ text: "Commentaire : ", bold: true, size: 20, font: "Calibri" }),
                            new TextRun({ text: opts.comment.trim(), size: 20, font: "Calibri", italics: true })
                        ]
                    })]
                })]
            }));
        }
        return new Table({
            width: { size: w, type: WidthType.DXA },
            columnWidths: [w],
            rows
        });
    };

    // Récupère les items d'une galerie (dans l'ordre d'affichage)
    const galleryItems = (kind) => {
        const cfg = GALLERIES[kind];
        const container = document.getElementById(cfg.containerId);
        if (!container) return [];
        const out = [];
        container.querySelectorAll(".cheminement-item").forEach(item => {
            const key = item.dataset.photoKey;
            if (photoStore[key]) {
                out.push({
                    key,
                    comment: item.querySelector(".cheminement-comment")?.value || ""
                });
            }
        });
        return out;
    };

    // Pousse une galerie complète dans le document
    const pushGallery = (children, kind, emptyLabel) => {
        const cfg = GALLERIES[kind];
        const items = galleryItems(kind);
        if (items.length === 0) {
            children.push(P(emptyLabel || `(Aucune photo « ${cfg.label} » fournie.)`,
                { italics: true, color: "888888" }));
            return;
        }
        items.forEach((it, i) => {
            children.push(photoBanner(`${cfg.label} ${i + 1}`, it.key, { comment: it.comment }));
            children.push(P("", { spacing: { before: 80, after: 80 } }));
        });
    };

    // ---------- CONSTRUCTION DU DOCUMENT ----------
    const children = [];
    const isTravaux = (document.getElementById("modeIntervention")?.value) === "travaux";

    // === BANDEAU TITRE PRINCIPAL ===
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
                            text: isTravaux ? "RAPPORT DE TRAVAUX - CÂBLAGE" : "RAPPORT D'AUDIT - CÂBLAGE",
                            bold: true, size: 32, color: COLOR_WHITE, font: "Calibri"
                        })]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 60, after: 240 },
                        children: [new TextRun({
                            text: cablageBannerText("│"),
                            size: 22, color: COLOR_WHITE, font: "Calibri"
                        })]
                    })
                ]
            })]
        })]
    }));
    children.push(P("", { spacing: { before: 120, after: 60 } }));

    // === SECTION 1 - INFORMATIONS GÉNÉRALES ===
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

    // === SECTION 2 - BAIE INFORMATIQUE ===
    children.push(sectionTitle(2, "Baie informatique"));
    children.push(kvTable([
        ["Type de baie", val("type_baie")],
        ["Nombre de U disponibles", val("nb_u_dispo")],
        ["Taille (L x P x H)", val("taille_baie")],
        ["Marque de la baie", val("marque_baie")],
        ["Nombre de prises disponibles", val("nb_prises_baie")]
    ]));

    // Équipements cochés
    children.push(subTitle("2.1", "Équipements présents dans la baie"));
    const EQUIP_LIST = [
        ["eq_bandeau", "Bandeau de brassage"],
        ["eq_pdu", "PDU / Multiprise"],
        ["eq_livebox", "Livebox"],
        ["eq_tiroir_optique", "Tiroir optique"],
        ["eq_routeur", "Routeur"],
        ["eq_switch", "Switch"],
        ["eq_firewall", "Firewall"],
        ["eq_ampli", "Amplificateur"],
        ["eq_nvr", "NVR / Enregistreur"],
        ["eq_barix", "Barix"],
        ["eq_blackbox", "BlackBox"],
        ["eq_tourpc", "Tour PC"],
        ["eq_wifi", "Borne Wi-Fi"],
        ["eq_onduleur", "Onduleur"],
        ["eq_autres", "Autres équipements"]
    ];
    const equipRows = EQUIP_LIST.map(([id, label]) => {
        const checked = !!document.getElementById(id)?.checked;
        return new TableRow({
            cantSplit: true,
            children: [
                valueCell(label, 6240),
                valueCell(checked ? "☑ Présent" : "☐ Absent", 3120, {
                    bold: checked,
                    color: checked ? COLOR_OK : "888888"
                })
            ]
        });
    });
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [6240, 3120],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("Équipement", 6240), labelCell("Présence", 3120)] }),
            ...equipRows
        ]
    }));
    if (val("autres_equipements").trim()) {
        children.push(P("", { spacing: { before: 80, after: 40 } }));
        children.push(kvTable([["Autres équipements (détail)", val("autres_equipements")]]));
    }

    // Conformité de la baie
    children.push(subTitle("2.2", "Contrôle de conformité"));
    const conf = getBaieConformeValue();
    children.push(kvTable([
        ["Baie conforme", conf || "Non renseigné", {
            bold: true,
            color: conf === "Oui" ? COLOR_OK : (conf === "Non" ? COLOR_KO : "888888")
        }],
        ["Règle appliquée", "Conforme si au moins 2 U disponibles et au moins 2 prises électriques disponibles" +
            (baieConformeManuel ? " (résultat ajusté manuellement par le technicien)" : " (calcul automatique)")]
    ]));
    if (val("commentaire_baie").trim()) {
        children.push(P("", { spacing: { before: 80, after: 40 } }));
        children.push(new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [
                new TableRow({ cantSplit: true, children: [labelCell("Commentaire de la baie", 9360)] }),
                new TableRow({ children: [valueCell(val("commentaire_baie"), 9360)] })
            ]
        }));
    }

    // === SECTION 3 - PHOTOS ===
    children.push(sectionTitle(3, "Photos"));

    // Photos fixes
    let sub = 0;
    FIXED_PHOTOS.slice(0, 5).forEach(fp => {           // Devanture → Adduction client
        sub++;
        children.push(subTitle(`3.${sub}`, fp.title));
        children.push(photoBanner(fp.title, fp.key));
        children.push(P("", { spacing: { before: 80, after: 80 } }));
    });

    // Galerie Cheminement
    sub++;
    children.push(subTitle(`3.${sub}`, "Cheminement"));
    pushGallery(children, "cheminement");

    // Galerie Percements
    sub++;
    children.push(subTitle(`3.${sub}`, "Percements"));
    pushGallery(children, "percement");

    // Travaux en hauteur + Plan d'évacuation
    FIXED_PHOTOS.slice(5).forEach(fp => {
        sub++;
        children.push(subTitle(`3.${sub}`, fp.title));
        children.push(photoBanner(fp.title, fp.key));
        children.push(P("", { spacing: { before: 80, after: 80 } }));
    });

    // Galerie Baie fermée
    sub++;
    children.push(subTitle(`3.${sub}`, "Baie fermée"));
    pushGallery(children, "baie_fermee");

    // === SECTION 4 - BLOCAGE (uniquement si la section est affichée) ===
    let nextSection = 4;
    if (isBlocageEnabled()) {
        children.push(sectionTitle(4, "Blocage"));
        children.push(subTitle("4.1", "Photos des blocages"));
        pushGallery(children, "blocage");
        children.push(subTitle("4.2", "Photos de la solution proposée"));
        pushGallery(children, "solution");
        nextSection = 5;
    }

    // === COMPTE RENDU GLOBAL ===
    children.push(sectionTitle(nextSection, "Compte rendu global"));
    const crText = val("compte_rendu_global");
    const crParas = crText.trim()
        ? crText.split("\n").map(line => new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: line, size: 20, font: "Calibri" })]
        }))
        : [new Paragraph({
            children: [new TextRun({ text: "(Aucun compte rendu renseigné.)", italics: true, size: 20, color: "888888", font: "Calibri" })]
        })];
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("Compte rendu global de l'intervention", 9360)] }),
            new TableRow({
                children: [new TableCell({
                    width: { size: 9360, type: WidthType.DXA },
                    margins: { top: 160, bottom: 160, left: 200, right: 200 },
                    borders: stdBorders,
                    children: crParas
                })]
            })
        ]
    }));

    // === SIGNATURE ===
    children.push(P("", { spacing: { before: 240, after: 60 } }));
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("Signature technicien / intervenant", 9360)] }),
            new TableRow({ cantSplit: true, children: [valueCell(
                `Nom : ${val("signataire_nom") || "_______________________________"}      Date : ${val("signataire_date")}`,
                9360
            )] })
        ]
    }));

    // ---------- DOCUMENT FINAL (en-tête / pied de page adaptés au donneur d'ordre) ----------
    const clientLogo = cablageClientLogoBytes();
    const doc = new Document({
        styles: {
            default: { document: { run: { font: "Calibri", size: 20 } } }
        },
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
                                        children: [new ImageRun({
                                            data: b64(LOGO_IPKONEKT_B64),
                                            transformation: { width: 60, height: 54 }
                                        })]
                                    })]
                                }),
                                new TableCell({
                                    width: { size: 3120, type: WidthType.DXA },
                                    verticalAlign: VerticalAlign.CENTER,
                                    borders: noBorders,
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: []
                                    })]
                                }),
                                new TableCell({
                                    width: { size: 3120, type: WidthType.DXA },
                                    verticalAlign: VerticalAlign.CENTER,
                                    borders: noBorders,
                                    children: [new Paragraph({
                                        alignment: AlignmentType.RIGHT,
                                        children: (clientLogo ? [new ImageRun({
                                            data: clientLogo,
                                            transformation: cablageClientLogoSize(60)
                                        })] : [])
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
                        children: [new TextRun({
                            text: cablageFooterText(),
                            italics: true, size: 16, color: COLOR_FOOTER, font: "Calibri"
                        })]
                    })]
                })
            },
            children: children
        }]
    });

    // ⚠️ Comme dans les autres formulaires : ATTENDRE le blob, sinon
    // captureSaveAs() (auth-upload) se termine avant l'appel à saveAs().
    const blob = await Packer.toBlob(doc);
    const safeName = (val("raison_sociale") || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
    const prefix = isTravaux ? "Travaux" : "Audit";
    saveAs(blob, `${prefix}_Cablage_${safeName}_${val("date_audit")}.docx`);
}

// ---------- EXPOSITION GLOBALE ----------
window.closeEditor = () => window.Editor?.close();
window.saveAnnotation = () => window.Editor?.save();
window.generateDocument = generateDocument;
window.resetForm = async () => {
    if (!confirm("Réinitialiser tout le formulaire ?\nLa sauvegarde automatique de cette session sera également effacée.")) return;
    try { await AUTOSAVE.clear(); } catch (_) {}
    location.reload();
};

// ============================================================
//  SAUVEGARDE AUTOMATIQUE DANS LE NAVIGATEUR (IndexedDB)
//  Identique au mécanisme des formulaires Couverture, avec une
//  base dédiée "cablage" (indépendante des autres formulaires).
// ============================================================
const AUTOSAVE = (() => {
    const DB_NAME = "cablage";
    const STORE   = "autosave";
    const KEY     = "current";
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
            req.onerror   = () => reject(req.error || new Error("idb-open"));
        });
        return _dbPromise;
    }

    async function _put(value) {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(value, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error || new Error("idb-put"));
        });
    }

    async function _get() {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const r = tx.objectStore(STORE).get(KEY);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror   = () => reject(r.error || new Error("idb-get"));
        });
    }

    async function _clear() {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error || new Error("idb-clear"));
        });
    }

    // Garde-fou : ne jamais remplacer une sauvegarde pleine par un formulaire vide
    function _isEmptyData(d) {
        if (!d) return true;
        const hasField = d.fields && Object.values(d.fields).some(v => String(v || "").trim() !== "");
        const hasPhoto = d.photos && Object.keys(d.photos).length > 0;
        const hasEquip = d.checkboxes && Object.values(d.checkboxes).some(Boolean);
        return !hasField && !hasPhoto && !hasEquip;
    }

    async function _saveNow() {
        if (_suspended) return;
        try {
            const data = collectFormData();
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
        if (!data) return false;
        _suspended = true;
        try {
            await applyFormData(data);
        } catch (err) {
            console.error("Restauration autosave échouée :", err);
        } finally {
            // Délai pour laisser les photos se ré-appliquer (mobile) avant de réactiver
            setTimeout(() => { _suspended = false; }, 1500);
        }
        return true;
    }

    function attach() {
        ["input", "change"].forEach(evt => {
            document.body.addEventListener(evt, schedule, true);
        });
        window.addEventListener("beforeunload", () => { _saveNow(); });
        window.addEventListener("pagehide", () => { _saveNow(); });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") _saveNow();
        });
        // Sauvegarde périodique de sécurité (annotations, mutations programmatiques...)
        setInterval(_saveNow, 30000);
    }

    async function clear() {
        clearTimeout(_timer);
        try { await _clear(); } catch (_) {}
    }

    return { attach, restore, schedule, clear, saveNow: _saveNow };
})();

window.__autosaveSchedule = () => AUTOSAVE.schedule();
