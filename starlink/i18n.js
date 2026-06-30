// ============================================================
//  i18n.js — Traductions FR → EN pour la génération du rapport Word
//
//  Utilisé uniquement pour le client final BLUEWIRELESS, qui peut
//  choisir la langue du document Word (FR ou EN) au moment de l'export.
//  Le formulaire à l'écran reste en français.
//
//  Principe : le texte FR sert de clé. t(texteFR, lang) renvoie :
//    - le texte FR tel quel si lang === "fr" (ou si pas de traduction)
//    - la traduction EN si lang === "en" et qu'elle existe
//
//  Pour ajouter/corriger une traduction : éditer la table EN_DICT ci-dessous.
// ============================================================

const EN_DICT = {
  // ---- En-tête / méta ----
  "RAPPORT D'AUDIT - INSTALLATION STARLINK": "SITE SURVEY REPORT - STARLINK INSTALLATION",
  "RAPPORT DE TRAVAUX - INSTALLATION STARLINK": "INSTALLATION REPORT - STARLINK INSTALLATION",
  "Référence commande": "Order reference",
  "Auditeur / Intervenant": "Surveyor / Technician",
  "Date d'audit": "Survey date",

  // ---- Section 1 : Informations administratives ----
  "Informations administratives du client": "Customer administrative information",
  "Raison sociale du site audité": "Site company name",
  "Adresse": "Address",
  "Code postal": "Postal code",
  "CP : ": "ZIP: ",
  "Ville": "City",
  "Horaire d'ouverture du site": "Site opening hours",
  "Procédure d'accès": "Access procedure",
  "Téléphone site": "Site phone",
  "Nom du contact client sur site": "On-site customer contact name",
  "Fonction": "Role",
  "Téléphone / Mail contact": "Contact phone / email",
  "Mail": "Email",

  // ---- Section 2 : Emplacement ----
  "Choix de l'emplacement de l'antenne": "Antenna location selection",
  "2.1 - Description de l'emplacement retenu": "2.1 - Description of the selected location",
  "Type d'emplacement": "Location type",
  "Toiture plate": "Flat roof",
  "Façade": "Facade",
  "Balcon / Garde-corps": "Balcony / Railing",
  "Acrotère": "Parapet",
  "Description détaillée": "Detailed description",
  "Hauteur depuis le sol": "Height from ground",
  "Accessibilité": "Accessibility",
  "Accessible sans moyen": "Accessible without equipment",
  "Echelle Requise": "Ladder required",
  "Nacelle Requise": "Aerial lift required",
  "Dégagement vers le ciel": "Clear view of the sky",
  "Suffisant (≥ 100°)": "Sufficient (≥ 100°)",
  "Insuffisant - voir obstruction": "Insufficient - see obstruction",
  "2.2 - Photos de l'emplacement": "2.2 - Location photos",
  "2.3 - Test de positionnement - Application Starlink": "2.3 - Positioning test - Starlink app",
  "Résultat du test d'obstruction": "Obstruction test result",
  "Aucune obstruction": "No obstruction",
  "Obstruction mineure": "Minor obstruction",
  "Obstruction bloquante": "Blocking obstruction",
  "Commentaire": "Comment",

  // ---- Section 3 : Pose & cheminement ----
  "Pose de l'antenne — Cheminement câble & point de pénétration": "Antenna installation — Cable routing & entry point",
  "3.1 - Informations de pose": "3.1 - Installation information",
  "Type de support installé": "Installed mount type",
  "Trépied": "Tripod",
  "Mât auto stable 1m": "Free-standing pole 1m",
  "Mât en drapeau": "Flag-mount pole",
  "Déport coudé": "Angled offset mount",
  "Mât droit 1m (garde-corps)": "Straight pole 1m (railing)",
  "Longueur de câble à prévoir": "Cable length required",
  "Type de cheminement câble": "Cable routing type",
  "Goulotte extérieure": "External trunking",
  "Faux plafond amovible (Tonga)": "Removable false ceiling (Tonga)",
  "Sous conduit encastré": "Through embedded conduit",
  "Mixte": "Mixed",
  "Point de pénétration": "Entry point",
  "Passage de façade": "Facade pass-through",
  "Menuiserie / joint": "Window frame / seal",
  "Fourreaux existants": "Existing ducts",
  "Percement réalisé": "Drilling done",
  "Étanchéité du passage": "Pass-through sealing",
  "Mastic appliqué": "Sealant applied",
  "Passe-câble étanche": "Watertight cable gland",
  "Non traité (à compléter)": "Untreated (to be completed)",
  "Hauteur maximale d'intervention": "Maximum working height",
  "3.2 - Photos de pose et cheminement": "3.2 - Installation and routing photos",

  // ---- Section 4 : Fiche de référence supports ----
  "Type de support installé - Fiche de référence": "Installed mount type - Reference sheet",
  "Support": "Mount",
  "Situation d'usage": "Use case",
  "Conditions / Contraintes": "Conditions / Constraints",
  "Toiture plate, dégagement ciel suffisant au ras du toit": "Flat roof, sufficient sky clearance at roof level",
  "Semelle résiliente obligatoire. Dalles gravillonnées.": "Resilient base mandatory. Gravel slabs.",
  "Toiture plate avec obstacles proches nécessitant de rehausser l'antenne pour le pointage": "Flat roof with nearby obstacles requiring the antenna to be raised for aiming",
  "Façade béton / brique / agglo, ou sur tube / mât existant (adaptateur)": "Concrete / brick / block facade, or on existing tube / pole (adapter)",
  "PAS de fixation sur bardage ou paroi métallique.": "NO fixing on cladding or metal walls.",
  "Acrotère ou muret en bord de toit": "Parapet or low wall at roof edge",
  "Étanchéité préservée — aucun perçage du revêtement de toit.": "Waterproofing preserved — no drilling of the roof covering.",
  "Balcon ou terrasse avec garde-corps en bon état": "Balcony or terrace with railing in good condition",
  "Colliers de serrage sur garde-corps. Pas de perçage façade.": "Clamps on the railing. No facade drilling.",
  "Rappel : ": "Reminder: ",
  "Toute intervention à plus de 2,5 m du sol nécessite un moyen de sécurité (nacelle ou harnais antichute). À déclencher dès la visite de site.": "Any work more than 2.5 m above the ground requires a safety measure (aerial lift or fall-arrest harness). To be arranged from the site visit onwards.",

  // ---- Section 5 : EPI ----
  "EPI requis - Équipements de Protection Individuelle": "Required PPE - Personal Protective Equipment",
  "EPI": "PPE",
  "Précision / Usage": "Details / Use",
  "Présent sur intervention": "Present on site",
  "Casque de protection": "Safety helmet",
  "Obligatoire si risque de chute d'objet ou travail en hauteur": "Mandatory if risk of falling objects or work at height",
  "Harnais antichute + longe": "Fall-arrest harness + lanyard",
  "Obligatoire si intervention > 2,5 m sans nacelle": "Mandatory if work > 2.5 m without aerial lift",
  "Chaussures de sécurité S3": "S3 safety shoes",
  "Port permanent sur chantier": "Worn at all times on site",
  "Gants de manutention": "Handling gloves",
  "Manutention du matériel, câbles, supports": "Handling of equipment, cables, mounts",
  "Gilet haute visibilité": "High-visibility vest",
  "Obligatoire en environnement circulation ou voie publique": "Mandatory in traffic areas or on public roads",
  "Lunettes de protection": "Safety glasses",
  "Perçage, vissage, découpe goulotte": "Drilling, screwing, trunking cutting",
  "Nacelle TOUCAN indoor 10m": "TOUCAN indoor aerial lift 10m",
  "Si intervention > 2,5m — location à la journée": "If work > 2.5m — daily rental",
  "Balisage de zone": "Zone marking",
  "Périmètre de sécurité autour de la zone d'intervention": "Safety perimeter around the work area",
  "Remarques EPI / Sécurité :": "PPE / Safety remarks:",

  // ---- Section 6/7 : Synthèse ----
  "Synthèse de l'intervention": "Intervention summary",
  "Heure de début d'intervention": "Start time",
  "Heure de fin d'intervention": "End time",
  "Durée totale à prévoir": "Total estimated duration",
  "Durée de l'intervention": "Intervention duration",
  "Nombre de techniciens": "Number of technicians",
  "Nacelle à prévoir": "Aerial lift to plan",
  "Nacelle utilisée": "Aerial lift used",
  "Échelle / Échafaud utilisé": "Ladder / Scaffold used",
  "Câblage supplémentaire": "Additional cabling",
  "Commentaire sur l'intervention": "Intervention comment",
  "Observations / Réserves / Points à lever": "Observations / Reservations / Open points",
  "Signature technicien / auditeur": "Technician / surveyor signature",
  "Nom : ": "Name: ",
  "Date : ": "Date: ",

  // ---- Valeurs communes ----
  "Oui": "Yes",
  "Non": "No",

  // ---- Section Bluewireless ----
  "Conclusions, équipement & périmètre (Bluewireless)": "Conclusions, equipment & scope (Bluewireless)",
  "Conclusion & recommandations": "Conclusion & recommendations",
  "Solution techniquement faisable ?": "Solution technically feasible?",
  "Emplacement retenu": "Selected location",
  "Équipement recommandé & considérations": "Recommended equipment & considerations",
  "Type de bâtiment": "Building type",
  "Matériau de construction": "Construction material",
  "Propriété du bâtiment": "Building ownership",
  "Coordonnées GPS du site": "Site GPS coordinates",
  "Vue satellite / plan de localisation": "Satellite view / location map",
  "Contacts — rôles & responsabilités": "Contacts — roles & responsibilities",
  "Gestion bâtiment / Bailleur": "Building management / Landlord",
  "Approbation travaux civils": "Civil works approval",
  "Responsable Facilities (client)": "Facilities manager (customer)",
  "Accès / escorte sur site": "Site access / escort",
  "Pénétration, équipement indoor & alimentation": "Entry point, indoor equipment & power",
  "Ingress existant ?": "Existing ingress?",
  "Si nouvel ingress : emplacement & matériau": "If new ingress: location & material",
  "Emplacement équipement indoor": "Indoor equipment location",
  "Liaison RJ-45 alim Starlink ↔ routeur": "RJ-45 link Starlink PSU ↔ router",
  "2 prises électriques disponibles ?": "2 power sockets available?",
  "Type de prise & voltage": "Socket type & voltage",
  "Problèmes d'alimentation": "Power issues",
  "Onduleur / UPS disponible ?": "UPS available?",
  "Bill of Materials — Blue Wireless": "Bill of Materials — Blue Wireless",
  "Dish Starlink (type)": "Starlink dish (type)",
  "Routeur (modèle)": "Router (model)",
  "Câble antenne Starlink": "Starlink antenna cable",
  "Câble Starlink → Ethernet": "Starlink → Ethernet cable",
  "Type de mât / support": "Mount / support type",
  "Infra pôle / sol / fixations": "Pole / ground infra / brackets",
  "Consommables d'installation": "Installation consumables",
  "Périmètre, risques & prochaines étapes": "Scope, risks & next steps",
  "Scope of Work — Blue Wireless": "Scope of Work — Blue Wireless",
  "Risques & mitigations": "Risks & mitigations",
  "BoM client": "Customer BoM",
  "Travaux préparatoires client (SoW)": "Customer preparatory works (SoW)",
  "Approbation / clearance requise": "Approval / clearance required",
  "Prochaines étapes (Next Steps)": "Next steps",

  // ---- Libellés photos ----
  "Vue Façade Extérieur": "Exterior facade view",
  "Vue générale de l'emplacement": "General view of the location",
  "Vue détaillée du point de fixation": "Detailed view of the fixing point",
  "Capture écran test obstruction (app Starlink)": "Obstruction test screenshot (Starlink app)",
  "Carte de couverture / signal obtenu": "Coverage map / signal obtained",
  "Antenne posée sur support": "Antenna mounted on support",
  "Point de pénétration façade": "Facade entry point",
  "Emplacement du routeur Starlink": "Starlink router location",

  // ---- Libellés dynamiques (préfixes) ----
  "Cheminement câble ": "Cable routing ",
  "Cheminement câble 1": "Cable routing 1",
  "Cheminement câble 2": "Cable routing 2",
  "Cheminement câble 3": "Cable routing 3",
};

// Renvoie la traduction d'un texte FR selon la langue demandée.
// lang : "fr" (défaut) ou "en". Si pas de traduction EN trouvée, renvoie le FR.
function t(frText, lang) {
  if (lang !== "en") return frText;
  if (frText in EN_DICT) return EN_DICT[frText];
  // Cas spéciaux gérés ailleurs (ex : "Cheminement câble " + n) → traduits dans app.js
  return frText;
}

// Exposer globalement
if (typeof window !== "undefined") {
  window.t = t;
  window.EN_DICT = EN_DICT;
}
