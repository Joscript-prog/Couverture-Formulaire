# Configuration rapide — Version Supabase

## Ce qui change par rapport à Firebase

Seulement **3 fichiers** ont changé pour passer à Supabase :
- `supabaseConfig.js` (remplace `firebaseConfig.js`)
- `auth-upload.js` (utilise le SDK Supabase)
- `admin.js` (utilise le SDK Supabase)

**Les 3 formulaires HTML restent identiques.** Le `app.js` de chaque dossier n'est toujours pas touché.

---

## Étapes pour activer

### 1. Côté Supabase (déjà fait par toi normalement)

- ✅ Projet créé : `formulaire-couverture`
- ✅ Table `rapports` créée avec les colonnes : `id, created_at, file_name, dossier, tech, mode, numero_ticket, numero_commande, raison_sociale, ville, words_size, json_size, docx_path, json_path`
- ✅ Bucket Storage `rapports` créé (public)
- ✅ Policies Storage : INSERT, SELECT, DELETE autorisées
- ✅ Récupéré l'URL du projet et la clé `sb_publishable_...`

### 2. Remplir `supabaseConfig.js`

Ouvre le fichier à la racine et remplace :

```javascript
export const SUPABASE_URL = "https://pjkidk.....supabase.co";       // ← TON URL
export const SUPABASE_KEY = "sb_publishable_........................";  // ← TA CLÉ PUBLISHABLE

export const ADMIN_EMAIL = "ton.email.outlook@domaine.com";  // ← TON EMAIL ADMIN

export const msalConfig = {
    auth: {
        clientId: "UUID-AZURE-...",   // ← Client ID Azure (étape Azure App Registration)
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin + window.location.pathname
    },
    ...
};

export const MOT_DE_PASSE_TECH = "TonMotDePasse2024!";  // ← Mot de passe technicien
```

### 3. (Optionnel) Configurer Azure pour l'admin

Si tu veux le dashboard admin, voir l'étape 5 du guide Firebase (Azure App Registration). C'est exactement la même chose pour Supabase.

Si tu n'as pas besoin du dashboard admin pour l'instant : seuls les **formulaires techniciens** marcheront, et c'est déjà très utile.

### 4. Tester en local

```bash
python3 -m http.server 8000
```

- Formulaire technicien : http://localhost:8000/pico-quatra/
- Dashboard admin : http://localhost:8000/admin.html

---

## Sécurité importante

⚠️ Ne JAMAIS commiter `supabaseConfig.js` rempli sur GitHub si tu mets en place le repo.

Crée un `.gitignore` à la racine :
```
supabaseConfig.js
```

Et garde un fichier d'exemple `supabaseConfig.example.js` (avec les placeholders) versionné à la place.

⚠️ La clé `sb_secret_...` ne doit **JAMAIS** apparaître dans le code frontend, ni sur GitHub.
