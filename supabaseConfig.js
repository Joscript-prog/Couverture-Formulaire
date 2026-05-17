// =================================================================
//  CONFIGURATION SUPABASE PARTAGÉE
//  Utilisé par :
//   - pico-quatra/index.html (via auth-upload.js)
//   - 4g-5g/index.html       (via auth-upload.js)
//   - starlink/index.html    (via auth-upload.js)
//   - admin.html             (via admin.js)
//
// =================================================================

// Import du SDK Supabase v2 via CDN (ES module officiel)
import { createClient }
    from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================
//  VOS CLÉS SUPABASE
//  (Supabase → ⚙️ Project Settings → API)
//  ⚠️  L'URL doit être SANS "/rest/v1/" à la fin !
//      Le SDK l'ajoute automatiquement.
// =====================================================
export const SUPABASE_URL = "https://pjkidklafhpohwkihoqa.supabase.co";
export const SUPABASE_KEY = "sb_publishable_8fMZTxNqRIFAgm4fdWFAFw_dMy1Ufre";

// =====================================================
//  NOM DU BUCKET ET DE LA TABLE (créés dans Supabase)
// =====================================================
export const BUCKET_NAME  = "rapports";
export const TABLE_NAME   = "rapports";

// =====================================================
//  AUTHENTIFICATION ADMIN (mot de passe simple)
//  ⚠️  À garder DIFFÉRENT du mot de passe technicien.
//      Si vous avez 1 seul admin, c'est largement suffisant.
//      Pour une vraie sécurité d'entreprise (multi-admin,
//      OAuth Outlook, etc.), voir la version MSAL plus
//      complexe.
// =====================================================
export const MOT_DE_PASSE_ADMIN = "AdminIPKCouv2026!";

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
