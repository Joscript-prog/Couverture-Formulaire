// =================================================================
//  ADMIN.JS — Dashboard administrateur (auth par mot de passe simple)
//   - Login : mot de passe défini dans supabaseConfig.js
//   - Lecture / suppression Supabase Storage + table rapports
//   - Filtres, recherche, tri, suppression simple et en masse
// =================================================================

import {
    supabase, BUCKET_NAME, TABLE_NAME,
    STORAGE_WARNING_BYTES, STORAGE_LIMIT_BYTES
} from "./supabaseConfig.js";

// =================================================================
//  COMPTE ADMIN (Supabase Auth)
//  Cet email doit correspondre EXACTEMENT au compte créé dans
//  Supabase → Authentication → Users.
//  L'email n'est pas un secret ; le mot de passe, lui, est géré
//  par Supabase et n'apparaît JAMAIS dans le code.
// =================================================================
const ADMIN_EMAIL = "thanajo008@gmail.com";

// =================================================================
//  ÉTAT GLOBAL
// =================================================================
let rapports         = [];
let filteredRapports = [];

// =================================================================
//  DOM HELPERS
// =================================================================
const $ = (id) => document.getElementById(id);

function showToast(msg, type) {
    const t = $("toast");
    t.textContent = msg;
    t.className = type || "info";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3500);
}

function showLoginError(msg) {
    const box = $("loginErrorBox");
    box.textContent = msg;
    box.style.display = "block";
}

function clearLoginError() {
    $("loginErrorBox").style.display = "none";
}

// =================================================================
//  AU CHARGEMENT
// =================================================================
document.addEventListener("DOMContentLoaded", async () => {
    // Brancher le bouton login (toujours)
    $("adminLoginBtn").addEventListener("click", onLoginClick);

    // Soumission par "Entrée" sur le champ mot de passe
    $("adminPassword").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onLoginClick();
        }
    });

    // Vérifier si une session Supabase Auth est déjà active
    // (l'admin reste connecté entre les rechargements de page)
    const { data } = await supabase.auth.getSession();
    if (data && data.session) {
        enterDashboard();
        return;
    }

    // Auto-focus sur le champ mot de passe
    setTimeout(() => $("adminPassword").focus(), 100);
});

// =================================================================
//  CONNEXION
// =================================================================
async function onLoginClick() {
    clearLoginError();
    const pwd = $("adminPassword").value || "";

    if (!pwd) {
        showLoginError("Veuillez saisir le mot de passe.");
        return;
    }

    const btn = $("adminLoginBtn");
    const oldLabel = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Connexion..."; }

    // Authentification RÉELLE via Supabase Auth.
    // L'admin obtient le rôle "authenticated" → ses requêtes peuvent
    // lire et supprimer les rapports (cf. policies SQL).
    const { error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: pwd
    });

    if (btn) { btn.disabled = false; btn.textContent = oldLabel; }

    if (error) {
        showLoginError("Mot de passe incorrect.");
        $("adminPassword").value = "";
        $("adminPassword").focus();
        return;
    }

    enterDashboard();
}

async function onLogoutClick() {
    if (!confirm("Voulez-vous vous déconnecter ?")) return;
    await supabase.auth.signOut();
    location.reload();
}

// =================================================================
//  ENTRÉE DANS LE DASHBOARD
// =================================================================
async function enterDashboard() {
    $("adminLoginScreen").style.display = "none";
    $("dashboardScreen").style.display = "block";

    // Brancher les boutons du dashboard
    $("adminLogoutBtn").addEventListener("click", onLogoutClick);
    $("modalCloseBtn").addEventListener("click", closeModal);
    $("detailsModal").addEventListener("click", (e) => {
        if (e.target.id === "detailsModal") closeModal();
    });

    // Filtres
    ["filterDossier", "filterTech", "filterMode", "filterSearch"]
        .forEach(id => $(id).addEventListener("input", applyFilters));

    // Suppression en masse
    $("bulkDeleteBtn").addEventListener("click", onBulkDeleteClick);

    await refreshData();
}

// =================================================================
//  CHARGEMENT DES RAPPORTS depuis Supabase
// =================================================================
async function refreshData() {
    $("tableArea").className = "loading";
    $("tableArea").textContent = "Chargement des rapports...";
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        rapports = (data || []).map(d => ({
            id:             d.id,
            fileName:       d.file_name || "",
            dossier:        d.dossier || "—",
            tech:           d.tech || "—",
            timestamp:      d.created_at ? new Date(d.created_at) : null,
            mode:           d.mode || "—",
            numeroTicket:   d.numero_ticket || "",
            numeroCommande: d.numero_commande || "",
            raison_sociale: d.raison_sociale || "",
            ville:          d.ville || "",
            wordsSize:      d.words_size || 0,
            jsonSize:       d.json_size || 0,
            docxPath:       d.docx_path || `${d.file_name}.docx`,
            jsonPath:       d.json_path || `${d.file_name}.json`,
            _raw:           d
        }));

        populateTechFilter();
        updateStats();
        applyFilters();
    } catch (err) {
        console.error("Erreur chargement Supabase :", err);
        $("tableArea").className = "";
        $("tableArea").innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>Erreur de chargement : ${escapeHtml(err.message || err)}</div>`;
        showToast("Erreur de chargement des rapports", "error");
    }
}

// =================================================================
//  STATS + ALERTE STOCKAGE
// =================================================================
function updateStats() {
    $("statTotal").textContent = rapports.length;

    const techs = new Set();
    let totalBytes = 0;
    rapports.forEach(r => {
        if (r.tech) techs.add(r.tech);
        totalBytes += (r.wordsSize || 0) + (r.jsonSize || 0);
    });
    $("statTechs").textContent = techs.size;
    $("statStorage").textContent = formatBytes(totalBytes);

    const pct = Math.min(100, (totalBytes / STORAGE_LIMIT_BYTES) * 100);
    const bar = $("storageBar");
    bar.style.width = pct.toFixed(1) + "%";
    bar.className = "storage-progress-bar";

    const card  = $("storageCard");
    const alert = $("storageAlert");
    card.classList.remove("warning", "danger");
    alert.classList.remove("danger");

    if (totalBytes >= STORAGE_LIMIT_BYTES * 0.95) {
        bar.classList.add("danger");
        card.classList.add("danger");
        alert.classList.add("danger");
        alert.style.display = "block";
        $("storageAlertTitle").textContent = "🚨 Limite de stockage atteinte !";
        $("storageAlertText").textContent  = `Vous avez utilisé ${formatBytes(totalBytes)} sur ${formatBytes(STORAGE_LIMIT_BYTES)}. Supprimez impérativement d'anciens rapports.`;
    } else if (totalBytes >= STORAGE_WARNING_BYTES) {
        bar.classList.add("warning");
        card.classList.add("warning");
        alert.style.display = "block";
        $("storageAlertTitle").textContent = "⚠️ Stockage en approche de la limite";
        $("storageAlertText").textContent  = `${formatBytes(totalBytes)} utilisés sur ${formatBytes(STORAGE_LIMIT_BYTES)}. Pensez à supprimer les anciens rapports.`;
    } else {
        alert.style.display = "none";
    }
    $("statStorageSub").textContent = `sur ${formatBytes(STORAGE_LIMIT_BYTES)} disponibles`;
}

function populateTechFilter() {
    const sel = $("filterTech");
    const current = sel.value;
    const techs = [...new Set(rapports.map(r => r.tech).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Tous</option>' +
        techs.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
    if (techs.includes(current)) sel.value = current;
}

// =================================================================
//  FILTRES
// =================================================================
function applyFilters() {
    const dossier = $("filterDossier").value;
    const tech    = $("filterTech").value;
    const mode    = $("filterMode").value;
    const search  = $("filterSearch").value.trim().toLowerCase();

    filteredRapports = rapports.filter(r => {
        if (dossier && r.dossier !== dossier) return false;
        if (tech    && r.tech    !== tech)    return false;
        if (mode    && r.mode    !== mode)    return false;
        if (search) {
            const hay = (r.numeroTicket + " " + r.raison_sociale + " " + r.ville + " " + r.fileName)
                .toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    renderTable();
}

// =================================================================
//  RENDU DU TABLEAU
// =================================================================
function renderTable() {
    const area = $("tableArea");
    area.className = "";

    if (filteredRapports.length === 0) {
        area.innerHTML = `<div class="empty-state">
            <div class="icon">📭</div>
            ${rapports.length === 0 ? "Aucun rapport envoyé pour le moment." : "Aucun rapport ne correspond aux filtres."}
        </div>`;
        return;
    }

    const rows = filteredRapports.map(r => `
        <tr data-id="${escapeAttr(r.id)}">
            <td class="date">${formatDate(r.timestamp)}</td>
            <td><span class="badge badge-dossier">${escapeHtml(r.dossier)}</span></td>
            <td>${escapeHtml(r.tech)}</td>
            <td><strong>${escapeHtml(r.numeroTicket)}</strong></td>
            <td>${escapeHtml(r.raison_sociale)}</td>
            <td>${escapeHtml(r.ville)}</td>
            <td><span class="badge badge-${r.mode === "travaux" ? "travaux" : "audit"}">${escapeHtml(r.mode)}</span></td>
            <td class="actions">
                <button class="action-btn" data-act="edit"  title="Ouvrir dans le formulaire pour modifier">✏️</button>
                <button class="action-btn" data-act="view"  title="Voir détails JSON">👀</button>
                <button class="action-btn" data-act="docx"  title="Télécharger Word">📄</button>
                <button class="action-btn" data-act="json"  title="Télécharger JSON">📋</button>
                <button class="action-btn delete" data-act="del" title="Supprimer">🗑️</button>
            </td>
        </tr>
    `).join("");

    area.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Dossier</th>
                    <th>Technicien</th>
                    <th>N° Ticket</th>
                    <th>Raison sociale</th>
                    <th>Ville</th>
                    <th>Mode</th>
                    <th style="text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    area.querySelectorAll("button.action-btn").forEach(btn => {
        btn.addEventListener("click", onActionClick);
    });
}

// =================================================================
//  ACTIONS PAR RAPPORT
// =================================================================
async function onActionClick(e) {
    const btn = e.currentTarget;
    const act = btn.dataset.act;
    const tr  = btn.closest("tr");
    const id  = tr?.dataset.id;
    const rap = rapports.find(r => String(r.id) === String(id));
    if (!rap) return;

    if (act === "edit") {
        await openInForm(rap);
    } else if (act === "view") {
        await openDetailsModal(rap);
    } else if (act === "docx") {
        await downloadFile(rap.docxPath, rap.fileName + ".docx");
    } else if (act === "json") {
        await downloadFile(rap.jsonPath, rap.fileName + ".json");
    } else if (act === "del") {
        await deleteReport(rap);
    }
}

// =================================================================
//  OUVRIR LE RAPPORT DANS SON FORMULAIRE D'ORIGINE (édition)
//  - Télécharge le JSON depuis Supabase
//  - Le stocke dans sessionStorage
//  - Ouvre le formulaire correspondant dans un nouvel onglet
//  - Le formulaire (via auth-upload.js) détecte le JSON et le charge
// =================================================================
async function openInForm(rap) {
    if (!rap.dossier || !["pico-quatra", "4g-5g", "starlink"].includes(rap.dossier)) {
        showToast(`Dossier inconnu : "${rap.dossier}". Impossible d'ouvrir le formulaire.`, "error");
        return;
    }

    showToast("Chargement du rapport...", "info");
    try {
        // 1) Télécharger le JSON depuis Supabase
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(rap.jsonPath);
        if (error) throw error;
        const jsonText = await data.text();

        // 2) Stocker dans sessionStorage avec une clé partagée
        //    NB: sessionStorage est par-onglet, donc on stocke avant
        //    d'ouvrir le nouvel onglet. Mais sessionStorage n'est PAS
        //    partagé entre onglets → on utilise localStorage à la place,
        //    avec une expiration courte.
        const payload = {
            jsonText: jsonText,
            fileName: rap.fileName,
            timestamp: Date.now()
        };
        localStorage.setItem("__techcouv_import_pending__", JSON.stringify(payload));

        // 3) Construire l'URL du formulaire et l'ouvrir dans un nouvel onglet
        const url = `./${rap.dossier}/`;
        const newWin = window.open(url, "_blank");
        if (!newWin) {
            // Popup bloquée → demander à l'utilisateur de cliquer
            showToast("⚠️ Popup bloquée. Cliquez sur le lien ci-dessous.", "error");
            const link = prompt(
                "Le navigateur a bloqué l'ouverture automatique.\n\nCopiez ce lien et ouvrez-le manuellement :",
                window.location.origin + window.location.pathname.replace(/admin\.html$/, "") + rap.dossier + "/"
            );
            return;
        }
        showToast("Formulaire ouvert dans un nouvel onglet. Connectez-vous pour voir les données.", "success");
    } catch (err) {
        console.error(err);
        showToast("Erreur de chargement : " + (err.message || err), "error");
    }
}

async function openDetailsModal(rap) {
    $("modalTitle").textContent = "📄 " + rap.fileName;
    $("modalBody").textContent = "Chargement du JSON...";
    $("detailsModal").classList.add("open");
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(rap.jsonPath);
        if (error) throw error;
        const text = await data.text();
        try {
            const parsed = JSON.parse(text);
            $("modalBody").textContent = JSON.stringify(parsed, null, 2);
        } catch {
            $("modalBody").textContent = text;
        }
    } catch (err) {
        $("modalBody").textContent = "❌ Erreur de chargement : " + (err.message || err);
    }
}

function closeModal() {
    $("detailsModal").classList.remove("open");
}

async function downloadFile(path, filename) {
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(path);
        if (error) throw error;

        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        showToast("Téléchargement lancé : " + filename, "success");
    } catch (err) {
        console.error(err);
        showToast("Erreur de téléchargement : " + (err.message || err), "error");
    }
}

// =================================================================
//  SUPPRESSION SIMPLE
// =================================================================
async function deleteReport(rap) {
    if (!confirm(`Supprimer définitivement le rapport ?\n\n${rap.fileName}\n\nLes fichiers Word et JSON seront aussi supprimés.`)) {
        return;
    }
    try {
        // 1) Storage : supprimer .docx et .json
        const { error: errStorage } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([rap.docxPath, rap.jsonPath]);
        if (errStorage) console.warn("Suppression Storage partielle :", errStorage);

        // 2) Table : supprimer la ligne
        const { error: errDb } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq("id", rap.id);
        if (errDb) throw errDb;

        showToast("Rapport supprimé.", "success");
        await refreshData();
    } catch (err) {
        console.error(err);
        showToast("Erreur de suppression : " + (err.message || err), "error");
    }
}

// =================================================================
//  SUPPRESSION EN MASSE PAR DATE
// =================================================================
async function onBulkDeleteClick() {
    const dateStr = $("bulkDeleteDate").value;
    if (!dateStr) {
        showToast("Sélectionnez une date.", "error");
        return;
    }
    const cutoff = new Date(dateStr + "T00:00:00");
    if (isNaN(cutoff.getTime())) {
        showToast("Date invalide.", "error");
        return;
    }
    const toDelete = rapports.filter(r => r.timestamp && r.timestamp < cutoff);
    if (toDelete.length === 0) {
        showToast(`Aucun rapport antérieur au ${dateStr}.`, "info");
        return;
    }
    if (!confirm(`Supprimer ${toDelete.length} rapport(s) antérieur(s) au ${dateStr} ?\n\nCette action est irréversible.`)) {
        return;
    }
    showToast(`Suppression en cours de ${toDelete.length} rapport(s)...`, "info");

    const allPaths = [];
    const allIds   = [];
    toDelete.forEach(r => {
        allPaths.push(r.docxPath, r.jsonPath);
        allIds.push(r.id);
    });

    let ok = 0, ko = 0;
    try {
        const { error: errStorage } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(allPaths);
        if (errStorage) console.warn("Suppression Storage partielle :", errStorage);

        const { error: errDb } = await supabase
            .from(TABLE_NAME)
            .delete()
            .in("id", allIds);

        if (errDb) {
            ko = allIds.length;
        } else {
            ok = allIds.length;
        }
    } catch (err) {
        console.error(err);
        ko = allIds.length;
    }

    showToast(`Terminé. ${ok} supprimé(s)${ko > 0 ? `, ${ko} échec(s)` : ""}.`, ko > 0 ? "error" : "success");
    await refreshData();
}

// =================================================================
//  UTILITAIRES
// =================================================================
function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2) + " " + sizes[i];
}

function formatDate(d) {
    if (!d) return "—";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function escapeAttr(s) { return escapeHtml(s); }
