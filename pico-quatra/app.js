/* ============================================================
 *  PICO / CEL-FI QUATRA — Application principale
 *  IPKONEKT / Bouygues Telecom
 * ============================================================ */

// ---- Stockage photos en mémoire (clé → { dataUrl, annotated, ... }) ----
const photoStore = {};

// ---- Compteurs pour clés dynamiques ----
let measureCounter = 0;
let picoPoseCounter = 0;
let picoPhotoCounter = 0;
let quatraPhotoCounter = 0;
// ---- Plans d'évacuation (multi-plans : un par étage / niveau) ----
// evacPlans = [ { id, title, points: [{id, label, xPct, yPct, measureId, size}] } ]
// La photo de chaque plan est stockée dans photoStore["plan_evac_<id>"].
let evacPlans = [];
let evacPlanCounter = 0;
let evacPointCounter = 0;

// =============================================================
//  MODE AUDIT / TRAVAUX
// =============================================================
function getMode() {
    const el = document.getElementById("modeIntervention");
    return (el && el.value === "travaux") ? "travaux" : "audit";
}

function updateFieldsForMode(mode) {
    const isTravaux = (mode === 'travaux');
    
    // Section 2 : champs techniques
    const fieldsToHide = ['nb_prises_elec', 'vlan_port'];
    const radioGroups = ['rj45_optimal', 'devis_desserte', 'vlan_besoin'];
    
    fieldsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.closest('.field-row').style.display = isTravaux ? 'none' : '';
    });
    radioGroups.forEach(name => {
        const container = document.querySelector(`input[name="${name}"]`)?.closest('.field-row');
        if (container) container.style.display = isTravaux ? 'none' : '';
    });
    
    // Section 3 : titre
    const measuresTitle = document.getElementById("measuresTitle");
    if (measuresTitle) {
        measuresTitle.innerText = isTravaux ? '3. Mesures radio (après intervention)' : '3. Mesures radio (avant intervention)';
    }
    
    // Section 8 : libellés
    const dureeLabel = document.getElementById("dureeLabel");
    if (dureeLabel) dureeLabel.innerText = isTravaux ? 'Durée des travaux réalisés' : 'Temps de travaux estimé';
    
    const nacelleLabel = document.getElementById("nacelleLabel");
    if (nacelleLabel) nacelleLabel.innerText = isTravaux ? 'Nacelle utilisée ?' : 'Nacelle à prévoir ?';
    
    // Section 9 : titre et champ accès
    const section9Title = document.getElementById("section9Title");
    if (section9Title) section9Title.innerText = isTravaux ? 'Synthèse d\'intervention' : '9. Accès site & prérequis';
    
    const accesFieldRow = document.getElementById("accesFieldRow");
    if (accesFieldRow) accesFieldRow.style.display = isTravaux ? 'none' : '';

    // Sections 5.2 / 6.2 : titres adaptés au mode (audit = à installer, travaux = posés)
    const picoPosesTitle = document.getElementById("picoPosesTitle");
    if (picoPosesTitle) picoPosesTitle.innerText = isTravaux ? '5.2 — PICO posés' : '5.2 — Pico à installer';

    const quatraEquipTitle = document.getElementById("quatraEquipTitle");
    if (quatraEquipTitle) quatraEquipTitle.innerText = isTravaux ? '6.2 — Équipements posés' : '6.2 — Equipements à installer';
}

function setMode(mode) {
    const hidden = document.getElementById("modeIntervention");
    if (hidden) hidden.value = (mode === "travaux") ? "travaux" : "audit";
    const ba = document.getElementById("modeAuditBtn");
    const bt = document.getElementById("modeTravauxBtn");
    if (ba && bt) {
        ba.classList.toggle("active", mode === "audit");
        bt.classList.toggle("active", mode === "travaux");
    }
    updateFieldsForMode(mode);
}
window.setMode = setMode;
window.getMode = getMode;

// =============================================================
//  STATUS BAR
// =============================================================
function showStatus(msg, type) {
    const s = document.getElementById("status");
    s.textContent = msg;
    s.className = type || "info";
    setTimeout(() => { s.className = ""; s.textContent = ""; }, 5000);
}

// =============================================================
//  INITIALISATION AU CHARGEMENT
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    renderQualiteGrid();
    renderForfaits("Pico");
    renderForfaits("Quatra");
    renderFournitures();
    addMeasureRow(); // une ligne par défaut
    addPicoPose();
    setupPicoPhotoBlocks();
    setupQuatraPhotoBlocks();
    setupEvacPlans();
    updateSectionState();

    // Date d'aujourd'hui par défaut
    const today = new Date().toISOString().slice(0, 10);
    const dateAudit = document.getElementById("date_audit");
    if (dateAudit && !dateAudit.value) dateAudit.value = today;

    document.body.addEventListener("click", handleGlobalClick);
    console.log("✅ PICO / Quatra — formulaire chargé");
    
    // Appliquer l'état des champs selon le mode initial
    updateFieldsForMode(getMode());
});

// =============================================================
//  GRILLE DE QUALITÉ RADIO
// =============================================================
function renderQualiteGrid() {
    const grid = document.getElementById("qualiteGrid");
    if (!grid || !window.QUALITE_RSRP) return;
    grid.innerHTML = "";
    window.QUALITE_RSRP.forEach(q => {
        const div = document.createElement("div");
        div.className = "qualite-item";
        div.style.background = q.color;
        div.innerHTML = `<span class="label">${q.label}</span><span class="seuil">${q.seuil}</span>`;
        grid.appendChild(div);
    });
}

// =============================================================
//  SECTIONS DÉPLIANTES
// =============================================================
function toggleSection(name) {
    const section = document.getElementById("section" + name);
    if (!section) return;
    section.classList.toggle("collapsed");
}
window.toggleSection = toggleSection;

function updateSectionState() {
    const picoActive = document.getElementById("activePico").checked;
    const quatraActive = document.getElementById("activeQuatra").checked;
    const secPico = document.getElementById("sectionPico");
    const secQuatra = document.getElementById("sectionQuatra");
    secPico.classList.toggle("active-pico", picoActive);
    secQuatra.classList.toggle("active-quatra", quatraActive);
    document.getElementById("picoBadge").textContent = picoActive ? "✓ Activée" : "Non activée";
    document.getElementById("quatraBadge").textContent = quatraActive ? "✓ Activée" : "Non activée";
}
window.updateSectionState = updateSectionState;

// =============================================================
//  FORFAITS (PICO ou QUATRA)
// =============================================================
function renderForfaits(type) {
    const container = document.getElementById((type === "Pico" ? "pico" : "quatra") + "ForfaitList");
    const data = (type === "Pico") ? window.PICO_FORFAITS : window.QUATRA_FORFAITS;
    if (!container || !data) return;
    container.innerHTML = "";
    const groupName = "forfait_" + type.toLowerCase();
    data.forEach(f => {
        const lbl = document.createElement("label");
        lbl.className = "forfait-card";
        lbl.dataset.ref = f.ref;
        lbl.innerHTML = `
            <input type="radio" name="${groupName}" value="${f.ref}">
            <div class="ref">${f.ref}</div>
            <div class="name">${f.label}</div>
            <div class="desc">${f.description}</div>
            <div class="crit">${f.critere}</div>
        `;
        const radio = lbl.querySelector("input[type='radio']");
        radio.addEventListener("change", () => {
            container.querySelectorAll(".forfait-card").forEach(c => c.classList.remove("selected"));
            if (radio.checked) lbl.classList.add("selected");
        });
        container.appendChild(lbl);
    });
}

// =============================================================
//  ANALYSE AUTOMATIQUE QUALITÉ (RSRP + SNR)
// =============================================================
const QUALITY_MATRIX = {
    excellent: {
        ">15":  { label: "Optimal",      color: "#16a34a" },
        "5-15": { label: "Très bon",     color: "#16a34a" },
        "0-5":  { label: "Correct",      color: "#f59e0b" },
        "<0":   { label: "Dégradé",      color: "#6b7280" }
    },
    bon: {
        ">15":  { label: "Très bon",     color: "#16a34a" },
        "5-15": { label: "Bon",          color: "#16a34a" },
        "0-5":  { label: "Acceptable",   color: "#f59e0b" },
        "<0":   { label: "Problématique",color: "#6b7280" }
    },
    faible: {
        ">15":  { label: "Bon",          color: "#16a34a" },
        "5-15": { label: "Acceptable",   color: "#f59e0b" },
        "0-5":  { label: "Limite",       color: "#6b7280" },
        "<0":   { label: "Très dégradé", color: "#dc2626" }
    },
    critique: {
        ">15":  { label: "Utilisable",   color: "#6b7280" },
        "5-15": { label: "Limite",       color: "#6b7280" },
        "0-5":  { label: "Critique",     color: "#dc2626" },
        "<0":   { label: "Inutilisable", color: "#dc2626" }
    }
};
function classifyRSRP(rsrp) {
    if (isNaN(rsrp)) return null;
    if (rsrp >= -85)  return "excellent";
    if (rsrp >= -100) return "bon";
    if (rsrp >= -115) return "faible";
    return "critique";
}
function classifySNR(snr) {
    if (isNaN(snr)) return null;
    if (snr > 15) return ">15";
    if (snr >= 5) return "5-15";
    if (snr >= 0) return "0-5";
    return "<0";
}
function evaluateQuality(rsrp, snr) {
    const r = classifyRSRP(rsrp);
    const s = classifySNR(snr);
    if (!r || !s) return null;
    return QUALITY_MATRIX[r][s];
}
function analyzeMeasureRow(id) {
    const rsrp = parseFloat(document.getElementById(id + "_rsrp").value);
    const snr  = parseFloat(document.getElementById(id + "_snr").value);
    const cell = document.getElementById(id + "_analyse");
    if (!cell) return;
    const q = evaluateQuality(rsrp, snr);
    if (!q) {
        cell.textContent = "—";
        cell.style.background = "#e5e7eb";
        cell.style.color = "#374151";
    } else {
        cell.textContent = q.label;
        cell.style.background = q.color;
        cell.style.color = "#ffffff";
    }
    if (typeof refreshEvacPointColors === "function") refreshEvacPointColors();
    if (typeof refreshEvacMeasureSelect === "function") refreshEvacMeasureSelect();
}

// =============================================================
//  MESURES RADIO
// =============================================================
function addMeasureRow() {
    measureCounter++;
    const id = "m_" + measureCounter;
    const tr = document.createElement("tr");
    tr.dataset.measureId = id;
    tr.innerHTML = `
        <td><input type="text" id="${id}_zone" placeholder="Foyer, Bureau..."></td>
        <td><input type="text" id="${id}_rsrp" inputmode="text" placeholder="-110"></td>
        <td><input type="text" id="${id}_snr" inputmode="text" placeholder="8"></td>
        <td><input type="text" id="${id}_rsrq" placeholder="-8"></td>
        <td><input type="text" id="${id}_band" placeholder="20"></td>
        <td><input type="text" id="${id}_5g" placeholder="-112/-10/28"></td>
        <td><input type="text" id="${id}_dn" inputmode="decimal" placeholder="37"></td>
        <td><input type="text" id="${id}_up" inputmode="decimal" placeholder="0.4"></td>
        <td id="${id}_analyse" style="padding:8px 10px; text-align:center; font-weight:600; font-size:0.85rem; border-radius:4px; background:#e5e7eb; color:#374151;">—</td>
        <td><button type="button" class="row-del" onclick="removeMeasureRow('${id}')">✕</button></td>
    `;
    document.getElementById("measuresBody").appendChild(tr);
    document.getElementById(id + "_rsrp").addEventListener("input", () => analyzeMeasureRow(id));
    document.getElementById(id + "_snr").addEventListener("input", () => analyzeMeasureRow(id));
    document.getElementById(id + "_zone").addEventListener("input", () => {
        if (typeof refreshEvacMeasureSelect === "function") refreshEvacMeasureSelect();
    });
}
window.addMeasureRow = addMeasureRow;
function removeMeasureRow(id) {
    const tr = document.querySelector(`tr[data-measure-id="${id}"]`);
    if (tr) tr.remove();
    // Délier cette mesure de tous les points qui y faisaient référence (tous plans)
    evacPlans.forEach(plan => {
        plan.points.forEach(p => {
            if (p.measureId === id) p.measureId = null;
        });
    });
    refreshEvacPointColors();
    refreshAllEvacMeasureSelects();
}
window.removeMeasureRow = removeMeasureRow;

// =============================================================
//  PICO POSÉS
// =============================================================
function addPicoPose() {
    picoPoseCounter++;
    const id = "pp_" + picoPoseCounter;
    const div = document.createElement("div");
    div.className = "pico-item";
    div.dataset.picoId = id;
    div.innerHTML = `
        <div class="num">PICO ${picoPoseCounter}</div>
        <input type="text" id="${id}_zone" placeholder="Zone / pièce (ex : Foyer, Studio 1...)">
        <input type="text" id="${id}_note" placeholder="Note (ex : fixation au plafond, antenne intégrée...)">
        <button type="button" class="row-del" onclick="removePicoPose('${id}')">✕ Supprimer</button>
    `;
    document.getElementById("picoPosesList").appendChild(div);
}
window.addPicoPose = addPicoPose;
function removePicoPose(id) {
    const div = document.querySelector(`[data-pico-id="${id}"]`);
    if (div) div.remove();
}
window.removePicoPose = removePicoPose;

// =============================================================
//  PHOTOS PICO & QUATRA (blocs dynamiques)
// =============================================================
const PICO_PHOTO_PRESETS = [
    "Vue de la baie informatique",
    "Emplacement PICO 1",
    "Emplacement PICO 2",
    "Cheminement câbles",
    "Point de pénétration / percement"
];
function setupPicoPhotoBlocks() {
    PICO_PHOTO_PRESETS.forEach(label => addPicoPhotoBlock(label));
}
function addPicoPhotoBlock(presetLabel) {
    picoPhotoCounter++;
    const key = "pico_photo_" + picoPhotoCounter;
    const block = createPhotoBlock(key, presetLabel || ("Photo PICO " + picoPhotoCounter), true);
    document.getElementById("picoPhotoGrid").appendChild(block);
}
window.addPicoPhotoBlock = addPicoPhotoBlock;

const QUATRA_PHOTO_PRESETS = [
    "NU (unité réseau)",
    "CU (unité de couverture)",
    "Cheminement câble RJ45",
    "Baie informatique"
];
function setupQuatraPhotoBlocks() {
    QUATRA_PHOTO_PRESETS.forEach(label => addQuatraPhotoBlock(label));
}
function addQuatraPhotoBlock(presetLabel) {
    quatraPhotoCounter++;
    const key = "quatra_photo_" + quatraPhotoCounter;
    const block = createPhotoBlock(key, presetLabel || ("Photo Quatra " + quatraPhotoCounter), true);
    document.getElementById("quatraPhotoGrid").appendChild(block);
}
window.addQuatraPhotoBlock = addQuatraPhotoBlock;

function createPhotoBlock(key, defaultLabel, removable) {
    const block = document.createElement("div");
    block.className = "photo-block";
    block.dataset.photoKey = key;
    block.innerHTML = `
        <input type="text" class="photo-label-input" data-photo-label-for="${key}"
               value="${escapeHtml(defaultLabel)}"
               placeholder="Libellé de la photo"
               style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #cfdce9; border-radius:4px; font-size:0.88rem;">
        <input type="file" accept="image/*" data-photo-input="${key}">
        <img class="photo-preview" id="preview_${key}" alt="">
        <div class="photo-actions">
            <button type="button" class="annotate-btn" data-annotate="${key}" disabled>✏ Annoter</button>
            <button type="button" class="clear-photo" data-clear="${key}">✕ Effacer</button>
            ${removable ? `<button type="button" class="clear-photo" data-remove-block="${key}" style="background:#6c757d;">🗑 Supprimer le bloc</button>` : ""}
        </div>
    `;
    const fileInput = block.querySelector('input[type="file"]');
    fileInput.addEventListener("change", (e) => handlePhotoUpload(key, e.target.files[0]));
    return block;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

async function handlePhotoUpload(key, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
        showStatus("Veuillez choisir une image.", "error");
        return;
    }
    try {
        const dataUrl = await fileToDataUrl(file);
        photoStore[key] = {
            dataUrl: dataUrl,
            originalDataUrl: dataUrl,
            annotated: false,
            type: file.type.includes("png") ? "png" : "jpg",
            name: file.name
        };
        const preview = document.getElementById("preview_" + key);
        if (preview) {
            preview.src = dataUrl;
            preview.classList.add("shown");
        }
        const annBtn = document.querySelector(`[data-annotate="${key}"]`);
        if (annBtn) annBtn.disabled = false;
    } catch (err) {
        console.error(err);
        showStatus("Erreur de lecture de l'image", "error");
    }
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

// =============================================================
//  CLIC GLOBAL (Annoter / Effacer / Supprimer bloc)
// =============================================================
function handleGlobalClick(e) {
    const annBtn = e.target.closest("[data-annotate]");
    if (annBtn) {
        const key = annBtn.dataset.annotate;
        if (!photoStore[key]) {
            showStatus("Importez d'abord une photo.", "error");
            return;
        }
        if (typeof window.Editor !== 'undefined' && window.Editor.open) {
            const labelInput = document.querySelector(`[data-photo-label-for="${key}"]`);
            const label = labelInput ? labelInput.value : "Photo";
            window.Editor.open(key, label);
        } else {
            showStatus("L'éditeur n'est pas chargé.", "error");
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
        const fileInput = document.querySelector(`[data-photo-input="${key}"]`);
        if (fileInput) fileInput.value = "";
        return;
    }
    const removeBlockBtn = e.target.closest("[data-remove-block]");
    if (removeBlockBtn) {
        const key = removeBlockBtn.dataset.removeBlock;
        delete photoStore[key];
        const block = removeBlockBtn.closest(".photo-block");
        if (block) block.remove();
        return;
    }
}

// =============================================================
//  PLAN(S) D'ÉVACUATION (MULTI-PLANS — un par étage / niveau)
// =============================================================
// Modèle :
//   evacPlans = [
//     { id: 0, title: "Rez-de-chaussée", points: [{id, label, xPct, yPct, measureId, size}] },
//     { id: 1, title: "1er étage",       points: [...] }
//   ]
// Photo de chaque plan : photoStore["plan_evac_<id>"].
// Une mesure (measureId) ne peut être liée qu'à UN seul point, tous plans confondus.

// --- Helpers ---
function getEvacPlanById(planId) {
    return evacPlans.find(p => p.id === Number(planId));
}
function getEvacPlanCardEl(planId) {
    return document.querySelector(`.evac-plan-card[data-plan-id="${planId}"]`);
}
function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/(["\\\]\[\(\)\.\#\:])/g, "\\$1");
}
// Tous les measureId déjà liés à un point (tous plans confondus)
function getAllLinkedMeasureIds() {
    const set = new Set();
    evacPlans.forEach(plan => plan.points.forEach(p => {
        if (p.measureId) set.add(p.measureId);
    }));
    return set;
}
function findPointPlanByMeasureId(measureId) {
    for (const plan of evacPlans) {
        const pt = plan.points.find(p => p.measureId === measureId);
        if (pt) return { plan, point: pt };
    }
    return null;
}

// --- Initialisation ---
function setupEvacPlans() {
    const addBtn = document.getElementById("addEvacPlanBtn");
    if (addBtn) addBtn.addEventListener("click", () => addEvacPlan());

    // Au démarrage : créer une première carte vide (rend la zone d'upload visible)
    if (evacPlans.length === 0) {
        addEvacPlan();
    }
}

// Ajoute un nouveau plan d'évacuation (vide)
function addEvacPlan(initialState) {
    const planId = evacPlanCounter++;
    const fallbackTitle = (evacPlans.length === 0)
        ? "Plan d'implantation principal"
        : `Plan – Étage ${evacPlans.length + 1}`;
    const plan = {
        id: planId,
        title: (initialState && typeof initialState.title === 'string' && initialState.title.trim())
            ? initialState.title
            : fallbackTitle,
        points: Array.isArray(initialState?.points) ? initialState.points.slice() : []
    };
    evacPlans.push(plan);
    renderEvacPlanCard(plan);
    return plan;
}

// Supprime un plan complet (photo + points), après confirmation si non vide
function removeEvacPlan(planId) {
    const plan = getEvacPlanById(planId);
    if (!plan) return;
    const hasContent = !!photoStore[`plan_evac_${planId}`] || plan.points.length > 0;
    if (hasContent) {
        if (!confirm(`Supprimer le plan « ${plan.title} » ?\nCette action retire aussi tous les points placés sur ce plan. Les autres plans sont conservés.`)) {
            return;
        }
    }
    delete photoStore[`plan_evac_${planId}`];
    const card = getEvacPlanCardEl(planId);
    if (card) card.remove();
    evacPlans = evacPlans.filter(p => p.id !== Number(planId));

    // Toujours conserver au moins une carte (vide) à l'écran
    if (evacPlans.length === 0) {
        addEvacPlan();
    } else {
        refreshAllEvacMeasureSelects();
    }
}

// Rend le DOM d'une carte (un plan)
function renderEvacPlanCard(plan) {
    const container = document.getElementById("evacPlansContainer");
    if (!container) return;
    const card = document.createElement("div");
    card.className = "evac-plan-card";
    card.dataset.planId = String(plan.id);
    card.innerHTML = `
        <div class="evac-plan-card-header">
            <div class="evac-plan-card-title-wrap">
                <span class="evac-plan-card-icon">📋</span>
                <input type="text" class="evac-plan-card-title-input" value="${escapeHtml(plan.title)}" placeholder="Ex : Rez-de-chaussée, 1er étage, Bâtiment A...">
            </div>
            <button type="button" class="evac-plan-card-remove-btn" title="Supprimer ce plan">🗑 Supprimer ce plan</button>
        </div>

        <div class="evac-upload-area">
            <div class="icon">📷</div>
            <div>Cliquez pour importer une photo de ce plan</div>
        </div>
        <input type="file" class="evac-input" accept="image/*" style="display:none;">

        <div class="plan-evac-container"><img class="plan-evac-img" alt="Plan" /></div>

        <div class="add-evac-controls" style="display:none; flex-direction: column; gap:8px; align-items:stretch;">
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <label style="font-size:0.85rem; color:#1f4e79; font-weight:600; min-width:130px;">Lier à une mesure :</label>
                <select class="evac-measure-select" style="flex:1; min-width:160px;"><option value="">— Aucune (label libre ci-dessous) —</option></select>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <label style="font-size:0.85rem; color:#1f4e79; font-weight:600; min-width:130px;">ou label libre :</label>
                <input type="text" class="evac-label" placeholder="Ex : PICO 1, CU 2, FOYER..." maxlength="20" style="flex:1; min-width:160px;">
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn-success evac-place-btn">📍 Placer un point sur ce plan</button>
                <button type="button" class="clear-photo evac-replace-btn" style="padding: 10px 14px;">🖼 Remplacer la photo</button>
            </div>
            <p style="font-size:0.8rem; color:#555; margin:0;">💡 Si lié à une mesure, le cercle prend la couleur de l'analyse RSRP/SNR. Cliquez et glissez la poignée bleue (en bas à droite) pour redimensionner.</p>
        </div>
    `;
    container.appendChild(card);

    // --- Listeners ---
    const titleInput = card.querySelector(".evac-plan-card-title-input");
    if (titleInput) titleInput.addEventListener("input", () => { plan.title = titleInput.value; });

    const removeBtn = card.querySelector(".evac-plan-card-remove-btn");
    if (removeBtn) removeBtn.addEventListener("click", () => removeEvacPlan(plan.id));

    const uploadArea = card.querySelector(".evac-upload-area");
    const fileInput = card.querySelector(".evac-input");
    if (uploadArea && fileInput) {
        uploadArea.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const dataUrl = await fileToDataUrl(file);
                photoStore[`plan_evac_${plan.id}`] = {
                    dataUrl: dataUrl,
                    originalDataUrl: dataUrl,
                    annotated: false,
                    type: file.type.includes("png") ? "png" : "jpg",
                    name: file.name
                };
                showEvacStageForPlan(plan.id, dataUrl);
                // Si on a remplacé la photo d'un plan qui contenait déjà des points,
                // re-rendre les points par-dessus la nouvelle image, une fois chargée.
                const img = card.querySelector(".plan-evac-img");
                const renderExisting = () => {
                    card.querySelectorAll(".evac-point").forEach(el => el.remove());
                    plan.points.forEach(pt => renderEvacPoint(pt, plan.id));
                    refreshEvacPointColors();
                };
                if (img && img.complete && img.naturalWidth > 0) renderExisting();
                else if (img) img.addEventListener("load", renderExisting, { once: true });
                refreshAllEvacMeasureSelects();
            } catch (err) {
                console.error(err);
            }
        });
    }

    const replaceBtn = card.querySelector(".evac-replace-btn");
    if (replaceBtn && fileInput) {
        replaceBtn.addEventListener("click", () => {
            fileInput.value = "";
            fileInput.click();
        });
    }

    const placeBtn = card.querySelector(".evac-place-btn");
    if (placeBtn) placeBtn.addEventListener("click", () => armPlacePoint(plan.id));

    // Si le plan a déjà une photo et des points (cas du chargement depuis JSON)
    const photo = photoStore[`plan_evac_${plan.id}`];
    if (photo && photo.dataUrl) {
        showEvacStageForPlan(plan.id, photo.dataUrl);
        const img = card.querySelector(".plan-evac-img");
        const renderAll = () => {
            plan.points.forEach(pt => renderEvacPoint(pt, plan.id));
            refreshEvacPointColors();
        };
        if (img && img.complete && img.naturalWidth > 0) renderAll();
        else if (img) img.addEventListener("load", renderAll, { once: true });
    }
    refreshEvacMeasureSelectForPlan(plan.id);
}

// Affiche la zone "image + contrôles" d'un plan (et masque sa zone d'upload)
function showEvacStageForPlan(planId, dataUrl) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const img = card.querySelector(".plan-evac-img");
    const container = card.querySelector(".plan-evac-container");
    const controls = card.querySelector(".add-evac-controls");
    const upArea = card.querySelector(".evac-upload-area");
    if (img) img.src = dataUrl;
    if (container) container.classList.add("shown");
    if (controls) controls.style.display = "flex";
    if (upArea) upArea.style.display = "none";
}

// --- Sélecteur de mesure (par plan) ---
function refreshEvacMeasureSelectForPlan(planId) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const sel = card.querySelector(".evac-measure-select");
    if (!sel) return;
    const currentValue = sel.value;

    // measureIds liés ailleurs (sur un autre plan) — ils ne doivent pas être proposés ici comme libres
    const linkedAll = getAllLinkedMeasureIds();
    const plan = getEvacPlanById(planId);
    const linkedHere = new Set((plan?.points || []).map(p => p.measureId).filter(Boolean));

    sel.innerHTML = '<option value="">— Aucune (label libre ci-dessous) —</option>';
    document.querySelectorAll("#measuresBody tr[data-measure-id]").forEach(tr => {
        const id = tr.dataset.measureId;
        const zone = (document.getElementById(id + "_zone")?.value || "").trim();
        if (!zone) return;
        const placedHere = linkedHere.has(id);
        const placedElsewhere = linkedAll.has(id) && !placedHere;
        const opt = document.createElement("option");
        opt.value = id;
        const r = parseFloat(document.getElementById(id + "_rsrp")?.value);
        const s = parseFloat(document.getElementById(id + "_snr")?.value);
        const q = evaluateQuality(r, s);
        let suffix = "";
        if (placedHere) suffix = " ✓ placé ici";
        else if (placedElsewhere) {
            const where = findPointPlanByMeasureId(id);
            suffix = where ? ` ✓ placé sur « ${where.plan.title} »` : " ✓ placé ailleurs";
        }
        opt.textContent = zone + (q ? ` — ${q.label}` : "") + suffix;
        // On désactive l'option si la mesure est placée (ici ou ailleurs)
        opt.disabled = placedHere || placedElsewhere;
        sel.appendChild(opt);
    });
    if (currentValue && sel.querySelector(`option[value="${currentValue}"]:not([disabled])`)) {
        sel.value = currentValue;
    }
}

function refreshAllEvacMeasureSelects() {
    evacPlans.forEach(p => refreshEvacMeasureSelectForPlan(p.id));
}

// Compat ascendante avec d'autres fichiers qui pourraient appeler l'ancien nom global
function refreshEvacMeasureSelect() { refreshAllEvacMeasureSelects(); }

// --- Couleur d'analyse pour un measureId donné ---
function getMeasureColor(measureId) {
    if (!measureId) return "#dc2626";
    const r = parseFloat(document.getElementById(measureId + "_rsrp")?.value);
    const s = parseFloat(document.getElementById(measureId + "_snr")?.value);
    const q = evaluateQuality(r, s);
    return q ? q.color : "#dc2626";
}
function getMeasureLabel(measureId) {
    if (!measureId) return "";
    return (document.getElementById(measureId + "_zone")?.value || "").trim();
}

// --- Placement d'un point sur un plan donné (armé par planId) ---
let placePointArmed = null; // null ou planId

function armPlacePoint(planId) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const sel = card.querySelector(".evac-measure-select");
    const labelInput = card.querySelector(".evac-label");
    const measureId = sel.value || null;
    const freeLabel = (labelInput.value || "").trim();
    const label = measureId ? getMeasureLabel(measureId) : freeLabel;
    if (!label) {
        showStatus("Sélectionnez une mesure ou entrez un label libre.", "error");
        return;
    }
    // Mesure déjà placée (ici ou ailleurs) ?
    if (measureId && getAllLinkedMeasureIds().has(measureId)) {
        showStatus("Cette mesure est déjà liée à un point (sur ce plan ou un autre).", "error");
        return;
    }
    placePointArmed = Number(planId);
    showStatus(`👆 Cliquez maintenant sur le plan « ${getEvacPlanById(planId)?.title || ""} » à l'emplacement souhaité.`, "info");
    const container = card.querySelector(".plan-evac-container");
    if (!container) return;
    container.style.cursor = "crosshair";
    const onClick = (e) => {
        if (placePointArmed !== Number(planId)) return;
        if (e.target.closest(".evac-point")) return;
        const rect = container.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        addEvacPoint(label, xPct, yPct, measureId, planId);
        placePointArmed = null;
        container.style.cursor = "";
        labelInput.value = "";
        if (sel) sel.value = "";
        refreshAllEvacMeasureSelects();
        container.removeEventListener("click", onClick);
    };
    container.addEventListener("click", onClick, { once: false });
}
window.armPlacePoint = armPlacePoint;

function addEvacPoint(label, xPct, yPct, measureId, planId) {
    const plan = getEvacPlanById(planId);
    if (!plan) return;
    evacPointCounter++;
    const id = "ep_" + evacPointCounter;
    const point = { id, label, xPct, yPct, measureId: measureId || null, size: 80 };
    plan.points.push(point);
    renderEvacPoint(point, planId);
}

function renderEvacPoint(point, planId) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const container = card.querySelector(".plan-evac-container");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "evac-point";
    div.dataset.evacId = point.id;
    div.dataset.planId = String(planId);
    div.style.left = point.xPct + "%";
    div.style.top = point.yPct + "%";
    div.style.width = (point.size || 80) + "px";
    div.style.height = (point.size || 80) + "px";
    const color = getMeasureColor(point.measureId);
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    const haloBg = `radial-gradient(circle, rgba(${r},${g},${b},0.55) 0%, rgba(${r},${g},${b},0.25) 40%, rgba(${r},${g},${b},0) 75%)`;
    div.innerHTML = `
        <span class="evac-halo" style="background:${haloBg};"></span>
        <span class="evac-dot" style="background:${color};"></span>
        <span class="evac-label">${escapeHtml(point.label)}</span>
        <span class="evac-del" data-evac-del="${point.id}">✕</span>
        <span class="evac-resize" data-evac-resize="${point.id}">↘</span>
    `;
    container.appendChild(div);
    makeEvacPointDraggable(div, point, planId);
    makeEvacPointResizable(div, point);
    div.querySelector(".evac-del").addEventListener("click", (e) => {
        e.stopPropagation();
        const plan = getEvacPlanById(planId);
        if (plan) {
            const idx = plan.points.findIndex(p => p.id === point.id);
            if (idx >= 0) plan.points.splice(idx, 1);
        }
        div.remove();
        refreshAllEvacMeasureSelects();
    });
}

function refreshEvacPointColors() {
    document.querySelectorAll(".evac-point").forEach(div => {
        const evacId = div.dataset.evacId;
        const planId = div.dataset.planId;
        const plan = getEvacPlanById(planId);
        if (!plan) return;
        const point = plan.points.find(p => p.id === evacId);
        if (!point) return;
        const color = getMeasureColor(point.measureId);
        const r = parseInt(color.substring(1, 3), 16);
        const g = parseInt(color.substring(3, 5), 16);
        const b = parseInt(color.substring(5, 7), 16);
        const haloBg = `radial-gradient(circle, rgba(${r},${g},${b},0.55) 0%, rgba(${r},${g},${b},0.25) 40%, rgba(${r},${g},${b},0) 75%)`;
        const halo = div.querySelector(".evac-halo");
        const dot = div.querySelector(".evac-dot");
        if (halo) halo.style.background = haloBg;
        if (dot) dot.style.background = color;
    });
}

function makeEvacPointDraggable(div, point, planId) {
    let dragging = false;
    let startX = 0, startY = 0, startXPct = 0, startYPct = 0;
    div.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("evac-del")) return;
        if (e.target.classList.contains("evac-resize")) return;
        dragging = true;
        div.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        startXPct = point.xPct;
        startYPct = point.yPct;
        e.preventDefault();
    });
    div.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const card = getEvacPlanCardEl(planId);
        if (!card) return;
        const container = card.querySelector(".plan-evac-container");
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const dxPct = ((e.clientX - startX) / rect.width) * 100;
        const dyPct = ((e.clientY - startY) / rect.height) * 100;
        point.xPct = Math.max(0, Math.min(100, startXPct + dxPct));
        point.yPct = Math.max(0, Math.min(100, startYPct + dyPct));
        div.style.left = point.xPct + "%";
        div.style.top = point.yPct + "%";
    });
    div.addEventListener("pointerup", () => { dragging = false; });
    div.addEventListener("pointercancel", () => { dragging = false; });
}

function makeEvacPointResizable(div, point) {
    const handle = div.querySelector(".evac-resize");
    if (!handle) return;
    let resizing = false;
    let startX = 0, startSize = point.size || 80;
    handle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        resizing = true;
        handle.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startSize = point.size || 80;
        e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
        if (!resizing) return;
        const dx = e.clientX - startX;
        const newSize = Math.max(40, Math.min(300, startSize + dx * 1.5));
        point.size = Math.round(newSize);
        div.style.width = point.size + "px";
        div.style.height = point.size + "px";
    });
    handle.addEventListener("pointerup", () => { resizing = false; });
    handle.addEventListener("pointercancel", () => { resizing = false; });
}

// Compat ascendante avec l'ancienne API HTML (boutons inline onclick="clearPlan()")
// — désormais la suppression se fait par bouton "🗑 Supprimer ce plan" de chaque carte.
function clearPlan() {
    if (evacPlans.length === 1) {
        removeEvacPlan(evacPlans[0].id);
    }
}
window.clearPlan = clearPlan;

// =============================================================
//  FOURNITURES
// =============================================================
function renderFournitures() {
    const container = document.getElementById("fournituresContainer");
    if (!container || !window.FOURNITURES_PICO) return;
    container.innerHTML = "";
    window.FOURNITURES_PICO.forEach(catBlock => {
        const cat = document.createElement("div");
        cat.className = "fournitures-cat";
        cat.innerHTML = `<h4>${catBlock.cat}</h4><div class="fournitures-list"></div>`;
        const list = cat.querySelector(".fournitures-list");
        catBlock.items.forEach(item => {
            const row = document.createElement("div");
            row.className = "fourn-item";
            row.innerHTML = `
                <input type="checkbox" id="${item.id}_chk">
                <label for="${item.id}_chk">${item.label}</label>
                <input type="number" class="qty-input" id="${item.id}_qty" min="0" step="${item.unit === 'ML' ? '1' : '1'}" placeholder="0">
                <span class="unit-tag">${item.unit}</span>
            `;
            list.appendChild(row);
            const qtyInput = row.querySelector(".qty-input");
            const chk = row.querySelector("input[type='checkbox']");
            qtyInput.addEventListener("input", () => {
                if (qtyInput.value && parseFloat(qtyInput.value) > 0) chk.checked = true;
            });
        });
        container.appendChild(cat);
    });
}

// =============================================================
//  COLLECTE DES DONNÉES (utilisée pour Word & JSON)
// =============================================================
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}
function radioVal(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
}

function collectMeasures() {
    const rows = [];
    document.querySelectorAll("#measuresBody tr[data-measure-id]").forEach(tr => {
        const id = tr.dataset.measureId;
        const rsrp = val(id + "_rsrp");
        const snr  = val(id + "_snr");
        const rsrq = val(id + "_rsrq");
        const band = val(id + "_band");
        const m4g = (rsrp || rsrq || band) ? [rsrp || "—", rsrq || "—", band || "—"].join("/") : "";
        const r = parseFloat(rsrp);
        const s = parseFloat(snr);
        const q = evaluateQuality(r, s);
        rows.push({
            zone: val(id + "_zone"),
            rsrp, snr, rsrq, band,
            m4g,
            m5g:  val(id + "_5g"),
            dn:   val(id + "_dn"),
            up:   val(id + "_up"),
            qualite: q ? q.label : "",
            qualiteColor: q ? q.color.replace("#", "") : ""
        });
    });
    return rows;
}

function collectPicoPoses() {
    const list = [];
    document.querySelectorAll("#picoPosesList .pico-item").forEach((div, idx) => {
        const id = div.dataset.picoId;
        const zone = val(id + "_zone");
        const note = val(id + "_note");
        if (zone || note) list.push({ num: idx + 1, zone, note });
    });
    return list;
}

function collectFournitures() {
    const list = [];
    if (!window.FOURNITURES_PICO) return list;
    window.FOURNITURES_PICO.forEach(catBlock => {
        catBlock.items.forEach(item => {
            const chk = document.getElementById(item.id + "_chk");
            const qty = document.getElementById(item.id + "_qty");
            if (chk && chk.checked) {
                const q = qty && qty.value ? parseFloat(qty.value) : 0;
                list.push({
                    label: item.label,
                    qty: q || 1,
                    unit: item.unit,
                    cat: catBlock.cat
                });
            }
        });
    });
    return list;
}

function getSelectedForfait(type) {
    const groupName = "forfait_" + type.toLowerCase();
    const sel = document.querySelector(`input[name="${groupName}"]:checked`);
    if (!sel) return null;
    const data = (type === "Pico") ? window.PICO_FORFAITS : window.QUATRA_FORFAITS;
    return data.find(f => f.ref === sel.value) || null;
}

function collectAllFormData() {
    const mode = getMode();
    const isTravaux = (mode === 'travaux');
    return {
        numero_ot: val("numero_ot"),
        cdp_bytel: val("cdp_bytel"),
        auditeur: val("auditeur"),
        direction: val("direction"),
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
        batiment_classe: radioVal("batiment_classe"),
        loc_baie: val("loc_baie"),
        nb_prises_elec: isTravaux ? "" : val("nb_prises_elec"),
        rj45_optimal: isTravaux ? "" : radioVal("rj45_optimal"),
        devis_desserte: isTravaux ? "" : radioVal("devis_desserte"),
        vlan_besoin: isTravaux ? "" : radioVal("vlan_besoin"),
        vlan_port: isTravaux ? "" : val("vlan_port"),
        mesures: collectMeasures(),
        mesures_note: val("mesures_note"),
        pico_forfait: getSelectedForfait("Pico"),
        pico_poses: collectPicoPoses(),
        pico_metrage: val("pico_metrage"),
        pico_hauteur: val("pico_hauteur"),
        quatra_forfait: getSelectedForfait("Quatra"),
        quatra_nb_nu: val("quatra_nb_nu"),
        quatra_nb_cu: val("quatra_nb_cu"),
        quatra_metrage_cu: val("quatra_metrage_cu"),
        fournitures: collectFournitures(),
        fournitures_libre: val("fournitures_libre"),
        outils_libre: val("outils_libre"),
        hauteur_max: val("hauteur_max"),
        nb_techniciens: val("nb_techniciens"),
        duree_totale: val("duree_totale"),
        nacelle_prevoir: radioVal("nacelle_prevoir"),
        echelle_prevoir: radioVal("echelle_prevoir"),
        acces_site: isTravaux ? "" : val("acces_site"),
        solution_validee_par: val("solution_validee_par"),
        observations: val("observations"),
        signataire_nom: val("signataire_nom"),
        signataire_date: val("signataire_date"),
        photoLabels: collectPhotoLabels()
    };
}

function collectPhotoLabels() {
    const labels = {};
    document.querySelectorAll("[data-photo-label-for]").forEach(inp => {
        const key = inp.dataset.photoLabelFor;
        labels[key] = inp.value || "";
    });
    return labels;
}

// =============================================================
//  EXPORT / IMPORT JSON
// =============================================================
function buildBaseFilename() {
    const ref = (val("numero_ot") || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const raison = (val("raison_sociale") || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
    const date = val("date_audit") || new Date().toISOString().slice(0, 10);
    const mode = (getMode() === "travaux") ? "TRAVAUX" : "AUDIT";
    const picoActive = document.getElementById("activePico").checked;
    const quatraActive = document.getElementById("activeQuatra").checked;
    let type = "PICO_QUATRA";
    if (picoActive && !quatraActive) type = "PICO";
    else if (!picoActive && quatraActive) type = "QUATRA";
    else if (picoActive && quatraActive) type = "PICO_QUATRA";
    let parts = [`${mode}_${type}`];
    if (ref) parts.push(ref);
    if (raison) parts.push(raison);
    parts.push(date);
    return parts.join("_");
}

async function exportToJSON() {
    try {
        const formData = collectAllFormData();
        const photos = {};
        Object.entries(photoStore).forEach(([k, p]) => {
            photos[k] = {
                dataUrl: p.dataUrl,
                originalDataUrl: p.originalDataUrl || null,
                annotated: p.annotated || false,
                annotations: p.annotations || null,
                naturalWidth: p.naturalWidth || null,
                naturalHeight: p.naturalHeight || null,
                type: p.type || "png",
                name: p.name || null
            };
        });
        const fullExport = {
            version: 2,
            type: "pico-quatra",
            exportedAt: new Date().toISOString(),
            mode: getMode(),
            picoActive: document.getElementById("activePico").checked,
            quatraActive: document.getElementById("activeQuatra").checked,
            formData,
            photos,
            evacPlans: evacPlans.map(p => ({ id: p.id, title: p.title, points: p.points.slice() })),
            evacPlanCounter: evacPlanCounter,
            evacPointCounter: evacPointCounter
        };
        const blob = new Blob([JSON.stringify(fullExport, null, 2)], { type: "application/json" });
        saveAs(blob, buildBaseFilename() + "_BACKUP.json");
        showStatus("✅ Sauvegarde JSON exportée.", "success");
    } catch (err) {
        console.error(err);
        showStatus("❌ Erreur export JSON : " + err.message, "error");
    }
}
window.exportToJSON = exportToJSON;

async function importFromJSON(file) {
    if (!file) return;
    if (!confirm("Importer ce fichier va remplacer toutes les données actuelles. Continuer ?")) {
        document.getElementById("importJsonInput").value = "";
        return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const fd = data.formData || {};
            // Reset visuel sans confirmation
            document.querySelectorAll("input, textarea, select").forEach(el => {
                if (el.id === "modeIntervention") return;
                if (el.type === "checkbox" || el.type === "radio") el.checked = false;
                else if (el.type !== "file") el.value = "";
            });
            Object.keys(photoStore).forEach(k => delete photoStore[k]);
            document.querySelectorAll(".photo-preview").forEach(p => { p.src = ""; p.classList.remove("shown"); });
            document.querySelectorAll(".annotate-btn").forEach(b => b.disabled = true);
            document.querySelectorAll(".forfait-card").forEach(c => c.classList.remove("selected"));
            document.getElementById("measuresBody").innerHTML = "";
            document.getElementById("picoPosesList").innerHTML = "";
            document.getElementById("picoPhotoGrid").innerHTML = "";
            document.getElementById("quatraPhotoGrid").innerHTML = "";
            measureCounter = picoPoseCounter = picoPhotoCounter = quatraPhotoCounter = 0;
            // Reset complet des plans d'évacuation (le DOM sera reconstruit par le bloc multi-plans plus bas)
            const _evacContainerReset = document.getElementById("evacPlansContainer");
            if (_evacContainerReset) _evacContainerReset.innerHTML = "";
            evacPlans = [];
            evacPlanCounter = 0;
            document.querySelectorAll(".evac-point").forEach(p => p.remove());
            setMode(data.mode === "travaux" ? "travaux" : "audit");
            document.getElementById("activePico").checked = !!data.picoActive;
            document.getElementById("activeQuatra").checked = !!data.quatraActive;
            const TEXT_FIELDS = [
                "numero_ot", "cdp_bytel", "auditeur", "direction", "date_audit",
                "raison_sociale", "adresse", "code_postal", "ville", "horaire", "procedure_acces",
                "tel_site", "contact_nom", "contact_fonction", "contact_tel", "contact_mail",
                "loc_baie", "nb_prises_elec", "vlan_port", "mesures_note",
                "pico_metrage", "pico_hauteur",
                "quatra_nb_nu", "quatra_nb_cu", "quatra_metrage_cu",
                "fournitures_libre", "outils_libre",
                "hauteur_max", "nb_techniciens", "duree_totale",
                "acces_site", "solution_validee_par", "observations",
                "signataire_nom", "signataire_date"
            ];
            TEXT_FIELDS.forEach(id => {
                const el = document.getElementById(id);
                if (el && fd[id] !== undefined && fd[id] !== null) el.value = fd[id];
            });
            ["batiment_classe", "rj45_optimal", "devis_desserte", "vlan_besoin",
             "nacelle_prevoir", "echelle_prevoir"].forEach(name => {
                const v = fd[name];
                if (v) {
                    const r = document.querySelector(`input[name="${name}"][value="${v}"]`);
                    if (r) r.checked = true;
                }
            });
            (fd.mesures || []).forEach(m => {
                addMeasureRow();
                const id = "m_" + measureCounter;
                document.getElementById(id + "_zone").value = m.zone || "";
                document.getElementById(id + "_rsrp").value = m.rsrp || "";
                document.getElementById(id + "_snr").value  = m.snr  || "";
                document.getElementById(id + "_rsrq").value = m.rsrq || "";
                document.getElementById(id + "_band").value = m.band || "";
                if (!m.rsrp && !m.rsrq && !m.band && m.m4g) {
                    const parts = String(m.m4g).split("/");
                    if (parts[0]) document.getElementById(id + "_rsrp").value = parts[0].trim();
                    if (parts[1]) document.getElementById(id + "_rsrq").value = parts[1].trim();
                    if (parts[2]) document.getElementById(id + "_band").value = parts[2].trim();
                }
                document.getElementById(id + "_5g").value = m.m5g || "";
                document.getElementById(id + "_dn").value = m.dn || "";
                document.getElementById(id + "_up").value = m.up || "";
                analyzeMeasureRow(id);
            });
            if ((fd.mesures || []).length === 0) addMeasureRow();
            (fd.pico_poses || []).forEach(p => {
                addPicoPose();
                const id = "pp_" + picoPoseCounter;
                document.getElementById(id + "_zone").value = p.zone || "";
                document.getElementById(id + "_note").value = p.note || "";
            });
            if ((fd.pico_poses || []).length === 0) addPicoPose();
            if (fd.pico_forfait && fd.pico_forfait.ref) {
                const r = document.querySelector(`input[name="forfait_pico"][value="${fd.pico_forfait.ref}"]`);
                if (r) { r.checked = true; r.closest(".forfait-card").classList.add("selected"); }
            }
            if (fd.quatra_forfait && fd.quatra_forfait.ref) {
                const r = document.querySelector(`input[name="forfait_quatra"][value="${fd.quatra_forfait.ref}"]`);
                if (r) { r.checked = true; r.closest(".forfait-card").classList.add("selected"); }
            }
            (fd.fournitures || []).forEach(f => {
                window.FOURNITURES_PICO.forEach(catBlock => {
                    catBlock.items.forEach(item => {
                        if (item.label === f.label) {
                            const chk = document.getElementById(item.id + "_chk");
                            const qty = document.getElementById(item.id + "_qty");
                            if (chk) chk.checked = true;
                            if (qty) qty.value = f.qty || "";
                        }
                    });
                });
            });
            const photos = data.photos || {};
            const labels = fd.photoLabels || {};
            const picoKeys = Object.keys(photos).filter(k => k.startsWith("pico_photo_"));
            const quatraKeys = Object.keys(photos).filter(k => k.startsWith("quatra_photo_"));
            if (picoKeys.length > 0) {
                document.getElementById("picoPhotoGrid").innerHTML = "";
                picoPhotoCounter = 0;
                picoKeys.sort((a, b) => parseInt(a.split("_")[2]) - parseInt(b.split("_")[2]));
                picoKeys.forEach(k => {
                    const lbl = labels[k] || ("Photo PICO " + (picoPhotoCounter + 1));
                    addPicoPhotoBlock(lbl);
                });
            } else {
                setupPicoPhotoBlocks();
            }
            if (quatraKeys.length > 0) {
                document.getElementById("quatraPhotoGrid").innerHTML = "";
                quatraPhotoCounter = 0;
                quatraKeys.sort((a, b) => parseInt(a.split("_")[2]) - parseInt(b.split("_")[2]));
                quatraKeys.forEach(k => {
                    const lbl = labels[k] || ("Photo Quatra " + (quatraPhotoCounter + 1));
                    addQuatraPhotoBlock(lbl);
                });
            } else {
                setupQuatraPhotoBlocks();
            }
            Object.entries(photos).forEach(([key, p]) => {
                photoStore[key] = {
                    dataUrl: p.dataUrl,
                    originalDataUrl: p.originalDataUrl || p.dataUrl,
                    annotated: p.annotated || false,
                    annotations: p.annotations || null,
                    naturalWidth: p.naturalWidth || null,
                    naturalHeight: p.naturalHeight || null,
                    type: p.type || "png",
                    name: p.name || null
                };
                const preview = document.getElementById("preview_" + key);
                if (preview && p.dataUrl) {
                    preview.src = p.dataUrl;
                    preview.classList.add("shown");
                }
                const annBtn = document.querySelector(`[data-annotate="${key}"]`);
                if (annBtn) annBtn.disabled = false;
            });
            // ===== Plan(s) d'évacuation (chargement, avec rétrocompat ancien format) =====
            // Migration ancien format → nouveau si nécessaire
            let _evacPlansToLoad = null;
            if (Array.isArray(data.evacPlans) && data.evacPlans.length > 0) {
                _evacPlansToLoad = data.evacPlans;
                if (typeof data.evacPlanCounter === "number") evacPlanCounter = data.evacPlanCounter;
                if (typeof data.evacPointCounter === "number") evacPointCounter = data.evacPointCounter;
            } else if (Array.isArray(data.evacPoints) || (photos.plan_evac && photos.plan_evac.dataUrl)) {
                // Ancien format : un seul plan, photo dans photos.plan_evac, points dans data.evacPoints
                _evacPlansToLoad = [{
                    id: 0,
                    title: "Plan d'implantation",
                    points: Array.isArray(data.evacPoints) ? data.evacPoints.slice() : []
                }];
                // Migrer la photo : photoStore["plan_evac"] → photoStore["plan_evac_0"]
                if (photoStore["plan_evac"]) {
                    photoStore["plan_evac_0"] = photoStore["plan_evac"];
                    delete photoStore["plan_evac"];
                }
            }

            if (_evacPlansToLoad && _evacPlansToLoad.length > 0) {
                _evacPlansToLoad.forEach(p => {
                    const pts = (Array.isArray(p.points) ? p.points : []).map(pt => {
                        if (!pt.size) pt.size = 80;
                        if (!("measureId" in pt)) pt.measureId = null;
                        // Décaler le compteur de points si nécessaire
                        if (pt.id) {
                            const num = parseInt(String(pt.id).split("_")[1]);
                            if (!isNaN(num) && num > evacPointCounter) evacPointCounter = num;
                        }
                        return { ...pt };
                    });
                    const planId = (typeof p.id === "number") ? p.id : evacPlanCounter++;
                    if (planId >= evacPlanCounter) evacPlanCounter = planId + 1;
                    const plan = {
                        id: planId,
                        title: (typeof p.title === "string" && p.title.trim()) ? p.title : "Plan d'implantation",
                        points: pts
                    };
                    evacPlans.push(plan);
                    renderEvacPlanCard(plan);
                });
                // Couleurs et sélecteurs (les points DOM se rendent dès que l'image se charge)
                setTimeout(() => {
                    refreshEvacPointColors();
                    refreshAllEvacMeasureSelects();
                }, 60);
            } else {
                // Sauvegarde sans plan → carte vide par défaut
                addEvacPlan();
            }
            updateSectionState();
            document.getElementById("importJsonInput").value = "";
            showStatus("✅ Sauvegarde importée.", "success");
        } catch (err) {
            console.error(err);
            showStatus("❌ Erreur d'import : " + err.message, "error");
        }
    };
    reader.readAsText(file);
}
window.importFromJSON = importFromJSON;

// =============================================================
//  GÉNÉRATION DU RAPPORT WORD
// =============================================================
const COLOR_TITLE = "1F3864";
const COLOR_SUBTITLE = "2E75B6";
const COLOR_TABLE_LABEL = "F2F2F2";
const COLOR_BORDER = "BFBFBF";
const COLOR_WHITE = "FFFFFF";
const COLOR_HEADER_BG = "2E5481";

async function generateReport() {
    showStatus("⏳ Génération du rapport en cours...", "info");
    try {
        await window.__libsLoaded;
        if (typeof docx === "undefined") throw new Error("La bibliothèque docx n'a pas pu être chargée.");
        const { Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, WidthType, BorderStyle, ShadingType, VerticalAlign, HeightRule, Footer, Header, PageNumber, HeadingLevel, Packer, LevelFormat, PageOrientation } = docx;
        const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
        const b64 = (s) => { const binary = atob(s); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; };
        const FONT = "Calibri";
        const stdBorder = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER };
        const stdBorders = { top: stdBorder, bottom: stdBorder, left: stdBorder, right: stdBorder };
        const P = (text, opts) => new Paragraph({ spacing: { before: 80, after: 80 }, ...(opts || {}), children: Array.isArray(text) ? text : [new TextRun({ text: text || "", font: FONT, size: 22, ...(opts && opts.runOpts || {}) })] });
        const H = (text, level) => new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true, font: FONT, size: level === 1 ? 30 : (level === 2 ? 26 : 22), color: level === 1 ? COLOR_TITLE : COLOR_SUBTITLE })] });
        const cellText = (text, opts) => new TableCell({ width: opts && opts.width ? { size: opts.width, type: WidthType.DXA } : undefined, shading: opts && opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR, color: "auto" } : undefined, margins: { top: 80, bottom: 80, left: 100, right: 100 }, borders: stdBorders, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: opts && opts.align ? opts.align : AlignmentType.LEFT, children: [new TextRun({ text: text || "", font: FONT, size: 20, bold: !!(opts && opts.bold), color: opts && opts.color ? opts.color : "000000" })] })] });
        function dataUrlToBytes(dataUrl) { const base64 = dataUrl.split(",")[1]; const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
        async function getPhotoImageRun(key, maxW, maxH) {
            const p = photoStore[key];
            if (!p || !p.dataUrl) return null;
            try {
                const dims = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => resolve({ w: maxW, h: maxH }); img.src = p.dataUrl; });
                const ratio = dims.w / dims.h;
                let w = maxW, h = Math.round(maxW / ratio);
                if (h > maxH) { h = maxH; w = Math.round(maxH * ratio); }
                return new ImageRun({ data: dataUrlToBytes(p.dataUrl), transformation: { width: w, height: h }, type: (p.type === "png") ? "png" : "jpg" });
            } catch (err) { console.warn("Photo invalide", key, err); return null; }
        }
        const mode = getMode();
        const isTravaux = (mode === 'travaux');
        const picoActive = document.getElementById("activePico").checked;
        const quatraActive = document.getElementById("activeQuatra").checked;
        let typeLabel = "";
        if (picoActive && quatraActive) typeLabel = "PICO BTS + CEL-FI QUATRA";
        else if (picoActive) typeLabel = "INSTALLATION PICO BTS";
        else if (quatraActive) typeLabel = "INSTALLATION CEL-FI QUATRA";
        else typeLabel = "PICO / CEL-FI QUATRA";
        const titreRapport = ((mode === "travaux") ? "RAPPORT DE TRAVAUX - " : "RAPPORT D'AUDIT - ") + typeLabel;
        const children = [];
        children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [9360], rows: [new TableRow({ children: [new TableCell({ width: { size: 9360, type: WidthType.DXA }, shading: { fill: COLOR_HEADER_BG, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 240, bottom: 200, left: 200, right: 200 }, borders: stdBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: titreRapport, bold: true, size: 32, color: COLOR_WHITE, font: FONT })] }), new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: "Bouygues Telecom | IPKONEKT", size: 22, color: COLOR_WHITE, font: FONT })] })] })] })] }));
        children.push(P(""));
        const hdrRows = [ ["Numéro d'OT", val("numero_ot")], ["CDP Bytel", val("cdp_bytel")], ["Auditeur / Intervenant", val("auditeur")], ["Direction / Service", val("direction")], ["Date d'intervention", val("date_audit")] ].filter(r => r[1] && r[1].trim());
        if (hdrRows.length > 0) {
            children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [3120, 6240], rows: hdrRows.map(([k, v]) => new TableRow({ children: [ cellText(k, { width: 3120, shading: COLOR_TABLE_LABEL, bold: true }), cellText(v, { width: 6240 }) ] })) }));
            children.push(P(""));
        }
        children.push(H("1. Informations administratives du client", 1));
        const clientRows = [ ["Raison sociale", val("raison_sociale")], ["Adresse", [val("adresse"), val("code_postal"), val("ville")].filter(x => x).join(" ")], ["Horaire d'ouverture", val("horaire")], ["Procédure d'accès", val("procedure_acces")], ["Téléphone du site", val("tel_site")], ["Contact", [val("contact_nom"), val("contact_fonction")].filter(x => x).join(" — ")], ["Téléphone du contact", val("contact_tel")], ["Mail du contact", val("contact_mail")] ].filter(r => r[1] && r[1].trim());
        if (clientRows.length > 0) children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [3120, 6240], rows: clientRows.map(([k, v]) => new TableRow({ children: [ cellText(k, { width: 3120, shading: COLOR_TABLE_LABEL, bold: true }), cellText(v, { width: 6240 }) ] })) }));
        children.push(H("2. Informations techniques client", 1));
        const techRows = [
            ["Bâtiment classé", radioVal("batiment_classe")],
            ["Localisation de la baie informatique", val("loc_baie")],
            ...(!isTravaux ? [
                ["Nb de prises électriques disponibles", val("nb_prises_elec")],
                ["Prise RJ45 à l'emplacement optimal", radioVal("rj45_optimal")],
                ["Devis desserte à prévoir", radioVal("devis_desserte")],
                ["Besoin VLAN", radioVal("vlan_besoin")],
                ["Si VLAN, sur quel port", val("vlan_port")]
            ] : [])
        ].filter(r => r[1] && r[1].trim());
        if (techRows.length > 0) children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [4680, 4680], rows: techRows.map(([k, v]) => new TableRow({ children: [ cellText(k, { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(v, { width: 4680 }) ] })) }));
        children.push(H("3. Mesures radio", 1));
        children.push(P("Tests réalisés avec l'application Network Cell Info Lite.", { runOpts: { italics: true, color: "555555" } }));
        children.push(H("État de la couverture radio", 2));
        children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [3120, 6240], rows: [ new TableRow({ children: [ cellText("Qualité couverture", { width: 3120, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true }), cellText("4G", { width: 6240, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }) ] }), new TableRow({ children: [cellText("Bonne", { width: 3120, bold: true }), cellText("> -97 dBm", { width: 6240 })] }), new TableRow({ children: [cellText("Moyenne", { width: 3120, bold: true }), cellText("-98 dBm < X < -107 dBm", { width: 6240 })] }), new TableRow({ children: [cellText("Médiocre", { width: 3120, bold: true }), cellText("-108 dBm < X < -117 dBm", { width: 6240 })] }), new TableRow({ children: [cellText("Mauvaise", { width: 3120, bold: true }), cellText("> -118 dBm", { width: 6240 })] }), new TableRow({ children: [cellText("Inexistante", { width: 3120, bold: true }), cellText("Pas de couverture", { width: 6240 })] }) ] }));
        const mesures = collectMeasures().filter(m => m.zone || m.m4g || m.m5g || m.rsrp);
        if (mesures.length > 0) {
            children.push(H("Points de mesure", 2));
            const mesureRows = [ new TableRow({ tableHeader: true, children: [ cellText("Point de mesure", { width: 1880, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true }), cellText("4G (RSRP/SNR/RSRQ/Band)", { width: 2080, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }), cellText("5G (RSRP/RSRQ/Band)", { width: 1880, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }), cellText("↓ Mb", { width: 880, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }), cellText("↑ Mb", { width: 880, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }), cellText("Analyse auto", { width: 1760, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }) ] }) ];
            mesures.forEach(m => {
                const m4g = [m.rsrp, m.snr, m.rsrq, m.band].map(x => (x === undefined || x === null || x === "") ? "—" : x).join("/");
                mesureRows.push(new TableRow({ children: [ cellText(m.zone || "—", { width: 1880, bold: true }), cellText(m4g, { width: 2080, align: AlignmentType.CENTER }), cellText(m.m5g || "—", { width: 1880, align: AlignmentType.CENTER }), cellText(m.dn || "—", { width: 880, align: AlignmentType.CENTER }), cellText(m.up || "—", { width: 880, align: AlignmentType.CENTER }), cellText( m.qualite || "—", { width: 1760, align: AlignmentType.CENTER, bold: !!m.qualite, shading: m.qualiteColor ? "#" + m.qualiteColor : undefined, color: m.qualite ? COLOR_WHITE : "000000" }) ] }));
            });
            children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [1880, 2080, 1880, 880, 880, 1760], rows: mesureRows }));
        }
        const mesureNote = val("mesures_note");
        if (mesureNote.trim()) { children.push(P("")); children.push(P(mesureNote, { runOpts: { italics: true } })); }
        if (mesures.length > 0) {
            const stats = {};
            let totalAnalysed = 0;
            mesures.forEach(m => { if (m.qualite) { stats[m.qualite] = (stats[m.qualite] || 0) + 1; totalAnalysed++; } });
            if (totalAnalysed > 0) { children.push(H("Synthèse de l'analyse automatique", 2)); const summary = Object.entries(stats).map(([k, v]) => `${v} point${v > 1 ? "s" : ""} en qualité « ${k} »`).join(" • "); children.push(P(`Sur ${totalAnalysed} point${totalAnalysed > 1 ? "s" : ""} analysé${totalAnalysed > 1 ? "s" : ""} (RSRP + SNR renseignés) : ${summary}.`, { runOpts: { italics: true, color: "555555" } })); }
        }
        // ===== Section 4 — Plans d'évacuation (un sous-bloc par plan ayant une photo) =====
        const _plansForReport = evacPlans.filter(p => !!photoStore[`plan_evac_${p.id}`]);
        if (_plansForReport.length > 0) {
            children.push(H("4. Plan(s) d'implantation / d'évacuation", 1));
            for (let _i = 0; _i < _plansForReport.length; _i++) {
                const _plan = _plansForReport[_i];
                // Sous-titre du plan
                const _planTitle = _plansForReport.length > 1
                    ? `Plan ${_i + 1} – ${_plan.title || "Plan d'implantation"}`
                    : (_plan.title || "Plan d'implantation");
                children.push(H(_planTitle, 2));

                const planImg = await renderPlanWithPoints(_plan.id);
                if (planImg) {
                    const planDims = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => resolve({ w: 600, h: 380 }); img.src = planImg; });
                    const maxW = 600, maxH = 420;
                    const ratio = planDims.w / planDims.h;
                    let pw = maxW, ph = Math.round(maxW / ratio);
                    if (ph > maxH) { ph = maxH; pw = Math.round(maxH * ratio); }
                    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: dataUrlToBytes(planImg), transformation: { width: pw, height: ph }, type: "png" })] }));
                }
                if (_plan.points.length > 0) {
                    children.push(P("Légende : " + _plan.points.map(p => p.label).join(" • "), { runOpts: { italics: true, color: "555555" } }));
                } else {
                    children.push(P("(Aucun point placé sur ce plan)", { runOpts: { italics: true, color: "999999" } }));
                }
            }
        }
        if (picoActive) {
            children.push(H("5. Mise en place de la solution PICO BTS", 1));
            const picoForfait = getSelectedForfait("Pico");
            if (picoForfait) {
                children.push(H("5.1 Forfait retenu", 2));
                children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [2080, 7280], rows: [ new TableRow({ children: [cellText("Référence", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(picoForfait.ref, { width: 7280 })] }), new TableRow({ children: [cellText("Forfait", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(picoForfait.label, { width: 7280, bold: true })] }), new TableRow({ children: [cellText("Description", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(picoForfait.description, { width: 7280 })] }), new TableRow({ children: [cellText("Critères", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(picoForfait.critere, { width: 7280 })] }) ] }));
            }
            const picoPoses = collectPicoPoses();
            if (picoPoses.length > 0) {
                children.push(H(isTravaux ? "5.2 PICO posés" : "5.2 Pico à installer", 2));
                const rows = [ new TableRow({ tableHeader: true, children: [ cellText("N°", { width: 800, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }), cellText("Zone / Pièce", { width: 3280, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true }), cellText("Note", { width: 5280, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true }) ] }) ];
                picoPoses.forEach(p => rows.push(new TableRow({ children: [ cellText(`PICO ${p.num}`, { width: 800, bold: true, align: AlignmentType.CENTER }), cellText(p.zone || "—", { width: 3280 }), cellText(p.note || "", { width: 5280 }) ] })));
                children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [800, 3280, 5280], rows }));
            }
            const metrage = val("pico_metrage");
            const hauteur = val("pico_hauteur");
            if (metrage || hauteur) {
                children.push(H("5.3 Métré câble & hauteur", 2));
                const metRows = [];
                if (metrage) metRows.push(new TableRow({ children: [cellText("Linéaire câble Ethernet total", { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(metrage + " ml", { width: 4680 })] }));
                if (hauteur) metRows.push(new TableRow({ children: [cellText("Hauteur de pose des PICO", { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(hauteur + " m", { width: 4680 })] }));
                children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [4680, 4680], rows: metRows }));
            }
            const picoPhotoKeys = Object.keys(photoStore).filter(k => k.startsWith("pico_photo_"));
            if (picoPhotoKeys.length > 0) {
                children.push(H("5.4 Reporting photos / cheminement câbles", 2));
                picoPhotoKeys.sort((a, b) => parseInt(a.split("_")[2]) - parseInt(b.split("_")[2]));
                for (const key of picoPhotoKeys) {
                    const labelInput = document.querySelector(`[data-photo-label-for="${key}"]`);
                    const label = labelInput ? labelInput.value : key;
                    const img = await getPhotoImageRun(key, 480, 320);
                    if (img) {
                        children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: "📷 " + label, bold: true, size: 22, color: COLOR_SUBTITLE, font: FONT })] }));
                        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [img] }));
                    }
                }
            }
        }
        if (quatraActive) {
            children.push(H("6. Mise en place de la solution CEL-FI QUATRA", 1));
            const quatraForfait = getSelectedForfait("Quatra");
            if (quatraForfait) {
                children.push(H("6.1 Forfait retenu", 2));
                children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [2080, 7280], rows: [ new TableRow({ children: [cellText("Référence", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(quatraForfait.ref, { width: 7280 })] }), new TableRow({ children: [cellText("Forfait", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(quatraForfait.label, { width: 7280, bold: true })] }), new TableRow({ children: [cellText("Description", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(quatraForfait.description, { width: 7280 })] }), new TableRow({ children: [cellText("Critères", { width: 2080, shading: COLOR_TABLE_LABEL, bold: true }), cellText(quatraForfait.critere, { width: 7280 })] }) ] }));
            }
            const qNu = val("quatra_nb_nu");
            const qCu = val("quatra_nb_cu");
            const qMet = val("quatra_metrage_cu");
            if (qNu || qCu || qMet) {
                children.push(H(isTravaux ? "6.2 Équipements posés" : "6.2 Equipements à installer", 2));
                const qRows = [];
                if (qNu) qRows.push(new TableRow({ children: [cellText("Nombre de NU", { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(qNu, { width: 4680 })] }));
                if (qCu) qRows.push(new TableRow({ children: [cellText("Nombre de CU", { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(qCu, { width: 4680 })] }));
                if (qMet) qRows.push(new TableRow({ children: [cellText("Linéaire câble RJ45 par CU", { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(qMet + " m", { width: 4680 })] }));
                children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [4680, 4680], rows: qRows }));
            }
            const quatraPhotoKeys = Object.keys(photoStore).filter(k => k.startsWith("quatra_photo_"));
            if (quatraPhotoKeys.length > 0) {
                children.push(H("6.3 Photos Quatra", 2));
                quatraPhotoKeys.sort((a, b) => parseInt(a.split("_")[2]) - parseInt(b.split("_")[2]));
                for (const key of quatraPhotoKeys) {
                    const labelInput = document.querySelector(`[data-photo-label-for="${key}"]`);
                    const label = labelInput ? labelInput.value : key;
                    const img = await getPhotoImageRun(key, 480, 320);
                    if (img) {
                        children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: "📷 " + label, bold: true, size: 22, color: COLOR_SUBTITLE, font: FONT })] }));
                        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [img] }));
                    }
                }
            }
        }
        const fournitures = collectFournitures();
        const fLibre = val("fournitures_libre");
        const oLibre = val("outils_libre");
        if (fournitures.length > 0 || fLibre.trim() || oLibre.trim()) {
            children.push(H("7. Fournitures & matériel", 1));
            if (fournitures.length > 0) {
                const byCat = {};
                fournitures.forEach(f => { if (!byCat[f.cat]) byCat[f.cat] = []; byCat[f.cat].push(f); });
                const fRows = [ new TableRow({ tableHeader: true, children: [ cellText("Désignation", { width: 6480, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true }), cellText("Quantité", { width: 1440, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }), cellText("Unité", { width: 1440, shading: COLOR_SUBTITLE, color: COLOR_WHITE, bold: true, align: AlignmentType.CENTER }) ] }) ];
                Object.keys(byCat).forEach(cat => {
                    fRows.push(new TableRow({ children: [new TableCell({ width: { size: 9360, type: WidthType.DXA }, columnSpan: 3, shading: { fill: COLOR_TABLE_LABEL, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: stdBorders, children: [new Paragraph({ children: [new TextRun({ text: cat, bold: true, italics: true, color: COLOR_TITLE, size: 20, font: FONT })] })] })] }));
                    byCat[cat].forEach(f => fRows.push(new TableRow({ children: [ cellText("• " + f.label, { width: 6480 }), cellText(String(f.qty), { width: 1440, align: AlignmentType.CENTER, bold: true }), cellText(f.unit, { width: 1440, align: AlignmentType.CENTER }) ] })));
                });
                children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [6480, 1440, 1440], rows: fRows }));
            }
            if (fLibre.trim()) { children.push(H("Autres fournitures", 2)); fLibre.split(/\n+/).forEach(line => { if (line.trim()) children.push(P("• " + line.trim())); }); }
            if (oLibre.trim()) { children.push(H("Outils nécessaires", 2)); oLibre.split(/\n+/).forEach(line => { if (line.trim()) children.push(P("• " + line.trim())); }); }
        }
        children.push(H("8. Mise en œuvre", 1));
        const dureeLabel = isTravaux ? "Durée des travaux réalisés" : "Temps de travaux estimé";
        const nacelleLabel = isTravaux ? "Nacelle utilisée ?" : "Nacelle à prévoir ?";
        const mevRows = [ ["Hauteur de travail max", val("hauteur_max") ? val("hauteur_max") + " m" : ""], ["Nombre d'intervenants", val("nb_techniciens")], [dureeLabel, val("duree_totale")], [nacelleLabel, radioVal("nacelle_prevoir")], ["Échelle / échafaudage", radioVal("echelle_prevoir")] ].filter(r => r[1] && r[1].trim());
        if (mevRows.length > 0) children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [4680, 4680], rows: mevRows.map(([k, v]) => new TableRow({ children: [ cellText(k, { width: 4680, shading: COLOR_TABLE_LABEL, bold: true }), cellText(v, { width: 4680 }) ] })) }));
        children.push(H(isTravaux ? "Synthèse d'intervention" : "9. Accès site & validation", 1));
        const acces = val("acces_site");
        const valide = val("solution_validee_par");
        const obs = val("observations");
        if (!isTravaux && acces.trim()) children.push(P([new TextRun({ text: "Conditions d'accès : ", bold: true, font: FONT, size: 22 }), new TextRun({ text: acces, font: FONT, size: 22 })]));
        if (valide.trim()) children.push(P([new TextRun({ text: "Solution validée par : ", bold: true, font: FONT, size: 22 }), new TextRun({ text: valide, font: FONT, size: 22 })]));
        if (obs.trim()) { children.push(H("Observations / Commentaires complémentaires", 2)); obs.split(/\n+/).forEach(line => { if (line.trim()) children.push(P(line.trim())); }); }
        const signNom = val("signataire_nom");
        const signDate = val("signataire_date");
        if (signNom || signDate) { children.push(P("")); children.push(P("")); children.push(P([new TextRun({ text: "Signataire : ", bold: true, font: FONT, size: 22 }), new TextRun({ text: signNom + (signDate ? "  —  " + signDate : ""), font: FONT, size: 22 })])); }
        const doc = new Document({
            creator: "IPKONEKT",
            title: titreRapport,
            description: titreRapport,
            styles: { default: { document: { run: { font: FONT, size: 20 } } } },
            sections: [{
                properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1080, bottom: 1080, left: 1080, header: 360, footer: 360 } } },
                headers: { default: new Header({ children: [new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680], borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } }, rows: [new TableRow({ children: [ new TableCell({ borders: noBorders, width: { size: 4680, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: (typeof LOGO_IPKONEKT_B64 !== "undefined") ? [new ImageRun({ data: b64(LOGO_IPKONEKT_B64), transformation: { width: 56, height: 50 }, type: "png" })] : [] })] }), new TableCell({ borders: noBorders, width: { size: 4680, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: (typeof LOGO_BOUYGUES_B64 !== "undefined") ? [new ImageRun({ data: b64(LOGO_BOUYGUES_B64), transformation: { width: 56, height: 56 }, type: "png" })] : [] })] }) ] })] })] }) },
                footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: "Document confidentiel — Usage interne IPKONEKT / Bouygues Telecom", italics: true, size: 16, color: "808080", font: FONT })] })] }) },
                children: children
            }]
        });
        const blob = await Packer.toBlob(doc);
        const filename = buildBaseFilename() + ".docx";
        saveAs(blob, filename);
        showStatus("✅ Rapport généré : " + filename, "success");
    } catch (err) {
        console.error(err);
        showStatus("❌ Erreur lors de la génération : " + err.message, "error");
    }
}
window.generateReport = generateReport;

async function renderPlanWithPoints(planId) {
    const planPhoto = photoStore[`plan_evac_${planId}`];
    const plan = getEvacPlanById(planId);
    if (!planPhoto || !planPhoto.dataUrl || !plan) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const card = getEvacPlanCardEl(planId);
            const wrap = card ? card.querySelector('.plan-evac-container') : null;
            const wrapRect = wrap ? wrap.getBoundingClientRect() : { width: img.naturalWidth, height: img.naturalHeight };
            const scaleX = img.naturalWidth  / Math.max(1, wrapRect.width);
            const scaleY = img.naturalHeight / Math.max(1, wrapRect.height);
            const scale = Math.max(scaleX, scaleY);
            plan.points.forEach((point) => {
                const colorHex = getMeasureColor(point.measureId);
                const hex = colorHex.replace("#", "");
                const r = parseInt(hex.substring(0,2), 16);
                const g = parseInt(hex.substring(2,4), 16);
                const b = parseInt(hex.substring(4,6), 16);
                const cx = (point.xPct / 100) * img.naturalWidth;
                const cy = (point.yPct / 100) * img.naturalHeight;
                const haloR = ((point.size || 80) / 2) * scale;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
                grad.addColorStop(0,    `rgba(${r},${g},${b},0.55)`);
                grad.addColorStop(0.4,  `rgba(${r},${g},${b},0.25)`);
                grad.addColorStop(0.75, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
                ctx.fill();
                const coreR = Math.max(6, 7 * scale);
                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.arc(cx, cy, coreR + 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = colorHex;
                ctx.beginPath();
                ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
                ctx.fill();
                const labelTxt = point.label || "•";
                const fontSize = Math.max(14, 14 * scale);
                ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                const metrics = ctx.measureText(labelTxt);
                const padX = 8, padY = 4;
                const labelW = metrics.width + padX * 2;
                const labelH = fontSize + padY * 2;
                const offsetX = coreR + 6;
                const offsetY = -(coreR + labelH + 6);
                const labelX = cx + offsetX;
                const labelY = cy + offsetY;
                ctx.fillStyle = "white";
                ctx.strokeStyle = "#1F4E79";
                ctx.lineWidth = 1.5;
                roundRectFill(ctx, labelX, labelY, labelW, labelH, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "#1F4E79";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(labelTxt, labelX + labelW / 2, labelY + labelH / 2);
            });
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(null);
        img.src = planPhoto.dataUrl;
    });
}

function roundRectFill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// =============================================================
//  RESET
// =============================================================
function resetForm() {
    if (!confirm("Réinitialiser le formulaire ? Toutes les données saisies seront perdues.")) return;
    document.querySelectorAll("input, textarea, select").forEach(el => {
        if (el.id === "modeIntervention") return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = false;
        else if (el.type !== "file") el.value = "";
    });
    setMode("audit");
    Object.keys(photoStore).forEach(k => delete photoStore[k]);
    document.querySelectorAll(".photo-preview").forEach(p => { p.src = ""; p.classList.remove("shown"); });
    document.querySelectorAll(".annotate-btn").forEach(b => b.disabled = true);
    document.querySelectorAll(".forfait-card").forEach(c => c.classList.remove("selected"));
    document.getElementById("measuresBody").innerHTML = "";
    document.getElementById("picoPosesList").innerHTML = "";
    document.getElementById("picoPhotoGrid").innerHTML = "";
    document.getElementById("quatraPhotoGrid").innerHTML = "";
    measureCounter = picoPoseCounter = picoPhotoCounter = quatraPhotoCounter = 0;
    addMeasureRow();
    addPicoPose();
    setupPicoPhotoBlocks();
    setupQuatraPhotoBlocks();
    clearPlan();
    updateSectionState();
    showStatus("Formulaire réinitialisé.", "success");
}
window.resetForm = resetForm;
