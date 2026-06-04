/* ============================================================================
   compteRendu.js — Module Compte Rendu Principal
   ----------------------------------------------------------------------------
   Gère :
     - Le catalogue des travaux/fournitures issus de "TYPES DE TRAVAUX POSSIBLES"
     - Le rendu dynamique des cases à cocher
     - Les champs conditionnels (quantité, métrage, intérieur/extérieur, état)
     - La génération automatique du texte du compte rendu (mode Audit / Travaux)
   ============================================================================ */

(function() {
    'use strict';

    /* --------------------------------------------------------------------
       1. CATALOGUE DES ÉLÉMENTS
       --------------------------------------------------------------------
       Chaque item :
         id        : identifiant unique (utilisé pour les inputs)
         label     : libellé affiché
         qty       : type de quantité  → null | 'count' | 'metrage' | 'hauteur'
         dual      : true si peut être intérieur ET extérieur (avec 2 métrages)
         loc       : true si choix simple intérieur/extérieur (sans dual)
         state     : true si peut être "déjà présent" ou "à installer"
         verbAudit : verbe au mode Audit pour le rendu (ex: "Prévoir")
         verbTrav  : verbe au mode Travaux (ex: "Mise en place de")
       -------------------------------------------------------------------- */

    const CATALOGUE = [
        {
            cat: "Travaux radio / antennaires",
            icon: "📡",
            items: [
                { id: "pose_pico",      label: "Pose pico BTS",                 qty: "count",   hauteur: true,  state: false },
                { id: "pose_smallcell", label: "Pose small cell",               qty: "count",   hauteur: true,  state: false },
                { id: "pose_repeteur",  label: "Pose répéteur",                 qty: "count",   hauteur: true,  state: false },
                { id: "ant_int",        label: "Pose antenne intérieure",      qty: "count",   hauteur: true,  state: false },
                { id: "ant_ext",        label: "Pose antenne extérieure",      qty: "count",   hauteur: true,  state: false },
                { id: "coupleur",       label: "Pose coupleur / splitter",     qty: "count",   state: false },
                { id: "attenuateur",    label: "Pose atténuateur",              qty: "count",   state: false },
                { id: "parafoudre",     label: "Pose parafoudre coaxial",       qty: "count",   state: false },
                { id: "azimutage",      label: "Azimutage / orientation antennaire", qty: null, state: false },
                { id: "tilt",           label: "Tilt mécanique / réglage inclinaison", qty: null, state: false },
                { id: "tests_radio",    label: "Tests radio post-pose",        qty: null,      state: false },
                { id: "calibration",    label: "Calibration / commissioning",  qty: null,      state: false },
                { id: "tos_ros",        label: "Mesure TOS / ROS",              qty: null,      state: false }
            ]
        },
        {
            cat: "Travaux de desserte",
            icon: "🔌",
            items: [
                { id: "create_rj45",    label: "Création desserte RJ45",        qty: "metrage", dual: true,    state: false },
                { id: "create_fibre",   label: "Création desserte fibre optique", qty: "metrage", dual: true, state: false },
                { id: "extension_res",  label: "Extension réseau existant",    qty: "metrage", dual: true,    state: false },
                { id: "tirage_vert",    label: "Tirage câble vertical",        qty: "metrage", state: false },
                { id: "tirage_hor",     label: "Tirage câble horizontal",      qty: "metrage", state: false },
                { id: "tirage_coax",    label: "Tirage câble coaxial",          qty: "metrage", dual: true,   state: false },
                { id: "pass_fauxplaf",  label: "Passage en faux plafond",       qty: "metrage", state: false },
                { id: "pass_gainetech", label: "Passage en gaine technique",    qty: "metrage", state: false },
                { id: "pass_videsanit", label: "Passage en vide sanitaire",     qty: "metrage", state: false },
                { id: "pass_combles",   label: "Passage en combles",            qty: "metrage", state: false },
                { id: "pass_facade",    label: "Passage façade extérieure",     qty: "metrage", state: false },
                { id: "pass_goulotte",  label: "Passage sous goulotte",         qty: "metrage", dual: true,    state: false },
                { id: "pass_iro",       label: "Passage tube IRO",              qty: "metrage", dual: true,    state: false },
                { id: "pass_irl",       label: "Passage IRL apparent",          qty: "metrage", dual: true,    state: false },
                { id: "pass_chemcab",   label: "Passage chemin de câble",      qty: "metrage", dual: true,    state: false },
                { id: "pass_dalle",     label: "Passage sur dalle / toiture terrasse", qty: "metrage", state: false },
                { id: "descente_tech",  label: "Descente technique",            qty: "metrage", state: false },
                { id: "pass_caniveau",  label: "Passage caniveau extérieur",    qty: "metrage", state: false },
                { id: "pass_tpc",       label: "Passage gaine TPC enterrée",    qty: "metrage", state: false },
                { id: "tranchee",       label: "Tranchée",                      qty: "metrage", state: false },
                { id: "raccord_baie",   label: "Raccordement baie informatique", qty: null,    state: false },
                { id: "brassage",       label: "Brassage réseau",               qty: "count",   labelQty: "jarretière(s)", state: false }
            ]
        },
        {
            cat: "Travaux de percement",
            icon: "🔨",
            items: [
                { id: "perc_placo",     label: "Percement cloison placo",       qty: "count",   state: false },
                { id: "perc_beton",     label: "Percement mur béton",           qty: "count",   state: false },
                { id: "perc_brique",    label: "Percement brique",              qty: "count",   state: false },
                { id: "trav_dalle",     label: "Traversée dalle",               qty: "count",   state: false },
                { id: "trav_facade",    label: "Traversée façade",              qty: "count",   state: false },
                { id: "trav_toiture",   label: "Traversée toiture",             qty: "count",   state: false },
                { id: "perc_etanche",   label: "Percement technique étanche",   qty: "count",   state: false },
                { id: "reprise_etanch", label: "Reprise étanchéité",            qty: null,      state: false },
                { id: "carottage",      label: "Carottage",                     qty: "count",   state: false },
                { id: "scellement",     label: "Scellement chimique",           qty: "count",   state: false },
                { id: "rebouchage",     label: "Rebouchage coupe-feu",          qty: "count",   state: false },
                { id: "reprise_finit",  label: "Reprise finition",              qty: null,      state: false }
            ]
        },
        {
            cat: "Travaux de fixation",
            icon: "🔧",
            items: [
                { id: "fix_mur",        label: "Fixation murale",               qty: "count",   state: false },
                { id: "fix_plafond",    label: "Fixation plafond",              qty: "count",   state: false },
                { id: "fix_dalle",      label: "Fixation sous dalle",           qty: "count",   state: false },
                { id: "fix_charpente",  label: "Fixation charpente métallique", qty: "count",   state: false },
                { id: "fix_facade",     label: "Fixation façade",               qty: "count",   state: false },
                { id: "fix_mat",        label: "Fixation mât",                  qty: "count",   state: false },
                { id: "fix_deport",     label: "Fixation support déporté",      qty: "count",   state: false },
                { id: "pose_console",   label: "Pose console",                  qty: "count",   state: false },
                { id: "pose_autoport",  label: "Pose support autoporté",        qty: "count",   state: false },
                { id: "pose_chemin",    label: "Pose support cheminée",         qty: "count",   state: false },
                { id: "pose_sabot",     label: "Pose sabot",                    qty: "count",   state: false },
                { id: "pose_platine",   label: "Pose platine",                  qty: "count",   state: false },
                { id: "pose_railDIN",   label: "Pose rail DIN",                 qty: "count",   state: false },
                { id: "renfort_struct", label: "Renfort structurel",            qty: null,      state: false },
                { id: "contrepoids",    label: "Pose contrepoids",              qty: "count",   state: false }
            ]
        },
        {
            cat: "Travaux réseau / informatique",
            icon: "💻",
            items: [
                { id: "switch",         label: "Switch PoE",                    qty: "count",   state: true },
                { id: "injecteur_poe",  label: "Injecteur PoE",                  qty: "count",   state: true },
                { id: "baie_6u",        label: "Baie 6U",                       qty: "count",   state: true },
                { id: "baie_9u",        label: "Baie 9U",                       qty: "count",   state: true },
                { id: "baie_12u",       label: "Baie 12U",                      qty: "count",   state: true },
                { id: "coffret_mural",  label: "Coffret mural",                 qty: "count",   state: true },
                { id: "ventil_baie",    label: "Ventilation baie",              qty: null,      state: true },
                { id: "plateau",        label: "Plateau technique",             qty: "count",   state: true },
                { id: "patch_panel",    label: "Patch panel",                   qty: "count",   state: true },
                { id: "prise_rj45",     label: "Prise RJ45 murale",             qty: "count",   state: true },
                { id: "convertisseur",  label: "Convertisseur média",           qty: "count",   state: true },
                { id: "vlan",           label: "Paramétrage VLAN",              qty: null,      state: false },
                { id: "param_ip",       label: "Paramétrage IP",                qty: null,      state: false },
                { id: "valid_lan",      label: "Validation LAN client",         qty: null,      state: false },
                { id: "tests_debit",    label: "Tests débit",                   qty: null,      state: false },
                { id: "etiquetage",     label: "Étiquetage / repérage câbles", qty: null,      state: false },
                { id: "recettage",      label: "Recettage / livraison technique", qty: null,    state: false },
                { id: "asbuilt",        label: "Documentation as-built",        qty: null,      state: false },
                { id: "mise_terre",     label: "Mise à la terre baie",          qty: null,      state: true }
            ]
        },
        {
            cat: "Fournitures — Cheminement câble",
            icon: "📦",
            items: [
                { id: "f_iro",          label: "Tube IRO",                      qty: "metrage", dual: true,    state: false },
                { id: "f_irl",          label: "Tube IRL",                      qty: "metrage", dual: true,    state: false },
                { id: "f_goulotte_pvc", label: "Goulotte PVC",                  qty: "metrage", dual: true,    state: false },
                { id: "f_goulotte_met", label: "Goulotte métallique",           qty: "metrage", dual: true,    state: false },
                { id: "f_goulotte_sol", label: "Goulotte de sol (passage de seuil)", qty: "metrage", state: false },
                { id: "f_goulotte_dlp", label: "Goulotte DLP avec prises",      qty: "metrage", state: false },
                { id: "f_chem_fil",     label: "Chemin de câble fil",          qty: "metrage", state: false },
                { id: "f_chem_dalle",   label: "Chemin de câble dalle",        qty: "metrage", state: false },
                { id: "f_icta",         label: "Gaine ICTA",                    qty: "metrage", state: false },
                { id: "f_annelee",      label: "Gaine annelée",                 qty: "metrage", state: false },
                { id: "f_passecloisons",label: "Passe-cloisons",                qty: "count",   state: false },
                { id: "f_passetoiture", label: "Passe-toiture",                 qty: "count",   state: false },
                { id: "f_fourreau",     label: "Fourreau",                      qty: "metrage", state: false }
            ]
        },
        {
            cat: "Fournitures — Réseau",
            icon: "🔗",
            items: [
                { id: "f_cat6",         label: "Câble RJ45 Cat6",               qty: "metrage", dual: true,    state: false },
                { id: "f_cat6a",        label: "Câble Cat6A",                   qty: "metrage", dual: true,    state: false },
                { id: "f_fibre",        label: "Fibre optique",                 qty: "metrage", dual: true,    state: false },
                { id: "f_jarretiere",   label: "Jarretière",                    qty: "count",   state: false },
                { id: "f_noyau",        label: "Noyau RJ45 / Keystone",         qty: "count",   state: false },
                { id: "f_connecteur",   label: "Connecteurs (N / SMA / RJ45)",  qty: "count",   state: false }
            ]
        },
        {
            cat: "Fournitures — Supports antennaires",
            icon: "🗼",
            items: [
                { id: "f_mat_auto",     label: "Mât autostable",                qty: "count",   state: false },
                { id: "f_mat_dep",      label: "Mât déporté",                   qty: "count",   state: false },
                { id: "f_mat_haub",     label: "Mât haubané",                   qty: "count",   state: false },
                { id: "f_mat_coude",    label: "Mât coudé",                     qty: "count",   state: false },
                { id: "f_console_mur",  label: "Console murale",                qty: "count",   state: false },
                { id: "f_console_dep",  label: "Console déportée",              qty: "count",   state: false },
                { id: "f_bras",         label: "Bras de fixation",              qty: "count",   state: false },
                { id: "f_platine",      label: "Platine",                       qty: "count",   state: false },
                { id: "f_sabot",        label: "Sabot toiture",                 qty: "count",   state: false },
                { id: "f_supportchem",  label: "Support cheminée",              qty: "count",   state: false },
                { id: "f_brides",       label: "Brides",                        qty: "count",   state: false },
                { id: "f_colliers",     label: "Colliers inox",                 qty: "count",   state: false },
                { id: "f_equerres",     label: "Équerres renforcées",           qty: "count",   state: false }
            ]
        },
        {
            cat: "Fournitures — Étanchéité / fixation",
            icon: "🛡️",
            items: [
                { id: "f_silic_blanc",  label: "Silicone blanc",                qty: "count",   labelQty: "tube(s)", state: false },
                { id: "f_silic_toit",   label: "Silicone toiture",              qty: "count",   labelQty: "tube(s)", state: false },
                { id: "f_mastic",       label: "Mastic",                        qty: "count",   labelQty: "tube(s)", state: false },
                { id: "f_resine",       label: "Résine scellement chimique",    qty: "count",   labelQty: "cartouche(s)", state: false },
                { id: "f_visserie",     label: "Visserie inox",                 qty: null,      state: false },
                { id: "f_chevilles",    label: "Chevilles béton",               qty: null,      state: false },
                { id: "f_goujons",      label: "Goujons d'expansion",           qty: "count",   state: false },
                { id: "f_rivets",       label: "Rivets",                        qty: null,      state: false },
                { id: "f_embases",      label: "Embases",                       qty: null,      state: false },
                { id: "f_colsons",      label: "Colsons / serre-câbles",        qty: null,      state: false }
            ]
        },
        {
            cat: "Fournitures — Protection électrique",
            icon: "⚡",
            items: [
                { id: "f_bandeau",      label: "Bandeau électrique",            qty: "count",   labelQty: "port(s)", state: true },
                { id: "f_onduleur",     label: "Onduleur",                      qty: "count",   state: true },
                { id: "f_disj",         label: "Disjoncteur divisionnaire",     qty: "count",   state: true },
                { id: "f_parasurt",     label: "Protection surtension",         qty: "count",   state: true },
                { id: "f_coffret",      label: "Coffret électrique",            qty: "count",   state: true },
                { id: "f_pdu",          label: "PDU (Power Distribution Unit)", qty: "count",   state: true }
            ]
        },
        {
            cat: "Sécurité chantier / Prérequis",
            icon: "🦺",
            items: [
                { id: "s_dict",         label: "DICT (travaux extérieurs)",     qty: null,      state: false },
                { id: "s_planprev",     label: "Plan de prévention",            qty: null,      state: false },
                { id: "s_permisfeu",    label: "Permis feu",                    qty: null,      state: false },
                { id: "s_consignation", label: "Consignation électrique",       qty: null,      state: false },
                { id: "s_nacelle",      label: "Nacelle",                       qty: null,      state: false },
                { id: "s_pirl",         label: "PIRL (Plateforme Individuelle Roulante Légère)", qty: null, state: false },
                { id: "s_echaf",        label: "Échafaudage",                   qty: null,      state: false },
                { id: "s_harnais",      label: "Harnais antichute",             qty: null,      state: false }
            ]
        }
    ];

    /* --------------------------------------------------------------------
       2. RENDU HTML DES CASES À COCHER
       -------------------------------------------------------------------- */

    function renderCheckboxes() {
        const root = document.getElementById('compteRenduCheckboxes');
        if (!root) return;
        let html = '';

        CATALOGUE.forEach(cat => {
            html += `<div class="cr-category" data-cat="${cat.cat}">`;
            html += `<h4><span class="cr-cat-icon">${cat.icon}</span>${cat.cat}</h4>`;

            // MOD 4 : items disposés en grille (colonnes) plutôt qu'en pile verticale
            html += `<div class="cr-items-grid">`;
            cat.items.forEach(it => {
                html += renderItem(it);
            });
            html += `</div>`;
            html += `</div>`;
        });

        root.innerHTML = html;
        attachListeners();
    }

    function renderItem(it) {
        const id = `cr_${it.id}`;
        let extras = '';

        // Bloc état (déjà présent / à installer)
        if (it.state) {
            extras += `
                <div class="cr-status-radios" data-for="${id}">
                    <label class="preset-existing"><input type="radio" name="${id}_state" value="existing">Déjà présent</label>
                    <label class="preset-install"><input type="radio" name="${id}_state" value="install" checked>À installer</label>
                </div>`;
        }

        // Bloc localisation simple
        if (it.loc && !it.dual) {
            extras += `
                <div class="cr-loc-radios">
                    <label><input type="radio" name="${id}_loc" value="int" checked>Intérieur</label>
                    <label><input type="radio" name="${id}_loc" value="ext">Extérieur</label>
                </div>`;
        }

        // Bloc dual (intérieur ET extérieur possible)
        if (it.dual) {
            extras += `
                <div class="cr-loc-radios">
                    <label><input type="radio" name="${id}_loc" value="int" checked>Intérieur</label>
                    <label><input type="radio" name="${id}_loc" value="ext">Extérieur</label>
                    <label><input type="radio" name="${id}_loc" value="both">Les deux</label>
                </div>`;
        }

        // Bloc quantité
        if (it.qty === 'count') {
            const lbl = it.labelQty || 'unité(s)';
            extras += `
                <div class="cr-qty-wrap" data-qty-type="count">
                    <input type="number" class="cr-qty-input" id="${id}_qty" min="0" placeholder="0">
                    <span class="cr-qty-label">${lbl}</span>
                </div>`;
        } else if (it.qty === 'metrage') {
            // Métrage simple OU dual selon état dual
            extras += `
                <div class="cr-qty-wrap cr-metrage-single" data-qty-type="metrage">
                    <input type="number" class="cr-qty-input" id="${id}_qty" min="0" placeholder="0">
                    <span class="cr-qty-label">m linéaires</span>
                </div>`;
            if (it.dual) {
                extras += `
                    <div class="cr-dual-metrage hidden" id="${id}_dualwrap">
                        <div><span>Int.:</span><input type="number" id="${id}_qty_int" min="0" placeholder="0"><span>m</span></div>
                        <div><span>Ext.:</span><input type="number" id="${id}_qty_ext" min="0" placeholder="0"><span>m</span></div>
                    </div>`;
            }
        }

        // Bloc hauteur (additionnel pour antennes/picos)
        if (it.hauteur) {
            extras += `
                <div class="cr-qty-wrap" data-qty-type="hauteur">
                    <input type="number" class="cr-qty-input" id="${id}_haut" min="0" step="0.1" placeholder="0">
                    <span class="cr-qty-label">m de hauteur</span>
                </div>`;
        }

        return `
            <div class="cr-item" data-id="${it.id}">
                <div class="cr-item-main">
                    <input type="checkbox" id="${id}" data-id="${it.id}">
                    <label for="${id}">${it.label}</label>
                </div>
                <div class="cr-item-extras hidden">
                    ${extras}
                </div>
            </div>
        `;
    }

    /* --------------------------------------------------------------------
       3. INTERACTIONS DYNAMIQUES
       -------------------------------------------------------------------- */

    function attachListeners() {
        // Cases à cocher : afficher/masquer les extras + régénérer
        document.querySelectorAll('#compteRenduCheckboxes input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const item = cb.closest('.cr-item');
                const extras = item.querySelector('.cr-item-extras');
                if (cb.checked) {
                    item.classList.add('checked');
                    extras.classList.remove('hidden');
                } else {
                    item.classList.remove('checked');
                    extras.classList.add('hidden');
                }
                regenererCompteRendu();
            });
        });

        // Radios localisation : si "both" => afficher dual, sinon métrage simple
        document.querySelectorAll('#compteRenduCheckboxes input[type="radio"]').forEach(r => {
            r.addEventListener('change', () => {
                if (r.name.endsWith('_loc')) {
                    const baseId = r.name.replace('_loc', '');
                    const dualWrap = document.getElementById(`${baseId}_dualwrap`);
                    const singleWrap = document.querySelector(`#${baseId}_qty`)?.closest('.cr-metrage-single');
                    if (dualWrap) {
                        if (r.value === 'both' && r.checked) {
                            dualWrap.classList.remove('hidden');
                            if (singleWrap) singleWrap.classList.add('hidden');
                        } else if (r.checked) {
                            dualWrap.classList.add('hidden');
                            if (singleWrap) singleWrap.classList.remove('hidden');
                        }
                    }
                }
                regenererCompteRendu();
            });
        });

        // Inputs numériques : régénérer en direct
        document.querySelectorAll('#compteRenduCheckboxes input[type="number"]').forEach(inp => {
            inp.addEventListener('input', () => regenererCompteRendu());
        });
    }

    /* --------------------------------------------------------------------
       4. GÉNÉRATION DU TEXTE DU COMPTE RENDU
       -------------------------------------------------------------------- */

    function getMode() {
        const el = document.getElementById('modeIntervention');
        return (el && el.value) ? el.value : 'audit';
    }

    function buildLineForItem(it) {
        // Renvoie soit null (rien à afficher), soit { existing: "...", action: "..." }
        const idPrefix = `cr_${it.id}`;
        const cb = document.getElementById(idPrefix);
        if (!cb || !cb.checked) return null;

        const mode = getMode();

        // Récup état (existing / install)
        let state = 'install';
        if (it.state) {
            const st = document.querySelector(`input[name="${idPrefix}_state"]:checked`);
            if (st) state = st.value;
        }

        // Récup localisation
        let loc = null;
        if (it.dual || it.loc) {
            const lc = document.querySelector(`input[name="${idPrefix}_loc"]:checked`);
            if (lc) loc = lc.value;
        }

        // Récup quantités
        const qty = (() => {
            const v = document.getElementById(`${idPrefix}_qty`);
            return v && v.value !== "" ? parseFloat(v.value) : null;
        })();
        const qtyInt = (() => {
            const v = document.getElementById(`${idPrefix}_qty_int`);
            return v && v.value !== "" ? parseFloat(v.value) : null;
        })();
        const qtyExt = (() => {
            const v = document.getElementById(`${idPrefix}_qty_ext`);
            return v && v.value !== "" ? parseFloat(v.value) : null;
        })();
        const haut = (() => {
            const v = document.getElementById(`${idPrefix}_haut`);
            return v && v.value !== "" ? parseFloat(v.value) : null;
        })();

        // Construction du fragment quantité/localisation
        let qtyText = "";
        if (it.qty === 'count' && qty !== null && qty > 0) {
            const u = it.labelQty || (qty > 1 ? 'unités' : 'unité');
            qtyText = `${qty} ${u}`;
        } else if (it.qty === 'metrage') {
            if (it.dual && loc === 'both') {
                const parts = [];
                if (qtyInt !== null && qtyInt > 0) parts.push(`${qtyInt} m en intérieur`);
                if (qtyExt !== null && qtyExt > 0) parts.push(`${qtyExt} m en extérieur`);
                qtyText = parts.join(' et ');
            } else if (qty !== null && qty > 0) {
                qtyText = `${qty} m linéaires`;
                if (loc === 'int') qtyText += ' (intérieur)';
                else if (loc === 'ext') qtyText += ' (extérieur)';
            } else if (loc === 'int' || loc === 'ext') {
                qtyText = (loc === 'int') ? '(intérieur)' : '(extérieur)';
            }
        } else if (it.qty === null && (it.loc || it.dual)) {
            if (loc === 'int') qtyText = '(intérieur)';
            else if (loc === 'ext') qtyText = '(extérieur)';
            else if (loc === 'both') qtyText = '(intérieur et extérieur)';
        }

        const hautText = (haut !== null && haut > 0) ? ` à ${haut} m de hauteur` : '';

        // ----- Cas EXISTANT -----
        if (state === 'existing') {
            let qtyPart = qtyText ? ` (${qtyText})` : '';
            return {
                kind: 'existing',
                text: `${it.label}${qtyPart} — déjà présent(e) sur site`
            };
        }

        // ----- Cas À FAIRE / À PRÉVOIR -----
        const lbl = it.label;
        let line = "";

        if (mode === 'audit') {
            // Mode AUDIT : "Prévoir ..."
            if (qtyText) {
                line = `Prévoir ${qtyText} — ${lbl}${hautText}`;
            } else {
                line = `Prévoir : ${lbl}${hautText}`;
            }
        } else {
            // Mode TRAVAUX : "Mise en place de ..."
            if (qtyText) {
                line = `Mise en place de ${qtyText} — ${lbl}${hautText}`;
            } else {
                line = `${lbl}${hautText} — réalisé`;
            }
        }

        return { kind: 'action', text: line };
    }

    function genererCompteRendu() {
        const mode = getMode();
        const sectionsExisting = [];
        const sectionsAction = {};

        CATALOGUE.forEach(cat => {
            cat.items.forEach(it => {
                const res = buildLineForItem(it);
                if (!res) return;
                if (res.kind === 'existing') {
                    sectionsExisting.push(res.text);
                } else {
                    if (!sectionsAction[cat.cat]) sectionsAction[cat.cat] = [];
                    sectionsAction[cat.cat].push(res.text);
                }
            });
        });

        let out = "";

        // En-tête selon mode
        if (mode === 'audit') {
            out += "===== PRÉCONISATIONS / POINTS À PRÉVOIR =====\n\n";
        } else {
            out += "===== TRAVAUX RÉALISÉS / MISE EN ŒUVRE =====\n\n";
        }

        // Bloc existant
        if (sectionsExisting.length) {
            out += "▸ Existant sur site :\n";
            sectionsExisting.forEach(t => { out += `   • ${t}\n`; });
            out += "\n";
        }

        // Blocs par catégorie
        const catOrder = CATALOGUE.map(c => c.cat);
        const hasAction = catOrder.some(c => sectionsAction[c] && sectionsAction[c].length);

        if (hasAction) {
            out += (mode === 'audit')
                ? "▸ Préconisations / Travaux à prévoir :\n\n"
                : "▸ Détail des travaux réalisés :\n\n";
            catOrder.forEach(c => {
                if (sectionsAction[c] && sectionsAction[c].length) {
                    out += `  ◦ ${c} :\n`;
                    sectionsAction[c].forEach(t => { out += `      – ${t}\n`; });
                    out += "\n";
                }
            });
        }

        if (!sectionsExisting.length && !hasAction) {
            out = "(Aucun élément coché pour l'instant — cochez les éléments concernés ci-dessus.)";
        }

        return out.trimEnd();
    }

    function regenererCompteRendu() {
        const ta = document.getElementById('compteRenduPreview');
        if (!ta) return;
        ta.value = genererCompteRendu();
    }

    /* --------------------------------------------------------------------
       5. SÉLECTEUR DE MODE
       -------------------------------------------------------------------- */

    function setMode(mode) {
        const hidden = document.getElementById('modeIntervention');
        if (hidden) hidden.value = mode;

        const ba = document.getElementById('modeAuditBtn');
        const bt = document.getElementById('modeTravauxBtn');
        if (ba && bt) {
            ba.classList.toggle('active', mode === 'audit');
            bt.classList.toggle('active', mode === 'travaux');
        }

        // Bascule CSS audit-only / travaux-only
        if (document.body) {
            document.body.setAttribute('data-mode', mode);
        }

        // Adaptation dynamique de la section 3 (mesures) et 4 (plan évac) selon le mode
        if (typeof window.applyTravauxLayout === 'function') {
            window.applyTravauxLayout(mode);
        }

        regenererCompteRendu();
    }

    /* --------------------------------------------------------------------
       6. EXPORT / IMPORT (pour intégration JSON existante)
       -------------------------------------------------------------------- */

    function getState() {
        const state = {
            mode: getMode(),
            items: {},
            preview: document.getElementById('compteRenduPreview')?.value || ""
        };
        CATALOGUE.forEach(cat => {
            cat.items.forEach(it => {
                const idPrefix = `cr_${it.id}`;
                const cb = document.getElementById(idPrefix);
                if (!cb) return;
                const data = { checked: cb.checked };
                if (it.state) {
                    const st = document.querySelector(`input[name="${idPrefix}_state"]:checked`);
                    data.state = st ? st.value : null;
                }
                if (it.loc || it.dual) {
                    const lc = document.querySelector(`input[name="${idPrefix}_loc"]:checked`);
                    data.loc = lc ? lc.value : null;
                }
                ['_qty', '_qty_int', '_qty_ext', '_haut'].forEach(suf => {
                    const inp = document.getElementById(`${idPrefix}${suf}`);
                    if (inp) data[suf] = inp.value;
                });
                state.items[it.id] = data;
            });
        });
        return state;
    }

    function setState(state) {
        if (!state) return;
        if (state.mode) setMode(state.mode);
        if (state.items) {
            Object.entries(state.items).forEach(([itemId, data]) => {
                const idPrefix = `cr_${itemId}`;
                const cb = document.getElementById(idPrefix);
                if (cb && data.checked !== undefined) {
                    cb.checked = data.checked;
                    cb.dispatchEvent(new Event('change'));
                }
                if (data.state) {
                    const r = document.querySelector(`input[name="${idPrefix}_state"][value="${data.state}"]`);
                    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
                }
                if (data.loc) {
                    const r = document.querySelector(`input[name="${idPrefix}_loc"][value="${data.loc}"]`);
                    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
                }
                ['_qty', '_qty_int', '_qty_ext', '_haut'].forEach(suf => {
                    const inp = document.getElementById(`${idPrefix}${suf}`);
                    if (inp && data[suf] !== undefined) inp.value = data[suf];
                });
            });
        }
        if (state.preview) {
            const ta = document.getElementById('compteRenduPreview');
            if (ta) ta.value = state.preview;
        } else {
            regenererCompteRendu();
        }
    }

    /* --------------------------------------------------------------------
       7. PARSING DU TEXTE FINAL POUR LE WORD
       --------------------------------------------------------------------
       Renvoie un tableau de blocs : { type: 'h1' | 'h2' | 'h3' | 'bullet' | 'p', text: '...' }
       à partir du texte (modifiable) du textarea.
       -------------------------------------------------------------------- */

    function parseCompteRenduText(txt) {
        if (!txt || !txt.trim()) return [];
        const blocks = [];
        const lines = txt.split('\n');
        for (let raw of lines) {
            const line = raw.trimEnd();
            if (!line.trim()) {
                blocks.push({ type: 'spacer', text: '' });
                continue;
            }
            // Titre principal "===== ... ====="
            const mTitle = line.match(/^=+\s*(.+?)\s*=+$/);
            if (mTitle) { blocks.push({ type: 'h1', text: mTitle[1] }); continue; }
            // Sous-titre "▸ ..."
            if (line.startsWith('▸')) {
                blocks.push({ type: 'h2', text: line.replace(/^▸\s*/, '').replace(/\s*:$/, '') });
                continue;
            }
            // Catégorie "  ◦ Nom :"
            const mCat = line.match(/^\s*◦\s*(.+?)\s*:?\s*$/);
            if (mCat) { blocks.push({ type: 'h3', text: mCat[1] }); continue; }
            // Bullet "      – ..."
            const mBullet = line.match(/^\s*[–•-]\s+(.+)$/);
            if (mBullet) { blocks.push({ type: 'bullet', text: mBullet[1] }); continue; }
            // Sinon paragraphe
            blocks.push({ type: 'p', text: line.trim() });
        }
        return blocks;
    }

    /* --------------------------------------------------------------------
       8. EXPOSITION GLOBALE
       -------------------------------------------------------------------- */

    window.CompteRendu = {
        render: renderCheckboxes,
        regenerer: regenererCompteRendu,
        setMode: setMode,
        getState: getState,
        setState: setState,
        parseText: parseCompteRenduText,
        getCatalogue: () => CATALOGUE
    };

    // Exposition directe de quelques helpers (appelés par onclick="...")
    window.setMode = setMode;
    window.regenererCompteRendu = regenererCompteRendu;

    // Auto-init au chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderCheckboxes);
    } else {
        renderCheckboxes();
    }

})();
