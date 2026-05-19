/* ============================================================
   pdfReport.js
   Génération d'un rapport PDF à partir des mêmes données que le
   Word, via html2pdf.js (html2canvas + jsPDF).

   - Bouton : "📄 Générer le rapport PDF" (dans index.html)
   - Fonction globale exposée : window.generatePDFReport()
   - Utilise photoStore, evacPlans, etc. via les __helpers exposés
     par app.js (window.__photoStore, window.__evacPlans, ...).
   ============================================================ */

(function () {
    'use strict';

    // ---------- Palette (cohérente avec le Word) ----------
    const COL_TITLE     = "#1F3864";
    const COL_SUBTITLE  = "#2E75B6";
    const COL_LABEL_BG  = "#F2F2F2";
    const COL_PHOTO_BG  = "#DEEBF7";
    const COL_BORDER    = "#BFBFBF";

    function $(id) { return document.getElementById(id); }
    function val(id) { const el = $(id); return el && 'value' in el ? (el.value || "") : ""; }
    function htmlEscape(s) {
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    function nl2br(s) { return htmlEscape(s).replace(/\n/g, "<br>"); }

    // ---------- Attente d'html2pdf ----------
    function waitForHtml2Pdf(timeoutMs) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            (function check() {
                if (typeof window.html2pdf !== "undefined") return resolve();
                if (Date.now() - start > (timeoutMs || 8000)) {
                    return reject(new Error("html2pdf indisponible (vérifiez votre connexion ou le fichier local html2pdf.bundle.min.js)."));
                }
                setTimeout(check, 100);
            })();
        });
    }

    // ---------- Helpers de rendu HTML ----------
    function pageBreak() {
        return `<div style="page-break-before: always; height:0;"></div>`;
    }
    function bandeauTitre(titre, sousTitre) {
        return `
        <div style="background:${COL_TITLE}; color:#fff; padding:18px 16px; text-align:center;
                    border-radius:4px; margin-bottom:14px;">
            <div style="font-size:18px; font-weight:700; letter-spacing:.3px;">${htmlEscape(titre)}</div>
            <div style="font-size:11px; margin-top:4px; opacity:.92;">${htmlEscape(sousTitre || "")}</div>
        </div>`;
    }
    function sectionTitle(num, txt) {
        return `<h2 style="margin:24px 0 8px 0; color:${COL_TITLE}; font-size:16px;
                            border-bottom:2px solid ${COL_TITLE}; padding-bottom:4px;">
                  ${num}.&nbsp;&nbsp;${htmlEscape(txt)}
                </h2>`;
    }
    function subTitle(num, txt) {
        return `<h3 style="margin:14px 0 6px 0; color:${COL_SUBTITLE}; font-size:13px; font-style:italic;">
                  ${htmlEscape(num)} - ${htmlEscape(txt)}
                </h3>`;
    }
    function infoTable(rows) {
        // rows : [ [label, value], ... ]
        const trs = rows.map(r => `
            <tr>
              <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:6px 8px;
                         font-weight:600; width:35%; font-size:11px;">${htmlEscape(r[0])}</td>
              <td style="border:1px solid ${COL_BORDER}; padding:6px 8px; font-size:11px;">${nl2br(r[1] || "—")}</td>
            </tr>`).join("");
        return `<table style="width:100%; border-collapse:collapse; margin-bottom:10px;">${trs}</table>`;
    }
    function photoBlock(title, dataUrl, opts) {
        opts = opts || {};
        const maxH = opts.maxH || 320;
        const inner = dataUrl
            ? `<img src="${dataUrl}" style="max-width:100%; max-height:${maxH}px; display:block; margin:0 auto;
                                            border:1px solid ${COL_BORDER}; background:#fff;" alt="">`
            : `<div style="padding:30px 0; color:#888; font-style:italic; text-align:center;">(Photo non fournie)</div>`;
        return `
        <div class="no-break" style="margin:8px 0 14px 0; border:1px solid ${COL_BORDER}; border-radius:4px; overflow:hidden;">
            <div style="background:${COL_PHOTO_BG}; color:${COL_TITLE}; padding:5px 8px; font-size:11px;
                        font-weight:600; border-bottom:1px solid ${COL_BORDER};">${htmlEscape(title)}</div>
            <div style="padding:8px; text-align:center; background:#fff;">${inner}</div>
        </div>`;
    }

    // ---------- Compte rendu (hiérarchisé) ----------
    function renderCompteRendu() {
        const txt = ($("compteRenduPreview") && $("compteRenduPreview").value || "").trim();
        if (!txt) return `<p style="color:#888; font-style:italic;">(Aucun élément renseigné dans le compte rendu principal.)</p>`;
        const blocks = (window.CompteRendu && window.CompteRendu.parseText) ? window.CompteRendu.parseText(txt) : [];
        if (!blocks.length) return `<pre style="white-space:pre-wrap; font-family:inherit;">${htmlEscape(txt)}</pre>`;
        return blocks.map(b => {
            switch (b.type) {
                case 'h1':     return `<div style="font-weight:700; font-size:13px; color:${COL_TITLE}; margin:10px 0 4px 0;">${htmlEscape(b.text)}</div>`;
                case 'h2':     return `<div style="font-weight:700; font-size:12px; color:${COL_SUBTITLE}; margin:8px 0 3px 0;">▸ ${htmlEscape(b.text)}</div>`;
                case 'h3':     return `<div style="font-weight:600; font-size:11px; margin:6px 0 2px 12px;">◦ ${htmlEscape(b.text)}</div>`;
                case 'bullet': return `<div style="font-size:11px; margin:2px 0 2px 28px;">– ${htmlEscape(b.text)}</div>`;
                case 'spacer': return `<div style="height:5px;"></div>`;
                default:       return `<div style="font-size:11px; margin:2px 0;">${htmlEscape(b.text)}</div>`;
            }
        }).join("");
    }

    // ---------- Points de mesure ----------
    function collectMeasurePoints() {
        const out = [];
        document.querySelectorAll('.measure-point-group').forEach(g => {
            out.push({
                num:           g.dataset.point || "",
                tech:         (g.dataset.tech || "4g").toLowerCase(),
                pointId:       g.dataset.pointId || "",
                lieu:          g.querySelector('.point-lieu')?.value     || "",
                rsrp:          g.querySelector('.measure-rsrp')?.value   || "",
                rsrq:          g.querySelector('.measure-rsrq')?.value   || "",
                sinr:          g.querySelector('.measure-sinr')?.value   || "",
                down:          g.querySelector('.measure-down')?.value   || "",
                up:            g.querySelector('.measure-up')?.value     || "",
                band:          g.querySelector('.measure-band')?.value   || "",
                analysisLabel: g.dataset.analysisLabel || "",
                analysisColor: g.dataset.analysisColor || ""
            });
        });
        return out;
    }
    function badge(label, color) {
        if (!label) return "";
        const c = color || "#6b7280";
        return `<span style="display:inline-block; background:${c}; color:#fff; padding:3px 9px;
                              border-radius:10px; font-size:10px; font-weight:700;">${htmlEscape(label)}</span>`;
    }
    function measurePointBlock(mp, photos) {
        const techLabel = (mp.tech === "5g") ? "5G" : "4G";
        const techColor = (mp.tech === "5g") ? "#16A34A" : "#2E75B6";
        const numAff = mp.num || "?";
        const lieuTxt = mp.lieu || "(lieu non précisé)";
        const photoLieu   = photos[`mesure_lieu_${mp.pointId}`]   || null;
        const photoScreen = photos[`mesure_screen_${mp.pointId}`] || null;
        return `
        <div class="no-break" style="margin:14px 0; border:1px solid ${COL_BORDER}; border-radius:4px;">
            <div style="background:${techColor}; color:#fff; padding:6px 10px; font-weight:700; font-size:12px;">
                ${techLabel} — Point ${htmlEscape(numAff)} : ${htmlEscape(lieuTxt)}
                ${mp.analysisLabel ? '&nbsp;&nbsp;' + badge(mp.analysisLabel, mp.analysisColor) : ''}
            </div>
            <div style="padding:8px;">
                <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
                    <tr>
                        <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px; font-weight:600; width:18%;">RSRP (dBm)</td>
                        <td style="border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px;">${htmlEscape(mp.rsrp || "—")}</td>
                        <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px; font-weight:600; width:18%;">RSRQ (dB)</td>
                        <td style="border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px;">${htmlEscape(mp.rsrq || "—")}</td>
                        <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px; font-weight:600; width:14%;">SNR (dB)</td>
                        <td style="border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px;">${htmlEscape(mp.sinr || "—")}</td>
                    </tr>
                    <tr>
                        <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px; font-weight:600;">Débit ↓ (Mbps)</td>
                        <td style="border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px;">${htmlEscape(mp.down || "—")}</td>
                        <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px; font-weight:600;">Débit ↑ (Mbps)</td>
                        <td style="border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px;">${htmlEscape(mp.up || "—")}</td>
                        <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px; font-weight:600;">Bande</td>
                        <td style="border:1px solid ${COL_BORDER}; padding:4px 8px; font-size:10px;">${htmlEscape(mp.band || "—")}</td>
                    </tr>
                </table>
                <table style="width:100%; border-collapse:collapse;">
                    <tr>
                        <td style="width:50%; vertical-align:top; padding-right:4px;">
                            ${photoBlock("Photo du lieu de mesure", photoLieu ? photoLieu.dataUrl : null, { maxH: 230 })}
                        </td>
                        <td style="width:50%; vertical-align:top; padding-left:4px;">
                            ${photoBlock("Capture des mesures (Speedtest, signal...)", photoScreen ? photoScreen.dataUrl : null, { maxH: 230 })}
                        </td>
                    </tr>
                </table>
            </div>
        </div>`;
    }

    // ---------- Matrice de qualité ----------
    function qualityMatrixTable() {
        const M = window.__QUALITY_MATRIX;
        if (!M) return "";
        const rsrpRows = [
            { label: "≥ −85 dBm (Excellent)",   k: "excellent" },
            { label: "−85 à −100 dBm (Bon)",    k: "bon" },
            { label: "−100 à −115 dBm (Faible)", k: "faible" },
            { label: "< −115 dBm (Critique)",   k: "critique" }
        ];
        const snrCols = [
            { label: "SNR > 15",   k: ">15" },
            { label: "SNR 5 à 15", k: "5-15" },
            { label: "SNR 0 à 5",  k: "0-5" },
            { label: "SNR < 0",    k: "<0" }
        ];
        const head = `
            <tr>
              <th style="background:${COL_TITLE}; color:#fff; border:1px solid ${COL_BORDER}; padding:6px; font-size:11px;">RSRP (Puissance)</th>
              ${snrCols.map(c => `<th style="background:${COL_TITLE}; color:#fff; border:1px solid ${COL_BORDER}; padding:6px; font-size:11px;">${htmlEscape(c.label)}</th>`).join("")}
            </tr>`;
        const body = rsrpRows.map(r => `
            <tr>
              <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:6px; font-size:11px; font-weight:600;">${htmlEscape(r.label)}</td>
              ${snrCols.map(c => {
                  const q = M[r.k][c.k];
                  return `<td style="background:${q.color}; color:#fff; border:1px solid ${COL_BORDER}; padding:6px; font-size:11px; font-weight:600; text-align:center;">${htmlEscape(q.label)}</td>`;
              }).join("")}
            </tr>`).join("");
        return `<table style="width:100%; border-collapse:collapse;">${head}${body}</table>`;
    }

    // ---------- Cheminements ----------
    function cheminementsBlock(photos) {
        const items = document.querySelectorAll('.cheminement-item');
        if (!items.length) return "";
        let html = "";
        items.forEach((it) => {
            const idx = it.dataset.idx;
            const comment = it.querySelector('.cheminement-comment')?.value || "";
            const p = photos[`cheminement_${idx}`];
            html += `
                <div class="no-break" style="margin:10px 0;">
                    ${photoBlock(`Cheminement n°${idx}`, p ? p.dataUrl : null, { maxH: 300 })}
                    ${comment ? `<div style="font-size:11px; margin:4px 4px 8px 4px;"><b>Commentaire :</b> ${nl2br(comment)}</div>` : ""}
                </div>`;
        });
        return html;
    }

    // ---------- Plans d'évacuation ----------
    async function evacPlansBlock() {
        const noPlan = $("noEvacPlan") && $("noEvacPlan").checked;
        if (noPlan) {
            const c = ($("noEvacPlanComment")?.value || "").trim();
            return `<p style="font-size:11px;"><i>Pas de plan d'évacuation fourni.</i>${c ? "<br><b>Justification :</b> " + nl2br(c) : ""}</p>`;
        }
        const plans = (typeof window.__evacPlans === "function") ? window.__evacPlans() : [];
        if (!plans.length) return `<p style="font-size:11px; color:#888;"><i>Aucun plan d'évacuation renseigné.</i></p>`;
        let html = "";
        for (const plan of plans) {
            let imgTag = "";
            try {
                const composed = await window.__composeEvacPlanDataUrl(plan.id);
                if (composed) {
                    imgTag = `<img src="${composed.dataUrl}" style="max-width:100%; max-height:380px; display:block; margin:6px auto; border:1px solid ${COL_BORDER};" alt="">`;
                }
            } catch (e) { /* ignore */ }
            if (!imgTag) imgTag = `<div style="padding:30px 0; color:#888; font-style:italic; text-align:center;">(Plan non disponible)</div>`;

            html += `
            <div class="no-break" style="margin:12px 0; border:1px solid ${COL_BORDER}; border-radius:4px;">
                <div style="background:${COL_PHOTO_BG}; color:${COL_TITLE}; padding:6px 10px; font-weight:600; font-size:11px;">
                    ${htmlEscape(plan.title || ("Plan " + plan.id))}
                    &nbsp;·&nbsp; <span style="font-weight:400;">${plan.points.length} point(s) placé(s)</span>
                </div>
                <div style="padding:6px;">${imgTag}</div>
            </div>`;
        }
        return html;
    }

    // ---------- Construction du document complet ----------
    async function buildReportHtml() {
        const mode = $("modeIntervention")?.value || "audit";
        const isTravaux = (mode === "travaux");
        const titrePrincipal = isTravaux
            ? "RAPPORT DE TRAVAUX — INSTALLATION ANTENNE 4G/5G"
            : "RAPPORT D'AUDIT — INSTALLATION ANTENNE 4G/5G";

        const photos = window.__photoStore || {};

        // === En-tête ===
        let html = `
        <div style="font-family: Calibri, Arial, sans-serif; color:#222; font-size:12px; line-height:1.4;">
            ${bandeauTitre(titrePrincipal, "Bouygues Telecom │ IPKONEKT")}
            <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
                <tr>
                    <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:6px; font-weight:600; font-size:11px; width:33%;">Référence commande</td>
                    <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:6px; font-weight:600; font-size:11px; width:33%;">Auditeur / Intervenant</td>
                    <td style="background:${COL_LABEL_BG}; border:1px solid ${COL_BORDER}; padding:6px; font-weight:600; font-size:11px; width:34%;">Date d'audit</td>
                </tr>
                <tr>
                    <td style="border:1px solid ${COL_BORDER}; padding:6px; font-size:11px;">${htmlEscape(val("ref_commande"))}</td>
                    <td style="border:1px solid ${COL_BORDER}; padding:6px; font-size:11px;">${htmlEscape(val("auditeur"))}</td>
                    <td style="border:1px solid ${COL_BORDER}; padding:6px; font-size:11px;">${htmlEscape(val("date_audit"))}</td>
                </tr>
            </table>`;

        // === Section 1 : Infos administratives ===
        html += sectionTitle(1, "Informations administratives du client");
        html += infoTable([
            ["Raison sociale",    val("raison_sociale")],
            ["Nom du contact",    val("contact_nom")],
            ["Téléphone",         val("contact_tel")],
            ["Email",             val("contact_email")],
            ["Adresse complète",  val("adresse")],
            ["Code postal / Ville", (val("code_postal") + " " + val("ville")).trim()],
            ["Type d'établissement", val("type_etablissement")]
        ]);

        // === Section 2 : Configuration et accès ===
        html += sectionTitle(2, "Configuration de la box / accès opérateur");
        html += infoTable([
            ["Type d'accès",      val("type_acces")],
            ["Opérateur(s)",      val("operateur")],
            ["Numéro de ligne",   val("num_ligne")],
            ["Référence de box",  val("ref_box")],
            ["Configuration",     val("config_acces")]
        ]);

        // === Section 3 : Photo routeur / point de pose ===
        html += sectionTitle(3, "Installation du routeur / Cheminement");
        const routeurPhoto = photos["routeur_install"] ? photos["routeur_install"].dataUrl : null;
        html += photoBlock("Photo du routeur / emplacement d'installation", routeurPhoto, { maxH: 340 });
        const chemHtml = cheminementsBlock(photos);
        if (chemHtml) {
            html += subTitle("3.1", "Cheminements identifiés");
            html += chemHtml;
        }

        // === Section 4 : Points de mesure 4G ===
        const mps = collectMeasurePoints();
        const mps4g = mps.filter(m => m.tech === "4g");
        const mps5g = mps.filter(m => m.tech === "5g");
        if (mps4g.length) {
            html += pageBreak();
            html += sectionTitle(4, "Points de mesure 4G");
            mps4g.forEach(mp => { html += measurePointBlock(mp, photos); });
        }
        if (mps5g.length) {
            html += pageBreak();
            html += sectionTitle(mps4g.length ? 5 : 4, "Points de mesure 5G");
            mps5g.forEach(mp => { html += measurePointBlock(mp, photos); });
        }

        // === Section : Matrice de qualité ===
        html += pageBreak();
        html += sectionTitle("·", "Matrice d'interprétation officielle (RSRP × SNR)");
        html += qualityMatrixTable();

        // === Section : Plans d'évacuation ===
        html += pageBreak();
        html += sectionTitle("·", "Plans d'évacuation (positionnement des points de mesure)");
        html += await evacPlansBlock();

        // === Compte rendu / Synthèse ===
        html += pageBreak();
        const titreCR = isTravaux ? "Compte rendu — Travaux réalisés / Mise en œuvre"
                                  : "Compte rendu — Préconisations / Points à prévoir";
        html += sectionTitle("·", titreCR);
        html += `<div style="background:#fafafa; border:1px solid ${COL_BORDER}; padding:10px; border-radius:4px;">
                    ${renderCompteRendu()}
                 </div>`;

        // === Signature ===
        html += `<div style="margin-top:24px; border-top:1px solid ${COL_BORDER}; padding-top:10px;">
                    <table style="width:100%;">
                        <tr>
                            <td style="font-size:11px; width:50%;"><b>Signataire :</b> ${htmlEscape(val("signataire_nom"))}</td>
                            <td style="font-size:11px; width:50%;"><b>Date :</b> ${htmlEscape(val("signataire_date"))}</td>
                        </tr>
                    </table>
                 </div>`;

        // === Pied de page (sera répété par html2pdf via pagination CSS si possible) ===
        html += `<div style="margin-top:18px; padding-top:6px; border-top:1px solid #ccc;
                              font-size:9px; color:#888; font-style:italic; text-align:center;">
                    Document confidentiel — Usage interne IPKONEKT / Bouygues Telecom
                 </div>`;

        html += `</div>`; // close root
        return html;
    }

    // ---------- API publique ----------
    async function generatePDFReport() {
        const btn = $("btnGeneratePDF");
        try {
            // Mêmes règles métier que pour le Word
            if (typeof window.__validateMeasurementPoints === "function") {
                const v = window.__validateMeasurementPoints();
                if (v && v.valid === false) {
                    alert("🔒 Génération PDF bloquée — éléments manquants :\n\n" + (v.errors || []).join("\n") +
                          "\n\nComplétez les éléments ci-dessus pour pouvoir générer le PDF.");
                    return;
                }
            }

            if (btn) { btn.disabled = true; btn.textContent = "⏳ Génération du PDF en cours..."; }

            await waitForHtml2Pdf();

            const reportHtml = await buildReportHtml();

            // Conteneur off-screen pour le rendu html2canvas
            const container = document.createElement("div");
            container.id = "__pdfReportRoot";
            container.style.cssText = "position:absolute; left:-99999px; top:0; width:780px; background:#fff; padding:24px;";
            container.innerHTML = reportHtml;
            document.body.appendChild(container);

            const safeName = (val("raison_sociale") || "Site").replace(/[^a-zA-Z0-9_-]/g, "_");
            const prefix = (val("modeIntervention") === "travaux") ? "Travaux" : "Audit";
            const filename = `${prefix}_4G5G_${safeName}_${val("date_audit") || ""}.pdf`;

            const opt = {
                margin:       [10, 10, 14, 10], // top, left, bottom, right (mm)
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.92 },
                html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'], avoid: '.no-break' }
            };

            await window.html2pdf().set(opt).from(container).save();

            // Nettoyage
            document.body.removeChild(container);
        } catch (err) {
            console.error("Erreur génération PDF :", err);
            alert("Erreur lors de la génération du PDF : " + (err && err.message ? err.message : err));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "📄 Générer le rapport PDF"; }
        }
    }

    window.generatePDFReport = generatePDFReport;
})();
