/* ============================================================
 *  PICO / CEL-FI QUATRA — Données BPU (sans prix)
 *  Référence : BPU IPKONEKT / Bouygues Telecom
 * ============================================================ */

// ----- Forfaits PICO BTS -----
window.PICO_FORFAITS = [
    {
        ref: "PICO-001",
        label: "Forfait 1",
        description: "1 technicien — 1 PicoBTS + câble Ethernet 2 ml — hors câblage",
        critere: "1 PicoBTS, sans linéaire significatif"
    },
    {
        ref: "PICO-002",
        label: "Forfait 2",
        description: "2 techniciens — jusqu'à 25 ml de câble — 1 PicoBTS max — hors cheminement",
        critere: "≤ 25 ml + 1 PicoBTS"
    },
    {
        ref: "PICO-003",
        label: "Forfait 3",
        description: "2 techniciens — 25 à 40 ml de câble — 2 PicoBTS max — hors cheminement",
        critere: "25 à 40 ml + ≤ 2 PicoBTS"
    },
    {
        ref: "PICO-004",
        label: "Forfait 4",
        description: "2 techniciens — 40 à 75 ml de câble — 4 PicoBTS max — hors cheminement",
        critere: "40 à 75 ml + ≤ 4 PicoBTS"
    },
    {
        ref: "DEVIS",
        label: "Sur devis",
        description: "Hors barème (au-delà de 75 ml de câble ou plus de 4 PicoBTS)",
        critere: "> 75 ml ou > 4 PicoBTS"
    }
];

// ----- Forfaits CEL-FI QUATRA -----
window.QUATRA_FORFAITS = [
    {
        ref: "QUAT-001",
        label: "Forfait 1",
        description: "Pose et câblage de 2 CU — utilise l'infrastructure RJ45 du client",
        critere: "2 CU — infra RJ45 client"
    },
    {
        ref: "QUAT-002",
        label: "Forfait 2",
        description: "Pose et câblage de 2 CU avec pose de câble RJ45 (25 m par NU/CU)",
        critere: "2 CU — RJ45 25 m/CU"
    },
    {
        ref: "QUAT-003",
        label: "Forfait 3",
        description: "Pose et câblage de 2 CU avec pose de câble RJ45 (50 m par NU/CU)",
        critere: "2 CU — RJ45 50 m/CU"
    },
    {
        ref: "QUAT-004",
        label: "Forfait 4",
        description: "Pose et câblage de 4 CU — utilise l'infrastructure RJ45 du client",
        critere: "4 CU — infra RJ45 client"
    },
    {
        ref: "QUAT-005",
        label: "Forfait 5",
        description: "Pose et câblage de 4 CU avec pose de câble RJ45 (25 m par NU/CU)",
        critere: "4 CU — RJ45 25 m/CU"
    },
    {
        ref: "QUAT-006",
        label: "Forfait 6",
        description: "Pose et câblage de 4 CU avec pose de câble RJ45 (50 m par NU/CU)",
        critere: "4 CU — RJ45 50 m/CU"
    }
];

// ----- Fournitures PICO (cases à cocher + quantités) -----
// Catégories pour rangement visuel
window.FOURNITURES_PICO = [
    {
        cat: "Équipements PICO",
        items: [
            { id: "f_pico_supp",        label: "PicoBTS supplémentaire",                          unit: "U",  ref: "PICO-006" },
            { id: "f_poe",              label: "Injecteur PoE++ Splitter",                        unit: "U",  ref: "PICO-007" },
            { id: "f_routeur_meme",     label: "Installation routeur (même intervention)",        unit: "U",  ref: "PICO-008" },
            { id: "f_routeur_separe",   label: "Installation routeur (intervention séparée)",     unit: "U",  ref: "PICO-009" },
            { id: "f_livraison",        label: "Livraison équipements (lot de 2 picos)",          unit: "Lot",ref: "PICO-010" },
            { id: "f_mes",              label: "Mise à disposition technicien finalisation MES (4h)", unit: "U", ref: "PICO-005" }
        ]
    },
    {
        cat: "Câblage & cheminement",
        items: [
            { id: "f_cat6e",            label: "Câble Cat6E (au-delà du forfait)",                unit: "ML", ref: "HF-001" },
            { id: "f_moulure",          label: "Moulure ≤ 32×12 ou tube IRO/gaine ≤ Ø25",         unit: "ML", ref: "HF-008" },
            { id: "f_percement",        label: "Percement mur plein ou dalle",                    unit: "U",  ref: "HF-022" },
            { id: "f_dedoubleur",       label: "Dédoubleur Ethernet (paire)",                     unit: "U",  ref: "HF-021" }
        ]
    },
    {
        cat: "Baie & infrastructure",
        items: [
            { id: "f_coffret_19_6u",    label: "Coffret 19″, 6U, profondeur 400 mm",              unit: "U",  ref: "HF-002" },
            { id: "f_coffret_9u",       label: "Coffret mural 9U",                                unit: "U",  ref: "HF-013" },
            { id: "f_plateau",          label: "Plateau support routeur 19″",                     unit: "U",  ref: "HF-003" },
            { id: "f_bandeau_rj45",     label: "Bandeau prises RJ45 équipé (12 ports)",           unit: "U",  ref: "HF-004" },
            { id: "f_bandeau_courant",  label: "Bandeau prises de courant",                       unit: "U",  ref: "HF-006" },
            { id: "f_alim_220",         label: "Point d'alimentation 220 VAC + disjoncteur 16 A", unit: "U",  ref: "HF-007" }
        ]
    },
    {
        cat: "Réseau actif & optique",
        items: [
            { id: "f_switch_poe",       label: "Switch 8 ports PoE",                              unit: "U",  ref: "HF-009" },
            { id: "f_switch_nopoe",     label: "Switch 8 ports non PoE",                          unit: "U",  ref: "HF-010" },
            { id: "f_gbic",             label: "Module GBIC Multimode",                           unit: "U",  ref: "HF-011" },
            { id: "f_convertisseur",    label: "Couple convertisseur RJ45 / Fibre optique",       unit: "U",  ref: "HF-012" },
            { id: "f_tiroir_optique",   label: "Tiroir optique équipé 12 corps de traversées",    unit: "U",  ref: "HF-005" },
            { id: "f_jarretiere",       label: "Jarretière optique MM duplex SC/PC L=2m",         unit: "U",  ref: "HF-014" }
        ]
    },
    {
        cat: "Câbles breakout fibre",
        items: [
            { id: "f_breakout_4f_80",   label: "Câble breakout MM 4 fibres SC/PC — 80 m",         unit: "U",  ref: "HF-015" },
            { id: "f_breakout_4f_100",  label: "Câble breakout MM 4 fibres SC/PC — 100 m",        unit: "U",  ref: "HF-016" },
            { id: "f_breakout_4f_120",  label: "Câble breakout MM 4 fibres SC/PC — 120 m",        unit: "U",  ref: "HF-017" },
            { id: "f_breakout_4f_150",  label: "Câble breakout MM 4 fibres SC/PC — 150 m",        unit: "U",  ref: "HF-018" },
            { id: "f_breakout_4f_200",  label: "Câble breakout MM 4 fibres SC/PC — 200 m",        unit: "U",  ref: "HF-019" },
            { id: "f_breakout_6f_200",  label: "Câble breakout MM 6 fibres SC/PC — 200 m",        unit: "U",  ref: "HF-020" }
        ]
    },
    {
        cat: "Moyens d'accès",
        items: [
            { id: "f_nacelle_12",       label: "Nacelle automotrice 12 m max + agent",            unit: "Jour", ref: "HF-024" },
            { id: "f_agent_nacelle",    label: "Agent de conduite nacelle automotrice",           unit: "Jour", ref: "HF-025" },
            { id: "f_echelle",          label: "Échafaudage ou échelle grande hauteur",           unit: "Jour", ref: "HF-026" }
        ]
    },
    {
        cat: "Dépose / Plus-value",
        items: [
            { id: "f_depose",           label: "Dépose routeur/PicoBTS + remise en état",         unit: "U",  ref: "HF-023" },
            { id: "f_nuit",             label: "Plus-value travail de nuit (majoration 50 %)",    unit: "Forfait", ref: "HF-028" }
        ]
    }
];

// ----- Fournitures spécifiques CEL-FI QUATRA -----
// (Les éléments hors forfait sont communs avec PICO ; on ne re-liste que ce qui est très spécifique)
window.FOURNITURES_QUATRA_NOTE = "Les fournitures hors forfait Quatra (câblage, baie, infrastructure réseau, moyens d'accès) utilisent la même liste que PICO.";

// ----- Grille de lecture qualité radio (basée sur RSRP, comme dans le rapport) -----
window.QUALITE_RSRP = [
    { label: "Bonne",      seuil: "> -97 dBm",         color: "#5cb85c" },
    { label: "Moyenne",    seuil: "-98 à -107 dBm",    color: "#f0ad4e" },
    { label: "Médiocre",   seuil: "-108 à -117 dBm",   color: "#e89233" },
    { label: "Mauvaise",   seuil: "> -118 dBm",        color: "#d9534f" },
    { label: "Inexistante",seuil: "Pas de couverture", color: "#6c757d" }
];
