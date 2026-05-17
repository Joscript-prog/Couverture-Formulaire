// =================================================================
//  CONFIGURATION SUPABASE SÉCURISÉE
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://pjkidklafhpohwkihoqa.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_KEY || SUPABASE_KEY.length < 20) {
    console.warn("⚠️ ATTENTION : Clé Supabase non configurée ! Crée un fichier .env");
}

export const BUCKET_NAME = "rapports";
export const TABLE_NAME = "rapports";

export const MOT_DE_PASSE_ADMIN = "AdminIPKCouv2026!";
export const MOT_DE_PASSE_TECH = "TECHCOUV2026";

export const TECHNICIENS = [
    "TECHCOUV-1", "TECHCOUV-2", "TECHCOUV-3",
    "TECHCOUV-4", "TECHCOUV-5", "TECHCOUV-6"
];

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const STORAGE_WARNING_BYTES = 800 * 1024 * 1024;
export const STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;

console.log("✅ Configuration Supabase chargée (sécurisée)");
