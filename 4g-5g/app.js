// ============================================================
//  AUDIT 4G/5G — VERSION COMPLÈTE (Style Starlink)
//  Génération Word identique au template Starlink validé
// ============================================================

const photoStore = {};
// Compteurs séparés par techno (pour numérotation interne stable)
let measureCounter4G = 0;
let measureCounter5G = 0;
let cheminementCounter = 0;

// MOD 1 — État des NIVEAUX / ÉTAGES de mesures.
// Chaque niveau possède un bloc 4G et un bloc 5G. La numérotation des points
// (measureCounter4G/5G) reste GLOBALE et continue à travers les niveaux, pour
// que les pointId ("4g-1", "5g-2"...) demeurent uniques et stables — c'est sur
// eux que reposent photoStore, evacPoints et la génération Word.
let measureLevelCounter = 0;

// État des plans d'évacuation (multi-plans : un par étage / niveau)
// Chaque plan : { id: number, title: string, points: [{pointId, leftPct, topPct, size, ...}] }
// Les photos sont stockées dans photoStore avec la clé "evac_plan_<id>"
let evacPlans = [];
let evacPlanCounter = 0;

// ---------- Couleurs / constantes du style Starlink ----------
const COLOR_TITLE       = "1F3864"; // bleu marine titres
const COLOR_SUBTITLE    = "2E75B6"; // bleu sous-titres 2.1 -
const COLOR_TABLE_LABEL = "F2F2F2"; // gris clair (libellés)
const COLOR_PHOTO_BG    = "DEEBF7"; // bleu pâle (bandeau photo)
const COLOR_PHOTO_BORDER= "BDD7EE";
const COLOR_BORDER      = "BFBFBF";
const COLOR_FOOTER      = "808080";
const COLOR_WHITE       = "FFFFFF";

// Couleurs accent par techno (pour pickers et titres)
const TECH_COLOR_4G = "2E75B6";
const TECH_COLOR_5G = "16A34A";

// Couleurs du LABEL techno dans le tableau récapitulatif du Word.
// IMPORTANT : ce fond sert UNIQUEMENT à distinguer la technologie (4G / 5G),
// il ne représente PAS la qualité du signal. Le vert de TECH_COLOR_5G pouvait
// être confondu avec la qualité « bon » → on force ici une nuance de bleu pour
// la 5G (et un bleu plus foncé pour la 4G afin que les deux restent lisibles).
const TECH_LABEL_4G = "2E75B6"; // bleu (4G)
const TECH_LABEL_5G = "1F4E79"; // bleu foncé (5G) — distinct de la 4G et des couleurs qualité

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

    // Initialiser un niveau par défaut (3 points 4G + 3 points 5G)
    initMeasurePoints();

    // MOD 1 : bouton d'ajout d'un niveau / étage complet (4G + 5G)
    const addLevelBtn = document.getElementById("addMeasureLevelBtn");
    if (addLevelBtn) addLevelBtn.addEventListener("click", () => {
        const card = addMeasureLevel();
        // Un nouveau niveau démarre avec 1 point 4G + 1 point 5G prêts à remplir,
        // pour éviter au technicien un clic supplémentaire à chaque étage.
        addMeasurePoint("4g", card);
        addMeasurePoint("5g", card);
        // Faire défiler jusqu'au nouveau niveau pour le rendre visible
        card.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const btnChem = document.getElementById("addCheminementBtn");
    if (btnChem) btnChem.addEventListener("click", () => addCheminementItem());

    const evacAddBtn = document.getElementById("addEvacPlanBtn");
    if (evacAddBtn) evacAddBtn.addEventListener("click", () => {
        addEvacPlan();
    });

    // Au moins un plan d'évacuation par défaut (zone d'upload vierge), pour rester
    // ergonomique : le technicien voit directement le bouton "📷 importer une photo"
    if (evacPlans.length === 0) {
        addEvacPlan();
    }

    // Au moins un cheminement par défaut
    if (document.getElementById("cheminementContainer") &&
        document.getElementById("cheminementContainer").children.length === 0) {
        addCheminementItem();
    }

    // Première génération des pickers (vide tant qu'aucun plan n'est chargé)
    refreshAllEvacPickers();

    // Photo d'installation du routeur (mode TRAVAUX)
    const routeurInput = document.getElementById("routeurPhotoInput");
    if (routeurInput) {
        routeurInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await processPhoto(file, "routeur_install");
            const annBtn = document.querySelector('[data-annotate="routeur_install"]');
            if (annBtn) annBtn.disabled = false;
            if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
        });
    }

    // (Les pickers de tous les plans sont déjà initialisés par refreshAllEvacPickers ci-dessus)

    // Application initiale du layout selon le mode courant
    const initialMode = (document.getElementById("modeIntervention")?.value) || "audit";
    document.body.setAttribute("data-mode", initialMode);
    applyTravauxLayout(initialMode);

    // Synchroniser les images des plans d'évacuation avec leur version annotée après
    // chaque passage dans l'éditeur. L'éditeur met à jour photoStore['evac_plan_<id>'].dataUrl
    // mais ne sait pas que l'image affichée dans le formulaire est dans une carte de plan,
    // donc syncEvacBgImage() s'occupe de re-pousser le dataUrl vers le bon <img>.
    //
    // Le HTML appelle window.saveAnnotation() et window.closeEditor() (et non
    // directement window.Editor.save/close), donc on enveloppe ces deux entrées.
    if (typeof window.saveAnnotation === 'function' && !window.saveAnnotation.__evacWrapped) {
        const _origSave = window.saveAnnotation;
        window.saveAnnotation = function() {
            const ret = _origSave.apply(this, arguments);
            // Le save de l'éditeur est async ; on attend un micro-délai pour laisser
            // le photoStore se mettre à jour, puis on synchronise.
            setTimeout(syncEvacBgImage, 50);
            setTimeout(syncEvacBgImage, 250);
            return ret;
        };
        window.saveAnnotation.__evacWrapped = true;
    }
    if (typeof window.closeEditor === 'function' && !window.closeEditor.__evacWrapped) {
        const _origClose = window.closeEditor;
        window.closeEditor = function() {
            const ret = _origClose.apply(this, arguments);
            setTimeout(syncEvacBgImage, 50);
            return ret;
        };
        window.closeEditor.__evacWrapped = true;
    }
    // Synchronisation initiale (au cas où l'éditeur aurait déjà été utilisé avant chargement)
    syncEvacBgImage();

    // ----- Case "Aucun plan d'évacuation disponible" -----
    const noEvac = document.getElementById("noEvacPlan");
    const noEvacComment = document.getElementById("noEvacPlanComment");
    if (noEvac) {
        noEvac.addEventListener("change", () => {
            if (noEvacComment) noEvacComment.style.display = noEvac.checked ? "block" : "none";
            updateGenerateButtonState();
        });
    }

    // ----- Recalculer l'état des boutons à chaque interaction pertinente -----
    // Capture en bouillon : tout changement de fichier ou de texte recalcule.
    document.body.addEventListener("change", (e) => {
        // input[type=file] couvre l'upload de toutes les photos (lieux, écrans, plan évac)
        // Les autres changements n'ont pas d'effet sur la validation mais le coût est négligeable.
        updateGenerateButtonState();
    });

    // État initial du bandeau / des boutons
    updateGenerateButtonState();

    // ----- MOD 6 : restauration de la sauvegarde automatique -----
    // On tente de restaurer la dernière session APRÈS avoir construit les blocs
    // par défaut. applyFormData() vide puis reconstruit les conteneurs, donc les
    // défauts ci-dessus sont simplement remplacés s'il existe une sauvegarde.
    // On branche les écouteurs d'autosave seulement APRÈS la restauration pour
    // ne pas réécrire immédiatement par-dessus.
    try {
        await AUTOSAVE.restore();
    } catch (err) {
        console.warn("Restauration auto impossible :", err);
    }
    AUTOSAVE.attach();
    updateGenerateButtonState();

    console.log("✅ Audit 4G/5G chargé avec succès");
});

// ---------- CLIC GLOBAL (Annoter / Effacer / Supprimer) ----------
function handleGlobalClick(e) {
    const annBtn = e.target.closest("[data-annotate]");
    if (annBtn) {
        const key = annBtn.dataset.annotate;
        if (!photoStore[key]) {
            alert("Importez d'abord une photo.");
            return;
        }
        if (typeof window.Editor !== 'undefined' && window.Editor.open) {
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

        // MOD 2 : si c'est une copie d'écran de point de mesure, retirer aussi les
        // valeurs qui avaient été pré-remplies par l'OCR de CETTE photo (les
        // valeurs saisies à la main, elles, sont conservées).
        const m = key.match(/^mesure_(lieu|screen)_(.+)$/);
        if (m) {
            const photoType = m[1];
            const group = clearBtn.closest(".measure-point-group");
            if (group) {
                clearOcrValuesForPhoto(group, photoType);
                _setOcrStatus(group, photoType, "", "info"); // effacer le message de statut
            }
        }

        // Recalcul de l'état des boutons (photo supprimée → peut bloquer la génération)
        if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
        if (window.__autosaveSchedule) window.__autosaveSchedule();
        return;
    }

    const delMP = e.target.closest("[data-del-measure]");
    if (delMP) {
        const group = delMP.closest('.measure-point-group');
        if (group && confirm("Supprimer ce point de mesure ?")) {
            const pid = group.dataset.pointId;
            // Supprimer les photos associées
            delete photoStore[`mesure_lieu_${pid}`];
            delete photoStore[`mesure_screen_${pid}`];
            // Supprimer aussi le point sur le(s) plan(s) évac s'il y est placé
            removeEvacPointFromAllPlans(pid);
            group.remove();
            // Recalculer numérotation interne (header) et pickers
            renumberMeasurePoints();
            refreshAllEvacPickers();
            if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
        }
        return;
    }

    const delChem = e.target.closest("[data-del-chem]");
    if (delChem) {
        const item = delChem.closest('.cheminement-item');
        if (item && confirm("Supprimer ce cheminement ?")) {
            const idx = item.dataset.idx;
            delete photoStore[`cheminement_${idx}`];
            item.remove();
        }
        return;
    }

    // Suppression d'un point sur un plan d'évacuation
    const delEvac = e.target.closest("[data-del-evac]");
    if (delEvac) {
        const pid = delEvac.dataset.delEvac; // string id type "4g-1" ou "travaux-antenne"
        removeEvacPointFromAllPlans(pid);
        refreshAllEvacPickers();
        if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
        return;
    }
}

// ============================================================
//  NORMALISATION D'IMAGE (CORRECTIF CRITIQUE)
//  Cause racine de l'erreur "Word a rencontré une erreur" :
//  les téléphones modernes (iPhone HEIC, Android WebP/AVIF, JPEG avec
//  rotation EXIF, photos 4000×3000 de 8 Mo...) génèrent des fichiers
//  dont les octets bruts ne correspondent pas au type "jpg" déclaré
//  ensuite dans le document docx → Word refuse d'ouvrir le fichier.
//
//  Solution : on REENCODE chaque photo via un canvas vers un JPEG
//  propre, généré par le navigateur. Avantages :
//    - format de sortie 100% conforme (Word l'ouvre toujours)
//    - rotation EXIF appliquée automatiquement par le canvas
//    - redimensionnement (max 2000 px sur le plus grand côté) →
//      docx beaucoup plus léger, génération beaucoup plus rapide
//    - tout format décodable par le navigateur est accepté en entrée
// ============================================================
async function normalizeImageFile(file, opts = {}) {
    const maxEdge = opts.maxEdge || 2000;     // côté max après redimensionnement
    const quality = opts.quality || 0.9;      // qualité JPEG (0.9 = très bon)

    if (!file) throw new Error("no-file");

    // 1) Lecture du fichier en dataURL (gère TOUT format que le navigateur sait décoder)
    const rawDataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
    });

    // 2) Décodage dans un <img> (canvas appliquera l'orientation EXIF)
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload  = () => resolve(i);
        i.onerror = () => reject(new Error("decode"));
        i.src = rawDataUrl;
    });

    // 3) Calcul de la taille cible
    let w = img.naturalWidth  || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("decode");
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
        const r = maxEdge / longest;
        w = Math.round(w * r);
        h = Math.round(h * r);
    }

    // 4) Dessin sur canvas (re-encodage)
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Fond blanc au cas où l'image source a un canal alpha (PNG transparent)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // 5) Export JPEG propre + bytes alignés avec le type
    const cleanDataUrl = canvas.toDataURL('image/jpeg', quality);
    const bytes = dataUrlToUint8Array(cleanDataUrl);

    return {
        dataUrl: cleanDataUrl,
        bytes:   bytes,
        type:    'jpg',
        width:   w,
        height:  h
    };
}

// Message d'erreur utilisateur unifié (HEIC etc.)
function _imageErrorMessage(err) {
    if (err && err.message === 'decode') {
        return "Format d'image non supporté par ce navigateur (par exemple HEIC produit par certains iPhones).\n\n" +
               "Solution : sur l'iPhone, allez dans Réglages → Appareil photo → Formats et cochez « Le plus compatible » (JPG).\n" +
               "Ou convertissez la photo en JPG/PNG avant de l'ajouter.";
    }
    if (err && err.message === 'read') {
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
            type: 'jpg',
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
        // Une photo a été ajoutée : recalcule l'état de validation
        if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
        if (window.__autosaveSchedule) window.__autosaveSchedule(); // MOD 6
    } catch (err) {
        console.error("Erreur photo :", err);
        alert(_imageErrorMessage(err));
    }
}

// ============================================================
//  MOD 2 — OCR ASSISTÉ DES COPIES D'ÉCRAN (pré-remplissage)
//  Objectif : lire automatiquement les valeurs sur la copie d'écran importée
//  et PRÉ-REMPLIR les champs correspondants. Les valeurs restent toujours
//  modifiables et on n'écrase JAMAIS un champ déjà saisi par le technicien.
//
//  Deux types de copie d'écran par point de mesure :
//    - "jauge"  (data-photo-type="lieu")   → RSRP, RSRQ, SNR/SINR
//    - "debit"  (data-photo-type="screen") → débit descendant / montant
//
//  Moteur : Tesseract.js, chargé À LA DEMANDE (uniquement au 1er import de
//  photo), donc aucun impact sur le temps de chargement du formulaire.
//  Cas non reconnus (iPhone, autre application) : on ne remplit rien, le
//  technicien saisit à la main. C'est volontairement une AIDE, pas une
//  automatisation imposée.
// ============================================================
let _tesseractPromise = null;
function ensureTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (_tesseractPromise) return _tesseractPromise;
    _tesseractPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js";
        s.onload = () => window.Tesseract ? resolve() : reject(new Error("tesseract-load"));
        s.onerror = () => reject(new Error("tesseract-network"));
        document.head.appendChild(s);
    });
    return _tesseractPromise;
}

// Lance la reconnaissance OCR sur un dataUrl et renvoie le texte brut.
async function _ocrText(dataUrl) {
    await ensureTesseract();
    // langue "eng" suffit (chiffres + libellés latins). On reste en best-effort.
    const { data } = await window.Tesseract.recognize(dataUrl, "eng");
    return (data && data.text) ? data.text : "";
}

// Normalise un nombre OCR : gère la virgule décimale FR (92,1 → 92.1),
// les espaces, et certaines confusions fréquentes (O→0, l→1, S→5 dans un
// contexte numérique léger). On reste prudent pour éviter les faux positifs.
function _parseNum(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(",", ".").replace(/\s+/g, "");
    s = s.replace(/[Oo]/g, "0");
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
}

// Cherche, dans le texte OCR, la valeur numérique associée à l'un des mots-clés.
// Sur les écrans "jauge" (Android), le nombre est souvent affiché sur le cadran,
// donc sur une ligne DIFFÉRENTE (juste avant ou juste après) du libellé. On
// inspecte donc la ligne du libellé PUIS les lignes adjacentes, et on retient le
// 1er nombre plausible trouvé en élargissant progressivement le rayon.
function _findValueNear(text, keywords, opts = {}) {
    const radius = opts.radius != null ? opts.radius : 2;
    const lines = text.split(/\n+/).map(l => l.trim());
    const kw = keywords.map(k => k.toLowerCase());

    const numbersIn = (line) => {
        if (!line) return [];
        const nums = line.match(/-?\d+(?:[.,]\d+)?/g);
        if (!nums) return [];
        return nums.map(_parseNum).filter(n => n != null);
    };

    for (let i = 0; i < lines.length; i++) {
        const low = lines[i].toLowerCase();
        if (!kw.some(k => low.includes(k))) continue;

        // 1) même ligne que le libellé
        const here = numbersIn(lines[i]);
        if (here.length) return here[0];

        // 2) lignes adjacentes, du plus proche au plus éloigné
        for (let d = 1; d <= radius; d++) {
            const before = numbersIn(lines[i - d]);
            if (before.length) return before[before.length - 1]; // dernier nb avant le libellé
            const after = numbersIn(lines[i + d]);
            if (after.length) return after[0];
        }
    }
    return null;
}

// Extrait les valeurs RADIO (jauge) : RSRP, RSRQ, SNR/SINR.
// Stratégie : on cherche chaque valeur près de son libellé, en évitant
// d'attribuer DEUX fois le même nombre (fréquent quand les cadrans brouillent
// l'association ligne↔libellé). Les bornes physiques filtrent les aberrations.
// En cas de doute, on préfère NE PAS remplir (saisie manuelle) plutôt que de
// proposer une valeur fausse.
function extractGaugeValues(text) {
    const out = {};
    const used = new Set();
    const take = (val) => { if (val == null) return false; if (used.has(val)) return false; used.add(val); return true; };

    const rsrp = _findValueNear(text, ["rsrp"]);
    if (rsrp != null && rsrp <= -30 && rsrp >= -160 && take(rsrp)) out.rsrp = rsrp; // dBm négatif

    const rsrq = _findValueNear(text, ["rsrq"]);
    if (rsrq != null && rsrq <= 0 && rsrq >= -40 && take(rsrq)) out.rsrq = rsrq;    // dB ≤ 0

    // SNR / SINR / RSSNR : sur Network Cell Info, c'est typiquement un entier
    // positif (ex : 28). On accepte aussi le négatif mais on privilégie un
    // nombre non encore utilisé et dans une plage crédible.
    const snr = _findValueNear(text, ["sinr", "rssnr", "snr"]);
    if (snr != null && snr >= -30 && snr <= 60 && take(snr)) out.sinr = snr;

    return out;
}

// Extrait les valeurs de DÉBIT : descendant (download) et montant (upload),
// souvent en "Mb/s". On s'appuie sur les mots-clés FR/EN de l'app.
function extractDebitValues(text) {
    const out = {};
    // Beaucoup d'écrans affichent "Télécharger 92,1 Mb/s" (descendant) puis
    // "Télécharger 3,7 Mb/s" (montant) — libellés parfois identiques. On capte
    // donc d'abord par mots-clés explicites, sinon par ordre d'apparition des
    // valeurs en Mb/s.
    const down = _findValueNear(text, ["download", "descendant", "↓", "down"]);
    const up   = _findValueNear(text, ["upload", "montant", "↑", "up"]);
    if (down != null && down >= 0 && down < 100000) out.down = down;
    if (up   != null && up   >= 0 && up   < 100000) out.up   = up;

    // Fallback : si on n'a rien trouvé par mot-clé, prendre les deux 1ers
    // nombres suivis de "Mb/s" / "Mbps" dans l'ordre (1er = descendant).
    if (out.down == null || out.up == null) {
        const speeds = [];
        const re = /(-?\d+(?:[.,]\d+)?)\s*(?:mb\/?s|mbps|mbit)/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            const n = _parseNum(m[1]);
            if (n != null && n >= 0 && n < 100000) speeds.push(n);
        }
        if (out.down == null && speeds.length >= 1) out.down = speeds[0];
        if (out.up   == null && speeds.length >= 2) out.up   = speeds[1];
    }
    return out;
}

// Correspondance champ ↔ techno de copie d'écran.
//  - "lieu"   (Jauge) renseigne RSRP / RSRQ / SNR-SINR
//  - "screen" (Débit) renseigne débit descendant / montant
const OCR_FIELD_MAP = {
    lieu:   { rsrp: ".measure-rsrp", rsrq: ".measure-rsrq", sinr: ".measure-sinr" },
    screen: { down: ".measure-down", up: ".measure-up" }
};

// Applique les valeurs détectées aux champs d'un point de mesure, SANS écraser
// ce que le technicien a déjà saisi À LA MAIN. Chaque champ rempli par l'OCR est
// "marqué" (dataset.ocrSource = photoType). Si le technicien modifie ensuite ce
// champ, la marque est retirée (le champ devient manuel et protégé). On surligne
// brièvement les champs remplis.
function applyOcrToGroup(group, photoType, values) {
    if (!group || !values) return 0;
    const map = OCR_FIELD_MAP[photoType] || {};
    let filled = 0;
    Object.keys(map).forEach(key => {
        if (values[key] == null) return;
        const input = group.querySelector(map[key]);
        if (!input) return;
        // Ne pas écraser une valeur saisie/conservée par le technicien.
        // Un champ encore marqué "ocrSource" (= posé par un OCR précédent de CETTE
        // même photo) peut, lui, être rafraîchi lors d'un réimport.
        const isOcrOwned = input.dataset.ocrSource === photoType;
        if (String(input.value).trim() !== "" && !isOcrOwned) return;

        input.value = String(values[key]);
        input.dataset.ocrSource = photoType; // marque "valeur issue de l'OCR de cette photo"
        input.classList.add("ocr-filled");
        setTimeout(() => input.classList.remove("ocr-filled"), 2500);
        filled++;
    });
    if (filled > 0) {
        analyzePoint(group);
        if (window.__autosaveSchedule) window.__autosaveSchedule();
    }
    return filled;
}

// Vide les champs qui ont été remplis par l'OCR de CETTE photo (et seulement
// ceux-là). Les valeurs saisies/corrigées manuellement (non marquées) restent.
// Utilisé quand le technicien remplace ou supprime la copie d'écran.
function clearOcrValuesForPhoto(group, photoType) {
    if (!group) return 0;
    const map = OCR_FIELD_MAP[photoType] || {};
    let cleared = 0;
    Object.keys(map).forEach(key => {
        const input = group.querySelector(map[key]);
        if (!input) return;
        if (input.dataset.ocrSource === photoType) {
            input.value = "";
            delete input.dataset.ocrSource;
            cleared++;
        }
    });
    if (cleared > 0) {
        analyzePoint(group);
        if (window.__autosaveSchedule) window.__autosaveSchedule();
    }
    return cleared;
}

// Affiche un petit statut OCR sous le bloc photo concerné (non bloquant).
function _setOcrStatus(group, photoType, msg, state) {
    if (!group) return;
    const photoBlock = group.querySelector(`input[data-photo-type="${photoType}"]`)?.closest(".mp-photo-block");
    if (!photoBlock) return;
    let el = photoBlock.querySelector(".ocr-status");
    if (!el) {
        el = document.createElement("div");
        el.className = "ocr-status";
        photoBlock.appendChild(el);
    }
    el.textContent = msg || "";
    el.dataset.state = state || "info"; // info | working | ok | warn
}

// Pipeline OCR complet pour une photo de point de mesure qui vient d'être importée.
// photoType : "lieu" (= jauge) ou "screen" (= débit).
async function runOcrForMeasurePhoto(group, photoType, dataUrl) {
    if (!group || !dataUrl) return;
    const isGauge = (photoType === "lieu");
    // Réimport / remplacement : on repart des valeurs OCR précédentes de CETTE
    // photo (on les efface) pour pouvoir les rafraîchir avec la nouvelle image.
    // Les valeurs manuelles ne sont pas touchées.
    clearOcrValuesForPhoto(group, photoType);
    _setOcrStatus(group, photoType, "🔎 Lecture automatique des valeurs…", "working");
    try {
        const text = await _ocrText(dataUrl);
        const values = isGauge ? extractGaugeValues(text) : extractDebitValues(text);
        const filled = applyOcrToGroup(group, photoType, values);
        if (filled > 0) {
            _setOcrStatus(group, photoType,
                `✅ ${filled} valeur${filled > 1 ? "s" : ""} pré-remplie${filled > 1 ? "s" : ""} (vérifiez / corrigez si besoin).`, "ok");
        } else {
            _setOcrStatus(group, photoType,
                "ℹ️ Valeurs non détectées automatiquement — saisie manuelle.", "warn");
        }
    } catch (err) {
        console.warn("OCR indisponible :", err);
        _setOcrStatus(group, photoType,
            "ℹ️ Lecture automatique indisponible — saisie manuelle.", "warn");
    }
}

// ============================================================
//  MATRICE D'INTERPRÉTATION OFFICIELLE (RSRP × SNR)
//  Selon grille fournie par le client.
// ============================================================
const QUALITY_MATRIX = {
    excellent: { // RSRP >= -85 dBm
        ">15":  { label: "Optimal",      color: "#16a34a" },
        "5-15": { label: "Très bon",     color: "#16a34a" },
        "0-5":  { label: "Correct",      color: "#f59e0b" },
        "<0":   { label: "Dégradé",      color: "#6b7280" }
    },
    bon: {       // -85 à -100 dBm
        ">15":  { label: "Très bon",     color: "#16a34a" },
        "5-15": { label: "Bon",          color: "#16a34a" },
        "0-5":  { label: "Acceptable",   color: "#f59e0b" },
        "<0":   { label: "Problématique",color: "#6b7280" }
    },
    faible: {    // -100 à -115 dBm
        ">15":  { label: "Bon",          color: "#16a34a" },
        "5-15": { label: "Acceptable",   color: "#f59e0b" },
        "0-5":  { label: "Limite",       color: "#6b7280" },
        "<0":   { label: "Très dégradé", color: "#dc2626" }
    },
    critique: {  // < -115 dBm
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

// ---------- ANALYSE AUTOMATIQUE D'UN POINT ----------
function analyzePoint(group) {
    const rsrp = parseFloat(group.querySelector('.measure-rsrp').value);
    const snr  = parseFloat(group.querySelector('.measure-sinr').value); // SINR = SNR ici
    const resultSpan = group.querySelector('.analysis-result');
    if (!resultSpan) return;

    const q = evaluateQuality(rsrp, snr);
    if (!q) {
        resultSpan.textContent = "En attente de données (RSRP + SNR requis)";
        resultSpan.style.background = "#e5e7eb";
        resultSpan.style.color = "#374151";
        group.dataset.analysisLabel = "";
        group.dataset.analysisColor = "";
        // Rafraîchir picker (couleur du dot peut changer)
        if (typeof refreshEvacPicker === "function") refreshEvacPicker();
        if (typeof refreshAllEvacPointColors === "function") refreshAllEvacPointColors();
        return;
    }
    resultSpan.textContent = q.label;
    resultSpan.style.background = q.color;
    resultSpan.style.color = "#ffffff";
    group.dataset.analysisLabel = q.label;
    group.dataset.analysisColor = q.color;

    // Synchroniser la couleur du point évac correspondant
    if (typeof refreshAllEvacPointColors === "function") {
        refreshAllEvacPointColors();
    }
    if (typeof refreshEvacPicker === "function") {
        refreshEvacPicker();
    }
}

// ---------- POINTS DE MESURE DYNAMIQUES (par techno : 4G / 5G) ----------
// ============================================================
//  MOD 1 — NIVEAUX / ÉTAGES (chaque niveau = bloc 4G + bloc 5G)
// ============================================================

// Helpers de sélection (par CLASSE → agrègent tous les niveaux)
function getMeasureContainers(tech) {
    const cls = tech === "5g" ? ".mp-container-5g" : ".mp-container-4g";
    return Array.from(document.querySelectorAll(cls));
}
function getAllMeasureGroups(tech) {
    // tech optionnel : si absent → tous
    let sel = ".measure-point-group";
    if (tech === "4g") sel = ".mp-container-4g .measure-point-group";
    else if (tech === "5g") sel = ".mp-container-5g .measure-point-group";
    return Array.from(document.querySelectorAll(sel));
}
function getLevelCards() {
    return Array.from(document.querySelectorAll("#measureLevelsContainer .measure-level-card"));
}
function getLastLevelCard() {
    const cards = getLevelCards();
    return cards.length ? cards[cards.length - 1] : null;
}

// Crée et insère une carte de niveau (bloc 4G + bloc 5G). Retourne la carte DOM.
function addMeasureLevel(opts = {}) {
    const container = document.getElementById("measureLevelsContainer");
    if (!container) return null;
    const levelId = measureLevelCounter++;
    const isFirst = getLevelCards().length === 0;
    const defaultTitle = isFirst ? "Niveau 1 / RDC" : `Niveau ${getLevelCards().length + 1}`;
    const title = (typeof opts.title === "string" && opts.title.trim()) ? opts.title : defaultTitle;

    const card = document.createElement("div");
    card.className = "measure-level-card";
    card.dataset.levelId = String(levelId);
    // Le tout premier niveau porte les ID historiques sur ses conteneurs, pour
    // rester 100% compatible avec le code qui référence encore ces ID.
    const id4 = isFirst ? ' id="measurePointsContainer4G"' : "";
    const id5 = isFirst ? ' id="measurePointsContainer5G"' : "";
    card.innerHTML = `
        <div class="measure-level-header">
            <div class="measure-level-title-wrap">
                <span class="measure-level-icon">🏢</span>
                <input type="text" class="measure-level-title-input" value="${escapeHtml(title)}"
                       placeholder="Ex : RDC, 1er étage, Bâtiment A...">
            </div>
            <button type="button" class="measure-level-remove-btn" title="Supprimer ce niveau">🗑 Supprimer ce niveau</button>
        </div>

        <div class="tech-block" data-tech="4g">
            <div class="tech-header"><h3 class="tech-title">📡 Mesures 4G</h3></div>
            <div${id4} class="measure-points-container mp-container-4g"></div>
            <button type="button" class="btn-secondary add-mp-btn audit-only mp-add-4g" style="margin-top:10px;">
                ➕ Ajouter un point de mesure 4G
            </button>
        </div>

        <div class="tech-block" data-tech="5g" style="margin-top:16px;">
            <div class="tech-header"><h3 class="tech-title">🛰️ Mesures 5G</h3></div>
            <div${id5} class="measure-points-container mp-container-5g"></div>
            <button type="button" class="btn-secondary add-mp-btn audit-only mp-add-5g" style="margin-top:10px;">
                ➕ Ajouter un point de mesure 5G
            </button>
        </div>
    `;
    container.appendChild(card);

    // Boutons d'ajout de point, ciblant CE niveau
    card.querySelector(".mp-add-4g")?.addEventListener("click", () => addMeasurePoint("4g", card));
    card.querySelector(".mp-add-5g")?.addEventListener("click", () => addMeasurePoint("5g", card));

    // Titre : déclenche un autosave
    card.querySelector(".measure-level-title-input")?.addEventListener("input", () => {
        if (window.__autosaveSchedule) window.__autosaveSchedule();
    });

    // Suppression du niveau
    card.querySelector(".measure-level-remove-btn")?.addEventListener("click", () => removeMeasureLevel(card));

    // En mode TRAVAUX on n'autorise pas l'ajout de plusieurs points → masquer les
    // boutons d'ajout (le layout travaux est ré-appliqué juste après par l'appelant).
    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
    if (window.__autosaveSchedule) window.__autosaveSchedule();
    return card;
}

// Supprime un niveau entier (ses points 4G + 5G). Les photos/points évac liés
// aux pointId supprimés sont nettoyés pour rester cohérent.
function removeMeasureLevel(card) {
    if (!card) return;
    const cards = getLevelCards();
    if (cards.length <= 1) {
        alert("Vous devez conserver au moins un niveau. Supprimez plutôt les points de mesure de ce niveau si nécessaire.");
        return;
    }
    const pts = card.querySelectorAll(".measure-point-group");
    const hasContent = Array.from(pts).some(g =>
        (g.querySelector(".point-lieu")?.value || "").trim() ||
        photoStore[`mesure_lieu_${g.dataset.pointId}`] ||
        photoStore[`mesure_screen_${g.dataset.pointId}`]
    );
    if (hasContent && !confirm("Supprimer ce niveau et tous ses points de mesure (4G + 5G) ?\nLes photos et repères associés seront également retirés.")) {
        return;
    }
    // Nettoyer photoStore + retirer des plans évac
    pts.forEach(g => {
        const pid = g.dataset.pointId;
        if (!pid) return;
        delete photoStore[`mesure_lieu_${pid}`];
        delete photoStore[`mesure_screen_${pid}`];
        removeMeasurePointFromAllPlans(pid);
    });
    card.remove();
    renumberMeasurePoints();
    refreshAllEvacPickers();
    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
    if (window.__autosaveSchedule) window.__autosaveSchedule();
}

// Retire un pointId de tous les plans d'évacuation (délègue à la fonction
// existante removeEvacPointFromAllPlans, définie plus bas — hoistée car
// déclaration de fonction).
function removeMeasurePointFromAllPlans(pid) {
    if (typeof removeEvacPointFromAllPlans === "function") {
        removeEvacPointFromAllPlans(pid);
    }
}

function initMeasurePoints() {
    const container = document.getElementById("measureLevelsContainer");
    if (!container) return;
    if (getLevelCards().length === 0) {
        const card = addMeasureLevel();
        // 3 points 4G + 3 points 5G par défaut sur le premier niveau (mode audit)
        for (let i = 1; i <= 3; i++) addMeasurePoint("4g", card);
        for (let i = 1; i <= 3; i++) addMeasurePoint("5g", card);
    }
}

// tech : "4g" | "5g" — levelCard : carte de niveau cible (défaut : dernier niveau)
function addMeasurePoint(tech, levelCard) {
    if (tech !== "4g" && tech !== "5g") tech = "4g";

    // Déterminer le niveau cible
    if (!levelCard) levelCard = getLastLevelCard();
    if (!levelCard) levelCard = addMeasureLevel(); // aucun niveau → en créer un
    if (!levelCard) return;

    const containerSel = tech === "4g" ? ".mp-container-4g" : ".mp-container-5g";
    const container = levelCard.querySelector(containerSel);
    if (!container) return;

    let count;
    if (tech === "4g") {
        measureCounter4G++;
        count = measureCounter4G;
    } else {
        measureCounter5G++;
        count = measureCounter5G;
    }

    // pointId stable utilisé partout (DOM, photoStore, evacPoints) : "4g-1", "5g-2"
    const pid = `${tech}-${count}`;
    const techLabel = tech === "4g" ? "4G" : "5G";

    const div = document.createElement("div");
    div.className = "measure-point-group";
    div.dataset.point = count;
    div.dataset.tech = tech;
    div.dataset.pointId = pid;
    div.innerHTML = `
        <div class="mp-header">
            <h4>📍 Point de mesure ${techLabel} ${count}</h4>
            <button class="btn-delete" data-del-measure title="Supprimer ce point">🗑</button>
        </div>
        <input type="text" class="point-lieu mp-field" placeholder="Lieu / Pièce (ex: Bureau Direction, Local Technique RDC...)">

        <div class="mp-photos">
            <div class="mp-photo-block">
                <label class="mp-photo-label">📷 Copie écran Jauge <span class="mp-photo-hint">(RSRP / RSRQ / SNR)</span></label>
                <input type="file" accept="image/*" data-photo-type="lieu">
                <img id="preview_mesure_lieu_${pid}" class="photo-preview">
                <div class="mp-photo-actions">
                    <button class="annotate-btn" data-annotate="mesure_lieu_${pid}" disabled>✏ Annoter</button>
                    <button class="clear-btn" data-clear="mesure_lieu_${pid}">🗑 Effacer</button>
                </div>
            </div>
            <div class="mp-photo-block">
                <label class="mp-photo-label">📱 Copie écran Débit <span class="mp-photo-hint">(↓ / ↑ Mbps)</span></label>
                <input type="file" accept="image/*" data-photo-type="screen">
                <img id="preview_mesure_screen_${pid}" class="photo-preview">
                <div class="mp-photo-actions">
                    <button class="annotate-btn" data-annotate="mesure_screen_${pid}" disabled>✏ Annoter</button>
                    <button class="clear-btn" data-clear="mesure_screen_${pid}">🗑 Effacer</button>
                </div>
            </div>
        </div>

        <div class="mp-measures">
            <div class="mp-measure-cell">
                <label>RSRP <span class="unit">(dBm)</span></label>
                <input type="text" inputmode="text" class="measure-rsrp" placeholder="ex: -82">
            </div>
            <div class="mp-measure-cell">
                <label>RSRQ <span class="unit">(dB)</span></label>
                <input type="text" inputmode="text" class="measure-rsrq" placeholder="ex: -10">
            </div>
            <div class="mp-measure-cell">
                <label>SNR / SINR <span class="unit">(dB)</span></label>
                <input type="text" inputmode="text" class="measure-sinr" placeholder="ex: 18">
            </div>
            <div class="mp-measure-cell">
                <label>↓ Débit desc. <span class="unit">(Mbps)</span></label>
                <input type="number" step="0.1" class="measure-down" placeholder="ex: 120">
            </div>
            <div class="mp-measure-cell">
                <label>↑ Débit mont. <span class="unit">(Mbps)</span></label>
                <input type="number" step="0.1" class="measure-up" placeholder="ex: 35">
            </div>
            <div class="mp-measure-cell">
                <label>Bande / Techno</label>
                <input type="text" class="measure-band" placeholder="${tech === '4g' ? 'ex: B7 4G+' : 'ex: n78 5G'}">
            </div>
        </div>

        <div class="mp-analysis">
            <strong>🎯 Qualité globale :</strong>
            <span class="analysis-result">En attente de données (RSRP + SNR requis)</span>
        </div>
    `;
    container.appendChild(div);

    div.querySelectorAll('input[type="file"]').forEach(inp => {
        inp.addEventListener("change", async (e) => {
            const type = e.target.dataset.photoType;
            const key = `mesure_${type}_${pid}`;
            await processPhoto(e.target.files[0], key);
            const annBtn = div.querySelector(`[data-annotate="${key}"]`);
            if (annBtn) annBtn.disabled = false;
            // MOD 2 : lecture automatique des valeurs sur la copie d'écran importée.
            //  - "lieu"   = copie écran Jauge  → RSRP / RSRQ / SNR-SINR
            //  - "screen" = copie écran Débit  → débit descendant / montant
            // Le pré-remplissage n'écrase jamais une saisie manuelle existante.
            const stored = photoStore[key];
            if (stored && stored.dataUrl) {
                runOcrForMeasurePhoto(div, type, stored.dataUrl); // asynchrone, non bloquant
            }
        });
    });

    div.querySelectorAll('input.measure-rsrp, input.measure-sinr').forEach(inp => {
        inp.addEventListener('input', () => analyzePoint(div));
    });

    // MOD 2 : dès que le technicien modifie LUI-MÊME un champ pré-rempli par
    // l'OCR, on retire la marque "ocrSource" → ce champ devient "manuel" et ne
    // sera plus ni écrasé ni effacé automatiquement (réimport / suppression photo).
    div.querySelectorAll('.measure-rsrp, .measure-rsrq, .measure-sinr, .measure-down, .measure-up').forEach(inp => {
        inp.addEventListener('input', () => { delete inp.dataset.ocrSource; });
    });

    // Mettre à jour le label si l'utilisateur change le nom du lieu
    const lieuInput = div.querySelector('.point-lieu');
    if (lieuInput) {
        lieuInput.addEventListener('input', () => {
            // Mettre à jour le label affiché sur le plan évac (si placé)
            updateEvacPointLabel(pid);
            // Rafraîchir picker (le nom affiché change)
            refreshEvacPicker();
        });
    }

    // Si le plan d'évacuation est visible, mettre à jour la liste
    refreshEvacPicker();
    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
    if (window.__autosaveSchedule) window.__autosaveSchedule(); // MOD 6
}

// Renumérote l'affichage des en-têtes "Point de mesure 4G N" après suppression.
// MOD 1 : la numérotation affichée est GLOBALE et continue à travers tous les
// niveaux (le 1er point 4G du niveau 2 suit le dernier point 4G du niveau 1),
// ce qui garde une lecture cohérente avec la légende du rapport Word.
function renumberMeasurePoints() {
    ["4g", "5g"].forEach(tech => {
        const techLabel = tech === "4g" ? "4G" : "5G";
        let i = 0;
        getAllMeasureGroups(tech).forEach(g => {
            i++;
            const h4 = g.querySelector('.mp-header h4');
            if (h4) h4.textContent = `📍 Point de mesure ${techLabel} ${i}`;
            // On NE change PAS dataset.pointId pour ne pas casser les associations
            // (photos, points évac déjà placés). On met juste à jour le label visuel.
            g.dataset.point = i;
        });
    });
}

// ============================================================
// ---------- PLAN(S) D'ÉVACUATION (MULTI-PLANS) ----------
// ============================================================
// Modèle :
//   evacPlans = [
//     { id: 0, title: "Rez-de-chaussée", points: [...] },
//     { id: 1, title: "1er étage",       points: [...] },
//   ]
// Chaque point est placé sur UN seul plan (un même pointId ne peut pas être
// dupliqué sur deux plans : c'est le sens même du repère).
// La photo de chaque plan est stockée dans photoStore["evac_plan_<id>"].
// ============================================================

// --- Helpers généraux ---

// Retrouver un plan dans evacPlans à partir de son id
function getEvacPlan(planId) {
    return evacPlans.find(p => p.id === Number(planId));
}

// Retrouver le placement (plan + point) d'un pointId donné, peu importe le plan
function findEvacPlacement(pid) {
    for (const plan of evacPlans) {
        const point = plan.points.find(p => p.pointId === pid);
        if (point) return { plan, point };
    }
    return null;
}

// Liste à plat de TOUS les points placés (tous plans confondus)
function getAllEvacPlacedPoints() {
    const all = [];
    evacPlans.forEach(plan => {
        plan.points.forEach(pt => all.push({ ...pt, planId: plan.id }));
    });
    return all;
}

// Liste des pointIds placés (tous plans confondus) — utile pour griser les pickers
function getAllPlacedEvacPointIds() {
    const set = new Set();
    evacPlans.forEach(plan => plan.points.forEach(p => set.add(p.pointId)));
    return set;
}

// Supprime un pointId de TOUS les plans où il pourrait être (en pratique : 1 seul)
function removeEvacPointFromAllPlans(pid) {
    evacPlans.forEach(plan => {
        const before = plan.points.length;
        plan.points = plan.points.filter(p => p.pointId !== pid);
        if (plan.points.length !== before) {
            // Retirer le DOM correspondant dans la carte de ce plan
            const card = getEvacPlanCardEl(plan.id);
            if (card) {
                const dot = card.querySelector(`.evac-point[data-pid="${cssEsc(pid)}"]`);
                if (dot) dot.remove();
            }
        }
    });
}

// Échapper un pid pour usage dans un sélecteur CSS (au cas où il contiendrait des caractères spéciaux)
function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/(["\\\]\[\(\)\.\#\:])/g, "\\$1");
}

// Récupère l'élément DOM .evac-plan-card pour un planId donné
function getEvacPlanCardEl(planId) {
    return document.querySelector(`.evac-plan-card[data-plan-id="${planId}"]`);
}

// --- Création / suppression d'un plan ---

// Ajoute un nouveau plan d'évacuation (vide), avec un titre par défaut basé sur le rang
function addEvacPlan(initialState) {
    const planId = evacPlanCounter++;
    const fallbackTitle = (evacPlans.length === 0)
        ? "Plan d'évacuation principal"
        : `Plan d'évacuation – Étage ${evacPlans.length + 1}`;
    const plan = {
        id: planId,
        title: (initialState && typeof initialState.title === 'string' && initialState.title.trim())
            ? initialState.title
            : fallbackTitle,
        points: Array.isArray(initialState?.points) ? initialState.points.slice() : []
    };
    evacPlans.push(plan);
    renderEvacPlanCard(plan);
    refreshAllEvacPickers();
    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
    return plan;
}

// Supprime un plan complet (photo + points) après confirmation
function removeEvacPlan(planId) {
    const plan = getEvacPlan(planId);
    if (!plan) return;
    const hasContent = !!photoStore[`evac_plan_${planId}`] || plan.points.length > 0;
    if (hasContent) {
        if (!confirm(`Supprimer le plan « ${plan.title} » ?\nCette action retire aussi tous les points et repères placés sur ce plan. Les autres plans et les autres données du formulaire sont conservés.`)) {
            return;
        }
    }

    // 1) Effacer la photo du store
    delete photoStore[`evac_plan_${planId}`];

    // 2) Retirer la carte du DOM
    const card = getEvacPlanCardEl(planId);
    if (card) card.remove();

    // 3) Retirer le plan de l'état
    evacPlans = evacPlans.filter(p => p.id !== Number(planId));

    // 4) S'assurer qu'il reste TOUJOURS au moins une carte vide (sinon on cache la section)
    //    → on garde un plan vide par défaut pour rester ergonomique
    if (evacPlans.length === 0) {
        addEvacPlan();
    } else {
        refreshAllEvacPickers();
    }

    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
}

// --- Rendu DOM d'une carte de plan ---

function renderEvacPlanCard(plan) {
    const container = document.getElementById('evacPlansContainer');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'evac-plan-card';
    card.dataset.planId = String(plan.id);
    card.innerHTML = `
        <div class="evac-plan-card-header">
            <div class="evac-plan-card-title-wrap">
                <span class="evac-plan-card-icon">📋</span>
                <input type="text" class="evac-plan-card-title-input" value="${escapeHtml(plan.title)}" placeholder="Ex : Rez-de-chaussée, 1er étage, Bâtiment A...">
            </div>
            <button type="button" class="evac-plan-card-remove-btn" title="Supprimer ce plan d'évacuation">🗑 Supprimer ce plan</button>
        </div>

        <div class="evacuation-upload-area" data-evac-upload>
            <span style="font-size:2rem;">📷</span>
            <p>Cliquez pour importer ce plan d'évacuation (image JPG/PNG <b>ou PDF</b>, multi-pages accepté)</p>
        </div>
        <input type="file" accept="image/*,application/pdf,.pdf" class="evac-file-input" style="display:none">

        <div class="evac-stage-container" style="display:none; position:relative; margin-top:10px; text-align:center;">
            <div class="evac-stage-wrap">
                <img class="evac-bg-image" alt="Plan d'évacuation">
            </div>
            <div class="evac-actions-wrap" style="margin-top:10px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button type="button" class="annotate-btn travaux-only" data-annotate="evac_plan_${plan.id}">
                    ✏ Annoter ce plan (flèches, cercles, texte, dessin libre)
                </button>
                <button type="button" class="clear-btn evac-replace-photo-btn" title="Remplacer la photo de ce plan (les points placés sont conservés)">
                    🖼 Remplacer la photo
                </button>
            </div>
        </div>

        <div class="evac-points-picker-wrap audit-only" style="display:none; margin-top:14px;">
            <div class="evac-picker-title">📍 Points disponibles à placer sur ce plan</div>
            <div class="evac-picker-help">Cliquez sur un point pour le placer ici. Un point déjà placé sur un autre plan est grisé (un point = un seul emplacement).</div>
            <div class="evac-points-picker"></div>
        </div>

        <div class="evac-travaux-picker-wrap travaux-only" style="display:none; margin-top:14px;">
            <div class="evac-picker-title">📍 Repères à placer sur ce plan</div>
            <div class="evac-picker-help">Cliquez sur un repère pour le placer ici. Un repère déjà placé sur un autre plan est grisé. Placez Antenne et Routeur sur le plan correspondant à leur position réelle (étage, bâtiment, etc.).</div>
            <div class="evac-travaux-picker"></div>
        </div>
    `;
    container.appendChild(card);

    // --- Listeners ---
    // Édition du titre
    const titleInput = card.querySelector('.evac-plan-card-title-input');
    if (titleInput) {
        titleInput.addEventListener('input', () => {
            plan.title = titleInput.value;
        });
    }

    // Suppression de tout le plan
    const removeBtn = card.querySelector('.evac-plan-card-remove-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => removeEvacPlan(plan.id));
    }

    // Upload : la zone d'upload déclenche l'input file caché
    const uploadArea = card.querySelector('[data-evac-upload]');
    const fileInput = card.querySelector('.evac-file-input');
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleEvacUpload(e, plan.id));
    }

    // Bouton "remplacer la photo" : ouvre le sélecteur de fichier sans supprimer les points
    const replaceBtn = card.querySelector('.evac-replace-photo-btn');
    if (replaceBtn && fileInput) {
        replaceBtn.addEventListener('click', () => {
            fileInput.value = "";
            fileInput.click();
        });
    }

    // Si le plan a déjà une photo (cas du chargement depuis JSON), l'afficher
    const photo = photoStore[`evac_plan_${plan.id}`];
    if (photo && photo.dataUrl) {
        showEvacStageForPlan(plan.id, photo.dataUrl);
    }

    // Si le plan a déjà des points (cas du chargement depuis JSON), les rendre quand l'image est prête
    if (plan.points.length > 0) {
        const bgImg = card.querySelector('.evac-bg-image');
        const renderAll = () => {
            plan.points.forEach(state => {
                if (state.travauxLabel) {
                    renderEvacTravauxPoint(state, plan.id);
                } else {
                    renderEvacPoint(state, plan.id);
                }
            });
            refreshAllEvacPointColors();
        };
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            renderAll();
        } else if (bgImg) {
            bgImg.addEventListener('load', renderAll, { once: true });
        }
    }
}

// Affiche la zone d'image (et masque la zone d'upload) pour un plan donné
function showEvacStageForPlan(planId, dataUrl) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const stage = card.querySelector('.evac-stage-container');
    const upArea = card.querySelector('[data-evac-upload]');
    const bgImg = card.querySelector('.evac-bg-image');
    if (stage) stage.style.display = 'block';
    if (bgImg) bgImg.src = dataUrl;
    if (upArea) upArea.style.display = 'none';
}

// ---------- UPLOAD D'UN PLAN ----------
// Utilise désormais normalizeImageFile() pour produire un JPEG propre — corrige le
// même bug que processPhoto() (Word qui refusait d'ouvrir le rapport).
async function handleEvacUpload(e, planId) {
    const file = e.target.files[0];
    if (!file) return;
    const plan = getEvacPlan(planId);
    if (!plan) return;

    // MOD 3 : si le fichier est un PDF, on le convertit en image(s).
    // - PDF 1 page  → image placée sur CE plan (comportement habituel).
    // - PDF N pages → page 1 sur ce plan, pages 2..N créent automatiquement
    //   de nouveaux plans (un plan = un niveau/étage), ce qui colle au modèle
    //   multi-plans existant. La génération Word reste inchangée : chaque plan
    //   possède toujours une simple image JPEG dans photoStore.
    const isPdf = (file.type === "application/pdf") ||
                  /\.pdf$/i.test(file.name || "");
    if (isPdf) {
        try {
            await ensurePdfJs();
            const pages = await pdfFileToImages(file, { maxEdge: 2400, quality: 0.92 });
            if (!pages.length) throw new Error("pdf-empty");

            // Page 1 → plan courant
            _applyEvacImage(planId, pages[0]);

            // Pages suivantes → nouveaux plans
            for (let i = 1; i < pages.length; i++) {
                const newPlan = addEvacPlan({ title: `${plan.title} – page ${i + 1}` });
                _applyEvacImage(newPlan.id, pages[i]);
            }

            refreshAllEvacPickers();
            if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
        } catch (err) {
            console.error("Erreur conversion PDF :", err);
            alert("Impossible de lire ce PDF.\n\n" +
                  "Vérifiez votre connexion (la bibliothèque de lecture PDF se charge en ligne) " +
                  "ou importez une image (JPG/PNG) à la place.\n\nDétail : " +
                  (err && err.message ? err.message : err));
        } finally {
            e.target.value = "";
        }
        return;
    }

    try {
        // Pour les plans d'évacuation on garde une résolution un peu plus haute
        // (max 2400 px) car on dessine des points par-dessus.
        const n = await normalizeImageFile(file, { maxEdge: 2400, quality: 0.92 });
        _applyEvacImage(planId, n);
        refreshAllEvacPickers();
        if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
    } catch (err) {
        console.error("Erreur upload plan évac :", err);
        alert(_imageErrorMessage(err));
    }
}

// Applique une image normalisée (issue d'une photo ou d'une page PDF) à un plan :
// stocke dans photoStore, affiche, et re-rend les points existants par-dessus.
// Factorisé pour être réutilisé par l'upload image ET la conversion PDF.
function _applyEvacImage(planId, n) {
    const plan = getEvacPlan(planId);
    if (!plan) return;
    photoStore[`evac_plan_${planId}`] = {
        data:    n.bytes,
        type:    'jpg',
        dataUrl: n.dataUrl
    };
    showEvacStageForPlan(planId, n.dataUrl);
    const card = getEvacPlanCardEl(planId);
    const bgImg = card ? card.querySelector('.evac-bg-image') : null;
    const renderExistingPoints = () => {
        if (!card) return;
        card.querySelectorAll('.evac-point').forEach(el => el.remove());
        plan.points.forEach(state => {
            if (state.travauxLabel) renderEvacTravauxPoint(state, planId);
            else renderEvacPoint(state, planId);
        });
        refreshAllEvacPointColors();
    };
    if (bgImg) {
        if (bgImg.complete && bgImg.naturalWidth > 0) renderExistingPoints();
        else bgImg.addEventListener('load', renderExistingPoints, { once: true });
    }
}

// ---------- MOD 3 : CHARGEMENT PDF.js (à la demande) ----------
let _pdfJsPromise = null;
function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (_pdfJsPromise) return _pdfJsPromise;
    _pdfJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = () => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                resolve();
            } else {
                reject(new Error("pdfjs-load"));
            }
        };
        s.onerror = () => reject(new Error("pdfjs-network"));
        document.head.appendChild(s);
    });
    return _pdfJsPromise;
}

// Convertit chaque page d'un PDF en image JPEG normalisée (même format que
// normalizeImageFile → { dataUrl, bytes, type:'jpg', width, height }).
async function pdfFileToImages(file, opts = {}) {
    const maxEdge = opts.maxEdge || 2400;
    const quality = opts.quality || 0.92;

    const arrayBuf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
    const out = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        // On rend à une échelle suffisante pour la lisibilité, puis on borne
        // le plus grand côté à maxEdge.
        let viewport = page.getViewport({ scale: 2 });
        const longest = Math.max(viewport.width, viewport.height);
        if (longest > maxEdge) {
            const scale = (2 * maxEdge) / longest;
            viewport = page.getViewport({ scale });
        }
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        out.push({
            dataUrl,
            bytes:  dataUrlToUint8Array(dataUrl),
            type:   "jpg",
            width:  canvas.width,
            height: canvas.height
        });
    }
    return out;
}

// Helpers : trouver le groupe DOM correspondant à un pointId ("4g-1", "5g-2"...)
function getMeasureGroupByPid(pid) {
    if (!pid) return null;
    return document.querySelector(`.measure-point-group[data-point-id="${pid}"]`);
}

// Récupérer tous les points existants dans l'ordre 4G puis 5G
function getAllMeasurePoints() {
    // MOD 1 : agrège les points 4G puis 5G de TOUS les niveaux (ordre : tous les
    // 4G dans l'ordre des niveaux, puis tous les 5G), ce qui correspond à la
    // numérotation globale et à l'ordre attendu par la génération Word.
    return [...getAllMeasureGroups("4g"), ...getAllMeasureGroups("5g")];
}

// Donne le nom à afficher pour un point (lieu ou fallback)
// Donne le nom à afficher pour un point (avec préfixe 4G/5G)
function getPointDisplayName(group) {
    if (!group) return "Point non nommé";

    // Détermination du préfixe techno
    const tech = (group.dataset.tech === "5g") ? "5G" : "4G";

    const lieuInput = group.querySelector('.point-lieu');
    const lieu = lieuInput ? lieuInput.value.trim() : "";

    if (lieu) {
        return `${tech} - ${lieu}`;
    } else {
        const pointNum = group.dataset.point || "X";
        return `${tech} - Point ${pointNum}`;
    }
}

// --- Rafraîchissement des pickers (un par plan) ---

// Rafraîchit le picker AUDIT (points 4G/5G) ET le picker TRAVAUX d'un plan donné
function refreshEvacPickerForPlan(planId) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;

    // Picker AUDIT (points 4G/5G dynamiques)
    const auditWrap = card.querySelector('.evac-points-picker-wrap');
    const auditPicker = card.querySelector('.evac-points-picker');
    if (auditWrap && auditPicker) {
        const planLoaded = !!photoStore[`evac_plan_${planId}`];
        auditWrap.style.display = planLoaded ? 'block' : 'none';

        if (planLoaded) {
            const placedAllIds = getAllPlacedEvacPointIds();
            const placedHerePids = new Set((getEvacPlan(planId)?.points || []).map(p => p.pointId));
            const groups = getAllMeasurePoints();

            auditPicker.innerHTML = "";
            if (groups.length === 0) {
                auditPicker.innerHTML = `<span class="evac-pp-empty">Aucun point de mesure défini. Ajoutez-en dans la section 3.</span>`;
            } else {
                groups.forEach(g => {
                    const pid = g.dataset.pointId;
                    const tech = g.dataset.tech || "4g";
                    const name = getPointDisplayName(g);
                    const placedHere = placedHerePids.has(pid);
                    const placedElsewhere = placedAllIds.has(pid) && !placedHere;
                    const placed = placedHere || placedElsewhere;

                    const item = document.createElement('div');
                    item.className = `evac-pp-item${placed ? " placed" : ""}`;
                    item.dataset.pid = pid;
                    item.dataset.tech = tech;
                    let suffix = "";
                    if (placedElsewhere) {
                        const placement = findEvacPlacement(pid);
                        if (placement) suffix = ` <span style="font-size:0.75rem; opacity:0.7;">(placé sur « ${escapeHtml(placement.plan.title)} »)</span>`;
                    }
                    item.innerHTML = `<span class="pp-tech-dot tech-${tech}"></span><span class="pp-name">${escapeHtml(name)}</span><span class="pp-tech-tag">(${tech.toUpperCase()})</span>${suffix}`;
                    if (!placed) {
                        item.addEventListener('click', () => placeEvacPoint(pid, planId));
                    } else if (placedHere) {
                        item.addEventListener('click', () => {
                            showEvacPopup("Ce point est déjà placé sur ce plan. Supprimez-le d'abord pour le replacer.");
                        });
                    } else {
                        item.addEventListener('click', () => {
                            showEvacPopup("Ce point est déjà placé sur un autre plan. Supprimez-le de cet autre plan d'abord, ou laissez-le où il est.");
                        });
                    }
                    auditPicker.appendChild(item);
                });

                // Tous placés (ici ou ailleurs) ?
                const allPlaced = groups.length > 0 && groups.every(g => placedAllIds.has(g.dataset.pointId));
                if (allPlaced) {
                    const info = document.createElement('div');
                    info.className = 'evac-pp-empty';
                    info.style.marginTop = '8px';
                    info.textContent = "Tous les points existants sont déjà placés (sur ce plan ou un autre).";
                    auditPicker.appendChild(info);
                }
            }
        }
    }

    // Picker TRAVAUX (Antenne / Routeur / Mesures post-installation)
    const travauxWrap = card.querySelector('.evac-travaux-picker-wrap');
    const travauxPicker = card.querySelector('.evac-travaux-picker');
    if (travauxWrap && travauxPicker) {
        const planLoaded = !!photoStore[`evac_plan_${planId}`];
        travauxWrap.style.display = planLoaded ? 'block' : 'none';

        if (planLoaded) {
            const placedAllIds = getAllPlacedEvacPointIds();
            const placedHerePids = new Set((getEvacPlan(planId)?.points || []).map(p =>
