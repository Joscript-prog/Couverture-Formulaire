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
            const placedHerePids = new Set((getEvacPlan(planId)?.points || []).map(p => p.pointId));
            travauxPicker.innerHTML = "";
            EVAC_TRAVAUX_MARKERS.forEach(m => {
                const pid = `travaux-${m.id}`;
                const placedHere = placedHerePids.has(pid);
                const placedElsewhere = placedAllIds.has(pid) && !placedHere;
                const placed = placedHere || placedElsewhere;

                const item = document.createElement('div');
                item.className = `evac-pp-item${placed ? " placed" : ""}`;
                item.dataset.pid = pid;
                item.dataset.tech = m.tech;
                let suffix = "";
                if (placedElsewhere) {
                    const placement = findEvacPlacement(pid);
                    if (placement) suffix = ` <span style="font-size:0.75rem; opacity:0.7;">(sur « ${escapeHtml(placement.plan.title)} »)</span>`;
                }
                item.innerHTML = `<span class="pp-tech-dot tech-${m.tech}"></span><span class="pp-name">${escapeHtml(m.label)}</span>${suffix}`;
                if (!placed) {
                    item.addEventListener('click', () => placeEvacTravauxMarker(m, planId));
                } else if (placedHere) {
                    item.addEventListener('click', () => {
                        showEvacPopup("Ce repère est déjà placé sur ce plan. Supprimez-le d'abord pour le replacer.");
                    });
                } else {
                    item.addEventListener('click', () => {
                        showEvacPopup("Ce repère est déjà placé sur un autre plan. Supprimez-le de cet autre plan d'abord.");
                    });
                }
                travauxPicker.appendChild(item);
            });
        }
    }
}

// Rafraîchit les pickers de TOUS les plans
function refreshAllEvacPickers() {
    evacPlans.forEach(p => refreshEvacPickerForPlan(p.id));
}

// Compat ascendante : noms historiques utilisés ailleurs dans le code
function refreshEvacPicker() { refreshAllEvacPickers(); }
function refreshEvacTravauxPicker() { refreshAllEvacPickers(); }

// Petit helper d'échappement HTML pour le nom du point
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Place un point existant (par pid) sur le plan d'évacuation indiqué
function placeEvacPoint(pid, planId) {
    const plan = getEvacPlan(planId);
    if (!plan) return;
    const card = getEvacPlanCardEl(planId);
    const bgImg = card ? card.querySelector('.evac-bg-image') : null;
    if (!card || !bgImg || !bgImg.src) {
        showEvacPopup("Importez d'abord la photo de ce plan d'évacuation.");
        return;
    }

    // Déjà placé sur ce plan ?
    if (plan.points.some(p => p.pointId === pid)) return;
    // Déjà placé ailleurs ? On refuse silencieusement (l'UI doit déjà l'avoir empêché).
    if (getAllPlacedEvacPointIds().has(pid)) {
        showEvacPopup("Ce point est déjà placé sur un autre plan.");
        return;
    }

    // Vérifier que le point existe encore
    const group = getMeasureGroupByPid(pid);
    if (!group) {
        showEvacPopup("Ce point n'existe plus dans le formulaire.");
        refreshAllEvacPickers();
        return;
    }

    const pointState = {
        pointId: pid,
        leftPct: 50,
        topPct: 50,
        size: 60   // diamètre du halo en px
    };
    plan.points.push(pointState);
    renderEvacPoint(pointState, planId);
    refreshAllEvacPointColors();
    refreshAllEvacPickers();
    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
}

// Popup helpers
function showEvacPopup(msg) {
    const txt = document.getElementById('evacPopupText');
    const overlay = document.getElementById('evacPopup');
    if (txt) txt.textContent = msg;
    if (overlay) overlay.classList.add('shown');
}
function closeEvacPopup() {
    const overlay = document.getElementById('evacPopup');
    if (overlay) overlay.classList.remove('shown');
}
window.closeEvacPopup = closeEvacPopup;

// (Re)dessiner un point sur un plan d'évacuation à partir de son état
function renderEvacPoint(state, planId) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const wrap = card.querySelector('.evac-stage-wrap');
    if (!wrap) return;
    const old = wrap.querySelector(`.evac-point[data-pid="${cssEsc(state.pointId)}"]`);
    if (old) old.remove();

    const group = getMeasureGroupByPid(state.pointId);
    const tech = (group && group.dataset.tech) || (String(state.pointId).startsWith("5g") ? "5g" : "4g");
    const name = getPointDisplayName(group);

    const dot = document.createElement('div');
    dot.className = 'evac-point';
    dot.dataset.pid = state.pointId;
    dot.dataset.tech = tech;
    dot.dataset.planId = String(planId);
    dot.style.left = state.leftPct + '%';
    dot.style.top = state.topPct + '%';
    dot.style.width  = state.size + 'px';
    dot.style.height = state.size + 'px';
    dot.innerHTML = `
        <div class="evac-halo"></div>
        <div class="evac-core"></div>
        <div class="evac-pin"><span class="pin-tech tech-${tech}"></span><span class="pin-name">${escapeHtml(name)}</span></div>
        <div class="evac-resize" title="Étirer pour agrandir le halo">⤢</div>
        <div class="evac-del" data-del-evac="${state.pointId}" title="Supprimer">✕</div>
    `;
    wrap.appendChild(dot);
    makeEvacInteractive(dot, state, wrap);
}

// Mettre à jour le label affiché d'un point évac (quand on change le nom du lieu)
function updateEvacPointLabel(pid) {
    // Le point peut être sur n'importe quel plan : on met à jour tous les .evac-point matching
    document.querySelectorAll(`.evac-point[data-pid="${cssEsc(pid)}"]`).forEach(dot => {
        const group = getMeasureGroupByPid(pid);
        const name = getPointDisplayName(group);
        const nameSpan = dot.querySelector('.evac-pin .pin-name');
        if (nameSpan) nameSpan.textContent = name;
    });
}

// Drag + Resize sur un point d'évacuation (souris + tactile)
function makeEvacInteractive(el, state, container) {
    const halo = el.querySelector('.evac-halo');
    const core = el.querySelector('.evac-core');
    const handle = el.querySelector('.evac-resize');

    let mode = null; // 'drag' ou 'resize'
    let startX = 0, startY = 0, startSize = state.size;

    const getPoint = (e) => {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    };

    const onDown = (e) => {
        const target = e.target;
        if (target.classList.contains('evac-del')) return;
        if (target.classList.contains('evac-resize')) {
            mode = 'resize';
            startSize = state.size;
        } else {
            mode = 'drag';
        }
        const pt = getPoint(e);
        startX = pt.x; startY = pt.y;
        e.preventDefault();
        e.stopPropagation();
    };

    const onMove = (e) => {
        if (!mode) return;
        const pt = getPoint(e);
        const dx = pt.x - startX;
        const dy = pt.y - startY;

        if (mode === 'drag') {
            const rect = container.getBoundingClientRect();
            // position actuelle en px → convertir + ajouter le delta → reconvertir en %
            const curX = (state.leftPct / 100) * rect.width;
            const curY = (state.topPct  / 100) * rect.height;
            const newX = Math.max(0, Math.min(rect.width,  curX + dx));
            const newY = Math.max(0, Math.min(rect.height, curY + dy));
            state.leftPct = (newX / rect.width)  * 100;
            state.topPct  = (newY / rect.height) * 100;
            el.style.left = state.leftPct + '%';
            el.style.top  = state.topPct  + '%';
            startX = pt.x; startY = pt.y;
        } else if (mode === 'resize') {
            // Le delta diagonal donne la nouvelle taille
            const delta = Math.max(dx, dy);
            const newSize = Math.max(20, Math.min(400, startSize + delta));
            state.size = newSize;
            el.style.width  = newSize + 'px';
            el.style.height = newSize + 'px';
        }
    };

    const onUp = () => { mode = null; };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

// Met à jour les couleurs de tous les points évac (tous plans confondus) selon les
// points de mesure correspondants
function refreshAllEvacPointColors() {
    evacPlans.forEach(plan => {
        plan.points.forEach(state => {
            if (state.travauxLabel) return; // repère travaux → couleur fixe, déjà appliquée
            const grp = getMeasureGroupByPid(state.pointId);
            const colorHex = (grp && grp.dataset.analysisColor)
                ? grp.dataset.analysisColor
                : "#dc2626"; // rouge par défaut si pas de mesure correspondante
            applyEvacPointColor(state.pointId, colorHex);
        });
    });
}

function applyEvacPointColor(pid, colorHex) {
    document.querySelectorAll(`.evac-point[data-pid="${cssEsc(pid)}"]`).forEach(el => {
        const hex = colorHex.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const halo = el.querySelector('.evac-halo');
        const core = el.querySelector('.evac-core');
        if (halo) {
            halo.style.background = `radial-gradient(circle, rgba(${r},${g},${b},0.55) 0%, rgba(${r},${g},${b},0.25) 40%, rgba(${r},${g},${b},0) 75%)`;
        }
        if (core) {
            core.style.background = colorHex;
        }
        el.dataset.color = colorHex;
    });
}

// ============================================================
//  MODE TRAVAUX — BASCULE DYNAMIQUE
// ============================================================

// Repères fixes du plan d'évacuation en mode TRAVAUX
const EVAC_TRAVAUX_MARKERS = [
    { id: "antenne",        label: "Antenne",                       color: "#dc2626", tech: "4g" },
    { id: "routeur",        label: "Routeur",                       color: "#1f3864", tech: "4g" },
    { id: "mesure_4g_post", label: "Mesure 4G après installation",  color: "#2e75b6", tech: "4g" },
    { id: "mesure_5g_post", label: "Mesure 5G après installation",  color: "#16a34a", tech: "5g" }
];

// Adapte dynamiquement la section 3 (mesures) au mode actif :
// - en TRAVAUX : ne conserver qu'UN seul point 4G et un seul point 5G (au global,
//   tous niveaux confondus) — les autres sont masqués mais conservés en DOM.
// - en AUDIT   : réafficher tous les points + le bouton d'ajout de niveau.
function applyTravauxLayout(mode) {
    ["4g", "5g"].forEach(tech => {
        const groups = getAllMeasureGroups(tech); // MOD 1 : tous les niveaux
        groups.forEach((g, idx) => {
            if (mode === "travaux") {
                g.style.display = (idx === 0) ? "" : "none"; // 1er point seulement
            } else {
                g.style.display = "";
            }
        });
        // S'il n'existe encore aucun point et qu'on est en travaux, en créer un seul
        if (mode === "travaux" && groups.length === 0) {
            addMeasurePoint(tech);
        }
    });

    // MOD 1 : en TRAVAUX, masquer le bouton "Ajouter un niveau" (la classe
    // audit-only le gère déjà via le CSS, mais on s'assure de la cohérence).
    const addLevelBtn = document.getElementById("addMeasureLevelBtn");
    if (addLevelBtn) addLevelBtn.style.display = (mode === "travaux") ? "none" : "";

    // En TRAVAUX, masquer les cartes de niveau au-delà de la première (un seul
    // point par techno suffit, inutile d'afficher plusieurs étages).
    getLevelCards().forEach((card, idx) => {
        card.style.display = (mode === "travaux" && idx > 0) ? "none" : "";
    });

    // Rafraîchir les pickers car la visibilité influence ce qui est plaçable
    refreshAllEvacPickers();

    // Recalculer la validation : les règles métier sont différentes selon le mode
    if (typeof updateGenerateButtonState === "function") {
        updateGenerateButtonState();
    }
}
window.applyTravauxLayout = applyTravauxLayout;

// Place un repère "travaux" sur le plan d'évacuation indiqué
function placeEvacTravauxMarker(marker, planId) {
    const plan = getEvacPlan(planId);
    if (!plan) return;
    const card = getEvacPlanCardEl(planId);
    const bgImg = card ? card.querySelector('.evac-bg-image') : null;
    if (!card || !bgImg || !bgImg.src) {
        showEvacPopup("Importez d'abord la photo de ce plan d'évacuation.");
        return;
    }
    const pid = `travaux-${marker.id}`;
    if (plan.points.some(p => p.pointId === pid)) return;
    if (getAllPlacedEvacPointIds().has(pid)) {
        showEvacPopup("Ce repère est déjà placé sur un autre plan.");
        return;
    }

    const pointState = {
        pointId: pid,
        leftPct: 50,
        topPct: 50,
        size: 60,
        travauxLabel: marker.label,
        travauxColor: marker.color,
        travauxTech: marker.tech
    };
    plan.points.push(pointState);
    renderEvacTravauxPoint(pointState, planId);
    refreshAllEvacPickers();
    if (typeof updateGenerateButtonState === "function") updateGenerateButtonState();
}

// Rend un repère "travaux" sur le plan (forme similaire aux points 4G/5G classiques)
function renderEvacTravauxPoint(state, planId) {
    const card = getEvacPlanCardEl(planId);
    if (!card) return;
    const wrap = card.querySelector('.evac-stage-wrap');
    if (!wrap) return;
    const old = wrap.querySelector(`.evac-point[data-pid="${cssEsc(state.pointId)}"]`);
    if (old) old.remove();

    const tech = state.travauxTech || "4g";
    const label = state.travauxLabel || "Repère";

    const dot = document.createElement('div');
    dot.className = 'evac-point';
    dot.dataset.pid = state.pointId;
    dot.dataset.tech = tech;
    dot.dataset.travaux = "1";
    dot.dataset.planId = String(planId);
    dot.style.left = state.leftPct + '%';
    dot.style.top  = state.topPct  + '%';
    dot.style.width  = state.size + 'px';
    dot.style.height = state.size + 'px';
    dot.innerHTML = `
        <div class="evac-halo"></div>
        <div class="evac-core"></div>
        <div class="evac-pin"><span class="pin-tech tech-${tech}"></span><span class="pin-name">${escapeHtml(label)}</span></div>
        <div class="evac-resize" title="Étirer pour agrandir le halo">⤢</div>
        <div class="evac-del" data-del-evac="${state.pointId}" title="Supprimer">✕</div>
    `;
    wrap.appendChild(dot);

    // Appliquer la couleur fixe du repère (pas de calcul depuis une mesure)
    const colorHex = state.travauxColor || "#dc2626";
    applyEvacPointColor(state.pointId, colorHex);

    makeEvacInteractive(dot, state, wrap);
}

// Met à jour les images affichées de TOUS les plans d'évacuation à partir du photoStore.
// Utilisé après chaque fermeture de l'éditeur pour que les annotations
// (flèches, cercles, textes, tracés) apparaissent directement dans le formulaire.
function syncEvacBgImage() {
    evacPlans.forEach(plan => {
        const photo = photoStore[`evac_plan_${plan.id}`];
        if (!photo || !photo.dataUrl) return;
        const card = getEvacPlanCardEl(plan.id);
        if (!card) return;
        const bg = card.querySelector('.evac-bg-image');
        if (bg && bg.src !== photo.dataUrl) {
            bg.src = photo.dataUrl;
        }
    });
}

// Conserve l'ancien nom pour rétro-compat éventuelle (n'est plus utilisé en interne).
function deleteEvacPlan() {
    // Quand on l'appelle sans argument (chemins historiques) : on supprime le PREMIER plan,
    // ou on demande à l'utilisateur de le faire via les boutons individuels.
    if (evacPlans.length === 1) {
        removeEvacPlan(evacPlans[0].id);
    } else if (evacPlans.length > 1) {
        showEvacPopup("Utilisez le bouton « 🗑 Supprimer ce plan » de chaque carte pour supprimer un plan précis.");
    }
}

// ============================================================
// CHEMINEMENT
// ============================================================
function addCheminementItem() {
    const container = document.getElementById('cheminementContainer');
    if (!container) return;
    cheminementCounter++;
    const idx = cheminementCounter;
    const div = document.createElement('div');
    div.className = 'cheminement-item';
    div.dataset.idx = idx;
    div.innerHTML = `
        <div class="chem-header">
            <strong>📷 Photo Cheminement ${idx}</strong>
            <button class="btn-delete" data-del-chem title="Supprimer">🗑</button>
        </div>
        <input type="file" accept="image/*">
        <img class="photo-preview" id="preview_cheminement_${idx}">
        <div class="chem-actions">
            <button class="annotate-btn" data-annotate="cheminement_${idx}" disabled>✏ Annoter</button>
            <button class="clear-btn" data-clear="cheminement_${idx}">🗑 Effacer</button>
        </div>
        <textarea class="cheminement-comment" placeholder="Description du cheminement (point de pénétration, longueur estimée, type de support, étanchéité...)"></textarea>
    `;
    container.appendChild(div);
    div.querySelector('input[type="file"]').addEventListener('change', async (e) => {
        await processPhoto(e.target.files[0], `cheminement_${idx}`);
        const annBtn = div.querySelector('.annotate-btn');
        if (annBtn) annBtn.disabled = false;
    });
}

// ---------- COMPOSER UN PLAN D'ÉVACUATION + SES POINTS POUR LE WORD ----------
// Pour un plan donné (par son id), compose une image PNG = photo de fond + tous les
// points placés sur ce plan, avec halo, dot central et label.
async function composeEvacPlanWithPoints(planId) {
    const photo = photoStore[`evac_plan_${planId}`];
    if (!photo) return null;
    const plan = getEvacPlan(planId);
    if (!plan) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Récupérer la taille du conteneur d'affichage pour convertir size px → coord image
            const card = getEvacPlanCardEl(planId);
            const wrap = card ? card.querySelector('.evac-stage-wrap') : null;
            const wrapRect = wrap ? wrap.getBoundingClientRect() : { width: img.naturalWidth, height: img.naturalHeight };
            const scaleX = img.naturalWidth  / Math.max(1, wrapRect.width);
            const scaleY = img.naturalHeight / Math.max(1, wrapRect.height);

            plan.points.forEach((state) => {
                const isTravaux = !!state.travauxLabel;
                const grp = isTravaux ? null : getMeasureGroupByPid(state.pointId);
                let colorHex;
                if (isTravaux) {
                    colorHex = state.travauxColor || "#dc2626";
                } else {
                    colorHex = (grp && grp.dataset.analysisColor) ? grp.dataset.analysisColor : "#dc2626";
                }
                const hex = colorHex.replace("#","");
                const r = parseInt(hex.substring(0,2),16);
                const g = parseInt(hex.substring(2,4),16);
                const b = parseInt(hex.substring(4,6),16);

                // Position en px image
                const cx = (state.leftPct / 100) * img.naturalWidth;
                const cy = (state.topPct  / 100) * img.naturalHeight;
                // Taille du halo en px image
                const haloR = (state.size / 2) * Math.max(scaleX, scaleY);

                // Halo (gradient radial)
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
                grad.addColorStop(0,    `rgba(${r},${g},${b},0.55)`);
                grad.addColorStop(0.4,  `rgba(${r},${g},${b},0.25)`);
                grad.addColorStop(0.75, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
                ctx.fill();

                // Dot central (compact)
                const coreR = Math.max(6, 7 * Math.max(scaleX, scaleY));
                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.arc(cx, cy, coreR + 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = colorHex;
                ctx.beginPath();
                ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
                ctx.fill();

                // Label = nom réel du point, à proximité du centre (pas du bord du halo)
                const labelTxt = isTravaux ? state.travauxLabel : getPointDisplayName(grp);
                const fontSize = Math.max(14, 14 * Math.max(scaleX, scaleY));
                ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                const metrics = ctx.measureText(labelTxt);
                const padX = 8, padY = 4;
                const labelW = metrics.width + padX * 2;
                const labelH = fontSize + padY * 2;
                // Positionnement légèrement au-dessus et à droite du centre du cercle
                // Distance fixe par rapport au dot, NE dépend PAS de la taille du halo
                const offsetX = coreR + 6;
                const offsetY = -(coreR + labelH + 6);
                const labelX = cx + offsetX;
                const labelY = cy + offsetY;
                // bg blanc avec bordure bleue
                ctx.fillStyle = "white";
                ctx.strokeStyle = "#1F4E79";
                ctx.lineWidth = 1.5;
                roundRect(ctx, labelX, labelY, labelW, labelH, 4, true, true);
                ctx.fillStyle = "#1F4E79";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(labelTxt, labelX + labelW / 2, labelY + labelH / 2);
            });

            // Convertir le canvas en Uint8Array PNG
            canvas.toBlob(async (blob) => {
                if (!blob) return resolve(null);
                const buf = await blob.arrayBuffer();
                const u8 = new Uint8Array(buf);
                // Calculer dimensions d'affichage (max 500 de large)
                const ratio = img.naturalHeight / img.naturalWidth;
                const dispW = 500;
                const dispH = Math.round(dispW * ratio);
                resolve({ data: u8, dispW: dispW, dispH: dispH });
            }, 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = photo.dataUrl;
    });
}

// Variante qui renvoie un dataUrl JPEG (utilisée par le générateur PDF).
async function composeEvacPlanDataUrl(planId) {
    const composed = await composeEvacPlanWithPoints(planId);
    if (!composed) return null;
    const blob = new Blob([composed.data], { type: 'image/png' });
    const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => resolve(null);
        r.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    return { dataUrl, dispW: composed.dispW, dispH: composed.dispH };
}

// Helper : rectangle arrondi
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

// ============================================================
//  GÉNÉRATION WORD — STYLE STARLINK
// ============================================================
// ---------- VALIDATION ----------
// Règles métier différentes selon le mode :
//   AUDIT :
//     1. Au moins 3 points 4G et 3 points 5G doivent exister.
//     2. Chaque point doit avoir SES DEUX photos (lieu + écran) → min 12 photos.
//     3. Tous les points doivent être placés sur le plan d'évacuation,
//        SAUF si "Aucun plan d'évacuation disponible" est cochée.
//   TRAVAUX :
//     1. Une mesure 4G + une mesure 5G renseignées (RSRP + SNR au minimum).
//     2. Chaque mesure (visible) doit avoir ses 2 photos (lieu + écran).
//     3. Photo de l'installation du routeur 4G présente.
//     4. Plan d'évacuation présent avec au moins les repères Antenne ET Routeur
//        placés (sauf si "Aucun plan d'évacuation disponible" est cochée).
function validateMeasurementPoints() {
    const mode = (document.getElementById("modeIntervention")?.value) || "audit";
    const errors = [];

    // Points existants — MOD 1 : agrégés sur TOUS les niveaux via les classes
    // .mp-container-4g / .mp-container-5g (et non plus deux conteneurs uniques).
    let points4G = getAllMeasureGroups("4g");
    let points5G = getAllMeasureGroups("5g");

    // En mode TRAVAUX, on ne valide que les blocs réellement visibles (les autres
    // sont conservés en DOM mais display:none).
    if (mode === "travaux") {
        const visible = (el) => el && el.offsetParent !== null && el.style.display !== "none";
        points4G = points4G.filter(visible);
        points5G = points5G.filter(visible);
    }

    // ----- Quota minimum de points par techno (cumul tous niveaux) -----
    const minPoints = (mode === "travaux") ? 1 : 3;
    if (points4G.length < minPoints) {
        errors.push(`Il faut au moins ${minPoints} mesure${minPoints>1?"s":""} 4G (actuellement : ${points4G.length}).`);
    }
    if (points5G.length < minPoints) {
        errors.push(`Il faut au moins ${minPoints} mesure${minPoints>1?"s":""} 5G (actuellement : ${points5G.length}).`);
    }

    // ----- Photos lieu + écran pour chaque point visible -----
    let photoCount = 0;
    const missingPhotos = [];
    const allPoints = [...points4G, ...points5G];
    allPoints.forEach((group, idx) => {
        const pid = group.dataset.pointId;
        if (!pid) return;
        const hasLieu = !!photoStore[`mesure_lieu_${pid}`];
        const hasScreen = !!photoStore[`mesure_screen_${pid}`];
        if (hasLieu) photoCount++;
        if (hasScreen) photoCount++;
        if (!hasLieu || !hasScreen) {
            const tech = (group.dataset.tech || "4g").toUpperCase();
            const num = group.dataset.point || (idx + 1);
            const missingParts = [];
            if (!hasLieu) missingParts.push("photo du lieu");
            if (!hasScreen) missingParts.push("copie d'écran");
            missingPhotos.push(`Mesure ${tech} ${num} : ${missingParts.join(" + ")} manquante(s)`);
        }
    });

    // Quota minimum de photos : 2 photos par point visible
    const minPhotos = allPoints.length * 2;
    if (photoCount < minPhotos) {
        if (mode === "travaux") {
            errors.push(`Il faut ${minPhotos} photos dans la section 3 — Mesures radio 4G/5G (actuellement : ${photoCount}/${minPhotos}). Chaque mesure doit avoir sa photo du lieu ET sa copie d'écran.`);
        } else {
            errors.push(`Il faut au moins 12 photos dans la section 3 — Mesures radio 4G/5G (actuellement : ${photoCount}/12). Chaque point doit avoir sa photo du lieu ET sa copie d'écran.`);
        }
        missingPhotos.slice(0, 6).forEach(m => errors.push("• " + m));
    }

    // ----- En mode TRAVAUX : photo de l'installation du routeur 4G obligatoire -----
    if (mode === "travaux") {
        if (!photoStore["routeur_install"]) {
            errors.push("Importez la photo de l'installation du routeur 4G (section 3).");
        }
    }

    // ----- Plan(s) d'évacuation -----
    const noPlanCheckbox = document.getElementById("noEvacPlan");
    const noPlan = !!(noPlanCheckbox && noPlanCheckbox.checked);

    if (!noPlan) {
        // Plans qui ont effectivement une photo chargée (un plan vide sans photo
        // est ignoré pour la validation, comme s'il n'existait pas).
        const plansWithPhoto = evacPlans.filter(p => !!photoStore[`evac_plan_${p.id}`]);
        const planLoaded = plansWithPhoto.length > 0;
        if (!planLoaded) {
            errors.push("Importez au moins un plan d'évacuation dans la section 4 (ou cochez « Aucun plan d'évacuation disponible » si le site n'en dispose pas).");
        } else {
            // Tous les points placés sur l'ensemble des plans à photo
            const placedIds = new Set();
            plansWithPhoto.forEach(p => p.points.forEach(pt => placedIds.add(pt.pointId)));

            if (mode === "travaux") {
                // En TRAVAUX : les repères Antenne et Routeur sont obligatoires (sur un plan, peu importe lequel).
                if (!placedIds.has("travaux-antenne")) {
                    errors.push("Placez le repère « Antenne » sur l'un des plans d'évacuation.");
                }
                if (!placedIds.has("travaux-routeur")) {
                    errors.push("Placez le repère « Routeur » sur l'un des plans d'évacuation.");
                }
            } else {
                // En AUDIT : tous les points 4G/5G existants doivent être placés (sur un plan, peu importe lequel).
                const notPlaced = allPoints.filter(g => !placedIds.has(g.dataset.pointId));
                if (notPlaced.length > 0) {
                    errors.push(`${notPlaced.length} point(s) de mesure n'est/ne sont pas positionné(s) sur un plan d'évacuation :`);
                    notPlaced.slice(0, 6).forEach(g => {
                        const tech = (g.dataset.tech || "4g").toUpperCase();
                        const num = g.dataset.point || "?";
                        errors.push(`• Point ${tech} ${num}`);
                    });
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors,
        photoCount: photoCount,
        points4GCount: points4G.length,
        points5GCount: points5G.length,
        noPlan: noPlan,
        mode: mode
    };
}

// ---------- ÉTAT TEMPS RÉEL DES BOUTONS Export JSON / Générer Word ----------
// Met à jour l'apparence des boutons et le bandeau d'avertissement selon la validation.
function updateGenerateButtonState() {
    const v = validateMeasurementPoints();
    const btnWord = document.getElementById("btnGenerateWord");
    const btnJson = document.getElementById("btnExportJSON");
    const banner = document.getElementById("validationBanner");

    if (btnWord) btnWord.disabled = !v.valid;
    if (btnJson) btnJson.disabled = !v.valid;

    if (!banner) return;

    if (v.valid) {
        banner.className = "banner-ok";
        banner.style.display = "block";
        const _titre = (v.mode === "travaux")
            ? "✅ Travaux complets — Génération autorisée"
            : "✅ Audit complet — Génération autorisée";
        banner.innerHTML = `
            <div class="vb-title">${_titre}</div>
            <div style="font-size:0.9em;">${v.photoCount} photos relevées${v.noPlan ? " — site sans plan d'évacuation (déclaré par le technicien)" : (v.mode === "travaux" ? " — antenne et routeur positionnés sur le plan" : " — tous les points sont positionnés sur le plan")}.</div>
        `;
    } else {
        banner.className = "banner-error";
        banner.style.display = "block";
        const items = v.errors.map(e => `<li>${escapeHtml(e)}</li>`).join("");
        banner.innerHTML = `
            <div class="vb-title">🔒 Génération bloquée — Éléments manquants :</div>
            <ul>${items}</ul>
        `;
    }
}
window.updateGenerateButtonState = updateGenerateButtonState;

async function generateDocument() {
    // Valider l'ensemble des règles avant de générer
    const validation = validateMeasurementPoints();
    if (!validation.valid) {
        const detail = validation.errors.join("\n");
        alert("🔒 Génération bloquée — éléments manquants :\n\n" + detail +
              "\n\nComplétez les éléments ci-dessus pour pouvoir générer le rapport.");
        // Rafraîchit le bandeau au cas où l'utilisateur clique malgré le bouton grisé
        updateGenerateButtonState();
        return;
    }

    const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        ImageRun, Header, Footer, AlignmentType, WidthType, BorderStyle,
        VerticalAlign, ShadingType, HeightRule
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

    // ---------- helpers de style ----------

    // Bordure grise standard
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

    // Paragraphe simple
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

    // Titre de section "1. Titre" avec ligne dessous
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

    // Sous-titre "2.1 - Texte"
    const subTitle = (num, txt) => new Paragraph({
        spacing: { before: 240, after: 80 },
        keepNext: true,
        keepLines: true,
        children: [
            new TextRun({ text: `${num} - ${txt}`, italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri" })
        ]
    });

    // Cellule "libellé" (gris clair, gras)
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

    // Cellule "valeur" (fond blanc)
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

    // Cellule contenant un Paragraph déjà construit (pour ImageRun, etc.)
    const customCell = (children, width, opts = {}) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: opts.valign || VerticalAlign.CENTER,
        margins: opts.margins || { top: 100, bottom: 100, left: 140, right: 140 },
        borders: opts.borders || stdBorders,
        shading: opts.shading,
        columnSpan: opts.columnSpan,
        children: children
    });

    // Tableau simple à 2 colonnes (libellé / valeur) — style Starlink
    const kvTable = (rows) => new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 6240],
        rows: rows.map(r => new TableRow({
            children: [labelCell(r[0], 3120), valueCell(r[1], 6240)]
        }))
    });

    // Bandeau photo (titre bleu pâle + image centrée)
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
                        transformation: { width: opts.imgW || 380, height: opts.imgH || 280 },
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
        return new Table({
            width: { size: w, type: WidthType.DXA },
            columnWidths: [w],
            rows: [
                new TableRow({ children: [titleCell] }),
                new TableRow({ children: [photoCell] })
            ]
        });
    };

    // ---------- CONSTRUCTION DU DOCUMENT ----------
    const children = [];

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
                            text: ((document.getElementById("modeIntervention")?.value) === "travaux"
                                ? "RAPPORT DE TRAVAUX - INSTALLATION ANTENNE 4G/5G"
                                : "RAPPORT D'AUDIT - INSTALLATION ANTENNE 4G/5G"),
                            bold: true, size: 32, color: COLOR_WHITE, font: "Calibri"
                        })]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 60, after: 240 },
                        children: [new TextRun({
                            text: "Bouygues Telecom │ IPKONEKT",
                            size: 22, color: COLOR_WHITE, font: "Calibri"
                        })]
                    })
                ]
            })]
        })]
    }));
    children.push(P("", { spacing: { before: 60, after: 60 } }));

    // === TABLEAU RÉFÉRENCE / AUDITEUR / DATE (3 colonnes) ===
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
            new TableRow({
                children: [
                    labelCell("Référence commande", 3120),
                    labelCell("Auditeur / Intervenant", 3120),
                    labelCell("Date d'audit", 3120)
                ]
            }),
            new TableRow({
                children: [
                    valueCell(val("ref_commande"), 3120),
                    valueCell(val("auditeur"), 3120),
                    valueCell(val("date_audit"), 3120)
                ]
            })
        ]
    }));

    // === SECTION 1 : INFOS ADMIN ===
    children.push(sectionTitle(1, "Informations administratives du client"));

    const cp = val("code_postal");
    const ville = val("ville");
    const tel = val("contact_tel");
    const mail = val("contact_mail");

    // Cellule "valeur" qui couvre 3 colonnes (utilisée pour fusionner avec la ligne CP/Ville)
    const wideValueCell = (txt) => new TableCell({
        width: { size: 6240, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        columnSpan: 3,
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        borders: stdBorders,
        children: [new Paragraph({
            children: [new TextRun({ text: txt || "", size: 20, font: "Calibri" })]
        })]
    });

    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 1560, 1560, 3120],
        rows: [
            new TableRow({ children: [labelCell("Raison sociale du site audité", 3120), wideValueCell(val("raison_sociale"))] }),
            new TableRow({ children: [labelCell("Adresse", 3120), wideValueCell(val("adresse"))] }),
            new TableRow({ children: [
                labelCell("Code postal", 3120),
                valueCell("CP : " + cp, 1560),
                labelCell("Ville", 1560),
                valueCell(ville, 3120)
            ]}),
            new TableRow({ children: [labelCell("Horaire d'ouverture du site", 3120), wideValueCell(val("horaire"))] }),
            new TableRow({ children: [labelCell("Procédure d'accès", 3120), wideValueCell(val("procedure_acces"))] }),
            new TableRow({ children: [labelCell("Téléphone site", 3120), wideValueCell(val("tel_site"))] }),
            new TableRow({ children: [labelCell("Nom du contact client sur site", 3120), wideValueCell(val("contact_nom"))] }),
            new TableRow({ children: [labelCell("Fonction", 3120), wideValueCell(val("contact_fonction"))] }),
            new TableRow({ children: [
                labelCell("Téléphone / Mail contact", 3120),
                valueCell(tel, 1560),
                labelCell("Mail", 1560),
                valueCell(mail, 3120)
            ]})
        ]
    }));

    // === SECTION 2 : INFOS TECHNIQUES BAIE ===
    children.push(sectionTitle(2, "Informations techniques – Baie / Local technique"));
    const _modeS2 = (document.getElementById("modeIntervention")?.value) || "audit";
    const s2Rows = [
        ["Localisation de la baie", val("localisation_baie")]
    ];
    if (_modeS2 !== "travaux") {
        s2Rows.push(["Nombre de prises électriques disponibles", val("nb_prises")]);
    }
    children.push(kvTable(s2Rows));

    // === SECTION 3 : MESURES RADIO 4G/5G ===
    children.push(sectionTitle(3, "Mesures radio 4G/5G – Points relevés"));

    // Légende matrice
    children.push(P("Grille de lecture officielle appliquée automatiquement :", { italics: true, color: "555555", spacing: { before: 60, after: 100 } }));
    children.push(buildMatrixTable(window.docx));
    children.push(P("", { spacing: { before: 120, after: 60 } }));

    // ---------- Helper bloc d'un point (section insécable) ----------
    // Construit un bloc complet pour un point de mesure (titre + tableau + analyse + photos)
    // et l'enveloppe dans un Table à 1 cellule avec cantSplit=true → la section ne sera
    // jamais coupée entre 2 pages. Si elle ne tient pas, Word fera un saut avant.
    function buildMeasureSectionBlock(group, sectionNum, subNum) {
        const pid = group.dataset.pointId;
        const tech = group.dataset.tech || "4g";
        const techLabel = tech === "4g" ? "4G" : "5G";
        const keyLieu = `mesure_lieu_${pid}`;
        const keyScreen = `mesure_screen_${pid}`;
        const lieuTxt = (group.querySelector('.point-lieu')?.value || "").trim() || "Point non nommé";

        const blockChildren = [];

        // Sous-titre (3.x.y)
        blockChildren.push(new Paragraph({
            spacing: { before: 200, after: 80 },
            keepNext: true,
            keepLines: true,
            children: [
                new TextRun({
                    text: `${sectionNum}.${subNum} - ${techLabel} – Point ${subNum} – ${lieuTxt}`,
                    italics: true, bold: true, size: 22, color: COLOR_SUBTITLE, font: "Calibri"
                })
            ]
        }));

        // Tableau de valeurs
        const rsrp = group.querySelector('.measure-rsrp')?.value || "—";
        const rsrq = group.querySelector('.measure-rsrq')?.value || "—";
        const sinr = group.querySelector('.measure-sinr')?.value || "—";
        const down = group.querySelector('.measure-down')?.value || "—";
        const up   = group.querySelector('.measure-up')?.value   || "—";
        const band = group.querySelector('.measure-band')?.value || "—";

        blockChildren.push(new Table({
            width: { size: 9120, type: WidthType.DXA },
            columnWidths: [1520, 1520, 1520, 1520, 1520, 1520],
            rows: [
                new TableRow({
                    cantSplit: true,
                    children: [
                        labelCell("RSRP (dBm)", 1520),
                        labelCell("RSRQ (dB)", 1520),
                        labelCell("SNR (dB)", 1520),
                        labelCell("↓ Desc. (Mbps)", 1520),
                        labelCell("↑ Mont. (Mbps)", 1520),
                        labelCell("Bande / Techno", 1520)
                    ]
                }),
                new TableRow({
                    cantSplit: true,
                    children: [
                        valueCell(rsrp, 1520),
                        valueCell(rsrq, 1520),
                        valueCell(sinr, 1520),
                        valueCell(down, 1520),
                        valueCell(up, 1520),
                        valueCell(band, 1520)
                    ]
                })
            ]
        }));

        // Analyse colorée
        const labelTxt = group.dataset.analysisLabel || "";
        const colorHex = (group.dataset.analysisColor || "#6b7280").replace("#","");
        if (labelTxt) {
            blockChildren.push(P("", { spacing: { before: 80, after: 0 } }));
            blockChildren.push(new Table({
                width: { size: 9120, type: WidthType.DXA },
                columnWidths: [3040, 6080],
                rows: [new TableRow({
                    cantSplit: true,
                    children: [
                        labelCell("🎯 Qualité globale (matrice RSRP × SNR)", 3040),
                        new TableCell({
                            width: { size: 6080, type: WidthType.DXA },
                            verticalAlign: VerticalAlign.CENTER,
                            shading: { fill: colorHex.toUpperCase(), type: ShadingType.CLEAR, color: "auto" },
                            margins: { top: 100, bottom: 100, left: 140, right: 140 },
                            borders: stdBorders,
                            children: [new Paragraph({
                                children: [new TextRun({ text: labelTxt, bold: true, size: 22, color: "FFFFFF", font: "Calibri" })]
                            })]
                        })
                    ]
                })]
            }));
        }

        // Photos côte à côte
        const hasL = !!photoStore[keyLieu];
        const hasS = !!photoStore[keyScreen];
        if (hasL || hasS) {
            blockChildren.push(P("", { spacing: { before: 120, after: 60 } }));
            blockChildren.push(new Table({
                width: { size: 9120, type: WidthType.DXA },
                columnWidths: [4560, 4560],
                borders: noBorders,
                rows: [new TableRow({
                    cantSplit: true,
                    children: [
                        new TableCell({
                            width: { size: 4560, type: WidthType.DXA },
                            margins: { top: 0, bottom: 0, left: 60, right: 60 },
                            borders: noBorders,
                            children: [hasL ? photoBannerInner("Copie écran Jauge", keyLieu, 4440) : P("(Pas de copie écran jauge)", { italics: true, color: "999999" })]
                        }),
                        new TableCell({
                            width: { size: 4560, type: WidthType.DXA },
                            margins: { top: 0, bottom: 0, left: 60, right: 60 },
                            borders: noBorders,
                            children: [hasS ? photoBannerInner("Copie écran Débit", keyScreen, 4440) : P("(Pas de copie écran débit)", { italics: true, color: "999999" })]
                        })
                    ]
                })]
            }));
        }

        // Enveloppe TOUT le bloc dans un Table à 1 ligne / 1 cellule avec cantSplit
        // → Word ne coupera JAMAIS le bloc entre 2 pages. Si pas assez de place, saut auto avant.
        return new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            borders: noBorders,
            rows: [new TableRow({
                cantSplit: true,
                children: [new TableCell({
                    width: { size: 9360, type: WidthType.DXA },
                    margins: { top: 80, bottom: 80, left: 0, right: 0 },
                    borders: noBorders,
                    children: blockChildren
                })]
            })]
        });
    }

    // ---------- Helper : sous-titre techno (3.A 4G — 3.B 5G) ----------
    const techSubTitle = (label, accentColor) => new Paragraph({
        spacing: { before: 280, after: 120 },
        keepNext: true,
        keepLines: true,
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: accentColor, space: 4 }
        },
        children: [
            new TextRun({ text: label, bold: true, size: 24, color: accentColor, font: "Calibri" })
        ]
    });

   // ---------- 3.A — 4G ----------
const _modeS3 = (document.getElementById("modeIntervention")?.value) || "audit";
// En mode TRAVAUX, ne conserver que les blocs visibles (un seul 4G + un seul 5G).
const _isVisible = (el) => {
    if (_modeS3 !== "travaux") return true;
    if (!el) return false;
    return el.offsetParent !== null && el.style.display !== "none";
};
const groups4G = Array.from(document.querySelectorAll('.mp-container-4g .measure-point-group')).filter(_isVisible);
if (groups4G.length > 0) {
    const _titre4G = (_modeS3 === "travaux") ? "3.A — Mesure 4G" : "3.A — Mesures 4G";
    children.push(techSubTitle(_titre4G, TECH_COLOR_4G));
    groups4G.forEach((group, idx) => {
        children.push(buildMeasureSectionBlock(group, "3.A", idx + 1));
        children.push(P("", { spacing: { before: 10, after: 10 } })); // espace réduit
    });
}

// ---------- 3.B — 5G ----------
const groups5G = Array.from(document.querySelectorAll('.mp-container-5g .measure-point-group')).filter(_isVisible);
if (groups5G.length > 0) {
    const _titre5G = (_modeS3 === "travaux") ? "3.B — Mesure 5G" : "3.B — Mesures 5G";
    children.push(techSubTitle(_titre5G, TECH_COLOR_5G));
    groups5G.forEach((group, idx) => {
        children.push(buildMeasureSectionBlock(group, "3.B", idx + 1));
        children.push(P("", { spacing: { before: 10, after: 10 } })); // espace réduit
    });
}

if (groups4G.length === 0 && groups5G.length === 0) {
    children.push(P("(Aucun point de mesure renseigné)", { italics: true, color: "999999" }));
}

// ---------- 3.C — Photo de l'installation du routeur (mode TRAVAUX uniquement) ----------
if (_modeS3 === "travaux" && photoStore['routeur_install']) {
    children.push(techSubTitle("3.C — Photo de l'installation du routeur 4G", TECH_COLOR_4G));
    const _routeurPhoto = photoStore['routeur_install'];
    // Calcul de dimensions raisonnables (max 480 px de large)
    let _rw = _routeurPhoto.naturalWidth || 800;
    let _rh = _routeurPhoto.naturalHeight || 600;
    const _maxW = 480;
    if (_rw > _maxW) {
        const _ratio = _maxW / _rw;
        _rw = _maxW;
        _rh = Math.round(_rh * _ratio);
    }
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 120 },
        keepNext: true,
        keepLines: true,
        children: [new ImageRun({
            data: _routeurPhoto.data,
            transformation: { width: _rw, height: _rh },
            type: _routeurPhoto.type === "png" ? "png" : "jpg"
        })]
    }));
}

    // Helper : bandeau photo "intérieur" (utilisé pour côte à côte)
   function photoBannerInner(title, key, maxWidthTwips) {
    const photo = photoStore[key];
    if (!photo) return new Paragraph({ text: "(Photo non fournie)", italics: true, color: "999999" });

    // Convertir la largeur max de twips en pixels approximatifs (1 pixel ≈ 15 twips)
    // La largeur max en pixels sera limitée à 400 pour éviter des images énormes
    let maxWidthPx = Math.min(400, maxWidthTwips / 15);
    // Largeur réelle de l'image (ne peut pas dépasser maxWidthPx)
    const width = Math.min(maxWidthPx, photo.naturalWidth);
    // Hauteur proportionnelle
    const height = (width / photo.naturalWidth) * photo.naturalHeight;

    return new Table({
        width: { size: maxWidthTwips, type: WidthType.DXA },
        columnWidths: [maxWidthTwips],
        rows: [
            new TableRow({ children: [new TableCell({
                width: { size: maxWidthTwips, type: WidthType.DXA },
                shading: { fill: COLOR_PHOTO_BG, type: ShadingType.CLEAR, color: "auto" },
                margins: { top: 80, bottom: 80, left: 140, right: 140 },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                    left: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                    right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER }
                },
                children: [new Paragraph({
                    children: [new TextRun({ text: `📷 ${title}`, bold: true, size: 20, color: COLOR_TITLE, font: "Calibri" })]
                })]
            })]}),
            new TableRow({ children: [new TableCell({
                width: { size: maxWidthTwips, type: WidthType.DXA },
                margins: { top: 120, bottom: 120, left: 120, right: 120 },
                verticalAlign: VerticalAlign.CENTER,
                borders: {
                    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                    left: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER },
                    right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PHOTO_BORDER }
                },
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new ImageRun({
                        data: photo.data,
                        transformation: { width: width, height: height },
                        type: photo.type
                    })]
                })]
            })]})
        ]
    });
}

     // === SECTION 4 : PLAN(S) D'ÉVACUATION (un sous-bloc par plan) ===
    const _modeS4 = (document.getElementById("modeIntervention")?.value) || "audit";
    const _titreS4 = (_modeS4 === "travaux")
        ? "Plan(s) d'évacuation – Cheminement Antenne → Routeur"
        : "Plan(s) d'évacuation – Localisation des points de mesure";
    children.push(sectionTitle(4, _titreS4));

    // Plans qui ont effectivement une photo chargée (un plan vide est ignoré dans le Word)
    const _plansForReport = evacPlans.filter(p => !!photoStore[`evac_plan_${p.id}`]);

    if (_plansForReport.length > 0) {
        // Pour chaque plan : sous-titre + image composée + légende propre
        for (let _planIdx = 0; _planIdx < _plansForReport.length; _planIdx++) {
            const _plan = _plansForReport[_planIdx];
            const _planPhoto = photoStore[`evac_plan_${_plan.id}`];

            // Sous-titre du plan (si plusieurs plans, on numérote ; sinon on garde juste le titre)
            const _planTitle = _plansForReport.length > 1
                ? `Plan ${_planIdx + 1} – ${_plan.title || "Plan d'évacuation"}`
                : (_plan.title || "Plan d'évacuation");

            children.push(new Paragraph({
                spacing: { before: _planIdx === 0 ? 80 : 240, after: 60 },
                keepNext: true,
                children: [new TextRun({
                    text: _planTitle,
                    bold: true,
                    size: 24,
                    color: COLOR_SUBTITLE
                })]
            }));

            const composed = await composeEvacPlanWithPoints(_plan.id);
            const planData = composed ? composed.data : _planPhoto.data;

            // Taille encore plus contrôlée pour tenir sur une page avec légende
            const MAX_WIDTH_PX = 420;
            let displayWidth = MAX_WIDTH_PX;
            let displayHeight = 0;

            if (composed && composed.dispW > 0) {
                const ratio = composed.dispH / composed.dispW;
                displayHeight = Math.round(MAX_WIDTH_PX * ratio);
            } else {
                const ratio = (_planPhoto.naturalHeight || 700) /
                             (_planPhoto.naturalWidth || 1000);
                displayHeight = Math.round(MAX_WIDTH_PX * ratio);
            }

            const planParagraph = new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100, after: 120 },
                keepNext: true,
                keepLines: true,
                children: [new ImageRun({
                    data: planData,
                    transformation: { width: displayWidth, height: displayHeight },
                    type: "png"
                })]
            });
            children.push(planParagraph);

            // Légende propre à ce plan
            if (_plan.points.length > 0) {
                const legendRows = _plan.points.map(p => {
                    if (p.travauxLabel) {
                        return {
                            lieu: p.travauxLabel,
                            label: "—",
                            tech: p.travauxTech || "4g",
                            color: (p.travauxColor || "#6b7280").replace("#","").toUpperCase()
                        };
                    }
                    const grp = getMeasureGroupByPid(p.pointId);
                    const label = grp ? (grp.dataset.analysisLabel || "—") : "—";
                    const lieu  = grp ? getPointDisplayName(grp) : "Point non nommé";
                    const tech  = grp ? (grp.dataset.tech || "4g") : "4g";
                    const colorHex = grp ? (grp.dataset.analysisColor || "#6b7280") : "#6b7280";
                    return { lieu, label, tech, color: colorHex.replace("#","").toUpperCase() };
                });

                const _legendeTitre = (_modeS4 === "travaux")
                    ? "Légende des repères de ce plan :"
                    : "Légende des points de ce plan :";
                children.push(P(_legendeTitre, {
                    italics: true,
                    color: "555555",
                    spacing: { before: 60, after: 40 }
                }));

                children.push(new Table({
                    width: { size: 9360, type: WidthType.DXA },
                    columnWidths: [820, 1040, 3640, 3860],
                    rows: [
                        new TableRow({ cantSplit: true, children: [
                            labelCell("Couleur", 820),
                            labelCell("Techno", 1040),
                            labelCell("Lieu / Nom du point", 3640),
                            labelCell("Qualité", 3860)
                        ]}),
                        ...legendRows.map(r => new TableRow({
                            cantSplit: true,
                            children: [
                                new TableCell({ width: { size: 820, type: WidthType.DXA }, shading: { fill: r.color }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: " ", size: 20, color: "FFFFFF" })] })] }),
                                new TableCell({
                                    width: { size: 1040, type: WidthType.DXA },
                                    shading: { fill: r.tech === "4g" ? TECH_LABEL_4G : TECH_LABEL_5G },
                                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.tech.toUpperCase(), bold: true, size: 20, color: "FFFFFF" })] })]
                                }),
                                valueCell(r.lieu, 3640),
                                valueCell(r.label, 3860)
                            ]
                        }))
                    ]
                }));
            } else {
                children.push(P("(Aucun point/repère placé sur ce plan)", { italics: true, color: "999999" }));
            }
        }
    } else {
        // Pas de plan importé : si le technicien a coché "aucun plan d'évacuation
        // disponible", on l'indique explicitement dans le Word (avec commentaire éventuel).
        const noEvacChk = document.getElementById("noEvacPlan");
        const noEvacCom = document.getElementById("noEvacPlanComment");
        if (noEvacChk && noEvacChk.checked) {
            children.push(P("Site sans plan d'évacuation — déclaré par le technicien.", {
                italics: true, color: "666666"
            }));
            const com = (noEvacCom && noEvacCom.value || "").trim();
            if (com) {
                children.push(P("Motif : " + com, { italics: true, color: "666666", size: 20 }));
            }
        } else {
            children.push(P("(Aucun plan d'évacuation fourni)", { italics: true, color: "999999" }));
        }
    }
    // === SECTION 5 : CHEMINEMENT (2 par ligne) ===
    children.push(sectionTitle(5, "Cheminement câble & installation"));
    const chemItems = Array.from(document.querySelectorAll('.cheminement-item'));
    if (chemItems.length === 0) {
        children.push(P("(Aucun cheminement renseigné)", { italics: true, color: "999999" }));
    }
    // On groupe par paires
    for (let i = 0; i < chemItems.length; i += 2) {
        const left = chemItems[i];
        const right = chemItems[i + 1] || null;

        const buildChemCell = (item) => {
            if (!item) {
                return [P("", {})]; // cellule vide
            }
            const idx = item.dataset.idx;
            const key = `cheminement_${idx}`;
            const comm = item.querySelector('.cheminement-comment')?.value || "";
            const blocks = [];
            if (photoStore[key]) {
                blocks.push(photoBannerInner(`Cheminement ${idx}`, key, 4560));
            } else {
                blocks.push(P(`(Cheminement ${idx} - pas de photo)`, { italics: true, color: "999999" }));
            }
            if (comm) {
                blocks.push(P(`Commentaire : ${comm}`, { italics: true, size: 18, spacing: { before: 80, after: 80 } }));
            }
            return blocks;
        };

        children.push(P("", { spacing: { before: 200, after: 60 } }));
        children.push(new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4680, 4680],
            borders: noBorders,
            rows: [new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({
                        width: { size: 4680, type: WidthType.DXA },
                        margins: { top: 0, bottom: 0, left: 60, right: 60 },
                        borders: noBorders,
                        children: buildChemCell(left)
                    }),
                    new TableCell({
                        width: { size: 4680, type: WidthType.DXA },
                        margins: { top: 0, bottom: 0, left: 60, right: 60 },
                        borders: noBorders,
                        children: buildChemCell(right)
                    })
                ]
            })]
        }));
    }

    // === SECTION 6 : SYNTHÈSE ===
    children.push(sectionTitle(6, "Synthèse de l'intervention"));
    const _modeS6 = (document.getElementById("modeIntervention")?.value) || "audit";
    const _radioVal = (name) => {
        const r = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
        return r ? r.value : "";
    };
    const _dureeLabel = (_modeS6 === "travaux") ? "Durée des travaux réalisés" : "Durée totale à prévoir";
    const s6Rows = [
        ["Heure de début d'intervention", val("heure_debut")],
        ["Heure de fin d'intervention", val("heure_fin")],
        [_dureeLabel, val("duree_totale")],
        ["Nombre de techniciens", val("nb_techniciens")]
    ];
    if (_modeS6 === "travaux") {
        s6Rows.push(["Nacelle utilisée ?", _radioVal("nacelle_prevoir")]);
        s6Rows.push(["Échelle / échafaudage ?", _radioVal("echelle_prevoir")]);
    }
    children.push(kvTable(s6Rows));

    children.push(P("", { spacing: { before: 200, after: 80 } }));

    // === COMPTE RENDU PRINCIPAL (structuré) ===
    const mode = (document.getElementById("modeIntervention")?.value) || "audit";
    const titreCR = (mode === "audit")
        ? "Compte rendu — Préconisations / Points à prévoir"
        : "Compte rendu — Travaux réalisés / Mise en œuvre";

    const crText = (document.getElementById("compteRenduPreview")?.value || "").trim();
    const blocks = (window.CompteRendu && crText) ? window.CompteRendu.parseText(crText) : [];

    // Bandeau d'en-tête
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({ cantSplit: true, children: [labelCell(titreCR, 9360)] })]
    }));

    // Contenu rendu sous forme de paragraphes hiérarchisés (sans cases à cocher !)
    if (blocks.length === 0) {
        children.push(P("(Aucun élément renseigné dans le compte rendu principal.)",
            { italics: true, color: "888888", spacing: { before: 120, after: 80 } }));
    } else {
        const crChildren = [];
        blocks.forEach(b => {
            switch (b.type) {
                case 'spacer':
                    crChildren.push(new Paragraph({
                        spacing: { before: 40, after: 40 },
                        children: [new TextRun({ text: "" })]
                    }));
                    break;
                case 'h1':
                    // déjà dans le titre du tableau, on saute pour ne pas dupliquer
                    break;
                case 'h2':
                    crChildren.push(new Paragraph({
                        spacing: { before: 200, after: 80 },
                        children: [new TextRun({
                            text: b.text,
                            bold: true,
                            size: 22,
                            color: COLOR_TITLE,
                            font: "Calibri"
                        })]
                    }));
                    break;
                case 'h3':
                    crChildren.push(new Paragraph({
                        spacing: { before: 140, after: 60 },
                        indent: { left: 200 },
                        children: [new TextRun({
                            text: b.text,
                            bold: true,
                            italics: true,
                            size: 20,
                            color: COLOR_SUBTITLE,
                            font: "Calibri"
                        })]
                    }));
                    break;
                case 'bullet':
                    crChildren.push(new Paragraph({
                        spacing: { before: 40, after: 40 },
                        indent: { left: 600, hanging: 200 },
                        children: [
                            new TextRun({ text: "• ", bold: true, size: 20, color: COLOR_TITLE, font: "Calibri" }),
                            new TextRun({ text: b.text, size: 20, font: "Calibri" })
                        ]
                    }));
                    break;
                case 'p':
                default:
                    crChildren.push(new Paragraph({
                        spacing: { before: 60, after: 60 },
                        children: [new TextRun({ text: b.text, size: 20, font: "Calibri" })]
                    }));
                    break;
            }
        });

        // Cellule unique contenant tout le compte rendu rendu joliment
        children.push(new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [
                new TableRow({
                    cantSplit: false,
                    children: [new TableCell({
                        width: { size: 9360, type: WidthType.DXA },
                        margins: { top: 160, bottom: 160, left: 200, right: 200 },
                        borders: stdBorders,
                        children: crChildren
                    })]
                })
            ]
        }));
    }

    // Zone "Observations complémentaires" (champ libre)
    children.push(P("", { spacing: { before: 160, after: 60 } }));
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("Observations / Commentaires complémentaires", 9360)] }),
            new TableRow({ cantSplit: true, children: [valueCell(val("observations") || "—", 9360)] })
        ]
    }));

    // === SIGNATURE ===
    children.push(P("", { spacing: { before: 240, after: 60 } }));
    children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [
            new TableRow({ cantSplit: true, children: [labelCell("Signature technicien / auditeur", 9360)] }),
            new TableRow({ cantSplit: true, children: [valueCell(
                `Nom : ${val("signataire_nom") || "_______________________________"}      Date : ${val("signataire_date")}`,
                9360
            )] })
        ]
    }));

    // ---------- DOCUMENT FINAL ----------
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
                                        children: [new ImageRun({
                                            data: b64(LOGO_BOUYGUES_B64),
                                            transformation: { width: 60, height: 60 }
                                        })]
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
                            text: "Document confidentiel — Usage interne IPKONEKT / Bouygues Telecom",
                            italics: true, size: 16, color: COLOR_FOOTER, font: "Calibri"
                        })]
                    })]
                })
            },
            children: children
        }]
    });

    Packer.toBlob(doc).then(blob => {
        const safeName = (val("raison_sociale") || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
        const prefix = ((document.getElementById("modeIntervention")?.value) === "travaux") ? "Travaux" : "Audit";
        saveAs(blob, `${prefix}_4G5G_${safeName}_${val("date_audit")}.docx`);
    });
}

// ---------- TABLEAU MATRICE D'INTERPRÉTATION (dans le Word) ----------
function buildMatrixTable(docxLib) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, ShadingType, VerticalAlign } = docxLib;

    const stdBorder = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER };
    const stdBorders = {
        top: stdBorder, bottom: stdBorder, left: stdBorder, right: stdBorder,
        insideHorizontal: stdBorder, insideVertical: stdBorder
    };

    // Cell helper
    const mc = (txt, w, opts = {}) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        borders: stdBorders,
        shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
        children: [new Paragraph({
            alignment: opts.align || "center",
            children: [new TextRun({
                text: txt,
                size: opts.size || 18,
                bold: opts.bold || false,
                color: opts.color || "000000",
                font: "Calibri"
            })]
        })]
    });

    const rsrpRows = [
        { label: "≥ −85 dBm (Excellent)",   k: "excellent" },
        { label: "−85 à −100 dBm (Bon)",    k: "bon" },
        { label: "−100 à −115 dBm (Faible)", k: "faible" },
        { label: "< −115 dBm (Critique)",   k: "critique" }
    ];
    const snrCols = [
        { label: "SNR > 15", k: ">15" },
        { label: "SNR 5 à 15", k: "5-15" },
        { label: "SNR 0 à 5", k: "0-5" },
        { label: "SNR < 0", k: "<0" }
    ];

    const W_LABEL = 3000;
    const W_COL = 1590;
    const TOTAL = W_LABEL + W_COL * 4; // 9360

    // Header row
    const headerCells = [
        mc("RSRP (Puissance)", W_LABEL, { fill: COLOR_TITLE, color: "FFFFFF", bold: true })
    ];
    snrCols.forEach(c => headerCells.push(mc(c.label, W_COL, { fill: COLOR_TITLE, color: "FFFFFF", bold: true })));
    const rows = [new TableRow({ children: headerCells })];

    // Body rows
    rsrpRows.forEach(r => {
        const cells = [mc(r.label, W_LABEL, { fill: COLOR_TABLE_LABEL, bold: true, align: "left" })];
        snrCols.forEach(c => {
            const q = QUALITY_MATRIX[r.k][c.k];
            const fill = q.color.replace("#", "").toUpperCase();
            cells.push(mc(q.label, W_COL, { fill: fill, color: "FFFFFF", bold: true }));
        });
        rows.push(new TableRow({ children: cells }));
    });

    return new Table({
        width: { size: TOTAL, type: WidthType.DXA },
        columnWidths: [W_LABEL, W_COL, W_COL, W_COL, W_COL],
        rows: rows
    });
}

// ---------- EXPOSITION GLOBALE ----------
window.closeEditor = () => window.Editor?.close();
window.saveAnnotation = () => window.Editor?.save();
window.generateDocument = generateDocument;
window.resetForm = async () => {
    if (!confirm("Réinitialiser tout le formulaire ?\nLa sauvegarde automatique de cette session sera également effacée.")) return;
    // MOD 6 : effacer la sauvegarde auto AVANT de recharger, sinon elle serait
    // restaurée au rechargement et le formulaire ne serait pas vraiment réinitialisé.
    try { await AUTOSAVE.clear(); } catch (_) {}
    location.reload();
};

// Exposés pour le module PDF (pdfReport.js) :
window.__photoStore = photoStore;
window.__evacPlans  = () => evacPlans;
window.__composeEvacPlanDataUrl = composeEvacPlanDataUrl;
window.__classifyRSRP = classifyRSRP;
window.__classifySNR  = classifySNR;
window.__QUALITY_MATRIX = QUALITY_MATRIX;
window.__validateMeasurementPoints = () => validateMeasurementPoints();

// ============================================================
//  MOD 6 — SAUVEGARDE AUTOMATIQUE DANS LE NAVIGATEUR
//  Objectif : si le technicien recharge accidentellement la page, toutes les
//  données (champs, radios, points de mesure, niveaux, plans évac, photos,
//  compte rendu...) sont restaurées.
//
//  Choix technique : IndexedDB plutôt que localStorage. Les photos sont
//  stockées en base64 (souvent plusieurs Mo au total) → localStorage (~5 Mo)
//  serait saturé. IndexedDB n'a pas cette limite stricte et stocke un objet
//  unique sans sérialisation manuelle lourde.
//
//  On RÉUTILISE collectFormData() / applyFormData() : aucune nouvelle logique
//  de (dé)sérialisation. L'autosave est débouncé pour ne pas écrire à chaque
//  frappe clavier.
// ============================================================
const AUTOSAVE = (() => {
    const DB_NAME = "audit4g5g";
    const STORE   = "autosave";
    const KEY     = "current";
    const DEBOUNCE_MS = 1200;

    let _dbPromise = null;
    let _timer = null;
    let _suspended = false; // true pendant une restauration (évite de se ré-écraser)

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

    // Sauvegarde immédiate (utilisée en interne par le debounce)
    async function _saveNow() {
        if (_suspended) return;
        try {
            const data = collectFormData(); // réutilise l'existant
            data.__autosavedAt = new Date().toISOString();
            await _put(data);
        } catch (err) {
            console.warn("Autosave échoué :", err);
        }
    }

    // Sauvegarde débouncée — appelée à chaque interaction
    function schedule() {
        if (_suspended) return;
        clearTimeout(_timer);
        _timer = setTimeout(_saveNow, DEBOUNCE_MS);
    }

    // Restaure la dernière sauvegarde (si présente). Retourne true si restauré.
    async function restore() {
        let data = null;
        try { data = await _get(); } catch (err) { console.warn("Lecture autosave impossible :", err); }
        if (!data) return false;
        _suspended = true;
        try {
            await applyFormData(data); // réutilise l'existant
        } catch (err) {
            console.error("Restauration autosave échouée :", err);
        } finally {
            // On laisse un court délai pour que les chargements d'images / setState
            // asynchrones se terminent avant de réactiver la sauvegarde.
            setTimeout(() => { _suspended = false; }, 400);
        }
        return true;
    }

    // Branche les écouteurs : toute saisie / changement déclenche un autosave débouncé.
    function attach() {
        ["input", "change"].forEach(evt => {
            document.body.addEventListener(evt, schedule, true);
        });
        // Filet de sécurité : sauvegarde aussi juste avant de quitter/recharger.
        window.addEventListener("beforeunload", () => { _saveNow(); });
    }

    async function clear() {
        clearTimeout(_timer);
        try { await _clear(); } catch (_) {}
    }

    return { attach, restore, schedule, clear, saveNow: _saveNow };
})();

// Exposé pour pouvoir déclencher un autosave après des mutations programmatiques
// (ajout de niveau, de point, de plan...) qui ne passent pas toujours par un
// évènement "input"/"change" capturé sur document.body.
window.__autosaveSchedule = () => AUTOSAVE.schedule();

// ---------- EXPORT / IMPORT JSON ----------
function collectFormData() {
    const data = {
        version: "audit-4g5g-v2",
        exportedAt: new Date().toISOString(),
        fields: {},
        radios: {},      // boutons radio (name -> value)
        measurePoints: [],
        cheminements: [],
        // Nouveau modèle multi-plans : tableau de plans avec leurs propres points
        evacPlans: evacPlans.map(p => ({
            id: p.id,
            title: p.title,
            points: p.points.slice()
        })),
        evacPlanCounter: evacPlanCounter,
        noEvacPlan: !!(document.getElementById("noEvacPlan") && document.getElementById("noEvacPlan").checked),
        noEvacPlanComment: (document.getElementById("noEvacPlanComment") || {}).value || "",
        photos: {}       // dataUrl pour pouvoir restaurer (optionnel et lourd)
    };

    // Tous les inputs / textareas / selects avec un id
    document.querySelectorAll("input[id], textarea[id], select[id]").forEach(el => {
        if (el.type === "file") return; // les fichiers ne s'exportent pas comme texte
        if (el.type === "radio" || el.type === "checkbox") return;
        data.fields[el.id] = el.value;
    });

    // Radios groupés par name
    document.querySelectorAll('input[type="radio"]:checked').forEach(el => {
        if (el.name) data.radios[el.name] = el.value;
    });

    // Points de mesure (liste à plat — conserve toutes les valeurs des champs)
    document.querySelectorAll('.measure-point-group').forEach(group => {
        data.measurePoints.push({
            num: group.dataset.point,
            tech: group.dataset.tech || "4g",
            pointId: group.dataset.pointId || "",
            lieu: group.querySelector('.point-lieu')?.value || "",
            rsrp: group.querySelector('.measure-rsrp')?.value || "",
            rsrq: group.querySelector('.measure-rsrq')?.value || "",
            sinr: group.querySelector('.measure-sinr')?.value || "",
            down: group.querySelector('.measure-down')?.value || "",
            up:   group.querySelector('.measure-up')?.value   || "",
            band: group.querySelector('.measure-band')?.value || "",
            analysisLabel: group.dataset.analysisLabel || "",
            analysisColor: group.dataset.analysisColor || ""
        });
    });

    // MOD 1 : structure des NIVEAUX (titre + appartenance des points à chaque
    // niveau). On stocke l'ordre et les pointId pour pouvoir reconstruire
    // fidèlement les cartes de niveau à la restauration.
    data.measureLevels = getLevelCards().map(card => ({
        levelId: card.dataset.levelId,
        title: card.querySelector('.measure-level-title-input')?.value || "",
        points4g: Array.from(card.querySelectorAll('.mp-container-4g .measure-point-group'))
                    .map(g => g.dataset.pointId),
        points5g: Array.from(card.querySelectorAll('.mp-container-5g .measure-point-group'))
                    .map(g => g.dataset.pointId)
    }));
    data.measureLevelCounter = measureLevelCounter;

    // Cheminements
    document.querySelectorAll('.cheminement-item').forEach(item => {
        data.cheminements.push({
            idx: item.dataset.idx,
            comment: item.querySelector('.cheminement-comment')?.value || ""
        });
    });

    // Photos (dataUrl en base64, plus annotations re-éditables si présentes)
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

    // État du compte rendu principal (cases cochées, quantités, état, localisation)
    if (window.CompteRendu && typeof window.CompteRendu.getState === "function") {
        data.compteRendu = window.CompteRendu.getState();
    }

    return data;
}

window.exportJSON = function() {
    try {
        // Même règle métier que pour la génération Word : on ne sort un JSON
        // que si l'audit est complet (au moins 12 photos + points placés ou pas de plan).
        const validation = validateMeasurementPoints();
        if (!validation.valid) {
            const detail = validation.errors.join("\n");
            alert("🔒 Export JSON bloqué — éléments manquants :\n\n" + detail +
                  "\n\nComplétez les éléments ci-dessus pour pouvoir exporter.");
            updateGenerateButtonState();
            return;
        }
        const data = collectFormData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const safeName = (document.getElementById("raison_sociale")?.value || "Audit").replace(/[^a-zA-Z0-9_-]/g, "_");
        const date = document.getElementById("date_audit")?.value || new Date().toISOString().slice(0,10);
        if (typeof saveAs !== "undefined") {
            saveAs(blob, `Audit_4G5G_${safeName}_${date}.json`);
        } else {
            // fallback : créer un lien et cliquer
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Audit_4G5G_${safeName}_${date}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    } catch (err) {
        console.error("Erreur export JSON :", err);
        alert("Impossible d'exporter le formulaire.");
    }
};

window.importJSON = function(event) {
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
            event.target.value = ""; // permet de réimporter le même fichier ensuite
        }
    };
    reader.readAsText(file);
};

async function applyFormData(data) {
    if (!data || typeof data !== "object") return;

    // Champs simples
    if (data.fields) {
        Object.keys(data.fields).forEach(id => {
            const el = document.getElementById(id);
            if (el && el.type !== "file") el.value = data.fields[id];
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

    // Photos (restauration depuis dataUrl + annotations re-éditables)
    // ⚠️ On RE-NORMALISE chaque dataUrl à travers un canvas pour garantir que
    // les octets stockés (utilisés par docx) correspondent bien à un JPEG valide.
    // Cela évite que d'anciens JSON (générés avant le correctif) provoquent à
    // nouveau l'erreur "Word a rencontré une erreur lors de l'ouverture".
    if (data.photos) {
        const photoEntries = Object.entries(data.photos);
        await Promise.all(photoEntries.map(async ([k, p]) => {
            if (!p || !p.dataUrl) return;
            try {
                const n = await _renormalizeDataUrl(p.dataUrl);
                photoStore[k] = {
                    data: n.bytes,
                    type: 'jpg',
                    dataUrl: n.dataUrl,
                    naturalWidth: n.width,
                    naturalHeight: n.height,
                    originalDataUrl: p.originalDataUrl || null,
                    annotations: p.annotations || null,
                    annotated: !!p.annotated
                };
            } catch (err) {
                // Fallback : on garde au moins le dataUrl pour l'aperçu, mais on
                // signale que cette photo pourra causer un problème de génération.
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

    // Points de mesure — MOD 1 : reconstruction par NIVEAUX.
    const levelsContainer = document.getElementById("measureLevelsContainer");
    if (levelsContainer && data.measurePoints) {
        // Réinitialiser conteneurs + compteurs
        levelsContainer.innerHTML = "";
        measureCounter4G = 0;
        measureCounter5G = 0;
        measureLevelCounter = 0;

        // Compatibilité ascendante : ancien export sans tech ni pointId
        const isLegacy = !data.measurePoints.some(mp => mp.tech || mp.pointId);

        // Index des données de point par pointId (pour le format à niveaux)
        const byPid = {};
        data.measurePoints.forEach((mp, i) => {
            const tech = isLegacy ? "4g" : (mp.tech === "5g" ? "5g" : "4g");
            // Migration des photos legacy : `mesure_lieu_<num>` → `mesure_lieu_4g-<num>`
            if (isLegacy) {
                const oldNum = mp.num != null ? String(mp.num) : String(i + 1);
                ["lieu", "screen"].forEach(t => {
                    const oldKey = `mesure_${t}_${oldNum}`;
                    const newKey = `mesure_${t}_${tech}-${i + 1}`;
                    if (photoStore[oldKey] && !photoStore[newKey]) {
                        photoStore[newKey] = photoStore[oldKey];
                        delete photoStore[oldKey];
                    }
                });
            }
            if (mp.pointId) byPid[mp.pointId] = mp;
        });

        // Remplit un groupe DOM nouvellement créé à partir d'un enregistrement point
        const fillGroup = (grp, mp) => {
            if (!grp || !mp) return;
            const pid = grp.dataset.pointId;
            if (mp.lieu)  grp.querySelector('.point-lieu').value = mp.lieu;
            if (mp.rsrp)  grp.querySelector('.measure-rsrp').value = mp.rsrp;
            if (mp.rsrq)  grp.querySelector('.measure-rsrq').value = mp.rsrq;
            if (mp.sinr)  grp.querySelector('.measure-sinr').value = mp.sinr;
            if (mp.down)  grp.querySelector('.measure-down').value = mp.down;
            if (mp.up)    grp.querySelector('.measure-up').value   = mp.up;
            if (mp.band)  grp.querySelector('.measure-band').value = mp.band;
            analyzePoint(grp);
            ['lieu', 'screen'].forEach(t => {
                const key = `mesure_${t}_${pid}`;
                if (photoStore[key]) {
                    const ann = grp.querySelector(`[data-annotate="${key}"]`);
                    if (ann) ann.disabled = false;
                    const prev = document.getElementById(`preview_${key}`);
                    if (prev) { prev.src = photoStore[key].dataUrl; prev.classList.add("shown"); }
                }
            });
        };

        // Crée un point sur un niveau précis et le remplit avec le 1er enregistrement
        // restant de la techno demandée (consommé dans `queue`).
        const addAndFill = (tech, card, mp) => {
            addMeasurePoint(tech, card);
            const sel = tech === "4g" ? ".mp-container-4g" : ".mp-container-5g";
            const groups = card.querySelectorAll(`${sel} .measure-point-group`);
            const grp = groups[groups.length - 1];
            fillGroup(grp, mp);
        };

        const levels = Array.isArray(data.measureLevels) ? data.measureLevels : null;

        if (levels && levels.length > 0) {
            // ----- Format à niveaux : reconstruction fidèle -----
            levels.forEach(lvl => {
                const card = addMeasureLevel({ title: lvl.title });
                (lvl.points4g || []).forEach(pid => addAndFill("4g", card, byPid[pid]));
                (lvl.points5g || []).forEach(pid => addAndFill("5g", card, byPid[pid]));
            });
            // Points orphelins (présents dans measurePoints mais référencés par aucun
            // niveau — cas d'un JSON édité à la main) : on les place sur le 1er niveau.
            const placed = new Set();
            levels.forEach(l => { (l.points4g||[]).forEach(p=>placed.add(p)); (l.points5g||[]).forEach(p=>placed.add(p)); });
            const orphans = data.measurePoints.filter(mp => mp.pointId && !placed.has(mp.pointId));
            if (orphans.length) {
                const card = getLevelCards()[0] || addMeasureLevel();
                orphans.forEach(mp => addAndFill(mp.tech === "5g" ? "5g" : "4g", card, mp));
            }
        } else if (data.measurePoints.length > 0) {
            // ----- Ancien format (sans niveaux) : un seul niveau avec tous les points,
            //       4G d'abord puis 5G, comme avant. -----
            const card = addMeasureLevel();
            data.measurePoints.forEach(mp => {
                const tech = isLegacy ? "4g" : (mp.tech === "5g" ? "5g" : "4g");
                if (tech === "4g") addAndFill("4g", card, mp);
            });
            data.measurePoints.forEach(mp => {
                const tech = isLegacy ? "4g" : (mp.tech === "5g" ? "5g" : "4g");
                if (tech === "5g") addAndFill("5g", card, mp);
            });
        }

        // Restaurer le compteur de niveaux si fourni (sinon il a été incrémenté
        // naturellement par addMeasureLevel ci-dessus)
        if (typeof data.measureLevelCounter === "number" && data.measureLevelCounter > measureLevelCounter) {
            measureLevelCounter = data.measureLevelCounter;
        }

        // Si l'export ne contenait aucun point, on remet les 3+3 par défaut
        if (data.measurePoints.length === 0) {
            initMeasurePoints();
        }
        renumberMeasurePoints();
    }

    // Cheminements
    const chemContainer = document.getElementById("cheminementContainer");
    if (chemContainer && data.cheminements) {
        chemContainer.innerHTML = "";
        cheminementCounter = 0;
        data.cheminements.forEach(ch => {
            addCheminementItem();
            const items = chemContainer.querySelectorAll('.cheminement-item');
            const item = items[items.length - 1];
            if (item) {
                if (ch.comment) item.querySelector('.cheminement-comment').value = ch.comment;
                const idx = item.dataset.idx;
                const key = `cheminement_${idx}`;
                if (photoStore[key]) {
                    const ann = item.querySelector(`[data-annotate="${key}"]`);
                    if (ann) ann.disabled = false;
                    const prev = document.getElementById(`preview_${key}`);
                    if (prev) {
                        prev.src = photoStore[key].dataUrl;
                        prev.classList.add("shown");
                    }
                }
            }
        });
    }

    // ===== Plan(s) d'évacuation =====
    // Migration ascendante : si la sauvegarde utilise l'ancien format (evacPoints à plat +
    // photoStore['evac_plan']), on la convertit en un unique plan avant restauration.
    let _evacPlansToLoad = null;
    if (Array.isArray(data.evacPlans) && data.evacPlans.length > 0) {
        // Nouveau format
        _evacPlansToLoad = data.evacPlans;
    } else if (Array.isArray(data.evacPoints) || photoStore['evac_plan']) {
        // Ancien format → on bâtit un plan unique d'id 0
        _evacPlansToLoad = [{
            id: 0,
            title: "Plan d'évacuation",
            points: Array.isArray(data.evacPoints) ? data.evacPoints : []
        }];
        // Migrer la photo : photoStore['evac_plan'] → photoStore['evac_plan_0']
        if (photoStore['evac_plan']) {
            photoStore['evac_plan_0'] = photoStore['evac_plan'];
            delete photoStore['evac_plan'];
        }
    }

    // Vider l'état + les cartes existantes
    const _evacContainer = document.getElementById('evacPlansContainer');
    if (_evacContainer) _evacContainer.innerHTML = "";
    evacPlans = [];
    // Restaurer le compteur si fourni
    evacPlanCounter = (typeof data.evacPlanCounter === 'number') ? data.evacPlanCounter : 0;

    if (_evacPlansToLoad && _evacPlansToLoad.length > 0) {
        _evacPlansToLoad.forEach(p => {
            // Normaliser les points
            const normalizedPoints = (Array.isArray(p.points) ? p.points : []).map(pt => {
                // Repère TRAVAUX
                if (pt.travauxLabel || (typeof pt.pointId === 'string' && pt.pointId.startsWith('travaux-'))) {
                    return {
                        pointId: pt.pointId,
                        leftPct: typeof pt.leftPct === 'number' ? pt.leftPct : 50,
                        topPct:  typeof pt.topPct  === 'number' ? pt.topPct  : 50,
                        size:    typeof pt.size    === 'number' ? pt.size    : 60,
                        travauxLabel: pt.travauxLabel || "Repère",
                        travauxColor: pt.travauxColor || "#dc2626",
                        travauxTech:  pt.travauxTech  || "4g"
                    };
                }
                // Point 4G/5G : compat ascendante avec pointId numérique
                let pid = pt.pointId;
                if (typeof pid === 'number') pid = `4g-${pid}`;
                // On ne garde que les points qui correspondent à un groupe existant
                if (!getMeasureGroupByPid(pid)) return null;
                return {
                    pointId: pid,
                    leftPct: typeof pt.leftPct === 'number' ? pt.leftPct : 50,
                    topPct:  typeof pt.topPct  === 'number' ? pt.topPct  : 50,
                    size:    typeof pt.size    === 'number' ? pt.size    : 60
                };
            }).filter(Boolean);

            const planId = (typeof p.id === 'number') ? p.id : evacPlanCounter++;
            // Décaler le compteur si l'id du plan dépasse le compteur courant
            if (planId >= evacPlanCounter) evacPlanCounter = planId + 1;

            const plan = {
                id: planId,
                title: (typeof p.title === 'string' && p.title.trim()) ? p.title : "Plan d'évacuation",
                points: normalizedPoints
            };
            evacPlans.push(plan);
            renderEvacPlanCard(plan);
        });
        // Couleurs et pickers (le rendu DOM des points est déjà déclenché par renderEvacPlanCard
        // dès que l'image de fond est chargée).
        setTimeout(() => {
            refreshAllEvacPointColors();
            refreshAllEvacPickers();
        }, 60);
    } else {
        // Aucun plan dans la sauvegarde → recréer une carte vide par défaut
        addEvacPlan();
    }

    // Restaurer l'état du compte rendu principal (cases, quantités, etc.)
    if (data.compteRendu && window.CompteRendu && typeof window.CompteRendu.setState === "function") {
        // setTimeout pour laisser le DOM se reconstruire si besoin
        setTimeout(() => window.CompteRendu.setState(data.compteRendu), 0);
    }

    // Restaurer la case "Aucun plan d'évacuation" et son commentaire
    const noEvac = document.getElementById("noEvacPlan");
    const noEvacComment = document.getElementById("noEvacPlanComment");
    if (noEvac) {
        noEvac.checked = !!data.noEvacPlan;
        if (noEvacComment) {
            noEvacComment.value = data.noEvacPlanComment || "";
            noEvacComment.style.display = noEvac.checked ? "block" : "none";
        }
    }

    // Recalculer l'état des boutons après import complet
    if (typeof updateGenerateButtonState === "function") {
        // setTimeout pour laisser les éventuels chargements d'images se faire
        setTimeout(() => updateGenerateButtonState(), 50);
    }
}

// Helper : dataUrl → Uint8Array
function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1] || "";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Re-passe un dataUrl quelconque à travers un canvas pour garantir un JPEG propre
// dont les octets correspondent au type déclaré. Utilisé à l'import JSON.
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
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const cleanDataUrl = canvas.toDataURL('image/jpeg', quality);
    return {
        dataUrl: cleanDataUrl,
        bytes:   dataUrlToUint8Array(cleanDataUrl),
        type:    'jpg',
        width:   w,
        height:  h
    };
}
