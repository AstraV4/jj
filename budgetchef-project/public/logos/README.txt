LOGOS DES ENSEIGNES
===================

Pour afficher les logos des supermarchés à la place de leur nom :

1. Dépose dans CE dossier une image par enseigne, nommée exactement par son
   identifiant, au format PNG (fond transparent recommandé) :

     lidl.png        aldi.png        carrefour.png   leclerc.png
     auchan.png      intermarche.png casino.png      monoprix.png
     cora.png        franprix.png    grandfrais.png  naturalia.png

   (hauteur ~40-60 px suffit ; l'app les redimensionne automatiquement)

2. Ouvre src/App.jsx et passe le drapeau à true :

     const USE_STORE_LOGOS = true;

3. Repousse sur GitHub — Railway redéploie tout seul.

Comportement : si un fichier est manquant, l'app réaffiche automatiquement le
NOM de l'enseigne à la place (aucun risque d'image cassée).

IMPORTANT — droits d'usage
Les logos des enseignes sont des marques déposées. Tu dois t'assurer d'avoir le
droit de les afficher (l'usage « nominatif », pour indiquer où un produit est le
moins cher, est souvent toléré, mais ce n'est pas un conseil juridique). Utilise
des fichiers officiels ou libres de droits, et respecte les chartes des marques.
Ces fichiers ne sont pas fournis avec le projet.
