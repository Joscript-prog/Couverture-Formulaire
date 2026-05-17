// =================================================================
//  CONFIGURATION SUPABASE PARTAGÉE
//  Utilisé par :
//   - pico-quatra/index.html (via auth-upload.js)
//   - 4g-5g/index.html       (via auth-upload.js)
//   - starlink/index.html    (via auth-upload.js)
//   - admin.html             (via admin.js)
//
//  ⚠️  REMPLACER LES 2 VALEURS CI-DESSOUS PAR LES VÔTRES
//      (URL du projet + clé publishable, depuis Supabase →
//       Project Settings → API)
// =================================================================

// Import du SDK Supabase v2 via CDN (ES module officiel)
import { createClient }
    from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================
//  VOS CLÉS SUPABASE
//  (Supabase → ⚙️ Project Settings → API)
// =====================================================
export const SUPABASE_URL = "https://pjkidklafhpohwkihoqa.supabase.co/rest/v1/"
export const SUPABASE_KEY = "sb_publishable_8fMZTxNqRIFAgm4fdWFAFw_dMy1Ufre"

// =====================================================
//  NOM DU BUCKET ET DE LA TABLE (créés dans Supabase)
// =====================================================
export const BUCKET_NAME  = "rapports";
export const TABLE_NAME   = "rapports";

// =====================================================
//  EMAIL ADMIN (utilisé pour valider l'accès au dashboard)
//  ⚠️  L'email doit correspondre EXACTEMENT au compte
//      Outlook utilisé pour se connecter au dashboard.
// =====================================================
export const ADMIN_EMAIL = "admin@votre-domaine.com";

// =====================================================
//  CONFIGURATION OAUTH MICROSOFT (MSAL) pour l'admin
//  → créer une application dans Azure AD :
//    https://portal.azure.com → App registrations
// =====================================================
export const msalConfig = {
    auth: {
        clientId:    "REMPLACEZ_PAR_VOTRE_CLIENT_ID_AZURE",
        authority:   "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin + window.location.pathname
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false
    }
};

// =====================================================
//  AUTHENTIFICATION TECHNICIEN
//  Liste des comptes autorisés + mot de passe commun.
// =====================================================
export const TECHNICIENS = [
    "TECHCOUV-1",
    "TECHCOUV-2",
    "TECHCOUV-3",
    "TECHCOUV-4",
    "TECHCOUV-5",
    "TECHCOUV-6"
];

export const MOT_DE_PASSE_TECH = "TECHCOUV2026";

// =====================================================
//  INITIALISATION DU CLIENT SUPABASE
// =====================================================
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =====================================================
//  LIMITES DE STOCKAGE (alerte / max)
//  Plan Free Supabase = 1 GB de Storage gratuit
//  → alerte à 800 MB, limite à 1 GB
// =====================================================
export const STORAGE_WARNING_BYTES = 800 * 1024 * 1024;       // 800 MB
export const STORAGE_LIMIT_BYTES   = 1 * 1024 * 1024 * 1024;  // 1 GB
