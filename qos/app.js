// ============================================================
//  FORMULAIRE AUDIT QOS — IPKONEKT
//  Audit des locaux techniques et des baies informatiques
//  (bâtiments > local technique > baies > switchs / onduleurs,
//  locaux secondaires SR, coffrets à créer ou remplacer,
//  rocades cuivre / fibre). Génère un rapport Word construit
//  sur le modèle « Rapport d'audit QOS ».
//
//  Mêmes briques que les autres formulaires : photoStore,
//  éditeur d'annotation (editor.js), autosave IndexedDB,
//  export / import JSON, génération Word (docx.umd.js),
//  envoi serveur via auth-upload.js.
//
//  Les parties dynamiques (bâtiments, baies, SR, coffrets, photos)
//  vivent dans l'objet `state` ; les champs fixes de l'en-tête
//  sont lus directement dans le DOM (par id).
// ============================================================

const photoStore = {};

// ---------- Couleurs du rapport Word ----------
const COLOR_TITLE    = "1F3864";
const COLOR_SUBTITLE = "2E75B6";
const COLOR_HEAD_ROW = "D9D9D9";
const COLOR_FOOTER   = "808080";

// ---------- État du formulaire ----------
function uid() { return Math.random().toString(36).slice(2, 9); }

function newFibre() {
    return { nb: "", connecteurs: { LC: false, SC: false, ST: false, FC: false }, jarretiere: { mono: false, multi: false } };
}
function newBaie() {
    return {
        id: uid(), open: true,
        usage: { distribution: false, voip: false, video: false, fai: false },
        typeU: "", dimensions: "",
        acces: { avant: false, arriere: false, cote: false },
        prises: "", uDispo: "", prisesLibres: "",
        fibre: newFibre(),
        commentaire: "", photos: [],
        switchs: { modele: "", nb: "", photos: [] },
        onduleur: { modele: "", va: "", w: "", photos: [] }
    };
}
function newSR() {
    return {
        id: uid(), open: true,
        emplacement: "", typeU: "", dimensions: "", uDispo: "", prises: "", prisesLibres: "",
        fibre: newFibre(), commentaire: "",
        switchs: { modele: "", nb: "" },
        onduleur: { modele: "", va: "", w: "", batterie: "", autonomie: "" },
        remarques: "", photos: []
    };
}
function newBatiment() {
    return {
        id: uid(), open: true, nom: "",
        local: { emplacement: "", clim: "", nbBaies: "", remarques: "", photos: [] },
        baies: [newBaie()], srs: []
    };
}
function newCoffret() {
    return { id: uid(), open: true, numero: "", emplacement: "", fibre: "", armoire: "", alim: "" };
}
function newState() {
    return { batiments: [newBatiment()], coffretsCrees: [], coffretsRempl: [], synthesePhotos: [] };
}
let state = newState();

function getAt(path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), state);
}
function setAt(path, value) {
    const ks = path.split(".");
    const last = ks.pop();
    const o = ks.reduce((acc, k) => (acc == null ? acc : acc[k]), state);
    if (o) o[last] = value;
}

// Complète un état importé (anciens exports, champs manquants) avec les valeurs par défaut
function mergeDefaults(target, defaults) {
    if (Array.isArray(defaults)) return Array.isArray(target) ? target : defaults;
    if (defaults && typeof defaults === "object") {
        const out = {};
        const t = (target && typeof target === "object") ? target : {};
        Object.keys(defaults).forEach(k => { out[k] = mergeDefaults(t[k], defaults[k]); });
        Object.keys(t).forEach(k => { if (!(k in out)) out[k] = t[k]; });
        return out;
    }
    return target === undefined || target === null ? defaults : target;
}
function normalizeState(raw) {
    const base = newState();
    const s = raw && typeof raw === "object" ? raw : {};
    const out = {
        batiments: Array.isArray(s.batiments) && s.batiments.length
            ? s.batiments.map(b => {
                const nb = mergeDefaults(b, newBatiment());
                nb.baies = (Array.isArray(b.baies) ? b.baies : []).map(x => mergeDefaults(x, newBaie()));
                nb.srs = (Array.isArray(b.srs) ? b.srs : []).map(x => mergeDefaults(x, newSR()));
                return nb;
            })
            : base.batiments,
        coffretsCrees: (Array.isArray(s.coffretsCrees) ? s.coffretsCrees : []).map(x => mergeDefaults(x, newCoffret())),
        coffretsRempl: (Array.isArray(s.coffretsRempl) ? s.coffretsRempl : []).map(x => mergeDefaults(x, newCoffret())),
        synthesePhotos: Array.isArray(s.synthesePhotos) ? s.synthesePhotos : []
    };
    return out;
}

// Clés photoStore référencées par un objet d'état (pour purger lors d'une suppression)
function photoKeysIn(obj) {
    const keys = [];
    (function walk(o) {
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (o && typeof o === "object") {
            if (typeof o.key === "string" && o.key.startsWith("qp_")) keys.push(o.key);
            Object.values(o).forEach(walk);
        }
    })(obj);
    return keys;
}
function purgePhotos(obj) {
    photoKeysIn(obj).forEach(k => {
        const p = photoStore[k];
        if (p && p._url) { try { URL.revokeObjectURL(p._url); } catch (_) {} }
        delete photoStore[k];
    });
}

// ---------- ATTENTE DES LIBRAIRIES ----------
function waitForLibs() {
    return new Promise((resolve) => {
        const check = () => {
            if (typeof window.docx !== 'undefined' && typeof window.saveAs !== 'undefined') resolve();
            else setTimeout(check, 100);
        };
        check();
    });
}

function schedule() { if (window.__autosaveSchedule) window.__autosaveSchedule(); }

// ============================================================
//  RENDU DES PARTIES DYNAMIQUES
// ============================================================
const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fText(label, path, o = {}) {
    return `<label class="qos-f${o.wide ? " wide" : ""}"><span>${label}</span>` +
        `<input type="${o.type || "text"}" data-path="${path}" value="${esc(getAt(path))}"` +
        `${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}` +
        `${o.inputmode ? ` inputmode="${o.inputmode}"` : ""}></label>`;
}
function fArea(label, path, o = {}) {
    return `<label class="qos-f wide"><span>${label}</span>` +
        `<textarea data-path="${path}" rows="${o.rows || 3}"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}>${esc(getAt(path))}</textarea></label>`;
}
function fChecks(label, base, items) {
    return `<fieldset class="qos-f qos-checks"><legend>${label}</legend>` +
        items.map(([k, l]) => `<label class="qos-check"><input type="checkbox" data-path="${base}.${k}"${getAt(base + "." + k) ? " checked" : ""}> ${l}</label>`).join("") +
        `</fieldset>`;
}
function fRadio(label, path, options) {
    const cur = getAt(path);
    return `<fieldset class="qos-f qos-checks"><legend>${label}</legend>` +
        options.map(v => `<label class="qos-check"><input type="radio" name="r_${path}" data-path="${path}" value="${v}"${cur === v ? " checked" : ""}> ${v}</label>`).join("") +
        `</fieldset>`;
}

// URL d'aperçu d'une photo (Blob) — régénérée quand l'éditeur remplace les octets
function photoUrl(key) {
    const p = photoStore[key];
    if (!p) return "";
    if (p._url && p._urlFor === p.data) return p._url;
    if (p._url) { try { URL.revokeObjectURL(p._url); } catch (_) {} }
    p._url = URL.createObjectURL(new Blob([p.data], { type: p.type === "png" ? "image/png" : "image/jpeg" }));
    p._urlFor = p.data;
    return p._url;
}

function photosBlock(title, path, note) {
    const list = getAt(path) || [];
    const items = list.map((ph, idx) => photoStore[ph.key] ? `
        <figure class="qos-photo">
            <img id="preview_${ph.key}" src="${photoUrl(ph.key)}" alt="">
            <figcaption>
                <button type="button" class="annotate-btn" data-act="annotate" data-key="${ph.key}">Annoter</button>
                <button type="button" class="clear-btn" data-act="delPhoto" data-path="${path}" data-idx="${idx}">Supprimer</button>
            </figcaption>
        </figure>` : "").join("");
    return `<div class="qos-photos">
        <div class="qos-photos-head">
            <strong>${title}</strong>
            <label class="qos-addphoto">+ Ajouter des photos
                <input type="file" accept="image/*" multiple data-photos="${path}">
            </label>
        </div>
        ${note ? `<p class="photo-cat-note">${note}</p>` : ""}
        ${items ? `<div class="qos-photo-grid">${items}</div>` : `<p class="qos-empty">Aucune photo.</p>`}
    </div>`;
}

function fibreHtml(p) {
    return `<div class="qos-grid">
        ${fText("Nombre de rocades / arrivées fibre", p + ".nb", { wide: true, placeholder: "Ex : 2 (tiroir optique SFR 12FO, boîtier mural Bouygues 6FO)" })}
        ${fChecks("Type de connecteur fibre", p + ".connecteurs", [["LC", "LC"], ["SC", "SC"], ["ST", "ST"], ["FC", "FC"]])}
        ${fChecks("Type de jarretière fibre", p + ".jarretiere", [["mono", "Monomode (OS1, OS2)"], ["multi", "Multimode (OM1 à OM5)"]])}
    </div>`;
}

function baieHtml(b, bp, j) {
    const p = `${bp}.baies.${j}`;
    return `<details class="qos-card qos-baie" data-open-path="${p}"${b.open !== false ? " open" : ""}>
        <summary><span>Baie informatique n°${j + 1}</span>
            <button type="button" class="btn-delete" data-act="delBaie" data-bp="${bp}" data-i="${j}" title="Supprimer cette baie"></button></summary>
        <div class="qos-body">
            <div class="qos-grid">
                ${fChecks("Usage de la baie", p + ".usage", [["distribution", "Distribution"], ["voip", "VOIP"], ["video", "Vidéo"], ["fai", "FAI"]])}
                ${fText("Type de baie en U", p + ".typeU", { placeholder: "Ex : 42 U, coffret mural 9 U" })}
                ${fText("Dimensions (H x L x P)", p + ".dimensions", { placeholder: "Ex : 2000 x 600 x 800 mm" })}
                ${fChecks("Type d'accès", p + ".acces", [["avant", "Face avant"], ["arriere", "Arrière"], ["cote", "Côté"]])}
                ${fText("Nombre et type de prises électriques", p + ".prises", { wide: true, placeholder: "Ex : 2 bandeaux PDU 19\" (6 prises 2P+T chacun)" })}
                ${fText("Nombre de U disponibles", p + ".uDispo", { inputmode: "numeric" })}
                ${fText("Nombre de prises électriques libres", p + ".prisesLibres", { inputmode: "numeric" })}
            </div>
            <h4 class="qos-h4">Rocade fibre</h4>
            ${fibreHtml(p + ".fibre")}
            ${fArea("Commentaires", p + ".commentaire", { placeholder: "Observations sur la baie (état, câblage existant, accessibilité...)" })}
            ${photosBlock("Photos de la baie", p + ".photos")}
            <h4 class="qos-h4">Switchs</h4>
            <div class="qos-grid">
                ${fText("Marque et modèle", p + ".switchs.modele", { placeholder: "Ex : Alcatel-Lucent OS6360-P48 (48 ports)" })}
                ${fText("Nombre de switchs actuels dans la baie", p + ".switchs.nb", { inputmode: "numeric" })}
            </div>
            ${photosBlock("Photos des switchs", p + ".switchs.photos")}
            <h4 class="qos-h4">Onduleur</h4>
            <div class="qos-grid">
                ${fText("Marque / modèle", p + ".onduleur.modele", { wide: true, placeholder: "Ex : Eaton 5PX 3000" })}
                ${fText("Capacité (VA)", p + ".onduleur.va", { inputmode: "numeric" })}
                ${fText("Capacité (W)", p + ".onduleur.w", { inputmode: "numeric" })}
            </div>
            ${photosBlock("Photos de l'onduleur", p + ".onduleur.photos")}
        </div>
    </details>`;
}

function srHtml(r, bp, k) {
    const p = `${bp}.srs.${k}`;
    return `<details class="qos-card qos-sr" data-open-path="${p}"${r.open !== false ? " open" : ""}>
        <summary><span>Baie / coffret informatique SR${k + 1}</span>
            <button type="button" class="btn-delete" data-act="delSR" data-bp="${bp}" data-i="${k}" title="Supprimer ce local secondaire"></button></summary>
        <div class="qos-body">
            <div class="qos-grid">
                ${fText("Emplacement / étage", p + ".emplacement")}
                ${fText("Type de baie / coffret en U", p + ".typeU")}
                ${fText("Dimensions (H x L x P)", p + ".dimensions")}
                ${fText("Nombre de U disponibles", p + ".uDispo", { inputmode: "numeric" })}
                ${fText("Nombre et type de prises électriques", p + ".prises", { wide: true })}
                ${fText("Nombre de prises électriques libres", p + ".prisesLibres", { inputmode: "numeric" })}
            </div>
            <h4 class="qos-h4">Rocade fibre</h4>
            ${fibreHtml(p + ".fibre")}
            ${fArea("Commentaires", p + ".commentaire")}
            <h4 class="qos-h4">Switchs</h4>
            <div class="qos-grid">
                ${fText("Marque et modèle", p + ".switchs.modele")}
                ${fText("Nombre de switchs actuels dans la baie", p + ".switchs.nb", { inputmode: "numeric" })}
            </div>
            <h4 class="qos-h4">Onduleurs</h4>
            <div class="qos-grid">
                ${fText("Marque / modèle", p + ".onduleur.modele", { wide: true })}
                ${fText("Capacité (VA)", p + ".onduleur.va", { inputmode: "numeric" })}
                ${fText("Capacité (W)", p + ".onduleur.w", { inputmode: "numeric" })}
                ${fText("Pourcentage batterie (load / capacity)", p + ".onduleur.batterie", { placeholder: "Ex : 35 % / 100 %" })}
                ${fText("Durée d'autonomie relevée (min)", p + ".onduleur.autonomie", { inputmode: "numeric" })}
            </div>
            ${fArea("Remarques / points particuliers", p + ".remarques")}
            ${photosBlock("Photos du SR" + (k + 1), p + ".photos")}
        </div>
    </details>`;
}

function batimentHtml(b, i) {
    const bp = `batiments.${i}`;
    return `<details class="qos-card qos-bat" data-open-path="${bp}"${b.open !== false ? " open" : ""}>
        <summary><span>Bâtiment n°${i + 1}${b.nom ? " — " + esc(b.nom) : ""}</span>
            <button type="button" class="btn-delete" data-act="delBat" data-i="${i}" title="Supprimer ce bâtiment"></button></summary>
        <div class="qos-body">
            ${fText("Nom du bâtiment (facultatif)", bp + ".nom", { placeholder: "Ex : bâtiment principal" })}
            <h3 class="qos-h3">Local technique</h3>
            <div class="qos-grid">
                ${fText("Emplacement du local technique", bp + ".local.emplacement", { placeholder: "Ex : -1, RDC, étage 2" })}
                ${fRadio("Climatisation", bp + ".local.clim", ["Oui", "Non"])}
                ${fText("Nombre de baies informatiques", bp + ".local.nbBaies", { placeholder: "Ex : 2 (1 baie au sol + 1 coffret mural)" })}
                ${fArea("Remarques / points particuliers", bp + ".local.remarques")}
            </div>
            ${photosBlock("Photos du local", bp + ".local.photos")}
            <h3 class="qos-h3">Baies informatiques</h3>
            ${b.baies.map((x, j) => baieHtml(x, bp, j)).join("")}
            <button type="button" class="btn-secondary" data-act="addBaie" data-bp="${bp}">+ Ajouter une baie</button>
            <h3 class="qos-h3">Locaux secondaires (SR)</h3>
            <p class="photo-cat-note">Sous-répartiteurs, baies ou coffrets des autres locaux du bâtiment (si existants).</p>
            ${b.srs.map((x, k) => srHtml(x, bp, k)).join("")}
            <button type="button" class="btn-secondary" data-act="addSR" data-bp="${bp}">+ Ajouter un local secondaire (SR)</button>
        </div>
    </details>`;
}

function coffretHtml(c, listPath, i, kind) {
    const p = `${listPath}.${i}`;
    return `<details class="qos-card" data-open-path="${p}"${c.open !== false ? " open" : ""}>
        <summary><span>${kind === "crees" ? "Ajout du coffret" : "Remplacement du coffret"} n°${i + 1}</span>
            <button type="button" class="btn-delete" data-act="delCoffret" data-list="${listPath}" data-i="${i}" title="Supprimer"></button></summary>
        <div class="qos-body"><div class="qos-grid">
            ${fText("Numéro du nouveau coffret / SR", p + ".numero")}
            ${fText("Emplacement", p + ".emplacement")}
            ${fText("Longueur de la liaison fibre (m)", p + ".fibre", { inputmode: "decimal" })}
            ${fText("Armoire électrique de raccordement", p + ".armoire")}
            ${fText("Longueur de l'alimentation électrique (m)", p + ".alim", { inputmode: "decimal" })}
        </div></div>
    </details>`;
}

function renderAll() {
    const y = window.scrollY;
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set("batimentsContainer", state.batiments.map(batimentHtml).join(""));
    set("coffretsCreesContainer", state.coffretsCrees.map((c, i) => coffretHtml(c, "coffretsCrees", i, "crees")).join(""));
    set("coffretsRemplContainer", state.coffretsRempl.map((c, i) => coffretHtml(c, "coffretsRempl", i, "rempl")).join(""));
    set("synthesePhotosContainer", photosBlock("Photos / médias complémentaires", "synthesePhotos"));
    window.scrollTo(0, y);
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
//  ÉVÉNEMENTS
// ============================================================
function onField(e) {
    const el = e.target.closest ? e.target.closest("[data-path]") : null;
    if (!el) return;
    const p = el.dataset.path;
    if (el.type === "checkbox") setAt(p, el.checked);
    else if (el.type === "radio") { if (el.checked) setAt(p, el.value); }
    else setAt(p, el.value);
    // Titre du bâtiment mis à jour en direct
    if (/^batiments\.\d+\.nom$/.test(p)) {
        const i = parseInt(p.split(".")[1], 10);
        const sp = el.closest("details")?.querySelector(":scope > summary > span");
        if (sp) sp.textContent = `Bâtiment n°${i + 1}${el.value ? " — " + el.value : ""}`;
    }
}

async function onPhotosChosen(input) {
    const path = input.dataset.photos;
    const files = Array.from(input.files || []);
    input.value = "";
    const list = getAt(path);
    if (!files.length || !Array.isArray(list)) return;
    for (const file of files) {
        const key = "qp_" + uid() + uid();
        await processPhoto(file, key);
        if (photoStore[key]) list.push({ key });
    }
    renderAll();
    schedule();
}

function handleClick(e) {
    const btn = e.target.closest("[data-act]");
    if (btn) {
        e.preventDefault();          // évite le repli du <details> quand le bouton est dans <summary>
        e.stopPropagation();
        const act = btn.dataset.act;
        const i = parseInt(btn.dataset.i, 10);
        if (act === "annotate") {
            const key = btn.dataset.key;
            if (!photoStore[key]) { alert("Photo introuvable."); return; }
            if (window.Editor && window.Editor.open) window.Editor.open(key, "Photo");
            else alert("L'éditeur d'annotation n'est pas chargé.");
            return;
        }
        if (act === "delPhoto") {
            const list = getAt(btn.dataset.path);
            const idx = parseInt(btn.dataset.idx, 10);
            if (Array.isArray(list) && list[idx] && confirm("Supprimer cette photo ?")) {
                purgePhotos(list[idx]);
                list.splice(idx, 1);
                renderAll(); schedule();
            }
            return;
        }
        if (act === "addBaie")  { getAt(btn.dataset.bp).baies.push(newBaie()); renderAll(); schedule(); return; }
        if (act === "addSR")    { getAt(btn.dataset.bp).srs.push(newSR()); renderAll(); schedule(); return; }
        if (act === "delBaie") {
            const b = getAt(btn.dataset.bp);
            if (confirm("Supprimer cette baie et ses photos ?")) { purgePhotos(b.baies[i]); b.baies.splice(i, 1); renderAll(); schedule(); }
            return;
        }
        if (act === "delSR") {
            const b = getAt(btn.dataset.bp);
            if (confirm("Supprimer ce local secondaire et ses photos ?")) { purgePhotos(b.srs[i]); b.srs.splice(i, 1); renderAll(); schedule(); }
            return;
        }
        if (act === "delBat") {
            if (state.batiments.length <= 1) { alert("Il faut conserver au moins un bâtiment."); return; }
            if (confirm("Supprimer ce bâtiment, ses baies et ses photos ?")) { purgePhotos(state.batiments[i]); state.batiments.splice(i, 1); renderAll(); schedule(); }
            return;
        }
        if (act === "delCoffret") {
            const list = getAt(btn.dataset.list);
            if (confirm("Supprimer ce coffret ?")) { list.splice(i, 1); renderAll(); schedule(); }
            return;
        }
        return;
    }

    // Boutons statiques (ajout bâtiment / coffrets)
    const id = e.target.closest("button") ? e.target.closest("button").id : "";
    if (id === "addBatimentBtn")     { state.batiments.push(newBatiment()); renderAll(); schedule(); }
    if (id === "addCoffretCreeBtn")  { state.coffretsCrees.push(newCoffret()); renderAll(); schedule(); }
    if (id === "addCoffretReplBtn")  { state.coffretsRempl.push(newCoffret()); renderAll(); schedule(); }

    // Logo client (statique)
    const clr = e.target.closest("[data-clear]");
    if (clr) {
        const key = clr.dataset.clear;
        delete photoStore[key];
        const prev = document.getElementById("preview_" + key);
        if (prev) { prev.removeAttribute("src"); prev.classList.remove("shown"); }
        schedule();
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await waitForLibs();

    const today = new Date().toISOString().slice(0, 10);
    ["date_audit", "date_creation"].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    document.body.addEventListener("click", handleClick);
    document.body.addEventListener("input", onField);
    document.body.addEventListener("change", (e) => {
        onField(e);
        const t = e.target;
        if (t.matches && t.matches("input[data-photos]")) onPhotosChosen(t);
        if (t.matches && t.matches("input[data-photo-input]")) {
            const file = t.files && t.files[0];
            if (file) processPhoto(file, t.dataset.photoInput);
        }
    });
    // Mémorise les blocs repliés / dépliés (l'événement toggle ne remonte pas : capture)
    document.body.addEventListener("toggle", (e) => {
        const d = e.target;
        if (d && d.matches && d.matches("details[data-open-path]")) {
            const o = getAt(d.dataset.openPath);
            if (o && typeof o === "object") o.open = d.open;
        }
    }, true);

    const restored = await AUTOSAVE.restore();
    if (!restored) renderAll();
    AUTOSAVE.attach();
});

// ============================================================
//  COLLECTE / APPLICATION DES DONNÉES (export, import, autosave)
// ============================================================
function collectFormData() {
    const data = {
        version: "qos-v1",
        exportedAt: new Date().toISOString(),
        fields: {}, radios: {}, checkboxes: {},
        state: JSON.parse(JSON.stringify(state)),
        photos: {}
    };
    document.querySelectorAll("input[id], textarea[id], select[id]").forEach(el => {
        if (el.type === "file" || el.type === "radio") return;
        if (el.type === "checkbox") { data.checkboxes[el.id] = el.checked; return; }
        data.fields[el.id] = el.value;
    });
    document.querySelectorAll('input[type="radio"][name]:checked').forEach(el => {
        if (!el.dataset.path) data.radios[el.name] = el.value;   // radios statiques uniquement
    });
    Object.keys(photoStore).forEach(k => {
        const p = photoStore[k];
        data.photos[k] = {
            type: p.type, dataUrl: p.dataUrl,
            originalDataUrl: p.originalDataUrl || null,
            annotations: p.annotations || null,
            annotated: !!p.annotated
        };
    });
    return data;
}

async function applyFormData(data) {
    if (!data || typeof data !== "object") return;
    if (data.fields) Object.keys(data.fields).forEach(id => {
        const el = document.getElementById(id);
        if (el && el.type !== "file") el.value = data.fields[id];
    });
    if (data.checkboxes) Object.keys(data.checkboxes).forEach(id => {
        const el = document.getElementById(id);
        if (el && el.type === "checkbox") el.checked = !!data.checkboxes[id];
    });
    if (data.radios) Object.keys(data.radios).forEach(name => {
        const el = document.querySelector(`input[type="radio"][name="${name}"][value="${data.radios[name]}"]`);
        if (el) el.checked = true;
    });

    // Photos (ré-encodage JPEG propre pour un docx toujours valide)
    Object.keys(photoStore).forEach(k => {
        if (photoStore[k]._url) { try { URL.revokeObjectURL(photoStore[k]._url); } catch (_) {} }
        delete photoStore[k];
    });
    if (data.photos) {
        await Promise.all(Object.entries(data.photos).map(async ([k, p]) => {
            if (!p || !p.dataUrl) return;
            try {
                const n = await _renormalizeDataUrl(p.dataUrl);
                photoStore[k] = {
                    data: n.bytes, type: "jpg", dataUrl: n.dataUrl,
                    naturalWidth: n.width, naturalHeight: n.height,
                    originalDataUrl: p.originalDataUrl || null,
                    annotations: p.annotations || null, annotated: !!p.annotated
                };
            } catch (err) {
                console.warn("Photo non re-normalisable (" + k + ") :", err);
                photoStore[k] = {
                    data: dataUrlToUint8Array(p.dataUrl), type: p.type || "jpg", dataUrl: p.dataUrl,
                    originalDataUrl: p.originalDataUrl || null,
                    annotations: p.annotations || null, annotated: !!p.annotated
                };
            }
            const prev = document.getElementById("preview_" + k);
            if (prev) { prev.src = photoStore[k].dataUrl; prev.classList.add("shown"); }
        }));
    }

    state = normalizeState(data.state);
    renderAll();
}

// ---------- EXPORT / IMPORT JSON ----------
function qosFileBase() {
    const site = (document.getElementById("raison_sociale")?.value || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
    const date = document.getElementById("date_audit")?.value || new Date().toISOString().slice(0, 10);
    return { site, date };
}

window.exportJSON = function () {
    try {
        const data = collectFormData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const { site, date } = qosFileBase();
        saveAs(blob, `Audit_QOS_${site}_${date}.json`);
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
            await applyFormData(JSON.parse(e.target.result));
            alert("Données importées avec succès.");
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
//  GÉNÉRATION DU RAPPORT WORD (modèle « Rapport d'audit QOS »)
//  Page de couverture, table des matières, bâtiments (local
//  technique, baies, locaux secondaires SR), coffrets, rocades,
//  synthèse. Format A4, moteur docx.umd.js.
// ============================================================
async function generateDocument() {
    const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
        Header, Footer, AlignmentType, WidthType, BorderStyle, VerticalAlign, ShadingType,
        HeadingLevel, PageNumber, PageBreak, TabStopType
    } = window.docx;

    const b64 = (s) => {
        const bin = atob(s);
        const res = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) res[i] = bin.charCodeAt(i);
        return res;
    };
    const val = (id) => {
        const el = document.getElementById(id);
        return el && el.value ? el.value.trim() : "";
    };
    const fmtDate = (iso) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "");
    };
    const radioVal = (name) => {
        const el = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
        return el ? el.value : "";
    };

    // ---------- Constantes de mise en page (A4) ----------
    const PAGE = { width: 11906, height: 16838 };
    const MARGIN = { top: 1666, right: 849, bottom: 1417, left: 1134, header: 426, footer: 400 };
    const TW = PAGE.width - MARGIN.left - MARGIN.right;   // largeur utile en DXA
    const HALF = Math.floor(TW / 2);
    const FONT = "Calibri";
    const SERIF = "Times New Roman";

    const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
    const borders = { top: line, bottom: line, left: line, right: line };
    const noLine = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const noBorders = { top: noLine, bottom: noLine, left: noLine, right: noLine };
    const cellMargins = { top: 60, bottom: 60, left: 120, right: 120 };

    // ---------- Paragraphes / cellules ----------
    const run = (text, o = {}) => new TextRun({
        text: text == null ? "" : String(text),
        bold: !!o.bold, italics: !!o.italics, underline: o.underline ? {} : undefined,
        size: o.size || 20, color: o.color, font: o.font || FONT
    });
    const textParas = (text, o = {}) => {
        const lines = String(text == null ? "" : text).split(/\r?\n/);
        return lines.map(l => new Paragraph({
            alignment: o.align, spacing: { before: 20, after: 20 }, keepNext: !!o.keepNext,
            children: [run(l, o)]
        }));
    };
    const P = (text, o = {}) => new Paragraph({
        alignment: o.align, spacing: o.spacing || { before: 60, after: 60 }, keepNext: !!o.keepNext,
        children: [run(text, o)]
    });
    const spacer = (n = 120) => new Paragraph({ spacing: { before: 0, after: n }, children: [] });

    const headRow = (title, span = 2) => new TableRow({
        cantSplit: true, tableHeader: false,
        children: [new TableCell({
            columnSpan: span, borders, margins: cellMargins,
            shading: { fill: COLOR_HEAD_ROW, type: ShadingType.CLEAR, color: "auto" },
            children: textParas(title, { bold: true, align: AlignmentType.CENTER, keepNext: true })
        })]
    });
    const kvRow = (label, value, o = {}) => new TableRow({
        cantSplit: true,
        children: [
            new TableCell({
                width: { size: HALF, type: WidthType.DXA }, borders, margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
                children: textParas(label, { bold: true })
            }),
            new TableCell({
                width: { size: TW - HALF, type: WidthType.DXA }, borders, margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
                children: textParas(value, o)
            })
        ]
    });
    const wideRow = (label, text) => new TableRow({
        cantSplit: false,
        children: [new TableCell({
            columnSpan: 2, borders, margins: cellMargins,
            children: [...(label ? textParas(label, { bold: true }) : []), ...textParas(text || "", {})]
        })]
    });
    const table = (rows) => new Table({
        width: { size: TW, type: WidthType.DXA }, columnWidths: [HALF, TW - HALF], rows
    });

    const chk = (label, on) => `${on ? "☒" : "☐"}  ${label}`;
    const joinChk = (items) => items.map(([l, on]) => chk(l, !!on)).join(" / ");
    const yesNo = (v) => `${v === "Oui" ? "☒" : "☐"}  Oui    /  ${v === "Non" ? "☒" : "☐"}  Non`;
    const unit = (v, u) => (String(v || "").trim() ? `${String(v).trim()} ${u}` : "");

    // ---------- Photos : grille 2 colonnes, ratio conservé ----------
    const photoDims = (photo, maxW, maxH) => {
        const w = photo.naturalWidth || 4, h = photo.naturalHeight || 3;
        const r = Math.min(maxW / w, maxH / h, 1);
        return { width: Math.max(1, Math.round(w * r)), height: Math.max(1, Math.round(h * r)) };
    };
    const photoCell = (key) => {
        const p = photoStore[key];
        return new TableCell({
            width: { size: HALF, type: WidthType.DXA }, borders, margins: { top: 100, bottom: 100, left: 100, right: 100 },
            verticalAlign: VerticalAlign.CENTER,
            children: [p ? new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new ImageRun({ data: p.data, transformation: photoDims(p, 300, 230), type: p.type })]
            }) : new Paragraph({ children: [] })]
        });
    };
    const photoGrid = (list) => {
        const keys = (list || []).map(x => x.key).filter(k => photoStore[k]);
        if (!keys.length) return [];
        const rows = [];
        for (let i = 0; i < keys.length; i += 2) {
            const a = photoCell(keys[i]);
            const b = keys[i + 1] ? photoCell(keys[i + 1]) : new TableCell({
                width: { size: HALF, type: WidthType.DXA }, borders, children: [new Paragraph({ children: [] })]
            });
            rows.push(new TableRow({ cantSplit: true, children: [a, b] }));
        }
        return [new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [HALF, TW - HALF], rows }), spacer(120)];
    };

    // ---------- Titres (numérotation manuelle, mémorisée pour la table des matières) ----------
    const outline = [];
    const heading = (level, num, text, pageBreakBefore) => {
        outline.push({ level, text: `${num}  ${text}` });
        const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
        return new Paragraph({
            heading: levels[level - 1], pageBreakBefore: !!pageBreakBefore, keepNext: true, keepLines: true,
            children: [new TextRun({ text: `${num}   ${text}`, font: SERIF })]
        });
    };

    // ---------- Blocs fibre / baies ----------
    const fibreRows = (f) => [
        headRow("Rocade Fibre"),
        kvRow("Nombre de rocades / arrivées fibre", f.nb),
        kvRow("Type de connecteur fibre sur la/les rocade(s)", joinChk([["LC", f.connecteurs.LC], ["SC", f.connecteurs.SC], ["ST", f.connecteurs.ST], ["FC", f.connecteurs.FC]])),
        kvRow("Type de jarretière fibre", `${chk("Monomode (OS1, OS2)", f.jarretiere.mono)}\n${chk("Multimode (OM1, OM2, OM3, OM4, OM5)", f.jarretiere.multi)}`)
    ];
    const capacite = (o) => {
        const va = String(o.va || "").trim(), w = String(o.w || "").trim();
        return (va || w) ? `${va || "…"} VA (${w || "…"} W)` : "";
    };

    const baieBlock = (b, num) => {
        const out = [];
        out.push(table([
            headRow(`Baie informatique n°${num}`),
            kvRow("Baie informatique", joinChk([["Distribution", b.usage.distribution], ["VOIP", b.usage.voip], ["Vidéo", b.usage.video], ["FAI", b.usage.fai]])),
            kvRow("Type de baie en U", b.typeU),
            kvRow("Dimensions de la baie (Hauteur x Largeur x Profondeur)", b.dimensions),
            kvRow("Type d'accès : face avant ? Arrière ? Côté ?", joinChk([["Face avant", b.acces.avant], ["Arrière", b.acces.arriere], ["Côté", b.acces.cote]])),
            kvRow("Nombre et type de prises électriques", b.prises),
            kvRow("Nombre de U disponibles", b.uDispo),
            kvRow("Nombre de prises électriques libres", b.prisesLibres),
            ...fibreRows(b.fibre),
            wideRow("Commentaires", b.commentaire)
        ]));
        out.push(...photoGrid(b.photos));
        out.push(spacer(80));
        out.push(table([
            headRow("Switchs"),
            kvRow("Marque et modèle", b.switchs.modele),
            kvRow("Nombre de switchs actuels dans la baie", b.switchs.nb)
        ]));
        out.push(...photoGrid(b.switchs.photos));
        out.push(spacer(80));
        out.push(table([
            headRow("Onduleur"),
            kvRow("Marque / modèle", b.onduleur.modele),
            kvRow("Capacité", capacite(b.onduleur))
        ]));
        out.push(...photoGrid(b.onduleur.photos));
        return out;
    };

    const srBlock = (r, num) => {
        const out = [];
        out.push(table([
            headRow(`SR n°${num}`),
            kvRow("Emplacement / étage", r.emplacement),
            kvRow("Type de baie / coffret en U", r.typeU),
            kvRow("Dimensions de la baie / coffret (Hauteur x Largeur x Profondeur)", r.dimensions),
            kvRow("Nombre de U disponibles", r.uDispo),
            kvRow("Nombre et type de prises électriques", r.prises),
            kvRow("Nombre de prises électriques libres", r.prisesLibres),
            ...fibreRows(r.fibre),
            wideRow("Commentaires", r.commentaire),
            headRow("Switchs"),
            kvRow("Marque et modèle", r.switchs.modele),
            kvRow("Nombre de switchs actuels dans la baie", r.switchs.nb),
            headRow("Onduleurs"),
            kvRow("Marque / modèle", r.onduleur.modele),
            kvRow("Capacité", capacite(r.onduleur)),
            kvRow("Pourcentage batterie (load / capacity)", r.onduleur.batterie),
            kvRow("Relevé de la durée d'autonomie", unit(r.onduleur.autonomie, "min")),
            wideRow("Remarques / points particuliers", r.remarques)
        ]));
        out.push(spacer(60));
        out.push(P(`Photos du SR${num} :`, { bold: true, underline: true, keepNext: true }));
        out.push(...photoGrid(r.photos));
        return out;
    };

    // ============================================================
    //  CONTENU (le sommaire est construit ensuite depuis `outline`)
    // ============================================================
    const content = [];
    state.batiments.forEach((b, i) => {
        const n = i + 1;
        const title = b.nom ? `Bâtiment n°${n} — ${b.nom}` : `Bâtiment n°${n}`;
        content.push(heading(1, `${n}`, title, i > 0));

        content.push(heading(2, `${n}.1`, "Local technique"));
        const nbBaies = (b.local.nbBaies || "").trim() || String(b.baies.length);
        content.push(table([
            headRow("Local Technique"),
            kvRow("Emplacement du local technique", b.local.emplacement),
            kvRow("Climatisation (oui / non)", yesNo(b.local.clim)),
            kvRow("Nombre de baies informatiques", nbBaies),
            kvRow("Remarques / points particuliers", b.local.remarques)
        ]));
        content.push(spacer(80));
        content.push(P("Photos du local :", { bold: true, underline: true, keepNext: true }));
        content.push(...photoGrid(b.local.photos));

        content.push(heading(2, `${n}.2`, "Baies informatiques"));
        content.push(P("Relever les caractéristiques techniques des baies et les équipements présents dans celles-ci :"));
        if (!b.baies.length) content.push(P("(Aucune baie renseignée.)", { italics: true, color: "888888" }));
        b.baies.forEach((x, j) => {
            content.push(heading(3, `${n}.2.${j + 1}`, `Baie informatique n°${j + 1}`));
            content.push(...baieBlock(x, j + 1));
        });

        content.push(heading(2, `${n}.3`, "Audit Locaux secondaires SR"));
        if (!b.srs.length) content.push(P("(Aucun local secondaire renseigné.)", { italics: true, color: "888888" }));
        else content.push(P("Relever les caractéristiques techniques des baies et les équipements présents dans celles-ci :"));
        b.srs.forEach((r, k) => {
            content.push(heading(3, `${n}.3.${k + 1}`, `Baie/coffret informatique SR${k + 1}`));
            content.push(...srBlock(r, k + 1));
        });
    });

    // --- Coffrets à créer / remplacer ---
    let sec = state.batiments.length + 1;
    content.push(heading(1, `${sec}`, "Création et/ou remplacement d'un coffret informatique", true));
    content.push(heading(2, `${sec}.1`, "Création de coffrets informatique"));
    content.push(P("Afin de respecter la norme de câblage ne permettant pas de dépasser 90 m pour les prises RJ ou dû au manque de place dans les coffrets existants, préciser s'il sera nécessaire d'ajouter des coffrets informatiques. Si c'est le cas, préciser la longueur de fibre optique nécessaire et la longueur de l'alimentation électrique qui doit être mise en place pour le coffret."));
    if (!state.coffretsCrees.length) content.push(P("Aucun coffret à créer.", { italics: true, color: "888888" }));
    const coffretTable = (c, i, label) => table([
        headRow(`${label} N°${i + 1}`),
        kvRow("Numéro du nouveau coffret / SR", c.numero),
        kvRow("Emplacement", c.emplacement),
        kvRow("Longueur de la liaison fibre", unit(c.fibre, "m")),
        kvRow("Armoire électrique de raccordement", c.armoire),
        kvRow("Longueur de l'alimentation électrique", unit(c.alim, "m"))
    ]);
    state.coffretsCrees.forEach((c, i) => { content.push(coffretTable(c, i, "AJOUT DU COFFRET")); content.push(spacer(100)); });

    content.push(heading(2, `${sec}.2`, "Remplacement coffrets informatiques"));
    content.push(P("Lors de l'audit, relever les coffrets avec une profondeur inférieure à 45 cm qui ne permettraient pas d'intégrer correctement les nouveaux switches. Si c'est le cas, préciser l'emplacement du coffret à remplacer et les caractéristiques du nouveau coffret."));
    if (!state.coffretsRempl.length) content.push(P("Aucun coffret à remplacer.", { italics: true, color: "888888" }));
    state.coffretsRempl.forEach((c, i) => { content.push(coffretTable(c, i, "REMPLACEMENT DU COFFRET")); content.push(spacer(100)); });

    // --- Rocades ---
    sec++;
    content.push(heading(1, `${sec}`, "Remplacement des rocades cuivre/fibre"));
    content.push(P("Lors de l'audit, relever les rocades entre les sous-répartiteurs et le local principal autocom qui ne sont pas en fibre."));
    const rc = radioVal("rocade_cuivre"), rf = radioVal("rocade_fibre");
    const oui = (v) => `${v === "Oui" ? "☒" : "☐"}  OUI  /  ${v === "Non" ? "☒" : "☐"}  NON`;
    content.push(P(`Rocade(s) cuivre à remplacer : ${oui(rc)}`, { bold: true }));
    content.push(P(`Quantité : ${val("rocade_cuivre_qte")}`));
    content.push(P(`Rocade(s) fibre à remplacer : ${oui(rf)}`, { bold: true }));
    content.push(P(`Quantité : ${val("rocade_fibre_qte")}`));

    // --- Synthèse ---
    sec++;
    content.push(heading(1, `${sec}`, "Synthèse des actions à mener/Remarques particulières"));
    content.push(P("Annoter ici toutes remarques / commentaires / médias particuliers supplémentaires :", { italics: true }));
    const synth = val("synthese_texte");
    if (synth) content.push(table([wideRow("", synth)]));
    content.push(spacer(80));
    content.push(...photoGrid(state.synthesePhotos));

    // ============================================================
    //  COUVERTURE
    // ============================================================
    const dateAudit = fmtDate(val("date_audit"));
    const siteName = val("raison_sociale");
    const cpVille = [val("code_postal"), val("ville")].filter(Boolean).join(" ");
    const siteLine = ["Site de " + siteName, cpVille].filter(s => s && s !== "Site de ").join(" – ");
    const coverTitle = (txt, before) => new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: before || 0, after: 0 },
        children: [new TextRun({ text: txt, font: SERIF, size: 56 })]
    });
    const cover = [
        new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { before: 600, after: 600 },
            children: [new ImageRun({ data: b64(LOGO_QOS_B64), transformation: { width: 260, height: Math.round(260 * LOGO_QOS_SIZE.height / LOGO_QOS_SIZE.width) }, type: "jpg" })]
        }),
        coverTitle("Rapport d'audit"),
        coverTitle(dateAudit ? `Le ${dateAudit}` : ""),
        coverTitle(siteLine),
        new Paragraph({
            spacing: { before: 400, after: 400 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR_SUBTITLE, space: 1 } },
            children: []
        })
    ];
    const logoClient = photoStore["logo_client"];
    if (logoClient) {
        cover.push(new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { before: 300, after: 0 },
            children: [new ImageRun({ data: logoClient.data, transformation: photoDims(logoClient, 260, 240), type: logoClient.type })]
        }));
    }

    // ============================================================
    //  TABLE DES MATIÈRES (liste des titres ; pas de numéros de page :
    //  un vrai sommaire Word demanderait une mise à jour des champs à l'ouverture)
    // ============================================================
    const toc = [new Paragraph({
        heading: HeadingLevel.TITLE, spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: "TABLE DES MATIERES", font: SERIF, bold: true, size: 28, color: COLOR_TITLE })]
    })];
    outline.forEach(o => {
        toc.push(new Paragraph({
            spacing: { before: o.level === 1 ? 140 : 30, after: 20 },
            indent: { left: (o.level - 1) * 360 },
            children: [new TextRun({ text: o.text, font: FONT, size: o.level === 1 ? 22 : 20, bold: o.level === 1 })]
        }));
    });
    toc.push(new Paragraph({ children: [new PageBreak()] }));

    // ============================================================
    //  EN-TÊTE / PIED DE PAGE
    // ============================================================
    const reference = val("reference_client") || siteName;
    const header = new Header({ children: [new Paragraph({
        children: [new ImageRun({ data: b64(LOGO_IPKONEKT_B64), transformation: { width: 60, height: 54 } })]
    })] });
    const footer = new Footer({ children: [
        new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 24, color: COLOR_TITLE, space: 4 } },
            tabStops: [{ type: TabStopType.RIGHT, position: TW }],
            children: [
                new TextRun({ text: `Référence : ${reference} / Rapport d'audit`, size: 16, font: FONT, color: COLOR_FOOTER }),
                new TextRun({ text: "\tPage ", size: 16, font: FONT, color: COLOR_FOOTER }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: COLOR_FOOTER })
            ]
        }),
        new Paragraph({ children: [new TextRun({ text: `Création : ${fmtDate(val("date_creation"))}`, size: 16, font: FONT, color: COLOR_FOOTER })] })
    ] });

    const pageProps = { page: { size: { width: PAGE.width, height: PAGE.height }, margin: MARGIN } };
    const doc = new Document({
        creator: "IPKONEKT",
        title: `Rapport d'audit — ${siteName}`,
        styles: {
            default: { document: { run: { font: FONT, size: 20 } } },
            paragraphStyles: [
                { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
                  run: { font: SERIF, size: 28, bold: true, color: COLOR_TITLE }, paragraph: { spacing: { before: 360, after: 160 } } },
                { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
                  run: { font: SERIF, size: 24, bold: true, color: "000000" }, paragraph: { spacing: { before: 280, after: 120 } } },
                { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
                  run: { font: SERIF, size: 22, bold: true, underline: {}, color: "000000" }, paragraph: { spacing: { before: 220, after: 100 } } }
            ]
        },
        sections: [
            { properties: pageProps, children: cover },
            { properties: pageProps, headers: { default: header }, footers: { default: footer }, children: [...toc, ...content] }
        ]
    });

    const blob = await Packer.toBlob(doc);
    const { site, date } = qosFileBase();
    saveAs(blob, `Rapport_Audit_QOS_${site}_${date}.docx`);
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
//  base dédiée "qos" (indépendante des autres formulaires).
// ============================================================
const AUTOSAVE = (() => {
    const DB_NAME = "qos";
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
    function _hasContent(o) {
        if (Array.isArray(o)) return o.some(_hasContent);
        if (o && typeof o === "object") {
            return Object.entries(o).some(([k, v]) => k !== "id" && k !== "open" && _hasContent(v));
        }
        return o === true || (typeof o === "string" && o.trim() !== "");
    }
    function _isEmptyData(d) {
        if (!d) return true;
        const hasField = d.fields && Object.entries(d.fields).some(([k, v]) => !/^date_/.test(k) && String(v || "").trim() !== "");
        const hasPhoto = d.photos && Object.keys(d.photos).length > 0;
        return !hasField && !hasPhoto && !_hasContent(d.state);
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
