// =================================================================
//  AUTH-UPLOAD.JS  —  Script PARTAGÉ par les 3 formulaires
//  Version SUPABASE
//
//  Définit :
//    • window.login()          → authentification technicien
//    • window.logout()         → déconnexion
//    • window.sendToServer()   → envoi Word + JSON vers Supabase
//
//  Chaque index.html définit AVANT ce script :
//    window.__DOSSIER        ("pico-quatra" | "4g-5g" | "starlink")
//    window.__GET_DOCX_BLOB  → ()=>Promise<Blob>  (Word généré)
//    window.__GET_JSON_BLOB  → ()=>Promise<Blob>  (JSON généré)
// =================================================================

import {
    supabase, BUCKET_NAME, TABLE_NAME,
    TECHNICIENS, MOT_DE_PASSE_TECH
} from "./supabaseConfig.js";

// =================================================================
//  CLÉ SESSIONSTORAGE
// =================================================================
const SESSION_KEY = "techcouv_logged_user";

// =================================================================
//  AU CHARGEMENT : monter l'écran de login + remplir le sélecteur
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("loginTechSelect");
    if (select) {
        TECHNICIENS.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    }

    // Bouton de connexion
    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) loginBtn.addEventListener("click", login);

    // Soumission par "Entrée" dans le champ mot de passe
    const passInput = document.getElementById("loginPassword");
    if (passInput) {
        passInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); login(); }
        });
    }

    // Vérifier si l'utilisateur est déjà connecté
    const user = sessionStorage.getItem(SESSION_KEY);
    if (user && TECHNICIENS.includes(user)) {
        applyLoggedInState(user);
    } else {
        showLoginScreen();
    }
});

// =================================================================
//  ÉCRAN DE LOGIN — affichage / masquage
// =================================================================
function showLoginScreen() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "flex";
    document.body.classList.add("locked");
}

function hideLoginScreen() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "none";
    document.body.classList.remove("locked");
}

function applyLoggedInState(user) {
    hideLoginScreen();
    const badge = document.getElementById("loggedUserBadge");
    if (badge) {
        badge.textContent = "👤 " + user;
        badge.style.display = "inline-flex";
    }
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "inline-flex";
}

// =================================================================
//  LOGIN — authentification technicien (simple)
// =================================================================
export function login() {
    const select = document.getElementById("loginTechSelect");
    const passInput = document.getElementById("loginPassword");
    const errorBox  = document.getElementById("loginError");

    const tech = select ? select.value : "";
    const pwd  = passInput ? passInput.value : "";

    if (!tech) {
        showLoginError("Veuillez sélectionner un technicien.");
        return;
    }
    if (!TECHNICIENS.includes(tech)) {
        showLoginError("Technicien inconnu.");
        return;
    }
    if (pwd !== MOT_DE_PASSE_TECH) {
        showLoginError("Mot de passe incorrect.");
        return;
    }

    if (errorBox) errorBox.style.display = "none";
    sessionStorage.setItem(SESSION_KEY, tech);
    applyLoggedInState(tech);
}
window.login = login;

function showLoginError(msg) {
    const errorBox = document.getElementById("loginError");
    if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
    } else {
        alert(msg);
    }
}

// =================================================================
//  LOGOUT — déconnecte et réaffiche l'écran de login
// =================================================================
export function logout() {
    if (!confirm("Voulez-vous vous déconnecter ?")) return;
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
}
window.logout = logout;

// =================================================================
//  HELPERS
// =================================================================
function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value || "").trim() : "";
}

function getMode() {
    const el = document.getElementById("modeIntervention");
    return el && el.value === "travaux" ? "travaux" : "audit";
}

// Récupère le numéro de commande selon le formulaire courant
function getNumeroCommande() {
    return val("numero_ot") || val("ref_commande") || "";
}

// Génère le nom de fichier au format demandé :
// "NUMERO_TICKET - NUMERO_COMMANDE - RAISON_SOCIALE - VILLE - PV_MODE"
function buildServerFilename() {
    const ticket  = val("numero_ticket");
    const cmd     = getNumeroCommande();
    const raison  = val("raison_sociale") || "SITE";
    const ville   = val("ville") || "VILLE";
    const pvMode  = (getMode() === "travaux") ? "PV TRAVAUX" : "PV AUDIT";

    // Nettoyage minimal : caractères problématiques en nom de fichier
    const clean = (s) => String(s).replace(/[\/\\:*?"<>|]/g, "").trim();

    return `${clean(ticket)} - ${clean(cmd)} - ${clean(raison)} - ${clean(ville)} - ${pvMode}`;
}

// Affichage d'un message à l'utilisateur (réutilise #status si présent)
function showMessage(msg, kind) {
    const s = document.getElementById("status");
    if (s) {
        s.textContent = msg;
        s.className = kind || "info";
        setTimeout(() => { s.textContent = ""; s.className = ""; }, 7000);
    } else {
        alert(msg);
    }
}

// =================================================================
//  ENVOI VERS LE SERVEUR SUPABASE
//  - Word + JSON envoyés dans Supabase Storage (bucket "rapports")
//  - Métadonnées enregistrées dans la table SQL "rapports"
// =================================================================
export async function sendToServer() {
    // 1) vérifier connexion technicien
    const tech = sessionStorage.getItem(SESSION_KEY);
    if (!tech || !TECHNICIENS.includes(tech)) {
        showMessage("❌ Vous devez être connecté pour envoyer.", "error");
        showLoginScreen();
        return;
    }

    // 2) vérifier numéro de ticket
    const ticket = val("numero_ticket");
    if (!ticket) {
        showMessage("❌ Le champ « Numéro de ticket » est obligatoire avant l'envoi.", "error");
        const f = document.getElementById("numero_ticket");
        if (f) { f.focus(); f.scrollIntoView({behavior:"smooth", block:"center"}); }
        return;
    }

    // 3) vérifier que les hooks Word + JSON sont fournis par le formulaire
    if (typeof window.__GET_DOCX_BLOB !== "function" ||
        typeof window.__GET_JSON_BLOB !== "function") {
        showMessage("❌ Erreur interne : hooks Word/JSON non disponibles.", "error");
        console.error("Hooks manquants : window.__GET_DOCX_BLOB / window.__GET_JSON_BLOB");
        return;
    }

    // 4) désactiver le bouton et afficher la progression
    const btn = document.getElementById("sendToServerBtn");
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = "📤 Envoi en cours..."; }
    showMessage("📤 Génération des fichiers...", "info");

    try {
        // 5) générer Word et JSON
        const docxBlob = await window.__GET_DOCX_BLOB();
        const jsonBlob = await window.__GET_JSON_BLOB();
        if (!docxBlob || !jsonBlob) throw new Error("Génération Word ou JSON impossible.");

        showMessage("☁️ Envoi vers Supabase...", "info");

        // 6) construire le nom de fichier
        const baseName = buildServerFilename();
        const docxPath = `${baseName}.docx`;
        const jsonPath = `${baseName}.json`;

        // 7) uploader les 2 fichiers dans Supabase Storage
        //    upsert: true → écrase si déjà existant
        const { error: errDocx } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(docxPath, docxBlob, {
                contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                upsert: true
            });
        if (errDocx) throw new Error("Upload Word : " + errDocx.message);

        const { error: errJson } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(jsonPath, jsonBlob, {
                contentType: "application/json",
                upsert: true
            });
        if (errJson) throw new Error("Upload JSON : " + errJson.message);

        // 8) enregistrer les métadonnées dans la table "rapports"
        const { error: errInsert } = await supabase
            .from(TABLE_NAME)
            .insert({
                file_name:       baseName,
                dossier:         window.__DOSSIER || "inconnu",
                tech:            tech,
                mode:            getMode(),
                numero_ticket:   ticket,
                numero_commande: getNumeroCommande(),
                raison_sociale:  val("raison_sociale"),
                ville:           val("ville"),
                words_size:      docxBlob.size,
                json_size:       jsonBlob.size,
                docx_path:       docxPath,
                json_path:       jsonPath
            });
        if (errInsert) throw new Error("Insertion métadonnées : " + errInsert.message);

        // 9) succès — ne PAS réinitialiser le formulaire
        showMessage(
            `✅ Rapport envoyé avec succès !\nFichiers : ${baseName}.docx et ${baseName}.json`,
            "success"
        );

    } catch (err) {
        console.error("Erreur d'envoi :", err);
        showMessage("❌ Erreur lors de l'envoi : " + (err.message || err), "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = btn.dataset.label || "📧 Envoyer au serveur";
        }
    }
}
window.sendToServer = sendToServer;
