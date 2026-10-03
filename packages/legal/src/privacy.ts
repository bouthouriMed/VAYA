import type { SupportedLocale } from '@vaya/config';
import type { LegalDocument } from './types';

/**
 * Structured content for VAYA's Privacy Policy (version 2.0), shared by the
 * mobile app and the marketing website — see the doc comment in `terms.ts`
 * for why this lives in a shared package. Built from
 * `docs/legal/v2/privacy-policy.en.md`, describing what the code actually
 * does today (see `docs/legal/v2/legal-product-audit.md` §5–§7), with every
 * statement that still needs an owner decision (controller identity,
 * contact addresses, DPO, hosting regions, retention periods) left out
 * rather than shown as a placeholder. French is the governing text.
 */
const fr: LegalDocument = {
  title: 'Politique de confidentialité',
  version: '2.0',
  effectiveDateLabel: 'Version 2.0',
  languageNote:
    'Langue faisant foi : français. En cas de divergence avec une traduction, la version française prévaut.',
  sections: [
    {
      heading: "1. Qui sommes-nous",
      body: [
        "VAYA (« nous ») exploite l'application mobile et le site internet VAYA (la « Plateforme ») et est responsable du traitement de vos données personnelles décrit ci-dessous.",
        "Pour toute question ou demande relative à vos données, contactez le Support VAYA, dont les coordonnées sont publiées sur la page de VAYA dans l'App Store et Google Play.",
        "Les termes Membre, Conducteur, Passager, Trajet, Réservation, Course, Point d'arrêt et Participation ont le sens défini dans nos Conditions Générales d'Utilisation.",
      ],
    },
    {
      heading: "2. L'essentiel",
      body: [
        "Nous collectons ce qui est nécessaire au fonctionnement d'une plateforme de covoiturage : vos informations de compte, les trajets que vous recherchez, publiez et réservez, vos messages et évaluations et, pendant une Course, la position du Conducteur.",
        "Les Conducteurs fournissent en plus des photos de leur permis, de leur assurance et de leur visage, que seule l'équipe VAYA habilitée peut consulter.",
        "Les autres Membres voient votre nom, votre photo, vos évaluations et, pour les Conducteurs, les informations du véhicule. Votre numéro de téléphone n'est montré qu'à l'autre partie d'une Réservation acceptée.",
        "Nous ne vendons pas vos données, n'affichons pas de publicité et n'utilisons aucun outil tiers d'analyse ou de publicité.",
        'Vous pouvez accéder à vos données, les corriger et supprimer votre compte depuis l\'application.',
      ],
    },
    {
      heading: '3. Données que vous nous fournissez',
      body: [
        "Compte : numéro de téléphone (connexion par téléphone), nom complet, langue.",
        "Connexion Google : si vous choisissez « Se connecter avec Google », nous recevons de Google votre identifiant Google, votre nom, votre adresse électronique et le lien de votre photo de profil Google.",
        "Profil : photo de profil facultative, choisie dans votre galerie ou issue de Google.",
        "Profil conducteur : marque, modèle, couleur, immatriculation, nombre de places et photo du véhicule ; biographie et langues parlées (facultatives).",
        "Vérification Conducteur : photos de votre permis de conduire, de votre attestation d'assurance et de votre visage (selfie), prises avec l'appareil photo dans l'application.",
        "Trajets publiés : départ, destination, heure de départ, itinéraire choisi, Points d'arrêt, places, Participation.",
        "Recherches et réservations : départ, destination, date, heure et nombre de places recherchés ; Points d'arrêt choisis ; Demandes de réservation ; alertes « Me notifier » (trajet et plage horaire).",
        "Messages échangés avec l'autre partie d'une Réservation ; évaluations, indicateurs de ponctualité et commentaires que vous donnez ; motif choisi lors d'une annulation ; signalements d'absence ; signalements et messages adressés au Support VAYA.",
      ],
    },
    {
      heading: "4. Données générées par l'utilisation de la Plateforme",
      body: [
        "Position du Conducteur pendant une Course : dès que le Conducteur démarre une Course et tant que son application est ouverte, celle-ci envoie environ toutes les 7 secondes la position GPS de l'appareil (coordonnées, cap, vitesse, précision). Nous ne conservons que la dernière position reçue : chaque nouvelle position remplace la précédente. Nous enregistrons aussi une fois si le Conducteur s'est approché du point de départ, et si le véhicule suit l'itinéraire prévu ou s'en écarte.",
        "Position ponctuelle de l'appareil : si vous autorisez l'accès à la localisation, votre position sert à centrer la carte, à vous aider à choisir un point de prise en charge et, si vous le choisissez, à accompagner un signalement d'absence. Elle n'est pas conservée sous forme d'historique.",
        "Données de Réservation et de Course : changements de statut et horodatages (demande, acceptation, expiration, annulation, démarrage, prise en charge, dépose, fin), distance de marche jusqu'au Point d'arrêt.",
        "Réputation : note moyenne, nombre de Courses terminées, scores de ponctualité et de fiabilité, niveau de confiance, et points de fiabilité liés aux annulations tardives et absences.",
        "Trajets réguliers : trajets que vous semblez effectuer régulièrement, déduits de votre historique (itinéraire, jours, plage horaire, score de confiance), et votre réponse à une suggestion.",
        "Événements d'utilisation : par exemple le lancement d'une recherche, les résultats affichés, un résultat choisi, un Point d'arrêt sélectionné ou une notification ouverte, avec les informations de trajet associées (y compris les coordonnées de départ et de destination) et l'heure. Ils sont stockés dans nos propres systèmes et ne sont pas transmis à des sociétés d'analyse.",
        "Notifications envoyées et leur statut de lecture ; jeton de notification push et plateforme (iOS/Android) ; adresse IP et données de requête dans les journaux du serveur ; demandes de code de connexion et tentatives échouées (les codes ne sont stockés que sous une forme protégée et illisible) ; sessions ; et, lorsque le suivi des erreurs est activé, rapports techniques d'erreur (modèle d'appareil, version du système et de l'application, détail de l'erreur).",
        "Données provenant d'autres Membres et de l'équipe VAYA : évaluations et commentaires vous concernant, signalements d'absence ou autres signalements vous concernant, décisions et notes de l'équipe VAYA (résultat de la Vérification Conducteur, motif communiqué, notes internes, suspension).",
        "Nous ne collectons pas de données bancaires (VAYA ne traite aucun paiement), ni vos contacts, ni votre position en arrière-plan (application fermée), ni d'identifiant publicitaire. Nous n'utilisons pas de reconnaissance faciale automatisée.",
      ],
    },
    {
      heading: '5. Finalités et bases légales',
      body: [
        "Créer et sécuriser votre compte, vous connecter, afficher votre profil aux autres Membres : exécution du contrat (nos Conditions Générales d'Utilisation).",
        "Rechercher, mettre en relation et classer les Trajets, proposer itinéraires et Points d'arrêt, calculer la Fourchette de Participation, gérer les Demandes de réservation, leurs délais, acceptations, expirations et le retrait des demandes en double : exécution du contrat.",
        "Permettre aux parties d'une Réservation de communiquer (messagerie, numéro de téléphone) : exécution du contrat.",
        "Suivi de la Course en temps réel, estimation de l'heure d'arrivée et avancement automatique de la Course : exécution du contrat avec le Conducteur et les Passagers, et notre intérêt légitime à la sécurité et à la fiabilité des Courses.",
        "Vérification Conducteur : exécution du contrat avec le Conducteur et notre intérêt légitime à protéger les Passagers.",
        "Évaluations, niveaux de confiance, gestion des annulations et des absences (y compris la constatation automatique d'absence) : exécution du contrat et intérêt légitime à une plateforme fiable.",
        "Notifications (push, dans l'application, codes par SMS, courriels) : exécution du contrat. Les notifications push ne sont envoyées que si vous les autorisez sur votre appareil.",
        "Suggestions de trajets réguliers et propositions proactives : intérêt légitime à vous proposer des trajets pertinents ; vous pouvez rejeter toute suggestion.",
        "Sécurité, traitement des signalements, modération, respect des conditions, prévention de la fraude et des abus, sécurité informatique : intérêt légitime et, le cas échéant, obligations légales.",
        "Analyse statistique et amélioration du service (par exemple comprendre la demande par itinéraire) et diagnostic des erreurs : intérêt légitime ; les rapports consultés par l'équipe sont agrégés.",
        "Respect de la loi, réponse aux autorités, constatation ou défense de droits en justice : obligation légale et intérêt légitime. Protection de la vie d'une personne en cas d'urgence : intérêts vitaux, uniquement si c'est réellement nécessaire.",
        "Lorsque la loi applicable exige votre consentement pour un traitement, nous le recueillons et vous pouvez le retirer à tout moment. Vous pouvez vous opposer aux traitements fondés sur notre intérêt légitime (section 12). Les données signalées comme obligatoires dans l'application sont nécessaires au service ; la photo de profil, la biographie et les langues sont facultatives.",
      ],
    },
    {
      heading: '6. Documents de Vérification Conducteur',
      body: [
        "Les photos sont prises en direct dans l'application ; l'import depuis la galerie n'est pas accepté.",
        "Elles sont stockées dans un espace privé non accessible publiquement. Seule l'équipe VAYA chargée de la vérification peut les consulter, via son outil d'administration.",
        "Un membre de l'équipe les compare manuellement. Nous n'utilisons ni reconnaissance faciale automatisée ni lecture automatique des documents.",
        "Elles ne sont jamais montrées aux autres Membres, qui voient uniquement que vous êtes un Conducteur vérifié.",
      ],
    },
    {
      heading: '7. Qui peut voir vos données',
      body: [
        "Toute personne consultant votre profil : votre nom complet et votre photo ; votre note moyenne, votre nombre de Courses, vos scores de ponctualité et de fiabilité et votre niveau de confiance ; pour un Conducteur, la marque, le modèle, la couleur, la photo et l'immatriculation du véhicule (pour aider les Passagers à reconnaître la bonne voiture), la biographie et les langues.",
        "Toute personne recherchant un trajet : les Trajets que vous publiez (départ, destination, itinéraire, Points d'arrêt, heure, prix, places). Si vous le préférez, choisissez un point de départ qui n'est pas votre adresse exacte.",
        "Toute personne consultant un Trajet : le prénom, la photo et la note des Passagers déjà acceptés sur ce Trajet.",
        "Votre numéro de téléphone : uniquement l'autre partie d'une Réservation acceptée, et seulement tant qu'elle l'est.",
        "Le Conducteur d'un Trajet : votre Point d'arrêt et votre Demande de réservation. Les messages : uniquement les deux parties de la Réservation.",
        "La position en direct du Conducteur : le Conducteur, et les Passagers de cette Course une fois à bord. Avant la prise en charge, les Passagers voient l'heure d'arrivée estimée et l'itinéraire, pas la position en direct.",
        "Les commentaires d'évaluation : le Membre évalué. Les points de fiabilité, documents de vérification et notes internes ne sont pas visibles par les autres Membres.",
      ],
    },
    {
      heading: '8. Prestataires et tiers',
      body: [
        "Nous faisons appel à des prestataires qui traitent des données pour notre compte et selon nos instructions : nos hébergeurs informatiques et de stockage de fichiers (serveurs, bases de données, photos et documents) ; Twilio (envoi des codes de connexion par SMS : numéro de téléphone et code) ; Google Maps Platform (recherche de lieux, itinéraires et temps de trajet : texte recherché et coordonnées, sans votre identité) ; Expo, avec Firebase Cloud Messaging de Google et le service de notifications d'Apple (envoi des notifications push : jeton et contenu de la notification) ; Resend (courriels transactionnels pour les comptes Google : adresse électronique, nom, contenu du courriel) ; Sentry, lorsqu'il est activé (diagnostic des erreurs : données techniques) ; et, le cas échéant, les services OpenStreetMap (recherche de lieux de secours et vérification cartographique des Points d'arrêt : texte recherché et coordonnées).",
        "Google, lorsque vous utilisez la connexion Google et lorsque l'application affiche Google Maps sur votre appareil, ainsi qu'Apple et Google pour les magasins d'applications et systèmes d'exploitation, traitent des données selon leurs propres politiques de confidentialité.",
        "Nous communiquons des données aux juridictions, à la police ou à d'autres autorités compétentes lorsque la loi l'exige, en réponse à une demande légale valable, ou lorsque c'est nécessaire pour protéger la vie ou la sécurité physique d'une personne. Nous pouvons aussi utiliser ou communiquer des données pour constater, exercer ou défendre des droits en justice. Nous examinons chaque demande et ne communiquons que le nécessaire.",
        "En cas de réorganisation, fusion ou cession de VAYA, les données peuvent être transférées au nouvel exploitant, qui devra respecter la présente politique ; nous vous en informerons.",
        "Nous ne vendons pas de données personnelles et ne les partageons pas à des fins publicitaires.",
      ],
    },
    {
      heading: '9. Transferts internationaux',
      body: [
        "Certains de ces prestataires traitent des données hors de votre pays, notamment aux États-Unis. Ces transferts sont effectués avec les garanties et, le cas échéant, les autorisations exigées par la loi applicable en matière de protection des données. Vous pouvez obtenir des informations sur ces garanties auprès du Support VAYA.",
      ],
    },
    {
      heading: "10. Accès de l'équipe VAYA",
      body: [
        "Un nombre restreint de membres de l'équipe VAYA utilise un outil d'administration interne, avec un compte individuel. Selon leur rôle, ils peuvent : rechercher et consulter les comptes des Membres (y compris téléphone et adresse électronique), les profils conducteur, les véhicules et les Trajets et Réservations récents, pour assister les Membres, traiter les signalements et faire respecter les conditions ; consulter les documents de Vérification Conducteur et les approuver ou les refuser ; traiter les signalements ; annuler un Trajet, restreindre un Conducteur, suspendre ou réactiver un compte ; consulter des statistiques agrégées sur les recherches et la demande.",
        "Toute action qui modifie un compte, un Trajet, une vérification ou un signalement est enregistrée dans un journal d'audit indiquant le membre de l'équipe, la date et le motif.",
        "L'outil d'administration ne donne pas accès au contenu des messages. Les membres de l'équipe sont tenus à la confidentialité et n'accèdent aux données que lorsque leurs tâches l'exigent.",
      ],
    },
    {
      heading: '11. Sécurité',
      body: [
        "Nous appliquons des mesures adaptées au risque, notamment : chiffrement des échanges (HTTPS) ; codes de connexion stockés uniquement sous forme d'empreinte cryptographique, avec limitation des tentatives ; jetons d'accès de courte durée ; limitation du nombre de requêtes ; documents de vérification en stockage privé accessible uniquement via l'accès authentifié de l'équipe ; contrôles côté serveur de chaque action ; et journal d'audit des actions de l'équipe.",
        "Aucun système n'est totalement sûr. En cas de violation de données susceptible de présenter un risque pour vos droits, nous informons l'autorité de contrôle compétente et, si le risque est élevé, les personnes concernées, comme la loi l'exige.",
      ],
    },
    {
      heading: '12. Durée de conservation',
      body: [
        "Nous conservons vos données de compte et de profil tant que votre compte existe, et les autres données tant qu'elles sont nécessaires aux finalités décrites à la section 5, selon les critères suivants : la durée de votre compte, la nécessité de conserver un historique cohérent pour les autres Membres, la sécurité de la Plateforme, et les délais nécessaires pour traiter un litige ou respecter une obligation légale.",
        "La dernière position du Conducteur pendant une Course est conservée avec l'enregistrement de cette Course. Les documents de Vérification Conducteur sont conservés tant que vous êtes Conducteur et supprimés lors de la suppression de votre compte.",
        "Nous pouvons conserver des données plus longtemps si la loi l'exige ou le temps nécessaire au traitement d'un litige, d'une enquête ou d'une action en justice en cours.",
      ],
    },
    {
      heading: '13. Décisions automatisées',
      body: [
        "Classement des résultats et propositions de Points d'arrêt : les Trajets sont classés selon leur adéquation à votre trajet (distance aux Points d'arrêt, détour, heure de départ). Cela ne décide pas de votre accès au service.",
        "Fourchette de Participation : calculée à partir de la distance et de la durée estimée de l'itinéraire. Niveau de confiance : calculé à partir du nombre de Courses terminées, de la note moyenne et de l'ancienneté du compte. Suggestions de trajets réguliers : déduites de votre historique, et que vous pouvez rejeter.",
        "Avancement automatique des Courses : l'arrivée au point de prise en charge, la montée à bord et la fin de Course peuvent être déduites des données de localisation ; les Courses restées ouvertes longtemps après leur fin prévue sont clôturées automatiquement.",
        "Constatation automatique d'absence : lorsque les données de localisation et l'état de la Course montrent clairement qu'une partie n'est jamais venue au point de rendez-vous, la Plateforme peut enregistrer une absence, avec des points de fiabilité et une note d'une étoile pour le Membre absent. Vous pouvez demander un réexamen par une personne, présenter votre point de vue et contester cette décision en contactant le Support VAYA (Conditions, article 10).",
        "VAYA ne suspend ni ne ferme aucun compte sur la seule base d'un traitement automatisé : ces décisions sont prises par un membre de l'équipe.",
      ],
    },
    {
      heading: '14. Vos droits',
      body: [
        "Dans les conditions prévues par la loi applicable, vous disposez d'un droit d'accès à vos données et d'en obtenir une copie ; de rectification (nom, photo et langue sont modifiables dans l'application) ; d'effacement (section 15) ; de limitation ; d'opposition aux traitements fondés sur l'intérêt légitime, y compris le profilage ; de portabilité des données que vous avez fournies ; de retrait de votre consentement lorsqu'un traitement repose sur celui-ci ; et de ne pas faire l'objet d'une décision fondée exclusivement sur un traitement automatisé produisant des effets importants, comme décrit à la section 13.",
        "Pour exercer ces droits, contactez le Support VAYA depuis le numéro de téléphone ou l'adresse électronique associés à votre compte, ou utilisez les outils de l'application lorsqu'ils existent. Nous pouvons vous demander de confirmer votre identité, et nous vous répondons dans les délais prévus par la loi.",
        "Vous pouvez également introduire une réclamation auprès de l'autorité de protection des données compétente : en Tunisie, l'Instance Nationale de Protection des Données Personnelles (INPDP), ou l'autorité de votre pays de résidence.",
      ],
    },
    {
      heading: '15. Suppression du compte',
      body: [
        "Dans l'application : Profil → Conditions et vie privée → Supprimer mon compte.",
        "La suppression n'est pas possible tant que vous avez une Réservation en attente ou acceptée, ou un Trajet publié, complet ou en cours : l'application vous indique ce qu'il faut annuler d'abord, afin de ne pas laisser un autre Membre sans Conducteur ou sans Passager.",
        "Immédiatement : votre nom est remplacé par une mention neutre ; votre numéro de téléphone, votre adresse électronique, votre identifiant Google et votre photo de profil sont supprimés ; vos documents de Vérification Conducteur et votre photo de profil sont effacés du stockage ; toutes vos sessions sont déconnectées. La suppression est définitive.",
        "Sont conservés : l'historique de vos Trajets, Réservations, Courses et évaluations passés, afin que l'historique et la réputation des autres Membres restent exacts ; ainsi que, à ce jour, les informations de véhicule, les messages échangés, les commentaires d'évaluation et les événements d'utilisation déjà enregistrés, qui ne sont plus associés à votre nom, à votre téléphone ni à votre adresse électronique. Vous pouvez demander au Support VAYA l'effacement de ces éléments ; nous y donnons suite sauf lorsque leur conservation reste nécessaire pour un autre Membre, un litige ou une obligation légale.",
      ],
    },
    {
      heading: '16. Notifications, localisation et stockage sur l\'appareil',
      body: [
        "Les notifications push ne sont envoyées que si vous les autorisez ; vous pouvez les désactiver à tout moment dans les réglages de votre appareil, et elles restent visibles dans la boîte de réception de l'application. Les SMS servent uniquement à envoyer les codes de connexion. Les courriels (comptes Google uniquement) concernent vos Réservations et évaluations ; nous n'envoyons pas de courriels publicitaires.",
        "L'application ne demande l'accès à votre localisation que « pendant l'utilisation de l'app ». Vous pouvez le refuser ou le retirer dans les réglages de votre appareil ; vous pouvez alors toujours rechercher en saisissant des lieux. Pendant une Course, le Conducteur a besoin de la localisation pour que les Passagers puissent suivre la Course ; à défaut, les Passagers voient que le suivi en direct n'est pas disponible.",
        "L'application conserve de façon sécurisée sur votre appareil votre session de connexion et vos préférences (langue, apparence), qui sont strictement nécessaires au service. Elle ne contient aucun traceur publicitaire ou d'analyse tiers ; les composants Google Maps peuvent collecter des données techniques selon la politique de Google. Notre site internet n'utilise ni cookies ni outils d'analyse.",
      ],
    },
    {
      heading: '17. Mineurs',
      body: [
        "VAYA est réservé aux personnes de 18 ans et plus. Nous ne collectons pas sciemment de données concernant des mineurs. Si nous apprenons qu'un compte appartient à une personne de moins de 18 ans, nous le fermons et supprimons les données. Un Passager voyageant avec un enfant ne crée pas de compte pour lui et nous ne collectons pas les données de l'enfant.",
      ],
    },
    {
      heading: '18. Modifications',
      body: [
        "Nous mettons à jour la présente politique lorsque nos traitements évoluent et vous informons dans l'application des changements importants avant leur entrée en vigueur. La version figure en tête de ce document.",
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Privacy Policy',
  version: '2.0',
  effectiveDateLabel: 'Version 2.0',
  languageNote:
    'Governing language: French. In case of any discrepancy with this translation, the French version prevails.',
  sections: [
    {
      heading: '1. Who we are',
      body: [
        'VAYA ("we") operates the VAYA mobile application and website (the "Platform") and is responsible for the processing of your personal data described below.',
        'For any question or request about your data, contact VAYA Support, whose contact details are published on VAYA\'s App Store and Google Play pages.',
        'The terms Member, Driver, Passenger, Ride, Booking, Trip, Stop and Contribution have the meaning given in our Terms of Use.',
      ],
    },
    {
      heading: '2. In short',
      body: [
        'We collect what is needed to run a carpooling platform: your account details, the journeys you search for, publish and book, your messages and ratings and, during a Trip, the Driver\'s location.',
        'Drivers also provide photos of their licence, insurance and face, which only authorised VAYA staff can see.',
        'Other Members see your name, photo, ratings and, for Drivers, vehicle details. Your phone number is shown only to the other party of an accepted Booking.',
        'We do not sell your data, show advertising, or use third-party analytics or advertising tools.',
        'You can access and correct your data and delete your account from the app.',
      ],
    },
    {
      heading: '3. Data you give us',
      body: [
        'Account: phone number (phone sign-in), full name, language.',
        'Google sign-in: if you choose "Sign in with Google", we receive from Google your Google identifier, name, email address and Google profile-photo link.',
        'Profile: optional profile photo, chosen from your photo library or taken from Google.',
        'Driver profile: vehicle make, model, colour, number plate, seats and photo; optional biography and languages spoken.',
        'Driver Verification: photos of your driving licence, insurance certificate and face (selfie), taken with the camera inside the app.',
        'Rides you publish: origin, destination, departure time, chosen route, Stops, seats, Contribution.',
        'Searches and bookings: origin, destination, date, time and seats searched; Stops chosen; Booking Requests; "Notify me" alerts (journey and time window).',
        'Messages exchanged with the other party of a Booking; ratings, punctuality indicators and comments you give; the reason you select when cancelling; no-show reports; reports and messages you send to VAYA Support.',
      ],
    },
    {
      heading: '4. Data generated when you use the Platform',
      body: [
        'Driver location during a Trip: from the moment a Driver starts a Trip and while the Driver\'s app is open, the app sends the device\'s GPS position (coordinates, heading, speed, accuracy) about every 7 seconds. We store only the most recent position: each new position overwrites the previous one. We also record once whether the Driver came near the departure point, and whether the vehicle is following or has deviated from the planned route.',
        'One-off device location: if you allow location access, your position is used to centre the map, help you choose a pickup point and, if you choose, accompany a no-show report. It is not stored as a location history.',
        'Booking and Trip records: status changes and timestamps (request, acceptance, expiry, cancellation, start, pickup, drop-off, completion), walking distance to the Stop.',
        'Reputation: average rating, number of completed Trips, punctuality and reliability scores, trust level, and reliability points from late cancellations and no-shows.',
        'Recurring journeys: journeys you appear to make regularly, inferred from your history (route, days, time window, confidence score), and your response to a suggestion.',
        'Usage events: for example starting a search, results shown, a result selected, a Stop chosen or a notification opened, with the related journey details (including origin and destination coordinates) and the time. They are stored in our own systems and are not sent to analytics companies.',
        'Notifications sent and whether you have read them; push-notification token and platform (iOS/Android); IP address and request data in server logs; sign-in code requests and failed attempts (codes are stored only in protected, unreadable form); sessions; and, when error tracking is enabled, technical error reports (device model, OS and app version, error details).',
        'Data from other Members and from VAYA staff: ratings and comments about you, no-show or other reports about you, decisions and notes by VAYA staff (Driver Verification outcome, reason given to you, internal notes, suspension).',
        'We do not collect bank details (VAYA processes no payments), your contacts, your location in the background (when the app is closed), or advertising identifiers. We do not use automated facial recognition.',
      ],
    },
    {
      heading: '5. Purposes and legal bases',
      body: [
        'Creating and securing your account, signing you in, showing your profile to other Members: performance of our contract (the Terms of Use).',
        'Searching, matching and ranking Rides, proposing routes and Stops, calculating the Contribution Range, handling Booking Requests, deadlines, acceptance, expiry and withdrawal of duplicate requests: performance of the contract.',
        'Letting the parties to a Booking communicate (messages, phone number): performance of the contract.',
        'Live Trip tracking, arrival estimates and automatic Trip progress: performance of the contract with the Driver and the Passengers, and our legitimate interest in the safety and reliability of Trips.',
        'Driver Verification: performance of the contract with the Driver and our legitimate interest in protecting Passengers.',
        'Ratings, trust levels, handling of cancellations and no-shows (including automatic no-show recording): performance of the contract and legitimate interest in a reliable platform.',
        'Notifications (push, in-app, SMS codes, emails): performance of the contract. Push notifications are sent only if you allow them on your device.',
        'Recurring-journey suggestions and proactive matches: legitimate interest in offering relevant journeys; you can dismiss any suggestion.',
        'Safety, handling reports, moderation, enforcing the Terms, preventing fraud and abuse, information security: legitimate interest and, where applicable, legal obligations.',
        'Statistics and service improvement (for example understanding demand by route) and error diagnosis: legitimate interest; reports seen by staff are aggregated.',
        'Complying with the law, responding to authorities, establishing or defending legal claims: legal obligation and legitimate interest. Protecting someone\'s life in an emergency: vital interests, only where genuinely necessary.',
        'Where the applicable law requires your consent for a processing activity, we ask for it and you can withdraw it at any time. You can object to processing based on our legitimate interests (section 14). Data marked as required in the app is needed to provide the service; profile photo, biography and languages are optional.',
      ],
    },
    {
      heading: '6. Driver Verification documents',
      body: [
        'The photos are taken live in the app; library uploads are not accepted.',
        'They are stored in a private area that is not publicly accessible. Only VAYA staff responsible for verification can view them, through the internal administration tool.',
        'A staff member compares them manually. We do not use automated facial recognition or automated document reading.',
        'They are never shown to other Members, who see only that you are a verified Driver.',
      ],
    },
    {
      heading: '7. Who can see your data',
      body: [
        'Anyone viewing your profile: your full name and photo; your average rating, number of Trips, punctuality and reliability scores and trust level; for a Driver, the vehicle\'s make, model, colour, photo and number plate (to help Passengers identify the right car), biography and languages.',
        'Anyone searching for a journey: the Rides you publish (origin, destination, route, Stops, time, price, seats). If you prefer, choose a departure point that is not your exact address.',
        'Anyone viewing a Ride: the first name, photo and rating of Passengers already accepted on that Ride.',
        'Your phone number: only the other party of an accepted Booking, and only while it remains accepted.',
        'The Driver of a Ride: your Stop and Booking Request. Messages: only the two parties of the Booking.',
        'The Driver\'s live position: the Driver, and the Passengers of that Trip once on board. Before pickup, Passengers see the estimated arrival time and the route, not the live position.',
        'Rating comments: the rated Member. Reliability points, verification documents and internal notes are not visible to other Members.',
      ],
    },
    {
      heading: '8. Service providers and third parties',
      body: [
        'We use providers that process data on our behalf and on our instructions: our cloud hosting and file-storage providers (servers, databases, photos and documents); Twilio (sending sign-in codes by SMS: phone number and code); Google Maps Platform (place search, routes and travel times: searched text and coordinates, without your identity); Expo, with Google Firebase Cloud Messaging and Apple\'s push notification service (delivering push notifications: token and notification content); Resend (transactional emails for Google accounts: email address, name, email content); Sentry, when enabled (error diagnosis: technical data); and, where used, OpenStreetMap services (fallback place search and map checks of Stops: searched text and coordinates).',
        'Google, when you use Google sign-in and when the app displays Google Maps on your device, and Apple and Google for the app stores and operating systems, process data under their own privacy policies.',
        'We disclose data to courts, police or other competent authorities when the law requires it, in response to a valid legal request, or where necessary to protect someone\'s life or physical safety. We may also use or disclose data to establish, exercise or defend legal claims. We assess each request and disclose only what is necessary.',
        'If VAYA is reorganised, merged or sold, data may be transferred to the new operator, who must respect this policy; we will inform you.',
        'We do not sell personal data and do not share it for advertising.',
      ],
    },
    {
      heading: '9. International transfers',
      body: [
        'Some of these providers process data outside your country, in particular in the United States. These transfers are made with the safeguards and, where required, the authorisations required by the applicable data-protection law. You can obtain information about these safeguards from VAYA Support.',
      ],
    },
    {
      heading: '10. Access by VAYA staff',
      body: [
        'A small number of VAYA staff use an internal administration tool, each with an individual account. Depending on their role, they can: search for and view Member accounts (including phone number and email), driver profiles, vehicles, and recent Rides and Bookings, to support Members, handle reports and enforce the Terms; view Driver Verification documents and approve or decline them; handle reports; cancel a Ride, restrict a Driver, suspend or reactivate an account; and view aggregated statistics on searches and demand.',
        'Every action that changes an account, a Ride, a verification or a report is recorded in an audit log showing the staff member, the time and the reason.',
        'The administration tool gives no access to message content. Staff are bound by confidentiality and access data only when their tasks require it.',
      ],
    },
    {
      heading: '11. Security',
      body: [
        'We apply measures appropriate to the risk, including: encryption of data in transit (HTTPS); sign-in codes stored only as one-way cryptographic values, with limits on attempts; short-lived access tokens; rate limiting; verification documents in private storage accessible only through authenticated staff access; server-side checks on every action; and an audit log of staff actions.',
        'No system is completely secure. If a personal-data breach is likely to put your rights at risk, we notify the competent supervisory authority and, where the risk is high, the people affected, as required by law.',
      ],
    },
    {
      heading: '12. How long we keep data',
      body: [
        'We keep your account and profile data for as long as your account exists, and other data for as long as needed for the purposes in section 5, based on these criteria: the life of your account, the need to keep a consistent history for other Members, the security of the Platform, and the time needed to handle a dispute or meet a legal obligation.',
        'The Driver\'s latest position during a Trip is kept with that Trip\'s record. Driver Verification documents are kept while you are a Driver and deleted when you delete your account.',
        'We may keep data longer if the law requires it, or for as long as needed to handle an ongoing dispute, investigation or legal claim.',
      ],
    },
    {
      heading: '13. Automated decisions',
      body: [
        'Search ranking and Stop proposals: Rides are ordered by how well they fit your journey (distance to Stops, detour, departure time). This does not decide your access to the service.',
        'Contribution Range: calculated from the route\'s distance and estimated duration. Trust level: calculated from your number of completed Trips, average rating and account age. Recurring-journey suggestions: inferred from your history, and you can dismiss them.',
        'Automatic Trip progress: arrival at the pickup point, boarding and the end of a Trip may be inferred from location data; Trips left open long after their expected end are closed automatically.',
        'Automatic no-show recording: when location data and Trip status clearly show that a party never came to the meeting point, the Platform may record a no-show, with reliability points and a 1-star rating for the absent Member. You can ask for review by a person, give your point of view and contest the decision by contacting VAYA Support (Terms, Article 10).',
        'VAYA does not suspend or close accounts based solely on automated processing: those decisions are taken by a member of staff.',
      ],
    },
    {
      heading: '14. Your rights',
      body: [
        'Under the conditions of the applicable law, you have the right to access your data and obtain a copy; to rectification (name, photo and language can be changed in the app); to erasure (section 15); to restriction; to object to processing based on legitimate interests, including profiling; to portability of the data you provided; to withdraw consent where processing is based on it; and not to be subject to a decision based solely on automated processing with significant effects, as described in section 13.',
        'To exercise these rights, contact VAYA Support from the phone number or email address linked to your account, or use the in-app tools where available. We may ask you to confirm your identity, and we reply within the time limits set by law.',
        'You can also lodge a complaint with the competent data-protection authority: in Tunisia, the Instance Nationale de Protection des Données Personnelles (INPDP), or the authority of your country of residence.',
      ],
    },
    {
      heading: '15. Deleting your account',
      body: [
        'In the app: Profile → Terms & Privacy → Delete my account.',
        'Deletion is not possible while you have a pending or accepted Booking, or a Ride that is published, full or in progress: the app tells you what to cancel first, so that no other Member is left without a Driver or a Passenger.',
        'Immediately: your name is replaced with a neutral placeholder; your phone number, email address, Google identifier and profile photo are removed; your Driver Verification documents and profile photo are erased from storage; all your sessions are signed out. Deletion is permanent.',
        'What is kept: the history of your past Rides, Bookings, Trips and ratings, so that other Members\' histories and reputations stay accurate; and, at present, vehicle details, messages exchanged, rating comments and usage events already recorded, which are no longer linked to your name, phone number or email address. You can ask VAYA Support to erase these items; we will do so unless keeping them remains necessary for another Member, a dispute or a legal obligation.',
      ],
    },
    {
      heading: '16. Notifications, location and on-device storage',
      body: [
        'Push notifications are sent only if you allow them; you can turn them off at any time in your device settings, and they remain visible in the app\'s inbox. SMS are used only to send sign-in codes. Emails (Google accounts only) relate to your Bookings and ratings; we do not send marketing emails.',
        'The app asks for location access only "while using the app". You can refuse or withdraw it in your device settings and still search by typing places. During a Trip, the Driver needs location access so that Passengers can follow the Trip; without it, Passengers see that live tracking is unavailable.',
        'The app securely stores your sign-in session and preferences (language, appearance) on your device; these are strictly necessary for the service. It contains no third-party advertising or analytics trackers; Google Maps components may collect technical data under Google\'s policy. Our website uses no cookies or analytics tools.',
      ],
    },
    {
      heading: '17. Children',
      body: [
        'VAYA is only for people aged 18 and over. We do not knowingly collect data about children. If we learn that an account belongs to a person under 18, we close it and delete the data. A Passenger travelling with a child does not create an account for the child, and we do not collect the child\'s data.',
      ],
    },
    {
      heading: '18. Changes',
      body: [
        'We update this policy when our processing changes and inform you in the app of significant changes before they take effect. The version is shown at the top of this document.',
      ],
    },
  ],
};

const ar: LegalDocument = {
  title: 'سياسة الخصوصية',
  version: '2.0',
  effectiveDateLabel: 'الإصدار 2.0',
  languageNote:
    'اللغة المعتمدة: الفرنسية. في حال وجود اختلاف بين هذه الترجمة والنص الفرنسي، يُعتمد النص الفرنسي.',
  sections: [
    {
      heading: '1. من نحن',
      body: [
        'تشغّل VAYA («نحن») تطبيق VAYA للهاتف المحمول وموقعه الإلكتروني («المنصة»)، وهي المسؤولة عن معالجة بياناتك الشخصية المبينة أدناه.',
        'لأي سؤال أو طلب يتعلق ببياناتك، اتصل بدعم VAYA الذي تُنشر بيانات الاتصال به في صفحة VAYA على App Store وGoogle Play.',
        'للمصطلحات عضو، سائق، راكب، رحلة، حجز، مشوار، نقطة توقف ومساهمة المعنى المحدد في شروط الاستخدام.',
      ],
    },
    {
      heading: '2. باختصار',
      body: [
        'نجمع ما يلزم لتشغيل منصة لتقاسم الرحلات: بيانات حسابك، والرحلات التي تبحث عنها وتنشرها وتحجزها، ورسائلك وتقييماتك، وموقع السائق أثناء المشوار.',
        'يقدّم السائقون إضافة إلى ذلك صوراً لرخصتهم وتأمينهم ووجههم، لا يطّلع عليها إلا فريق VAYA المخوّل.',
        'يرى الأعضاء الآخرون اسمك وصورتك وتقييماتك، وبالنسبة للسائقين بيانات السيارة. لا يُعرض رقم هاتفك إلا على الطرف الآخر في حجز مقبول.',
        'لا نبيع بياناتك ولا نعرض إعلانات ولا نستعمل أدوات تحليل أو إعلان تابعة لأطراف ثالثة.',
        'يمكنك الاطلاع على بياناتك وتصحيحها وحذف حسابك من التطبيق.',
      ],
    },
    {
      heading: '3. البيانات التي تقدمها لنا',
      body: [
        'الحساب: رقم الهاتف (عند الدخول بالهاتف)، الاسم الكامل، اللغة.',
        'الدخول عبر Google: إذا اخترت «الدخول عبر Google» نتلقى من Google معرّفك في Google واسمك وبريدك الإلكتروني ورابط صورة ملفك في Google.',
        'الملف الشخصي: صورة اختيارية من معرض صورك أو من Google.',
        'ملف السائق: علامة السيارة وطرازها ولونها ورقم تسجيلها وعدد مقاعدها وصورتها؛ نبذة واللغات المتحدَّث بها (اختيارية).',
        'التحقق من السائق: صور رخصة السياقة وشهادة التأمين ووجهك (صورة ذاتية) الملتقطة بكاميرا التطبيق.',
        'الرحلات المنشورة: نقطة الانطلاق، الوجهة، موعد الانطلاق، المسار المختار، نقاط التوقف، المقاعد، المساهمة.',
        'عمليات البحث والحجز: نقطة الانطلاق والوجهة والتاريخ والساعة وعدد المقاعد المبحوث عنها؛ نقاط التوقف المختارة؛ طلبات الحجز؛ تنبيهات «أعلمني» (الرحلة والفترة الزمنية).',
        'الرسائل المتبادلة مع الطرف الآخر في الحجز؛ التقييمات ومؤشرات الالتزام بالمواعيد والتعليقات التي تقدمها؛ السبب الذي تختاره عند الإلغاء؛ بلاغات عدم الحضور؛ البلاغات والرسائل الموجهة إلى دعم VAYA.',
      ],
    },
    {
      heading: '4. البيانات الناتجة عن استعمال المنصة',
      body: [
        'موقع السائق أثناء المشوار: منذ أن يبدأ السائق المشوار وطالما بقي تطبيقه مفتوحاً، يرسل التطبيق موقع الجهاز عبر GPS (الإحداثيات، الاتجاه، السرعة، الدقة) كل 7 ثوانٍ تقريباً. لا نحتفظ إلا بآخر موقع: كل موقع جديد يحل محل السابق. ونسجّل أيضاً مرة واحدة ما إذا اقترب السائق من نقطة الانطلاق، وما إذا كانت السيارة تتبع المسار المقرر أو تنحرف عنه.',
        'الموقع الآني للجهاز: إذا سمحت بالوصول إلى الموقع، يُستعمل موقعك لتوسيط الخريطة ومساعدتك على اختيار نقطة الصعود، وإن شئت لإرفاقه ببلاغ عدم حضور. ولا يُحفظ في شكل سجل مواقع.',
        'بيانات الحجز والمشوار: تغييرات الحالة وتوقيتاتها (الطلب، القبول، انتهاء الأجل، الإلغاء، البدء، الصعود، النزول، الانتهاء)، ومسافة المشي إلى نقطة التوقف.',
        'السمعة: متوسط التقييم، عدد المشاوير المنتهية، درجتا الالتزام بالمواعيد والموثوقية، مستوى الثقة، ونقاط الموثوقية الناتجة عن الإلغاء المتأخر وعدم الحضور.',
        'الرحلات المنتظمة: الرحلات التي يبدو أنك تقوم بها بانتظام، مستنتجة من سجلك (المسار، الأيام، الفترة الزمنية، درجة الثقة)، وردك على الاقتراح.',
        'أحداث الاستعمال: مثل بدء بحث، النتائج المعروضة، اختيار نتيجة أو نقطة توقف، فتح إشعار، مع معلومات الرحلة المرتبطة (بما في ذلك إحداثيات الانطلاق والوجهة) والتوقيت. تُخزَّن في أنظمتنا الخاصة ولا تُرسل إلى شركات تحليل.',
        'الإشعارات المرسلة وحالة قراءتها؛ رمز الإشعارات ونوع النظام (iOS/Android)؛ عنوان IP وبيانات الطلبات في سجلات الخادم؛ طلبات رمز الدخول والمحاولات الفاشلة (تُخزَّن الرموز في شكل محمي غير قابل للقراءة فقط)؛ الجلسات؛ وعند تفعيل تتبع الأخطاء، التقارير التقنية للأخطاء (طراز الجهاز، إصدار النظام والتطبيق، تفاصيل الخطأ).',
        'بيانات من أعضاء آخرين ومن فريق VAYA: التقييمات والتعليقات المتعلقة بك، بلاغات عدم الحضور أو غيرها المتعلقة بك، قرارات فريق VAYA وملاحظاته (نتيجة التحقق من السائق، السبب المبلَّغ إليك، الملاحظات الداخلية، التعليق).',
        'لا نجمع بيانات بنكية (لا تعالج VAYA أي دفع)، ولا جهات اتصالك، ولا موقعك في الخلفية (والتطبيق مغلق)، ولا معرّفات إعلانية. لا نستعمل التعرف الآلي على الوجه.',
      ],
    },
    {
      heading: '5. الأغراض والأسس القانونية',
      body: [
        'إنشاء حسابك وتأمينه وتسجيل دخولك وعرض ملفك على الأعضاء الآخرين: تنفيذ العقد (شروط الاستخدام).',
        'البحث عن الرحلات ومطابقتها وترتيبها، واقتراح المسارات ونقاط التوقف، وحساب نطاق المساهمة، ومعالجة طلبات الحجز وآجالها وقبولها وانتهائها وسحب الطلبات المكررة: تنفيذ العقد.',
        'تمكين طرفي الحجز من التواصل (الرسائل، رقم الهاتف): تنفيذ العقد.',
        'التتبع المباشر للمشوار وتقدير وقت الوصول والتقدم الآلي للمشوار: تنفيذ العقد مع السائق والركاب، ومصلحتنا المشروعة في سلامة المشاوير وموثوقيتها.',
        'التحقق من السائق: تنفيذ العقد مع السائق ومصلحتنا المشروعة في حماية الركاب.',
        'التقييمات ومستويات الثقة ومعالجة الإلغاء وعدم الحضور (بما في ذلك التسجيل الآلي لعدم الحضور): تنفيذ العقد والمصلحة المشروعة في منصة موثوقة.',
        'الإشعارات (الفورية، داخل التطبيق، رموز SMS، البريد الإلكتروني): تنفيذ العقد. لا تُرسل الإشعارات الفورية إلا إذا سمحت بها على جهازك.',
        'اقتراح الرحلات المنتظمة والمطابقات الاستباقية: المصلحة المشروعة في اقتراح رحلات مناسبة؛ يمكنك رفض أي اقتراح.',
        'السلامة ومعالجة البلاغات والإشراف واحترام الشروط ومنع الاحتيال والإساءة وأمن المعلومات: المصلحة المشروعة، وعند الاقتضاء الالتزامات القانونية.',
        'الإحصاءات وتحسين الخدمة (مثلاً فهم الطلب حسب المسار) وتشخيص الأخطاء: المصلحة المشروعة؛ التقارير التي يطّلع عليها الفريق مجمّعة.',
        'احترام القانون والاستجابة للسلطات وإثبات الحقوق أو الدفاع عنها أمام القضاء: الالتزام القانوني والمصلحة المشروعة. حماية حياة شخص في حالة طوارئ: المصالح الحيوية، فقط عند الضرورة الفعلية.',
        'عندما يشترط القانون المنطبق موافقتك على معالجة ما، نطلبها منك ويمكنك سحبها في أي وقت. يمكنك الاعتراض على المعالجات القائمة على مصلحتنا المشروعة (الفقرة 14). البيانات المشار إليها كإجبارية في التطبيق ضرورية لتقديم الخدمة؛ أما الصورة الشخصية والنبذة واللغات فاختيارية.',
      ],
    },
    {
      heading: '6. وثائق التحقق من السائق',
      body: [
        'تُلتقط الصور مباشرة في التطبيق، ولا يُقبل التحميل من المعرض.',
        'تُخزَّن في فضاء خاص غير متاح للعموم. لا يطّلع عليها إلا فريق VAYA المكلف بالتحقق، عبر أداة الإدارة الداخلية.',
        'يقارنها أحد أعضاء الفريق يدوياً. لا نستعمل التعرف الآلي على الوجه ولا القراءة الآلية للوثائق.',
        'لا تُعرض أبداً على الأعضاء الآخرين، الذين يرون فقط أنك سائق تم التحقق منه.',
      ],
    },
    {
      heading: '7. من يمكنه رؤية بياناتك',
      body: [
        'كل من يطّلع على ملفك: اسمك الكامل وصورتك؛ متوسط تقييمك وعدد مشاويرك ودرجتا الالتزام بالمواعيد والموثوقية ومستوى الثقة؛ وبالنسبة للسائق، علامة السيارة وطرازها ولونها وصورتها ورقم تسجيلها (لمساعدة الركاب على التعرف على السيارة الصحيحة)، والنبذة واللغات.',
        'كل من يبحث عن رحلة: الرحلات التي تنشرها (الانطلاق، الوجهة، المسار، نقاط التوقف، الساعة، السعر، المقاعد). إن شئت، اختر نقطة انطلاق ليست عنوانك الدقيق.',
        'كل من يطّلع على رحلة: الاسم الأول وصورة وتقييم الركاب المقبولين في تلك الرحلة.',
        'رقم هاتفك: الطرف الآخر في حجز مقبول فقط، وطالما بقي مقبولاً.',
        'سائق الرحلة: نقطة توقفك وطلب حجزك. الرسائل: طرفا الحجز فقط.',
        'الموقع المباشر للسائق: السائق، وركاب ذلك المشوار بعد صعودهم. قبل الصعود يرى الركاب الوقت المقدّر للوصول والمسار، لا الموقع المباشر.',
        'تعليقات التقييم: العضو الذي تم تقييمه. نقاط الموثوقية ووثائق التحقق والملاحظات الداخلية لا يراها الأعضاء الآخرون.',
      ],
    },
    {
      heading: '8. مزودو الخدمات والأطراف الثالثة',
      body: [
        'نستعين بمزودين يعالجون البيانات لحسابنا ووفق تعليماتنا: مزودو الاستضافة السحابية وتخزين الملفات (الخوادم، قواعد البيانات، الصور والوثائق)؛ Twilio (إرسال رموز الدخول عبر SMS: رقم الهاتف والرمز)؛ Google Maps Platform (البحث عن الأماكن والمسارات وأوقات التنقل: النص المبحوث عنه والإحداثيات، دون هويتك)؛ Expo مع Firebase Cloud Messaging من Google وخدمة الإشعارات من Apple (إيصال الإشعارات: الرمز ومحتوى الإشعار)؛ Resend (رسائل البريد الإلكتروني التشغيلية لحسابات Google: البريد الإلكتروني، الاسم، محتوى الرسالة)؛ Sentry عند تفعيله (تشخيص الأخطاء: بيانات تقنية)؛ وعند الاقتضاء خدمات OpenStreetMap (بحث احتياطي عن الأماكن وفحص خرائطي لنقاط التوقف: النص المبحوث عنه والإحداثيات).',
        'تعالج Google، عند استعمالك الدخول عبر Google وعند عرض التطبيق لخرائط Google على جهازك، وكذلك Apple وGoogle بالنسبة لمتاجر التطبيقات وأنظمة التشغيل، البيانات وفق سياسات الخصوصية الخاصة بها.',
        'نُطلع المحاكم أو الشرطة أو السلطات المختصة الأخرى على البيانات عندما يفرض القانون ذلك، أو استجابة لطلب قانوني صحيح، أو عند الضرورة لحماية حياة شخص أو سلامته الجسدية. ويمكننا أيضاً استعمال البيانات أو الإفصاح عنها لإثبات حقوق أو ممارستها أو الدفاع عنها أمام القضاء. نفحص كل طلب ولا نفصح إلا عن الضروري.',
        'في حال إعادة هيكلة VAYA أو اندماجها أو التفويت فيها، يمكن نقل البيانات إلى المشغّل الجديد الذي يلتزم باحترام هذه السياسة، مع إعلامك بذلك.',
        'لا نبيع البيانات الشخصية ولا نشاركها لأغراض إعلانية.',
      ],
    },
    {
      heading: '9. النقل الدولي للبيانات',
      body: [
        'يعالج بعض هؤلاء المزودين البيانات خارج بلدك، لا سيما في الولايات المتحدة. تتم عمليات النقل هذه مع الضمانات، وعند الاقتضاء التراخيص، التي يفرضها القانون المنطبق في مجال حماية البيانات. يمكنك الحصول على معلومات حول هذه الضمانات من دعم VAYA.',
      ],
    },
    {
      heading: '10. اطلاع فريق VAYA',
      body: [
        'يستعمل عدد محدود من أعضاء فريق VAYA أداة إدارة داخلية بحساب فردي لكل منهم. وحسب دورهم يمكنهم: البحث عن حسابات الأعضاء والاطلاع عليها (بما في ذلك الهاتف والبريد الإلكتروني) وعلى ملفات السائقين والسيارات والرحلات والحجوزات الأخيرة، لمساعدة الأعضاء ومعالجة البلاغات وفرض احترام الشروط؛ الاطلاع على وثائق التحقق من السائق وقبولها أو رفضها؛ معالجة البلاغات؛ إلغاء رحلة أو تقييد سائق أو تعليق حساب أو إعادة تفعيله؛ والاطلاع على إحصاءات مجمّعة حول عمليات البحث والطلب.',
        'كل عملية تغيّر حساباً أو رحلة أو تحققاً أو بلاغاً تُسجَّل في سجل تدقيق يبيّن عضو الفريق والتوقيت والسبب.',
        'لا تتيح أداة الإدارة الاطلاع على محتوى الرسائل. أعضاء الفريق ملزمون بالسرية ولا يطّلعون على البيانات إلا عندما تقتضي مهامهم ذلك.',
      ],
    },
    {
      heading: '11. الأمن',
      body: [
        'نطبّق تدابير ملائمة للمخاطر، منها: تشفير البيانات أثناء النقل (HTTPS)؛ تخزين رموز الدخول في شكل بصمة تشفيرية فقط مع تحديد عدد المحاولات؛ رموز نفاذ قصيرة الصلاحية؛ تحديد عدد الطلبات؛ تخزين وثائق التحقق في فضاء خاص لا يُنفذ إليه إلا عبر نفاذ مصادق عليه للفريق؛ تحققات من جهة الخادم لكل عملية؛ وسجل تدقيق لعمليات الفريق.',
        'لا يوجد نظام آمن تماماً. في حال حدوث خرق للبيانات قد يمثّل خطراً على حقوقك، نُعلم سلطة الرقابة المختصة، وإذا كان الخطر مرتفعاً نُعلم الأشخاص المعنيين، وفق ما يفرضه القانون.',
      ],
    },
    {
      heading: '12. مدة الاحتفاظ',
      body: [
        'نحتفظ ببيانات حسابك وملفك طالما بقي حسابك قائماً، وبالبيانات الأخرى طالما كانت ضرورية للأغراض المبينة في الفقرة 5، وفق المعايير التالية: مدة حسابك، وضرورة الحفاظ على سجل متناسق للأعضاء الآخرين، وأمن المنصة، والآجال اللازمة لمعالجة نزاع أو احترام التزام قانوني.',
        'يُحفظ آخر موقع للسائق أثناء المشوار مع سجل ذلك المشوار. تُحفظ وثائق التحقق من السائق طالما كنت سائقاً وتُحذف عند حذف حسابك.',
        'يمكننا الاحتفاظ بالبيانات مدة أطول إذا فرض القانون ذلك أو طوال المدة اللازمة لمعالجة نزاع أو تحقيق أو دعوى قضائية جارية.',
      ],
    },
    {
      heading: '13. القرارات الآلية',
      body: [
        'ترتيب النتائج واقتراح نقاط التوقف: تُرتَّب الرحلات حسب ملاءمتها لرحلتك (المسافة إلى نقاط التوقف، الانعطاف، موعد الانطلاق). ولا يحدد ذلك حقك في استعمال الخدمة.',
        'نطاق المساهمة: يُحسب انطلاقاً من مسافة المسار ومدته التقديرية. مستوى الثقة: يُحسب انطلاقاً من عدد المشاوير المنتهية ومتوسط التقييم وأقدمية الحساب. اقتراحات الرحلات المنتظمة: مستنتجة من سجلك ويمكنك رفضها.',
        'التقدم الآلي للمشاوير: يمكن استنتاج الوصول إلى نقطة الصعود والصعود ونهاية المشوار من بيانات الموقع، وتُغلق آلياً المشاوير التي تبقى مفتوحة مدة طويلة بعد موعد انتهائها المتوقع.',
        'التسجيل الآلي لعدم الحضور: عندما تُظهر بيانات الموقع وحالة المشوار بوضوح أن أحد الطرفين لم يأتِ أبداً إلى نقطة اللقاء، يمكن للمنصة تسجيل عدم الحضور مع نقاط موثوقية وتقييم بنجمة واحدة للعضو الغائب. يمكنك طلب مراجعة من قبل شخص، وإبداء رأيك، والطعن في هذا القرار بالاتصال بدعم VAYA (الشروط، الفصل 10).',
        'لا تعلّق VAYA أي حساب ولا تغلقه بناءً على معالجة آلية فقط: يتخذ هذه القرارات أحد أعضاء الفريق.',
      ],
    },
    {
      heading: '14. حقوقك',
      body: [
        'وفق الشروط التي يحددها القانون المنطبق، لك الحق في النفاذ إلى بياناتك والحصول على نسخة منها؛ وفي تصحيحها (يمكن تعديل الاسم والصورة واللغة في التطبيق)؛ وفي محوها (الفقرة 15)؛ وفي تقييد معالجتها؛ وفي الاعتراض على المعالجات القائمة على المصلحة المشروعة بما في ذلك التنميط؛ وفي نقل البيانات التي قدمتها؛ وفي سحب موافقتك عندما تقوم المعالجة عليها؛ وفي عدم الخضوع لقرار قائم حصرياً على معالجة آلية ذات آثار هامة، كما هو مبين في الفقرة 13.',
        'لممارسة هذه الحقوق، اتصل بدعم VAYA من رقم الهاتف أو البريد الإلكتروني المرتبط بحسابك، أو استعمل أدوات التطبيق عند توفرها. قد نطلب منك تأكيد هويتك، ونرد عليك في الآجال التي يحددها القانون.',
        'يمكنك أيضاً تقديم شكوى إلى سلطة حماية البيانات المختصة: في تونس، الهيئة الوطنية لحماية المعطيات الشخصية (INPDP)، أو سلطة بلد إقامتك.',
      ],
    },
    {
      heading: '15. حذف الحساب',
      body: [
        'في التطبيق: الملف الشخصي ← الشروط والخصوصية ← حذف حسابي.',
        'لا يمكن الحذف ما دام لديك حجز قيد الانتظار أو مقبول، أو رحلة منشورة أو مكتملة أو جارية: يبيّن لك التطبيق ما يجب إلغاؤه أولاً، حتى لا يبقى عضو آخر دون سائق أو راكب.',
        'فوراً: يُستبدل اسمك بعبارة محايدة؛ ويُحذف رقم هاتفك وبريدك الإلكتروني ومعرّف Google وصورتك الشخصية؛ وتُمحى وثائق التحقق من السائق وصورتك الشخصية من التخزين؛ وتُغلق كل جلساتك. الحذف نهائي.',
        'ما يُحتفظ به: سجل رحلاتك وحجوزاتك ومشاويرك وتقييماتك السابقة حتى يبقى سجل الأعضاء الآخرين وسمعتهم دقيقين؛ وحالياً بيانات السيارة والرسائل المتبادلة وتعليقات التقييم وأحداث الاستعمال المسجلة سابقاً، والتي لم تعد مرتبطة باسمك أو رقم هاتفك أو بريدك الإلكتروني. يمكنك أن تطلب من دعم VAYA محو هذه العناصر، ونستجيب لذلك ما لم يبقَ الاحتفاظ بها ضرورياً لعضو آخر أو لنزاع أو لالتزام قانوني.',
      ],
    },
    {
      heading: '16. الإشعارات والموقع والتخزين على الجهاز',
      body: [
        'لا تُرسل الإشعارات الفورية إلا إذا سمحت بها، ويمكنك إيقافها في أي وقت من إعدادات جهازك، وتبقى ظاهرة في صندوق إشعارات التطبيق. تُستعمل رسائل SMS فقط لإرسال رموز الدخول. رسائل البريد الإلكتروني (لحسابات Google فقط) تتعلق بحجوزاتك وتقييماتك، ولا نرسل رسائل إشهارية.',
        'لا يطلب التطبيق الوصول إلى موقعك إلا «أثناء استعمال التطبيق». يمكنك رفضه أو سحبه من إعدادات جهازك، ويبقى بإمكانك البحث بكتابة الأماكن. أثناء المشوار يحتاج السائق إلى الموقع حتى يتمكن الركاب من متابعة المشوار، وإلا يرى الركاب أن التتبع المباشر غير متاح.',
        'يحفظ التطبيق بشكل آمن على جهازك جلسة دخولك وتفضيلاتك (اللغة، المظهر)، وهي ضرورية للخدمة. لا يحتوي التطبيق على أي أدوات تتبع إشهارية أو تحليلية تابعة لأطراف ثالثة، وقد تجمع مكونات خرائط Google بيانات تقنية وفق سياسة Google. لا يستعمل موقعنا الإلكتروني ملفات تعريف الارتباط ولا أدوات تحليل.',
      ],
    },
    {
      heading: '17. القاصرون',
      body: [
        'VAYA مخصصة للأشخاص البالغين 18 سنة فما فوق. لا نجمع عن علم بيانات تخص القاصرين. إذا علمنا أن حساباً يعود لشخص دون 18 سنة، نغلقه ونحذف البيانات. الراكب الذي يسافر مع طفل لا ينشئ حساباً له، ولا نجمع بيانات الطفل.',
      ],
    },
    {
      heading: '18. التعديلات',
      body: [
        'نحدّث هذه السياسة عند تغيّر معالجاتنا، ونعلمك في التطبيق بالتغييرات الهامة قبل سريانها. يظهر رقم الإصدار في أعلى هذه الوثيقة.',
      ],
    },
  ],
};

export const PRIVACY_CONTENT: Record<SupportedLocale, LegalDocument> = { fr, en, ar };
