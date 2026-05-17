# Guide de configuration Firebase et Microsoft Outlook

Ce guide vous accompagne pour mettre en service le système de gestion des rapports TECHCOUV. **Temps estimé : 25–35 minutes.**

---

## 📋 Sommaire

1. [Vue d'ensemble](#vue-densemble)
2. [Créer le projet Firebase](#1-créer-le-projet-firebase)
3. [Activer Authentication](#2-activer-authentication)
4. [Activer Firestore Database](#3-activer-firestore-database)
5. [Activer Cloud Storage](#4-activer-cloud-storage)
6. [Récupérer la configuration Firebase](#5-récupérer-la-configuration-firebase)
7. [Configurer Microsoft Azure (OAuth Outlook)](#6-configurer-microsoft-azure-oauth-outlook)
8. [Compléter `firebaseConfig.js`](#7-compléter-firebaseconfigjs)
9. [Vérifier que tout fonctionne](#8-vérifier-que-tout-fonctionne)
10. [Annexes : règles de sécurité, dépannage, hébergement](#annexes)

---

## Vue d'ensemble

Le système utilise **trois services gratuits** :

| Service              | Rôle                                                    | Coût              |
|----------------------|---------------------------------------------------------|-------------------|
| Firebase Firestore   | Métadonnées des rapports (qui, quoi, quand)             | Gratuit (Spark)   |
| Firebase Storage     | Fichiers Word + JSON                                    | Gratuit jusqu'à 5 GB |
| Microsoft Azure AD   | Authentification OAuth de l'administrateur Outlook      | Gratuit           |

**Architecture des accès** :

- **Techniciens** → login simple (sélecteur + mot de passe commun) → écrivent dans Firestore et Storage.
- **Admin** → login OAuth Microsoft (compte Outlook) → lit, télécharge, supprime.

---

## 1. Créer le projet Firebase

1. Allez sur [https://console.firebase.google.com/](https://console.firebase.google.com/) et connectez-vous avec un compte Google.
2. Cliquez sur **« Ajouter un projet »**.
3. **Nom du projet** : par exemple `techcouv-rapports`. Cliquez sur **Continuer**.
4. **Google Analytics** : vous pouvez le désactiver (non nécessaire). Cliquez sur **Créer le projet**.
5. Attendez la fin de la création (~ 30 secondes), puis cliquez sur **Continuer**.

---

## 2. Activer Authentication

L'application utilise l'authentification **anonyme** Firebase (les techniciens écrivent sans compte Google, et leur identité TECHCOUV-X est vérifiée par le mot de passe commun et stockée dans les métadonnées).

1. Dans le menu de gauche, cliquez sur **Compilation → Authentication**.
2. Cliquez sur **Commencer**.
3. Onglet **Sign-in method** → **Ajouter un fournisseur** → choisissez **Anonyme**.
4. Activez-le et cliquez sur **Enregistrer**.

---

## 3. Activer Firestore Database

1. Menu de gauche → **Compilation → Firestore Database**.
2. Cliquez sur **Créer une base de données**.
3. Choisissez **Mode production** → **Suivant**.
4. **Emplacement** : choisissez `eur3 (europe-west)` (recommandé pour la France). ⚠️ **Cette option est définitive.**
5. Cliquez sur **Activer**.

Une fois la base créée, allez dans l'onglet **Règles** et collez les règles suivantes :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Collection des rapports
    match /rapports/{document=**} {
      // Les techniciens authentifiés (anonymes) peuvent créer + lire.
      allow create: if request.auth != null;
      allow read:   if request.auth != null;

      // Seul l'admin peut supprimer.
      // ⚠️  Remplacez l'email ci-dessous par celui de votre admin Outlook.
      allow delete: if request.auth != null
                    && request.auth.token.email == "admin@votre-domaine.com";

      // Personne ne peut modifier un rapport après envoi.
      allow update: if false;
    }
  }
}
```

Cliquez sur **Publier**.

> 💡 **Remarque importante** : avec une connexion anonyme Firebase, `request.auth.token.email` est vide par défaut. Pour que la règle `delete` fonctionne réellement pour l'admin, deux options :
> - **Option A (simple, recommandée pour démarrage)** : pendant le développement, vous pouvez assouplir la règle delete à `if request.auth != null;` et **faire confiance à la vérification côté client** (l'admin ne voit même pas le bouton supprimer s'il n'est pas connecté avec le bon email). Sécurité limitée mais fonctionnelle.
> - **Option B (production)** : mettre en place une Cloud Function qui génère un **custom token** Firebase à partir du token Microsoft. C'est plus complexe (~ 1 jour de dev en plus). Je recommande de commencer avec l'option A et migrer plus tard.

Pour l'**option A**, utilisez plutôt :

```javascript
match /rapports/{document=**} {
  allow create: if request.auth != null;
  allow read:   if request.auth != null;
  allow delete: if request.auth != null;
  allow update: if false;
}
```

---

## 4. Activer Cloud Storage

1. Menu de gauche → **Compilation → Storage**.
2. Cliquez sur **Commencer**.
3. Choisissez **Mode production** → **Suivant**.
4. **Emplacement** : reprenez le même que Firestore (`europe-west`).
5. Cliquez sur **Terminé**.

Onglet **Règles** → collez :

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    match /rapports/{fileName} {
      // Les techniciens authentifiés peuvent uploader et lire.
      allow write: if request.auth != null;
      allow read:  if request.auth != null;

      // Suppression : voir la remarque dans la section Firestore.
      // Option A simplifiée :
      allow delete: if request.auth != null;
    }
  }
}
```

Cliquez sur **Publier**.

---

## 5. Récupérer la configuration Firebase

1. En haut à gauche, cliquez sur l'icône ⚙️ **Paramètres** → **Paramètres du projet**.
2. Onglet **Général** → faites défiler jusqu'à **« Vos applications »**.
3. Cliquez sur l'icône **`</>`** (Web).
4. **Surnom de l'application** : `Formulaire TECHCOUV` (peu importe). Ne cochez pas Firebase Hosting.
5. Cliquez sur **Enregistrer l'application**.
6. Firebase affiche un bloc de code avec un objet `firebaseConfig`. **Copiez ses valeurs** :

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...........",
    authDomain: "techcouv-rapports.firebaseapp.com",
    projectId: "techcouv-rapports",
    storageBucket: "techcouv-rapports.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcd1234..."
};
```

➡️ Gardez cet écran ouvert, vous allez recoller ces valeurs dans `firebaseConfig.js` à l'étape 7.

---

## 6. Configurer Microsoft Azure (OAuth Outlook)

L'admin se connecte au dashboard avec son compte Outlook Pro. Pour cela, il faut **enregistrer une application** dans Azure Active Directory.

1. Allez sur [https://portal.azure.com/](https://portal.azure.com/) et connectez-vous avec un compte Microsoft administrateur (idéalement celui qui sera l'admin du dashboard).
2. Dans la barre de recherche du haut, tapez **« App registrations »** (ou **« Inscriptions d'applications »**) et cliquez dessus.
3. Cliquez sur **« Nouvelle inscription »**.
4. **Nom** : `Dashboard TECHCOUV` (peu importe).
5. **Types de comptes pris en charge** : choisissez **« Comptes dans n'importe quel annuaire organisationnel et comptes Microsoft personnels »** (ou plus restrictif selon votre besoin).
6. **URI de redirection** :
   - Type : **Application monopage (SPA)**
   - URL : l'URL où sera hébergé `admin.html`.
     - Pendant les tests locaux : `http://localhost:8000/admin.html`
     - En production : `https://votre-domaine.com/admin.html`

   ⚠️ L'URL doit correspondre **exactement** (protocole, port, chemin) à celle où l'admin se connectera.

7. Cliquez sur **S'inscrire**.

Une fois créée, sur la page de l'application :

8. Copiez l'**« ID d'application (client) »** (un UUID type `1234abcd-...`). C'est votre `clientId`.
9. Menu de gauche → **Authentification**. Vérifiez que sous **« Plateformes »**, vous avez bien votre URL en type **SPA** (pas en « Web »). Si elle est en mauvais type, supprimez-la et recréez-la en **SPA**.
10. Toujours dans **Authentification**, descendez jusqu'à **« Flux implicite et flux hybrides »** : cochez **ID tokens** et **Access tokens** par sécurité. Enregistrez.

> 💡 Si vous avez plusieurs URLs (localhost + production), ajoutez-les toutes dans la même section SPA.

---

## 7. Compléter `firebaseConfig.js`

Ouvrez `firebaseConfig.js` à la racine du projet et remplacez les placeholders par les valeurs récupérées :

```javascript
export const firebaseConfig = {
    apiKey:            "AIzaSy............",          // ← étape 5
    authDomain:        "techcouv-rapports.firebaseapp.com",
    projectId:         "techcouv-rapports",
    storageBucket:     "techcouv-rapports.appspot.com",
    messagingSenderId: "123456789012",
    appId:             "1:123456789012:web:abcd1234..."
};

// ← email de l'admin Outlook (doit correspondre EXACTEMENT à
//   l'adresse utilisée pour se connecter au dashboard)
export const ADMIN_EMAIL = "votre.nom@votre-domaine.com";

export const msalConfig = {
    auth: {
        clientId:    "1234abcd-....-....-....-............",  // ← étape 6
        authority:   "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin + window.location.pathname
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false
    }
};

// Mot de passe commun à tous les techniciens — ⚠️ à changer !
export const MOT_DE_PASSE_TECH = "votre-mot-de-passe-fort";
```

---

## 8. Vérifier que tout fonctionne

### Test local rapide

À la racine du projet :

```bash
# Avec Python 3 (recommandé) :
python3 -m http.server 8000

# Ou avec Node :
npx serve -p 8000
```

Puis ouvrez :

- **Portail** : http://localhost:8000/
- **Formulaire pico-quatra** : http://localhost:8000/pico-quatra/
- **Dashboard admin** : http://localhost:8000/admin.html

### Test côté technicien

1. Ouvrez un formulaire (par exemple `/pico-quatra/`).
2. L'écran de login doit apparaître.
3. Sélectionnez `TECHCOUV-3`, tapez le mot de passe défini dans `firebaseConfig.js`, cliquez sur **Se connecter**.
4. Le formulaire s'affiche, vous voyez « 👤 TECHCOUV-3 » en haut à droite.
5. Remplissez **au minimum** :
   - Numéro de ticket
   - Numéro d'OT / Référence commande
   - Raison sociale
   - Ville
6. Cliquez sur **📧 Envoyer au serveur**.
7. Vous devez voir « ✅ Rapport envoyé avec succès ! » et les noms de fichier.
8. Vérifiez dans Firebase Console :
   - **Firestore Database → rapports** : un document doit apparaître.
   - **Storage → rapports/** : deux fichiers `.docx` et `.json` doivent s'y trouver.

### Test côté admin

1. Ouvrez `/admin.html`.
2. Cliquez sur **Se connecter avec Outlook**.
3. La popup Microsoft s'ouvre, connectez-vous avec votre compte admin.
4. ⚠️ Si vous voyez « Le compte n'est pas autorisé », c'est que l'email connecté **ne correspond pas exactement** à `ADMIN_EMAIL` dans `firebaseConfig.js`. Vérifiez l'orthographe (sensible à la casse selon votre tenant).
5. Le dashboard doit afficher le rapport envoyé.
6. Testez :
   - 👀 Voir détails → modal avec le JSON.
   - 📄 Télécharger Word → le fichier `.docx` se télécharge.
   - 📋 Télécharger JSON → le fichier `.json` se télécharge.
   - 🗑️ Supprimer → confirmer → le rapport disparaît du tableau et des deux services Firebase.

---

## Annexes

### Hébergement gratuit

Quelques options pour héberger gratuitement :

- **Firebase Hosting** (gratuit, 10 GB / mois) — `firebase deploy`.
- **Netlify** (gratuit, glisser-déposer du dossier).
- **GitHub Pages** (gratuit, depuis un repo).
- **Vercel** (gratuit).

⚠️ Quel que soit l'hébergeur choisi, n'oubliez pas de **mettre à jour l'URI de redirection dans Azure** (étape 6) avec l'URL définitive.

### Dépannage

| Problème | Cause probable | Solution |
|----------|----------------|----------|
| « Mot de passe incorrect » côté technicien | Mot de passe pas mis à jour dans `firebaseConfig.js` | Vérifier `MOT_DE_PASSE_TECH` |
| Erreur Firebase à l'upload | Règles Firestore/Storage trop strictes | Vérifier que `request.auth != null` autorise create/write |
| « Le compte n'est pas autorisé » sur admin | Email différent de `ADMIN_EMAIL` | Synchroniser exactement les deux (sensible à la casse) |
| MSAL : « Redirect URI mismatch » | URL Azure ≠ URL d'accès | Recréer l'URI dans Azure App Registration en type **SPA** |
| Popup MSAL bloquée | Navigateur bloque les popups | Autoriser les popups pour le site |
| « Stockage utilisé : 0 B » | Aucune métadonnée `wordsSize`/`jsonSize` | Normal au tout début, se met à jour à chaque envoi |
| Stockage approche 4 GB | Espace bientôt plein | Le dashboard affiche l'alerte → utiliser la suppression en masse par date |

### Suivi du quota Firebase

Firebase Console → **Storage → Usage** affiche les Go consommés en temps réel.
Plan Spark (gratuit) :
- Storage : 5 GB
- Firestore : 1 Go + 50 000 lectures / 20 000 écritures par jour.

Pour ce projet, la limite contraignante sera **Storage**. Avec en moyenne 5 Mo par rapport (Word + JSON avec photos), vous tenez **~ 1000 rapports** dans le quota gratuit.

### Améliorations futures possibles

- **Cloud Function** pour générer un custom token Firebase à partir du token MSAL → sécurité « vraie » des règles delete admin.
- **Notification email** quand le stockage dépasse 4 Go (via une Cloud Function planifiée).
- **Export Excel** du tableau des rapports.
- **Statistiques** par technicien / par mois.

---

✅ **Tout est prêt.** Bonne utilisation !
