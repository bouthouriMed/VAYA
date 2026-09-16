# Politique de confidentialité de VAYA

**Version 1.0 — Entrée en vigueur : [DATE À FIXER LORS DE LA PUBLICATION]**
**Langue faisant foi : français.** Voir `docs/legal/README.md` pour le statut de revue
juridique de ce document et le suivi des démarches auprès de l'INPDP.

---

## 1. Préambule et responsable du traitement

La présente Politique de confidentialité décrit comment VAYA collecte, utilise, partage et
protège les données à caractère personnel des utilisateurs de son application (« Membres »),
conformément à la loi organique n° 2004-63 du 27 juillet 2004 relative à la protection des
données à caractère personnel, et aux textes qui pourraient lui succéder.

Le **responsable du traitement** est VAYA [dénomination sociale, forme juridique et adresse
du siège social à compléter — voir `docs/legal/README.md`], joignable à l'adresse
**privacy@vaya.tn** pour toute question relative à vos données personnelles.

Cette politique fait partie intégrante des [Conditions Générales d'Utilisation](./terms-and-conditions.md)
de VAYA.

---

## 2. Données collectées

### 2.1. Données fournies directement par le Membre

- **Identité** : nom complet, numéro de téléphone, adresse électronique (le cas échéant),
  langue préférée.
- **Photographie de profil** (facultative).
- **Documents de vérification d'identité (« KYC »), pour les Conducteurs uniquement** :
  photographie du visage en direct (« selfie »), photographie du permis de conduire,
  photographie de l'attestation d'assurance automobile, informations sur le véhicule
  (marque, modèle, couleur, immatriculation). **Ces photographies sont exclusivement
  capturées en direct par l'appareil photo de l'application — VAYA n'accepte aucun import
  depuis une galerie existante, ce qui signifie que la photographie transmise a
  nécessairement été prise au moment de la vérification.**
- **Contenu des échanges** : messages envoyés dans la messagerie intégrée à
  l'application entre un Conducteur et un Passager ayant une Réservation en commun.
- **Évaluations et commentaires** laissés après un Trajet.

### 2.2. Données collectées automatiquement

- **Données de localisation** : position de départ et de destination saisies pour la
  recherche ou la publication d'un Trajet ; position GPS en temps réel du Conducteur
  pendant le déroulement d'un Trajet actif, afin d'assurer le suivi du trajet et la
  détection automatique de ses étapes (prise en charge, dépose, fin de trajet).
- **Identifiant de l'appareil** aux fins de l'envoi de notifications push.
- **Données techniques d'usage** : journaux d'erreurs et de diagnostics techniques
  (lorsque le suivi d'erreurs est activé), horodatage des actions effectuées dans
  l'application, adresse IP au niveau de l'infrastructure serveur.

### 2.3. Données que VAYA ne collecte pas

VAYA ne collecte, à ce jour, aucune donnée de paiement (aucune carte bancaire, aucun
identifiant de portefeuille électronique) : la Contribution est échangée directement entre
Membres, hors de la Plateforme (voir CGU, article 7.2).

---

## 3. Finalités et bases légales du traitement

| Finalité | Données concernées | Base légale |
|---|---|---|
| Création et gestion du compte | Identité, téléphone | Exécution du contrat (CGU) |
| Vérification d'identité du Conducteur | Selfie, permis, assurance | Consentement explicite (donnée sensible) + intérêt légitime de sécurité de la marketplace |
| Mise en relation et réservation de Trajets | Localisation, itinéraire, Trajet | Exécution du contrat |
| Suivi en temps réel d'un Trajet actif | Position GPS du Conducteur | Exécution du contrat, limité à la durée du Trajet actif |
| Messagerie entre Membres d'une même Réservation | Contenu des messages | Exécution du contrat |
| Système d'évaluation et de confiance | Notes, commentaires | Exécution du contrat / intérêt légitime de sécurité |
| Notifications (réservation, message, rappel) | Identifiant d'appareil | Exécution du contrat |
| Sécurité, prévention de la fraude, respect des CGU | Ensemble des données ci-dessus | Intérêt légitime |
| Statistiques d'usage agrégées et anonymisées | Données d'usage | Intérêt légitime |
| Diagnostics techniques (suivi d'erreurs) | Journaux techniques | Intérêt légitime |

---

## 4. Traitement des données biométriques et documents d'identité (KYC)

4.1. La photographie du visage capturée lors de la vérification d'identité constitue une
**donnée biométrique**, catégorie de donnée sensible au sens de la législation tunisienne
sur la protection des données. Son traitement repose sur le **consentement explicite et
éclairé** du Membre, recueilli avant la capture, et qui peut être retiré à tout moment (ce
retrait entraînant toutefois l'impossibilité de conserver le statut de Conducteur vérifié).

4.2. Cette photographie et les documents associés (permis, assurance) sont utilisés
**exclusivement** aux fins de vérifier l'identité du Conducteur et la validité de ses
documents, et ne sont **jamais** communiqués à d'autres Membres ni utilisés à des fins de
reconnaissance faciale automatisée à l'égard de tiers.

4.3. Conformément au régime renforcé applicable au traitement de données biométriques en
droit tunisien, VAYA soumet ce traitement à l'autorisation préalable de l'**Instance
Nationale de Protection des Données Personnelles (INPDP)**, en sus de la déclaration
générale de ses traitements de données. Le suivi de cette démarche administrative est
documenté à `docs/legal/README.md` — il s'agit d'une action opérationnelle distincte de la
rédaction de la présente politique.

---

## 5. Destinataires et sous-traitants des données

VAYA ne vend jamais les données personnelles de ses Membres. Elles peuvent être communiquées
aux catégories de destinataires suivantes, strictement dans la mesure nécessaire à
l'exécution des finalités décrites ci-dessus :

- **Aux autres Membres**, de façon limitée : un Passager voit le prénom, la note et le
  niveau de confiance d'un Conducteur avant de réserver ; un Conducteur voit l'identité
  d'un Passager ayant réservé une place chez lui. Le numéro de téléphone d'un Membre n'est
  **jamais** communiqué à un autre Membre via l'application.
- **Aux sous-traitants techniques de VAYA**, notamment : l'hébergeur de l'infrastructure
  serveur et de la base de données ; le fournisseur de services d'envoi de SMS (vérification
  du numéro de téléphone) ; le fournisseur de stockage des fichiers (photographies de
  profil, documents KYC) ; le fournisseur de notifications push ; l'outil de suivi
  technique des erreurs (lorsqu'il est activé). Chacun de ces sous-traitants n'agit que sur
  instruction de VAYA et dans le cadre d'un engagement contractuel de confidentialité.
- **Aux autorités compétentes**, lorsque la loi l'exige ou dans le cadre d'une procédure
  judiciaire ou administrative régulière.

---

## 6. Transferts de données hors de Tunisie

Certains sous-traitants techniques de VAYA (hébergement infrastructure, stockage de
fichiers, service de notifications push, outil de suivi d'erreurs) sont susceptibles
d'héberger tout ou partie des données en dehors du territoire tunisien. Conformément aux
articles 47 et 50 à 52 de la loi organique n° 2004-63, un tel transfert fait l'objet d'une
**demande d'autorisation préalable auprès de l'INPDP**, distincte de la déclaration
générale des traitements. Le statut de cette démarche est suivi à `docs/legal/README.md`.
Lorsqu'un transfert est autorisé, VAYA veille à ce que le sous-traitant concerné offre des
garanties de sécurité et de confidentialité substantiellement équivalentes à celles
requises par le droit tunisien.

---

## 7. Durée de conservation

| Catégorie de données | Durée de conservation |
|---|---|
| Compte actif (identité, historique de Trajets, évaluations) | Pendant toute la durée d'activité du compte |
| Documents KYC (selfie, permis, assurance) | Pendant la durée du statut de Conducteur vérifié, puis effacés selon l'article 9 ci-dessous en cas de suppression du compte ou de rejet de la vérification |
| Messages entre Membres | Le temps de leur utilité pour le suivi de la Réservation concernée, puis conformément à l'article 9 |
| Position GPS en temps réel | Uniquement pendant la durée d'un Trajet actif ; non conservée sous forme individualisée au-delà de la fin de ce Trajet, hors nécessité d'un litige en cours |
| Journaux techniques et de diagnostic | Durée strictement nécessaire à la résolution des incidents techniques, généralement quelques semaines |
| Données conservées à des fins probatoires en cas de litige ou de fraude avérée | Limitée à la durée strictement nécessaire à la gestion du litige, dans le respect des délais de prescription applicables |

Ces durées sont revues périodiquement et pourront être précisées dans la déclaration
formelle de VAYA auprès de l'INPDP (article 6.a).

---

## 8. Sécurité des données

VAYA met en œuvre des mesures techniques et organisationnelles raisonnables pour protéger
les données personnelles de ses Membres contre l'accès non autorisé, la perte, l'altération
ou la divulgation : chiffrement des communications entre l'application et les serveurs de
VAYA, contrôle d'accès aux données par les seules personnes habilitées, et journalisation
des accès aux données sensibles. Aucun système n'étant infaillible, VAYA s'engage à
informer les Membres concernés et l'INPDP, conformément à la réglementation applicable, en
cas d'incident de sécurité affectant significativement leurs données.

---

## 9. Vos droits sur vos données

Conformément à la loi organique n° 2004-63 (notamment ses articles 32, 42 et 55), tout
Membre dispose des droits suivants sur ses données personnelles :

- **Droit d'accès** : obtenir la confirmation que des données le concernant sont traitées,
  et en obtenir une copie intelligible.
- **Droit de rectification** : faire corriger, compléter ou mettre à jour des données
  inexactes ou incomplètes — directement possible depuis l'écran « Informations
  personnelles » de l'application pour la plupart des champs.
- **Droit d'opposition** : s'opposer à tout moment à un traitement, sauf lorsque ce
  traitement est nécessaire à l'exécution du contrat qui vous lie à VAYA ou imposé par la
  loi.
- **Droit à l'effacement (suppression)** : demander la suppression de votre compte et
  l'effacement ou l'anonymisation de vos données, dans les conditions décrites à l'article
  10 ci-dessous.

Ces droits peuvent être exercés directement depuis l'application (Profil → Informations
personnelles, ou Profil → Conditions et vie privée → Supprimer mon compte), ou en écrivant
à **privacy@vaya.tn**. VAYA répond à toute demande dans un délai raisonnable. En cas de
désaccord persistant, le Membre peut saisir l'**Instance Nationale de Protection des
Données Personnelles (INPDP)**.

---

## 10. Suppression de compte

10.1. **Comment demander la suppression.** Depuis l'application : Profil → Conditions et
vie privée → Supprimer mon compte. Une confirmation explicite est demandée avant toute
suppression, celle-ci étant définitive.

10.2. **Quand la suppression peut être refusée.** Pour ne pas priver un autre Membre d'un
engagement en cours, la demande est refusée tant que le compte a une Réservation active
(en attente ou acceptée) en tant que Passager, ou un Trajet publié et non terminé en tant
que Conducteur. L'application indique clairement ce blocage et invite à régulariser la
situation (annuler la Réservation ou le Trajet concerné) avant de renouveler la demande.

10.3. **Ce qui est effacé.** Dès la suppression confirmée :
   - les données d'identification directe (nom, numéro de téléphone, adresse électronique,
     identifiant de connexion Google le cas échéant, photographie de profil) sont
     irréversiblement anonymisées dans la base de données de VAYA ;
   - les documents de vérification d'identité (selfie, permis de conduire, attestation
     d'assurance) sont supprimés du stockage de fichiers de VAYA ;
   - l'ensemble des sessions actives du compte sont immédiatement révoquées — le compte ne
     peut plus être utilisé pour se connecter, même avec une session déjà ouverte.

10.4. **Ce qui est conservé, et pourquoi.** Les enregistrements strictement nécessaires à
la tenue des engagements pris envers d'autres Membres avant la suppression (l'existence
d'une Réservation ou d'une évaluation passée, par exemple) sont conservés sous forme
anonymisée uniquement — c'est-à-dire sans qu'aucune donnée ne permette plus d'identifier le
Membre supprimé — car leur suppression intégrale porterait atteinte au droit d'un autre
Membre de conserver l'historique de ses propres Trajets et évaluations. Aucune donnée
directement identifiante n'est conservée au-delà de la suppression, hors obligation légale
de conservation qui s'imposerait à VAYA (par exemple dans le cadre d'un litige en cours ou
d'une obligation comptable ou fiscale), auquel cas seules les données strictement
nécessaires à cette obligation sont conservées, pour la durée strictement nécessaire.

10.5. La suppression de compte est **irréversible** : un Membre souhaitant réutiliser VAYA
après suppression doit créer un nouveau compte.

---

## 11. Mineurs

L'utilisation de VAYA n'est pas destinée aux personnes de moins de 18 ans. VAYA ne collecte
pas sciemment de données concernant des mineurs. Si VAYA venait à en avoir connaissance,
les données concernées seraient supprimées dans les meilleurs délais.

---

## 12. Modification de la présente politique

VAYA peut modifier la présente Politique de confidentialité à tout moment, notamment pour
refléter une évolution du service ou de la réglementation applicable. Toute modification
substantielle est portée à la connaissance des Membres par un moyen approprié avant son
entrée en vigueur.

---

## 13. Contact et réclamation

Pour exercer vos droits ou pour toute question relative à cette politique :
**privacy@vaya.tn**

Pour toute réclamation relative au traitement de vos données personnelles, vous pouvez
également saisir l'autorité tunisienne compétente :

**Instance Nationale de Protection des Données Personnelles (INPDP)**
[coordonnées officielles à vérifier et compléter lors de la publication — voir
`docs/legal/README.md`]
