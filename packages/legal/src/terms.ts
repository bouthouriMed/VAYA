import type { SupportedLocale } from '@vaya/config';
import type { LegalDocument } from './types';

/**
 * Structured content for VAYA's Terms of Use (version 2.0), shared by the
 * mobile app (`apps/mobile/src/features/legal/`) and the marketing website
 * (`apps/website/src/app/[locale]/legal/terms`) so both render the exact
 * same text. Built from `docs/legal/v2/terms-and-conditions.en.md` with every
 * clause that still depends on an owner decision (legal entity, contact
 * addresses, governing law, fees cap) left out rather than shown as a
 * placeholder — see `docs/legal/v2/legal-product-audit.md` §8 for what must
 * be added back once decided. French is the governing text; English/Arabic
 * are translations and have not been reviewed by counsel or a professional
 * legal translator (tracked in `docs/legal/README.md`). The website only
 * renders fr/en; `ar` is mobile-only.
 */
const fr: LegalDocument = {
  title: "Conditions Générales d'Utilisation",
  version: '2.0',
  effectiveDateLabel: 'Version 2.0',
  languageNote:
    'Langue faisant foi : français. En cas de divergence avec une traduction, la version française prévaut.',
  sections: [
    {
      heading: "L'essentiel",
      body: [
        "VAYA est une application qui met en relation des personnes qui effectuent déjà un trajet en voiture (les Conducteurs) avec des personnes qui souhaitent faire le même chemin (les Passagers), afin qu'elles partagent les frais du trajet. VAYA n'est pas une entreprise de transport et ne conduit personne.",
        "L'utilisation de VAYA est gratuite. VAYA ne gère aucun paiement : le Passager verse sa participation directement au Conducteur.",
        "Le prix par place doit rester dans une fourchette calculée par VAYA à partir de l'itinéraire. Un Conducteur ne doit jamais réaliser de bénéfice sur un trajet.",
        "Les Conducteurs doivent être vérifiés par VAYA avant de pouvoir publier un trajet.",
        "Une annulation tardive ou une absence affecte votre fiabilité. Il n'y a aucune pénalité financière.",
        "Vous pouvez supprimer votre compte à tout moment depuis l'application.",
        'Ce résumé vous aide à lire les conditions ; il ne les remplace pas.',
      ],
    },
    {
      heading: '1. Définitions',
      body: [
        "« VAYA », « nous » : l'exploitant de la Plateforme.",
        "« Plateforme » : l'application mobile VAYA, son site internet et les services associés.",
        '« Membre » : toute personne ayant créé un compte VAYA.',
        '« Conducteur » : un Membre dont le profil conducteur a été approuvé par VAYA et qui propose des places sur un Trajet.',
        '« Passager » : un Membre qui demande ou détient une place sur un Trajet.',
        '« Trajet » : un déplacement publié par un Conducteur, avec son départ, sa destination, son heure de départ, son itinéraire, ses Points d\'arrêt, ses places et sa Participation par place.',
        "« Point d'arrêt » : un point de prise en charge ou de dépose sur un Trajet, choisi parmi des points proposés par la Plateforme le long de l'itinéraire, ou placé par un Passager sous réserve des contrôles de la Plateforme et de l'acceptation du Conducteur.",
        "« Demande de réservation » : la demande d'une ou plusieurs places par un Passager. « Réservation » : une Demande de réservation acceptée par le Conducteur.",
        "« Course » : l'exécution d'une Réservation, du démarrage par le Conducteur jusqu'à la dépose du Passager ou la fin de la Course.",
        '« Participation » : la somme par place que le Passager verse au Conducteur pour partager les frais du Trajet. « Fourchette de Participation » : le minimum et le maximum par place calculés par la Plateforme pour un Trajet.',
        "« Vérification Conducteur » : l'examen par VAYA de l'identité, du permis de conduire, de l'assurance et du véhicule d'un Membre avant qu'il puisse conduire.",
        "« Contenu » : toute information fournie par un Membre sur la Plateforme (profil, photos, véhicule, messages, évaluations, commentaires).",
        "« Support VAYA » : le contact d'assistance publié sur la page de VAYA dans l'App Store et Google Play.",
      ],
    },
    {
      heading: '2. Champ et acceptation',
      body: [
        "Les présentes conditions régissent votre utilisation de la Plateforme. Notre Politique de confidentialité explique comment nous traitons les données personnelles.",
        "Vous acceptez les présentes conditions en créant un compte. Si vous ne les acceptez pas, ne créez pas de compte. Un compte est nécessaire pour demander une place, publier un Trajet ou échanger avec d'autres Membres.",
      ],
    },
    {
      heading: '3. Ce que fait VAYA — et ce que VAYA ne fait pas',
      body: [
        "VAYA fournit une plateforme technologique. Elle permet aux Membres de publier et rechercher des Trajets, de voir des itinéraires, des Points d'arrêt et une Fourchette de Participation suggérés, d'envoyer, accepter ou refuser des Demandes de réservation, d'échanger une fois une Réservation conclue, de suivre une Course sur une carte, d'annuler et de s'évaluer.",
        "VAYA n'est pas un transporteur. Nous ne possédons, ne louons et n'exploitons aucun véhicule, nous n'employons aucun Conducteur et ne lui donnons aucune instruction, et nous ne transportons personne. Chaque Conducteur effectue un trajet qu'il ferait de toute façon, pour son propre compte. L'accord de partage du trajet se forme entre le Conducteur et le Passager ; VAYA n'en est pas partie.",
        "Nous sommes responsables de fournir la Plateforme avec soin et compétence raisonnables, de l'exactitude des informations que nous générons nous-mêmes (itinéraires et Fourchette de Participation, qui sont des estimations) et de la Vérification Conducteur telle que décrite à l'article 5. Nous ne sommes pas responsables de la façon dont un Membre conduit, se comporte ou exécute une Réservation, sauf lorsque la loi nous en rend responsables (article 15).",
        "La Plateforme classe les résultats de recherche, propose des Points d'arrêt, calcule la Fourchette de Participation et déduit l'avancement d'une Course à partir de données de localisation. L'article 10 et notre Politique de confidentialité en expliquent les principaux paramètres.",
      ],
    },
    {
      heading: '4. Conditions et compte',
      body: [
        "Vous devez avoir au moins 18 ans et la capacité juridique de contracter.",
        "Vous vous connectez avec un numéro de téléphone vérifié par un code à usage unique, ou avec un compte Google. Vous devez utiliser votre vrai nom. Vous ne pouvez détenir qu'un seul compte et ne devez ni créer un compte pour autrui ni utiliser le compte d'une autre personne.",
        "Vous êtes responsable de la sécurité de l'accès à votre téléphone et à votre compte Google. Prévenez le Support VAYA si vous pensez qu'un tiers a accédé à votre compte.",
        "Gardez vos informations exactes et à jour. Vous pouvez modifier votre nom, votre photo et votre langue dans l'application.",
      ],
    },
    {
      heading: '5. Devenir Conducteur — Vérification Conducteur',
      body: [
        "Pour publier des Trajets, vous devez : détenir un permis de conduire valide pour le véhicule utilisé ; être propriétaire du véhicule ou avoir l'autorisation de son propriétaire ; disposer d'une assurance automobile valide (article 16) ; maintenir le véhicule en bon état et conforme à la loi ; et avoir été approuvé à l'issue de la Vérification Conducteur.",
        "Vous renseignez votre véhicule (marque, modèle, couleur, immatriculation, nombre de places) et photographiez, avec l'appareil photo dans l'application, votre permis, votre attestation d'assurance et votre visage (selfie). L'import depuis la galerie n'est pas possible. Un membre de l'équipe VAYA examine manuellement ces éléments pour vérifier que les documents paraissent authentiques et valides et que le selfie correspond à la photo du permis. VAYA n'utilise pas de reconnaissance faciale automatisée. Nous pouvons approuver, refuser ou demander un nouvel envoi, en vous indiquant le motif.",
        "L'approbation signifie qu'au moment de l'examen, les documents fournis paraissaient authentiques, valides et vous appartenir. Elle ne garantit pas vos compétences de conduite, l'état de votre véhicule, ni la validité ultérieure de votre permis ou de votre assurance. Vous devez nous prévenir et cesser de publier des Trajets si votre permis est suspendu ou retiré ou si votre assurance prend fin.",
        "VAYA peut vous demander de renouveler la Vérification Conducteur (par exemple à l'expiration d'un document) et peut restreindre votre faculté de publier des Trajets dans les conditions de l'article 17.",
      ],
    },
    {
      heading: '6. Partage des frais — la Participation',
      body: [
        "VAYA sert à partager des frais, pas à gagner de l'argent. Un Conducteur ne peut demander aux Passagers qu'une participation aux frais réels du trajet (carburant, péages, stationnement, part de l'usure et de l'assurance du véhicule). Il ne doit réaliser aucun bénéfice et ne doit pas utiliser la Plateforme pour exercer une activité commerciale ou professionnelle de transport de personnes (taxi, louage, VTC ou équivalent).",
        "Pour chaque Trajet, la Plateforme calcule une Participation recommandée par place à partir de la distance et de la durée estimée de l'itinéraire, selon des paramètres de coût de référence révisés périodiquement, ainsi qu'un minimum et un maximum. Le Conducteur choisit une Participation dans cette fourchette ; la Plateforme refuse tout prix en dehors. La Participation affichée au moment de la réservation est le montant convenu.",
        "La Fourchette de Participation s'applique par place. Le Conducteur reste responsable de veiller à ce que le total reçu de l'ensemble des Passagers d'un Trajet ne dépasse pas ses frais réels pour ce Trajet, et doit baisser sa Participation si nécessaire.",
        "VAYA ne perçoit, ne détient ni ne transfère aucune somme. Le Passager verse sa Participation directement au Conducteur, en espèces ou par tout autre moyen convenu entre eux, au moment convenu. Aucun autre montant ne peut être demandé pour la place (par exemple un supplément pour bagages ou détour) s'il n'est pas indiqué sur le Trajet avant la réservation.",
        "L'utilisation de VAYA est actuellement gratuite : aucun frais de réservation ou de service n'est facturé. Si nous décidions d'introduire des frais, nous vous en informerions à l'avance (article 20) et ils ne s'appliqueraient jamais à une Réservation conclue avant leur annonce.",
        "Chaque Membre est responsable du respect des règles fiscales et de transport qui lui sont applicables. VAYA ne peut fournir de conseil juridique ou fiscal individuel.",
      ],
    },
    {
      heading: '7. Publier un Trajet (Conducteurs)',
      body: [
        "Vous devez publier des informations exactes : départ, destination, date et heure de départ, itinéraire, Points d'arrêt que vous acceptez de desservir, nombre de places réellement disponibles et véhicule utilisé.",
        "La Plateforme propose des options d'itinéraire et des Points d'arrêt candidats le long de l'itinéraire choisi ; vous choisissez ceux que vous proposez. Les lieux de rendez-vous saisis librement ne sont pas acceptés. Les Points d'arrêt sont des suggestions fondées sur des données cartographiques : vous restez responsable de ne vous arrêter que là où c'est légal et sûr.",
        "Vous devez conduire vous-même le Trajet, avec le véhicule déclaré, et ne pas proposer plus de places que le véhicule ne peut légalement transporter avec ceinture de sécurité.",
        "La Plateforme peut vous suggérer d'enregistrer un trajet que vous faites régulièrement. Un brouillon de Trajet suggéré n'est jamais publié sans votre confirmation.",
      ],
    },
    {
      heading: '8. Demander une place (Passagers)',
      body: [
        "Les résultats de recherche présentent les Trajets que la Plateforme estime compatibles avec votre départ, votre destination et votre horaire, y compris des Trajets passant près de votre itinéraire. Chaque résultat affiche le profil public, la note et le niveau de confiance du Conducteur avant toute demande.",
        "Vous choisissez votre Point d'arrêt de prise en charge (et, lorsqu'il est proposé, de dépose), le nombre de places, puis envoyez votre Demande de réservation. Si vous placez vous-même un point de prise en charge, la Plateforme vous montre le détour et l'horaire qui en résultent avant l'envoi, et le Conducteur peut refuser.",
        "Le Conducteur doit accepter ou refuser dans le délai affiché dans l'application. À défaut, la demande expire et vous n'êtes pas engagé.",
        "Vous pouvez envoyer un nombre limité de Demandes de réservation pour le même trajet à différents Conducteurs. Dès que l'une est acceptée, les autres sont automatiquement retirées et vous en êtes informé.",
        "La Réservation est conclue lorsque le Conducteur accepte. Vous êtes alors tous deux engagés sur le Trajet tel que réservé, sous réserve de l'article 10.",
      ],
    },
    {
      heading: '9. Pendant une Réservation et une Course',
      body: [
        "Le Conducteur et le Passager doivent : être à l'heure au Point d'arrêt convenu ; signaler rapidement tout changement ; se comporter avec respect ; respecter la loi ; et ne transporter rien d'illégal ou de dangereux.",
        "Le Conducteur doit : conduire prudemment et légalement ; ne pas conduire sous l'influence de l'alcool, de stupéfiants ou de médicaments altérant la conduite ; respecter l'itinéraire et les Points d'arrêt convenus (un détour raisonnable dû aux conditions de circulation est admis) ; maintenir le véhicule propre et sûr ; permettre à chaque Passager de porter une ceinture ; et ne pas demander plus que la Participation convenue.",
        "Le Passager doit : verser la Participation convenue ; respecter le véhicule et les règles raisonnables annoncées par le Conducteur avant le Trajet (bagages, tabac, nourriture, animaux) ; porter sa ceinture ; et ne pas amener le Conducteur à enfreindre la loi.",
        "Un Passager ne peut voyager avec un enfant qu'en accord préalable avec le Conducteur et avec le dispositif de retenue exigé par la loi. Les mineurs ne peuvent ni réserver ni voyager seuls.",
        "Lorsque le Conducteur démarre une Course, son application partage la position du véhicule avec VAYA tant qu'elle est ouverte, afin que les Passagers voient l'heure d'arrivée estimée et, une fois à bord, le véhicule sur la carte. La Plateforme utilise cette position pour mettre à jour automatiquement l'avancement de la Course (arrivée au point de prise en charge, fin de Course, etc.). Le Conducteur ne doit pas manipuler les données de localisation pour tromper d'autres Membres ou VAYA.",
        "Les objets oubliés se règlent directement entre Membres via la messagerie de la Réservation. VAYA ne conserve ni ne restitue d'objets.",
      ],
    },
    {
      heading: '10. Annulations, absences et fiabilité',
      body: [
        "Chaque partie peut annuler une Réservation dans l'application en indiquant un motif. Les conséquences dépendent du délai avant le départ prévu : 24 heures ou plus avant le départ, aucune conséquence ; moins de 24 heures mais au moins 30 minutes avant, 1 point de fiabilité ; moins de 30 minutes avant ou après le départ, 3 points de fiabilité.",
        "Si un Membre ne se présente pas, l'autre partie peut signaler une absence dans l'application à partir de 15 minutes après l'heure de départ prévue. La Plateforme peut aussi constater automatiquement une absence lorsque les données de localisation et l'état de la Course montrent clairement qu'une partie n'est jamais venue au point de rendez-vous. Une absence constatée ajoute 5 points de fiabilité au Membre absent et enregistre une note d'une étoile à son encontre.",
        "Les points de fiabilité sont un indicateur interne qui permet à VAYA d'identifier un manque de fiabilité répété. Ils ne sont pas visibles par les autres Membres. Des annulations tardives ou absences répétées peuvent entraîner les mesures de l'article 17.",
        "VAYA ne gérant aucun paiement, les annulations et absences n'entraînent aucune conséquence financière via la Plateforme. Tout accord entre Membres sur une somme déjà versée relève d'eux seuls.",
        "Si vous estimez qu'une absence a été enregistrée à tort contre vous (y compris de façon automatique), contactez le Support VAYA dans les 14 jours. Un membre de notre équipe l'examinera et supprimera la note et les points si l'enregistrement était erroné.",
        "Nous pouvons ajuster les délais ou les points ci-dessus. Les changements ne s'appliquent qu'aux Réservations conclues après leur publication, et les présentes conditions sont mises à jour en conséquence.",
        "Un Conducteur qui annule un Trajet annule les Réservations correspondantes, avec les conséquences ci-dessus. VAYA peut aussi annuler un Trajet pour des raisons de sécurité ou de conformité ; les Passagers concernés sont informés et aucun point ne leur est appliqué.",
      ],
    },
    {
      heading: '11. Communication entre Membres',
      body: [
        "Une fois une Réservation acceptée, une messagerie privée s'ouvre entre le Conducteur et ce Passager. Elle n'accepte plus de nouveaux messages après la fin de la Course.",
        "Une fois une Réservation acceptée, et tant qu'elle l'est, chaque partie peut voir le numéro de téléphone de l'autre dans l'application afin de l'appeler au sujet de cette Réservation. Avant l'acceptation, les numéros ne sont jamais affichés. Vous ne devez utiliser le numéro d'un autre Membre que pour organiser cette Réservation.",
        "N'utilisez pas la messagerie pour partager un contenu interdit par l'article 12, pour organiser un paiement en dehors de la Participation convenue, ou pour organiser des trajets hors de la Plateforme afin d'échapper aux présentes conditions.",
      ],
    },
    {
      heading: '12. Comportements interdits',
      body: [
        "Il est interdit : d'utiliser VAYA à des fins lucratives ou de transport commercial, ou de demander plus que la Participation ;",
        "de fournir de fausses informations sur vous-même, un Trajet, un véhicule ou un document, ou d'usurper l'identité d'autrui ; de créer plusieurs comptes ou de partager ou vendre votre compte ;",
        "de harceler, menacer, insulter, discriminer ou agresser quiconque, notamment en raison de son origine, de son sexe, de sa religion, d'un handicap ou de toute caractéristique protégée par la loi ; de commettre tout harcèlement ou comportement sexuel non désiré ;",
        "de conduire ou voyager sous l'emprise de l'alcool ou de stupéfiants, ou de transporter des armes, des marchandises illégales ou des substances dangereuses ;",
        "d'utiliser les données personnelles d'un autre Membre (numéro de téléphone, localisation…) en dehors de la Réservation concernée ;",
        "de publier un Contenu illicite, diffamatoire, haineux, sexuellement explicite ou portant atteinte aux droits d'autrui ; de rédiger des évaluations fausses, sans rapport avec une Course réelle, ou obtenues contre un avantage ;",
        "de manipuler la Plateforme, notamment en falsifiant des données de localisation, en réalisant de fausses Courses pour obtenir des évaluations, ou en contournant la vérification, les limitations ou les mesures de sécurité ; d'extraire des données de la Plateforme par des moyens automatisés ou de la décompiler, sauf dans les limites permises par la loi.",
      ],
    },
    {
      heading: '13. Sécurité et signalements',
      body: [
        "VAYA n'est pas un service d'urgence. En cas d'urgence, appelez directement les services de secours (en Tunisie : police 197, SAMU 190, protection civile 198).",
        "Vous pouvez signaler un Membre, un Trajet ou une Course en contactant le Support VAYA. Indiquez ce qui s'est passé, quand, et la Réservation concernée.",
        "Un membre de notre équipe examine chaque signalement. Nous pouvons contacter les personnes concernées, examiner les données de la Réservation et de la Course, et prendre les mesures de l'article 17. Nous informons l'auteur du signalement de son traitement ; nous pouvons ne pas être en mesure de détailler les mesures prises à l'égard d'un autre Membre.",
        "Lorsque la loi l'exige, ou lorsque nous estimons de bonne foi qu'il existe un risque grave pour la vie ou la sécurité d'une personne, nous coopérons avec les autorités compétentes et pouvons leur communiquer les informations pertinentes, comme décrit dans la Politique de confidentialité.",
      ],
    },
    {
      heading: '14. Évaluations et informations de confiance',
      body: [
        "Après une Course terminée, le Conducteur et chaque Passager peuvent s'évaluer dans les 24 heures : une note de 1 à 5 étoiles, un indicateur de ponctualité facultatif et un commentaire facultatif. Chaque partie ne peut évaluer l'autre qu'une fois par Course.",
        "Votre note moyenne, votre nombre de Courses terminées, vos scores de ponctualité et de fiabilité et votre niveau de confiance (« Nouveau », « Confiance », « Top VAYA ») sont affichés sur votre profil public. Le niveau de confiance dépend du nombre de Courses terminées, de la note moyenne et de l'ancienneté du compte.",
        "Les commentaires ne sont visibles que par le Membre évalué (et par VAYA). Ils ne sont pas publiés sur les profils.",
        "Les évaluations doivent être sincères et fondées sur la Course réelle. Nous pouvons retirer une évaluation contraire à l'article 12 ou résultant d'une erreur, y compris une absence enregistrée à tort. Nous ne retirons pas une évaluation parce qu'elle est négative.",
      ],
    },
    {
      heading: '15. Responsabilité',
      body: [
        "Chaque Membre est responsable de son propre comportement et de l'exécution des Réservations qu'il conclut : le Conducteur, notamment, de sa conduite et de son véhicule ; le Passager, de son comportement et de ses affaires. Les réclamations liées à une Course (accident, dommage, perte) sont dirigées contre la personne responsable et son assureur, selon la loi applicable.",
        "VAYA est responsable des dommages causés par son propre manquement aux présentes conditions ou par sa faute, selon la loi applicable. VAYA n'est pas responsable : du comportement des Membres, de l'exécution ou de l'annulation d'un Trajet ou de l'état d'un véhicule, sauf dans la mesure où VAYA a elle-même causé le dommage ou y a contribué ; de l'exactitude des informations fournies par les Membres ; d'un écart entre la réalité et les estimations de la Plateforme (itinéraires, durées, heures d'arrivée, Points d'arrêt, Fourchette de Participation) établies avec un soin raisonnable ; des pertes qui n'étaient pas raisonnablement prévisibles ; ni des interruptions dues à des événements échappant à son contrôle raisonnable (article 19).",
        "Rien dans les présentes conditions ne limite ni n'exclut la responsabilité en cas de décès ou de dommage corporel causé par notre négligence, de fraude, de faute lourde ou intentionnelle, ni toute responsabilité qui ne peut être limitée ou exclue selon la loi qui vous est applicable, y compris les règles impératives de protection des consommateurs.",
      ],
    },
    {
      heading: '16. Assurance',
      body: [
        "VAYA ne fournit ni ne vend aucune assurance. L'assurance automobile du Conducteur est la couverture applicable à un Trajet.",
        "Le Conducteur doit vérifier auprès de son assureur que sa police couvre le transport de passagers qui partagent les frais, et ne doit pas publier de Trajet si ce n'est pas le cas. Le Passager peut interroger le Conducteur sur son assurance avant de réserver.",
        "La Vérification Conducteur contrôle qu'une attestation d'assurance a été présentée et paraissait valide au moment de l'examen ; elle ne confirme pas l'étendue de la couverture.",
      ],
    },
    {
      heading: '17. Mesures à l\'égard des comptes',
      body: [
        "Nous pouvons prendre des mesures lorsque nous avons des motifs raisonnables de penser qu'un Membre a enfreint les présentes conditions ou la loi, a créé un risque pour la sécurité d'autrui ou a fourni de faux documents de vérification ; en cas d'annulations tardives ou d'absences répétées ; ou lorsque la loi ou une autorité compétente l'exige.",
        "Selon la gravité et la répétition, nous pouvons : adresser un avertissement ; retirer un Contenu ou une évaluation ; annuler un Trajet ; restreindre la faculté de publier des Trajets ; suspendre le compte ; ou fermer le compte.",
        "Les mesures sont proportionnées. Sauf si la loi nous en empêche ou si cela compromettait la sécurité d'autrui ou une enquête, nous vous informons de la mesure prise, de ses motifs et des faits sur lesquels elle repose, au plus tard lorsqu'elle prend effet.",
        "Vous pouvez demander le réexamen d'une mesure en contactant le Support VAYA dans les 30 jours. Un membre de notre équipe différent de celui qui a pris la décision l'examinera.",
        "Pendant une suspension, le Membre ne peut pas utiliser la Plateforme. Les Réservations en cours peuvent être annulées ; les Membres concernés en sont informés.",
      ],
    },
    {
      heading: '18. Contenus et propriété intellectuelle',
      body: [
        "Vos Contenus restent les vôtres. Vous accordez à VAYA une licence non exclusive, gratuite et mondiale, pour la durée de présence de vos Contenus sur la Plateforme, afin de les héberger, reproduire, adapter (par exemple redimensionner une photo) et afficher dans la mesure nécessaire au fonctionnement, à la sécurité et à l'amélioration de la Plateforme. Cette licence prend fin à la suppression de vos Contenus, sauf pour les copies que nous devons conserver selon la Politique de confidentialité.",
        "Vous devez détenir les droits sur les Contenus que vous fournissez. Ne publiez pas de photos d'autres personnes sans leur accord.",
        "La Plateforme, ses logiciels, son design, ses bases de données, ainsi que le nom et le logo VAYA appartiennent à VAYA ou à ses concédants. Nous vous accordons un droit personnel, non transférable et révocable d'utiliser l'application conformément à sa destination. Si vous nous envoyez des suggestions, nous pouvons les utiliser sans obligation envers vous.",
        "Les cartes et informations de lieux sont fournies par des tiers (notamment Google et les contributeurs d'OpenStreetMap) selon leurs propres conditions et attributions.",
      ],
    },
    {
      heading: '19. Disponibilité de la Plateforme',
      body: [
        "Nous nous efforçons de maintenir la Plateforme disponible et sécurisée, sans pouvoir garantir un accès ininterrompu. Nous pouvons la suspendre temporairement pour maintenance, sécurité ou pour des raisons échappant à notre contrôle (pannes de réseau, coupures d'électricité, décisions des autorités). Lorsqu'une interruption planifiée affecte des Réservations existantes, nous essayons de prévenir les Membres.",
      ],
    },
    {
      heading: '20. Modification des conditions',
      body: [
        "Nous pouvons modifier les présentes conditions pour tenir compte de l'évolution de la Plateforme, de la loi ou de nos pratiques. Nous vous informons des modifications importantes dans l'application au moins 30 jours avant leur entrée en vigueur, sauf si un changement est exigé plus tôt par la loi ou pour répondre à un risque de sécurité.",
        "Si vous n'acceptez pas une modification, vous pouvez supprimer votre compte avant son entrée en vigueur. Les modifications ne s'appliquent pas aux Réservations conclues avant leur entrée en vigueur.",
      ],
    },
    {
      heading: '21. Fin de la relation',
      body: [
        "Vous pouvez supprimer votre compte à tout moment dans l'application (Profil → Conditions et vie privée → Supprimer mon compte). La suppression n'est pas possible tant que vous avez une Réservation active ou un Trajet ouvert ; vous devez d'abord les annuler ou les terminer. La suppression est définitive. La Politique de confidentialité explique ce que nous supprimons et ce que nous conservons.",
        "Nous pouvons fermer votre compte dans les conditions de l'article 17, ou en cas d'arrêt de la Plateforme, auquel cas nous vous prévenons au moins 30 jours à l'avance lorsque c'est possible.",
        'Les articles 15 et 18 survivent à la fin de la relation.',
      ],
    },
    {
      heading: '22. Réclamations et litiges',
      body: [
        "Pour toute réclamation, contactez le Support VAYA. Nous nous efforçons de la traiter dans un délai raisonnable et d'abord à l'amiable.",
        "Si vous êtes un consommateur, rien dans les présentes conditions ne vous prive de la protection des dispositions impératives de la loi du pays où vous résidez habituellement, ni de la possibilité d'agir devant les tribunaux de votre lieu de résidence.",
      ],
    },
    {
      heading: '23. Dispositions générales',
      body: [
        "Les présentes conditions et les informations affichées dans l'application au sujet d'un Trajet ou d'une Réservation constituent l'intégralité de l'accord entre vous et VAYA concernant la Plateforme.",
        "Si une disposition est jugée invalide, les autres restent en vigueur et la disposition invalide est remplacée par une disposition valide aussi proche que possible de son objet.",
        "Vous ne pouvez pas céder votre compte ni vos droits au titre des présentes conditions. Nous pouvons transférer nos droits et obligations à une autre entité dans le cadre d'une réorganisation ou d'une cession de l'activité, sans réduire vos droits ; nous vous en informerons.",
        "Le fait de ne pas faire appliquer une disposition ne vaut pas renonciation à celle-ci.",
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Terms of Use',
  version: '2.0',
  effectiveDateLabel: 'Version 2.0',
  languageNote:
    'Governing language: French. In case of any discrepancy with this translation, the French version prevails.',
  sections: [
    {
      heading: 'In short',
      body: [
        'VAYA is an app that connects people who are already making a car journey (Drivers) with people who want to travel the same way (Passengers) so that they can share the cost of the journey. VAYA is not a transport company and does not drive anyone.',
        'Using VAYA is free. VAYA does not handle payments: Passengers pay their contribution directly to the Driver.',
        'The price per seat must stay within a range that VAYA calculates from the route. A Driver must never make a profit from a journey.',
        'Drivers must be verified by VAYA before they can publish a journey.',
        'Cancelling late or not showing up affects your reliability record. There are no financial penalties.',
        'You can delete your account at any time from the app.',
        'This summary helps you read the Terms; it does not replace them.',
      ],
    },
    {
      heading: '1. Definitions',
      body: [
        '"VAYA", "we", "us": the operator of the Platform.',
        '"Platform": the VAYA mobile application, its website and the related services.',
        '"Member": a person who has created a VAYA account.',
        '"Driver": a Member whose driver profile has been approved by VAYA and who offers seats on a Ride.',
        '"Passenger": a Member who requests or holds a seat on a Ride.',
        '"Ride": a journey published by a Driver, with its origin, destination, departure time, route, Stops, seats and Contribution per seat.',
        '"Stop": a pickup or drop-off point on a Ride, chosen from points proposed by the Platform along the route, or placed by a Passenger subject to the Platform\'s checks and the Driver\'s acceptance.',
        '"Booking Request": a Passenger\'s request for one or more seats. "Booking": a Booking Request accepted by the Driver.',
        '"Trip": the performance of a Booking, from the Driver starting the journey until the Passenger is dropped off or the Trip otherwise ends.',
        '"Contribution": the amount per seat a Passenger pays the Driver to share the costs of the Ride. "Contribution Range": the minimum and maximum per seat that the Platform calculates for a Ride.',
        '"Driver Verification": VAYA\'s review of a Member\'s identity, driving licence, insurance and vehicle before they can drive.',
        '"Content": any information a Member provides on the Platform (profile, photos, vehicle, messages, ratings, comments).',
        '"VAYA Support": the support contact published on VAYA\'s App Store and Google Play pages.',
      ],
    },
    {
      heading: '2. Scope and acceptance',
      body: [
        'These Terms govern your use of the Platform. Our Privacy Policy explains how we process personal data.',
        'You accept these Terms by creating an account. If you do not accept them, do not create an account. You need an account to request a seat, publish a Ride or communicate with other Members.',
      ],
    },
    {
      heading: '3. What VAYA does — and does not do',
      body: [
        'VAYA provides a technology platform. It lets Members publish and search Rides; see suggested routes, Stops and a Contribution Range; send, accept and decline Booking Requests; message each other once a Booking exists; follow a Trip on a map; cancel; and rate each other.',
        'VAYA is not a transport operator. We do not own, rent or operate vehicles, we do not employ or instruct Drivers, and we do not carry anyone. Each Driver makes a journey they would make anyway, on their own account. The arrangement to share the journey is made between the Driver and the Passenger; VAYA is not a party to it.',
        'We are responsible for providing the Platform with reasonable care and skill, for the accuracy of information we generate ourselves (routes and the Contribution Range, which are estimates), and for Driver Verification as described in Article 5. We are not responsible for how a Member drives, behaves or performs a Booking, except where the law makes us responsible (Article 15).',
        'The Platform ranks search results, proposes Stops, calculates the Contribution Range and infers the progress of a Trip from location data. Article 10 and our Privacy Policy explain the main parameters.',
      ],
    },
    {
      heading: '4. Eligibility and your account',
      body: [
        'You must be at least 18 years old and legally able to enter into contracts.',
        'You sign in with a mobile number verified by a one-time code, or with a Google account. You must use your real name. You may hold only one account and must not create an account for someone else or use another person\'s account.',
        'You are responsible for keeping access to your phone and Google account secure. Tell VAYA Support if you think someone else has accessed your account.',
        'Keep your information accurate and up to date. You can change your name, photo and language in the app.',
      ],
    },
    {
      heading: '5. Becoming a Driver — Driver Verification',
      body: [
        'To publish Rides you must: hold a valid driving licence for the vehicle you use; own the vehicle or have the owner\'s permission; have valid motor insurance (Article 16); keep the vehicle roadworthy and compliant with the law; and be approved through Driver Verification.',
        'You enter your vehicle details (make, model, colour, number plate, seats) and take photos, with the camera inside the app, of your driving licence, your insurance certificate and your face (a selfie). Uploads from your photo library are not possible. A member of VAYA\'s team reviews them manually to check that the documents appear genuine and valid and that the selfie matches the licence photo. VAYA does not use automated facial recognition. We may approve, decline or ask you to resubmit, and we tell you the reason.',
        'Approval means that, at the time of review, the documents you provided appeared genuine, valid and yours. It does not guarantee your driving skills, the condition of your vehicle, or the later validity of your licence or insurance. You must tell us, and stop publishing Rides, if your licence is suspended or withdrawn or your insurance ends.',
        'VAYA may ask you to repeat Driver Verification (for example, when a document expires) and may restrict your ability to publish Rides as described in Article 17.',
      ],
    },
    {
      heading: '6. Cost-sharing — the Contribution',
      body: [
        'VAYA is for sharing costs, not for earning money. A Driver may only ask Passengers to contribute to the actual costs of the journey (fuel, tolls, parking, a share of vehicle wear and insurance). A Driver must not make a profit and must not use the Platform to carry on a commercial or professional passenger-transport activity (taxi, louage, ride-hailing or similar).',
        'For each Ride, the Platform calculates a recommended Contribution per seat from the route\'s distance and estimated duration, using reference cost parameters reviewed periodically, plus a minimum and a maximum. The Driver chooses a Contribution within that range; the Platform rejects any price outside it. The Contribution shown when the Passenger books is the amount agreed.',
        'The Contribution Range applies per seat. The Driver remains responsible for ensuring that the total received from all Passengers on a Ride does not exceed their actual costs for that Ride, and must lower the Contribution where needed.',
        'VAYA does not collect, hold or transfer money. Passengers pay their Contribution directly to the Driver, in cash or by another method they agree, at the time they agree. No other amount may be requested for the seat (for example, for luggage or a detour) unless it is shown on the Ride before booking.',
        'Using VAYA is currently free: no booking or service fee is charged. If we decide to introduce fees, we will tell you in advance (Article 20), and fees will never apply to a Booking made before they were announced.',
        'Each Member is responsible for complying with the tax and transport rules that apply to them. VAYA cannot give individual legal or tax advice.',
      ],
    },
    {
      heading: '7. Publishing a Ride (Drivers)',
      body: [
        'You must give accurate information: origin, destination, departure date and time, route, the Stops you agree to serve, the number of seats actually available, and the vehicle you will use.',
        'The Platform proposes route options and candidate Stops along the chosen route; you choose which to offer. Free-text meeting places are not accepted. Stops are suggestions based on map data: you remain responsible for stopping only where it is legal and safe.',
        'You must drive the Ride yourself, in the declared vehicle, and offer no more seats than the vehicle may legally carry with seatbelts.',
        'The Platform may suggest saving a journey you make regularly. A suggested draft Ride is never published without your confirmation.',
      ],
    },
    {
      heading: '8. Requesting a seat (Passengers)',
      body: [
        'Search results show Rides that the Platform considers compatible with your origin, destination and time, including Rides passing near your route. Each result shows the Driver\'s public profile, rating and trust level before you request a seat.',
        'You choose your pickup Stop (and, where offered, drop-off Stop) and the number of seats, then send your Booking Request. If you place a pickup point yourself, the Platform shows you the resulting detour and timing before you send it, and the Driver may decline.',
        'The Driver must accept or decline within the deadline shown in the app. Otherwise the request expires and you are not committed.',
        'You may send a limited number of Booking Requests for the same journey to different Drivers. When one is accepted, the others are automatically withdrawn and you are notified.',
        'A Booking is formed when the Driver accepts. You are then both committed to the Ride as booked, subject to Article 10.',
      ],
    },
    {
      heading: '9. During a Booking and Trip',
      body: [
        'Driver and Passenger must: be on time at the agreed Stop; communicate changes promptly; behave respectfully; comply with the law; and not carry anything illegal or dangerous.',
        'The Driver must: drive safely and lawfully; not drive under the influence of alcohol, drugs or medication that impairs driving; respect the agreed route and Stops (a reasonable detour due to traffic is acceptable); keep the vehicle clean and safe; make sure every Passenger can wear a seatbelt; and not ask for more than the agreed Contribution.',
        'The Passenger must: pay the agreed Contribution; respect the vehicle and the Driver\'s reasonable rules announced before the Ride (luggage, smoking, food, pets); wear a seatbelt; and not cause the Driver to break the law.',
        'A Passenger may travel with a child only if agreed with the Driver in advance and with the restraint required by law. Minors may not book or travel alone.',
        'When the Driver starts a Trip, the Driver\'s app shares the vehicle\'s location with VAYA while it is open, so that Passengers can see the estimated arrival time and, once on board, the vehicle on the map. The Platform uses this location to update the Trip\'s progress automatically (arrival at the pickup point, end of the Trip, etc.). Drivers must not interfere with location data to mislead other Members or VAYA.',
        'Lost items are arranged directly between Members using the Booking\'s messaging. VAYA does not keep or return property.',
      ],
    },
    {
      heading: '10. Cancellations, no-shows and reliability',
      body: [
        'Either party may cancel a Booking in the app and must select a reason. The consequence depends on the time before the scheduled departure: 24 hours or more before departure, none; less than 24 hours but at least 30 minutes before, 1 reliability point; less than 30 minutes before or after departure, 3 reliability points.',
        'If a Member does not turn up, the other party may report a no-show in the app from 15 minutes after the scheduled departure time. The Platform may also record a no-show automatically when location data and Trip status clearly show that a party never came to the meeting point. A recorded no-show adds 5 reliability points to the absent Member and records a 1-star rating against them.',
        'Reliability points are an internal record VAYA uses to identify repeated unreliability. Other Members cannot see them. Repeated late cancellations or no-shows may lead to measures under Article 17.',
        'Because VAYA handles no payments, cancellations and no-shows have no financial consequences through the Platform. Any arrangement between Members about money already paid is between them.',
        'If you believe a no-show was recorded against you in error (including automatically), contact VAYA Support within 14 days. A member of our team will review it and remove the rating and points if the record was wrong.',
        'We may adjust the thresholds or points above. Changes apply only to Bookings made after we publish them, and these Terms are updated accordingly.',
        'A Driver who cancels a Ride cancels the related Bookings, with the consequences above. VAYA may also cancel a Ride for safety or compliance reasons; affected Passengers are informed and no points are applied to them.',
      ],
    },
    {
      heading: '11. Communication between Members',
      body: [
        'Once a Booking is accepted, a private message thread opens between the Driver and that Passenger. It stops accepting new messages when the Trip ends.',
        'Once a Booking is accepted, and while it remains accepted, each party can see the other\'s phone number in the app so they can call about that Booking. Before acceptance, phone numbers are never shown. You may use another Member\'s number only to organise that Booking.',
        'Do not use messages to share content prohibited by Article 12, to arrange payment outside the agreed Contribution, or to arrange journeys off the Platform to avoid these Terms.',
      ],
    },
    {
      heading: '12. Prohibited conduct',
      body: [
        'You must not: use VAYA for profit-making or commercial transport, or ask for more than the Contribution;',
        'give false information about yourself, a Ride, a vehicle or a document, or impersonate anyone; create several accounts, or share or sell your account;',
        'harass, threaten, insult, discriminate against or attack anyone, including on the basis of origin, sex, religion, disability or any characteristic protected by law; engage in any sexual harassment or unwanted sexual conduct;',
        'drive or travel under the influence of alcohol or drugs, or carry weapons, illegal goods or dangerous substances;',
        'use another Member\'s personal data (phone number, location, etc.) outside the Booking concerned;',
        'post Content that is unlawful, defamatory, hateful, sexually explicit or infringes another person\'s rights; write ratings that are false, unrelated to a real Trip, or obtained in exchange for a benefit;',
        'manipulate the Platform, including by falsifying location data, completing fake Trips to obtain ratings, or circumventing verification, limits or security measures; extract data from the Platform by automated means or reverse-engineer it, except as permitted by law.',
      ],
    },
    {
      heading: '13. Safety and reporting',
      body: [
        'VAYA is not an emergency service. In an emergency, call the emergency services directly (in Tunisia: police 197, ambulance (SAMU) 190, civil protection 198).',
        'You can report a Member, a Ride or a Trip by contacting VAYA Support. Tell us what happened, when, and which Booking it concerns.',
        'A member of our team reviews each report. We may contact the people involved, examine the Booking and Trip records, and take measures under Article 17. We tell the person who reported that the report has been handled; we may not be able to share the details of measures taken against another Member.',
        'Where the law requires it, or where we believe in good faith that there is a serious risk to someone\'s life or safety, we cooperate with competent authorities and may share relevant information with them, as described in the Privacy Policy.',
      ],
    },
    {
      heading: '14. Ratings and trust information',
      body: [
        'After a completed Trip, the Driver and each Passenger may rate each other within 24 hours: 1 to 5 stars, an optional punctuality indicator and an optional comment. Each party can rate the other only once per Trip.',
        'Your average rating, number of completed Trips, punctuality and reliability scores and trust level ("Nouveau", "Confiance", "Top VAYA") are shown on your public profile. The trust level depends on the number of completed Trips, your average rating and the age of your account.',
        'Comments are visible only to the Member being rated (and to VAYA). They are not published on profiles.',
        'Ratings must be honest and based on the actual Trip. We may remove a rating that breaches Article 12 or results from an error, including a no-show recorded in error. We do not remove ratings because they are negative.',
      ],
    },
    {
      heading: '15. Liability',
      body: [
        'Each Member is responsible for their own conduct and for performing the Bookings they enter into: the Driver, in particular, for their driving and vehicle; the Passenger for their behaviour and belongings. Claims arising from a Trip (accident, damage, loss) are made against the person responsible and their insurer under the applicable law.',
        'VAYA is liable for damage caused by its own breach of these Terms or by its fault, under the applicable law. VAYA is not liable for: the conduct of Members, the performance or cancellation of a Ride or the condition of a vehicle, except to the extent VAYA itself caused or contributed to the damage; the accuracy of information Members provide; differences between reality and the Platform\'s estimates (routes, durations, arrival times, Stops, Contribution Range) produced with reasonable care; losses that were not reasonably foreseeable; or interruptions caused by events beyond its reasonable control (Article 19).',
        'Nothing in these Terms limits or excludes liability for death or personal injury caused by our negligence, for fraud, for gross negligence or wilful misconduct, or any liability that cannot be limited or excluded under the law that applies to you, including mandatory consumer-protection rules.',
      ],
    },
    {
      heading: '16. Insurance',
      body: [
        'VAYA does not provide or sell insurance. The Driver\'s motor insurance is the cover that applies to a Ride.',
        'Drivers must check with their insurer that their policy covers carrying passengers who share costs, and must not publish Rides if it does not. Passengers can ask the Driver about insurance before booking.',
        'Driver Verification checks that an insurance certificate was presented and appeared valid at the time of review; it does not confirm what the policy covers.',
      ],
    },
    {
      heading: '17. Measures against accounts',
      body: [
        'We may take measures where we have reasonable grounds to believe that a Member has breached these Terms or the law, created a risk to the safety of others, or provided false verification documents; in case of repeated late cancellations or no-shows; or where required by law or a competent authority.',
        'Depending on seriousness and repetition, we may: issue a warning; remove Content or a rating; cancel a Ride; restrict the ability to publish Rides; suspend the account; or close the account.',
        'Measures are proportionate. Unless we are prevented by law or doing so would compromise others\' safety or an investigation, we tell you which measure we have taken, the reasons and the facts it is based on, at the latest when it takes effect.',
        'You can ask us to review a measure by contacting VAYA Support within 30 days. A member of our team other than the one who took the decision will review it.',
        'While an account is suspended, the Member cannot use the Platform. Bookings in progress may be cancelled; affected Members are informed.',
      ],
    },
    {
      heading: '18. Content and intellectual property',
      body: [
        'Your Content remains yours. You grant VAYA a non-exclusive, royalty-free, worldwide licence, for as long as your Content is on the Platform, to host, reproduce, adapt (for example, resize a photo) and display it as needed to operate, secure and improve the Platform. This licence ends when your Content is deleted, except for copies we must keep under the Privacy Policy.',
        'You must hold the rights to the Content you provide. Do not upload photos of other people without their permission.',
        'The Platform, its software, design and databases, and the VAYA name and logo belong to VAYA or its licensors. We grant you a personal, non-transferable, revocable right to use the app for its intended purpose. If you send us suggestions, we may use them without obligation to you.',
        'Maps and place information are provided by third parties (including Google and OpenStreetMap contributors) under their own terms and attributions.',
      ],
    },
    {
      heading: '19. Availability of the Platform',
      body: [
        'We aim to keep the Platform available and secure but cannot guarantee uninterrupted access. We may suspend it temporarily for maintenance, security or reasons beyond our control (network failures, power cuts, decisions of public authorities). Where a planned interruption affects existing Bookings, we try to give notice.',
      ],
    },
    {
      heading: '20. Changes to these Terms',
      body: [
        'We may change these Terms to reflect changes to the Platform, the law or our practices. We will inform you of material changes in the app at least 30 days before they take effect, unless a change is required sooner by law or to address a safety risk.',
        'If you do not agree to a change, you can delete your account before it takes effect. Changes do not apply to Bookings made before they take effect.',
      ],
    },
    {
      heading: '21. Ending the relationship',
      body: [
        'You can delete your account at any time in the app (Profile → Terms & Privacy → Delete my account). Deletion is not possible while you have an active Booking or an open Ride; you must first cancel or complete them. Deletion is permanent. The Privacy Policy explains what we delete and what we keep.',
        'We may close your account under Article 17, or if the Platform is discontinued, in which case we will give you at least 30 days\' notice where possible.',
        'Articles 15 and 18 survive the end of the relationship.',
      ],
    },
    {
      heading: '22. Complaints and disputes',
      body: [
        'For any complaint, contact VAYA Support. We aim to handle it within a reasonable time and to resolve it amicably first.',
        'If you are a consumer, nothing in these Terms deprives you of the protection of the mandatory provisions of the law of the country where you habitually reside, or of the right to bring proceedings before the courts of your place of residence.',
      ],
    },
    {
      heading: '23. General',
      body: [
        'These Terms and the information shown in the app about a Ride or Booking form the entire agreement between you and VAYA about the Platform.',
        'If a provision is held invalid, the rest remains in force, and the invalid provision is replaced by a valid one as close as possible to its purpose.',
        'You may not transfer your account or your rights under these Terms. We may transfer our rights and obligations to another entity as part of a reorganisation or sale of the business, without reducing your rights; we will inform you.',
        'Our not enforcing a provision does not mean we waive it.',
      ],
    },
  ],
};

const ar: LegalDocument = {
  title: 'شروط الاستخدام',
  version: '2.0',
  effectiveDateLabel: 'الإصدار 2.0',
  languageNote:
    'اللغة المعتمدة: الفرنسية. في حال وجود اختلاف بين هذه الترجمة والنص الفرنسي، يُعتمد النص الفرنسي.',
  sections: [
    {
      heading: 'باختصار',
      body: [
        'VAYA تطبيق يربط بين أشخاص يقومون أصلاً برحلة بالسيارة (السائقون) وأشخاص يرغبون في السفر في الاتجاه نفسه (الركاب) لتقاسم تكاليف الرحلة. VAYA ليست شركة نقل ولا تقود أحداً.',
        'استخدام VAYA مجاني. لا تتولى VAYA أي عملية دفع: يدفع الراكب مساهمته مباشرة إلى السائق.',
        'يجب أن يبقى سعر المقعد ضمن نطاق تحسبه VAYA انطلاقاً من المسار. لا يجوز للسائق أبداً تحقيق ربح من الرحلة.',
        'يجب أن تتحقق VAYA من السائقين قبل أن يتمكنوا من نشر رحلة.',
        'الإلغاء المتأخر أو عدم الحضور يؤثر على سجل موثوقيتك. لا توجد أي غرامات مالية.',
        'يمكنك حذف حسابك في أي وقت من التطبيق.',
        'هذا الملخص يساعدك على قراءة الشروط ولا يحل محلها.',
      ],
    },
    {
      heading: '1. تعريفات',
      body: [
        '«VAYA» أو «نحن»: مشغّل المنصة.',
        '«المنصة»: تطبيق VAYA للهاتف المحمول وموقعه الإلكتروني والخدمات المرتبطة بهما.',
        '«العضو»: كل شخص أنشأ حساباً في VAYA.',
        '«السائق»: عضو وافقت VAYA على ملفه كسائق ويعرض مقاعد في رحلة.',
        '«الراكب»: عضو يطلب مقعداً في رحلة أو يحجزه.',
        '«الرحلة»: تنقّل ينشره السائق، بنقطة انطلاقه ووجهته وموعد انطلاقه ومساره ونقاط توقفه ومقاعده ومساهمته لكل مقعد.',
        '«نقطة التوقف»: نقطة صعود أو نزول في الرحلة، تُختار من نقاط تقترحها المنصة على طول المسار، أو يحددها الراكب مع مراعاة تحققات المنصة وقبول السائق.',
        '«طلب الحجز»: طلب الراكب لمقعد أو أكثر. «الحجز»: طلب حجز قبله السائق.',
        '«المشوار»: تنفيذ الحجز، منذ بدء السائق للرحلة إلى إنزال الراكب أو انتهاء المشوار.',
        '«المساهمة»: المبلغ لكل مقعد الذي يدفعه الراكب للسائق لتقاسم تكاليف الرحلة. «نطاق المساهمة»: الحد الأدنى والأقصى لكل مقعد الذي تحسبه المنصة لكل رحلة.',
        '«التحقق من السائق»: فحص VAYA لهوية العضو ورخصة سياقته وتأمينه وسيارته قبل أن يتمكن من القيادة.',
        '«المحتوى»: كل معلومة يقدمها العضو على المنصة (الملف الشخصي، الصور، السيارة، الرسائل، التقييمات، التعليقات).',
        '«دعم VAYA»: جهة الاتصال للمساعدة المنشورة في صفحة VAYA على App Store وGoogle Play.',
      ],
    },
    {
      heading: '2. النطاق والقبول',
      body: [
        'تنظم هذه الشروط استخدامك للمنصة. وتشرح سياسة الخصوصية كيفية معالجتنا للبيانات الشخصية.',
        'تقبل هذه الشروط بإنشاء حساب. إذا لم تقبلها فلا تنشئ حساباً. الحساب ضروري لطلب مقعد أو نشر رحلة أو التواصل مع أعضاء آخرين.',
      ],
    },
    {
      heading: '3. ما تقوم به VAYA وما لا تقوم به',
      body: [
        'توفر VAYA منصة تكنولوجية تتيح للأعضاء نشر الرحلات والبحث عنها، والاطلاع على مسارات ونقاط توقف ونطاق مساهمة مقترحة، وإرسال طلبات الحجز وقبولها أو رفضها، والتراسل بعد إتمام الحجز، ومتابعة المشوار على الخريطة، والإلغاء، والتقييم المتبادل.',
        'VAYA ليست ناقلاً. لا نملك أي سيارة ولا نستأجرها ولا نشغّلها، ولا نشغّل السائقين ولا نعطيهم تعليمات، ولا ننقل أحداً. كل سائق يقوم برحلة كان سيقوم بها على أي حال ولحسابه الخاص. يُبرم اتفاق تقاسم الرحلة بين السائق والراكب، وVAYA ليست طرفاً فيه.',
        'نحن مسؤولون عن توفير المنصة بعناية وكفاءة معقولتين، وعن صحة المعلومات التي ننتجها بأنفسنا (المسارات ونطاق المساهمة، وهي تقديرات)، وعن التحقق من السائق كما هو مبين في الفصل 5. لسنا مسؤولين عن طريقة قيادة العضو أو سلوكه أو تنفيذه للحجز، إلا إذا حمّلنا القانون هذه المسؤولية (الفصل 15).',
        'ترتب المنصة نتائج البحث، وتقترح نقاط التوقف، وتحسب نطاق المساهمة، وتستنتج تقدم المشوار من بيانات الموقع. يشرح الفصل 10 وسياسة الخصوصية أهم المعايير المعتمدة.',
      ],
    },
    {
      heading: '4. الشروط والحساب',
      body: [
        'يجب أن يكون عمرك 18 سنة على الأقل وأن تتمتع بالأهلية القانونية للتعاقد.',
        'تسجّل الدخول برقم هاتف يتم التحقق منه برمز يُستعمل مرة واحدة، أو بحساب Google. يجب استعمال اسمك الحقيقي. لا يحق لك امتلاك أكثر من حساب واحد، ولا إنشاء حساب لغيرك أو استعمال حساب شخص آخر.',
        'أنت مسؤول عن تأمين الوصول إلى هاتفك وحساب Google الخاص بك. أبلغ دعم VAYA إذا اعتقدت أن شخصاً آخر دخل إلى حسابك.',
        'حافظ على دقة معلوماتك وتحديثها. يمكنك تعديل اسمك وصورتك ولغتك في التطبيق.',
      ],
    },
    {
      heading: '5. أن تصبح سائقاً — التحقق من السائق',
      body: [
        'لنشر الرحلات يجب: امتلاك رخصة سياقة سارية للسيارة المستعملة؛ أن تكون مالك السيارة أو حاصلاً على إذن مالكها؛ امتلاك تأمين سيارة ساري المفعول (الفصل 16)؛ الحفاظ على السيارة في حالة جيدة ومطابقة للقانون؛ والحصول على الموافقة إثر التحقق من السائق.',
        'تُدخل بيانات سيارتك (العلامة، الطراز، اللون، رقم التسجيل، عدد المقاعد) وتلتقط بكاميرا التطبيق صوراً لرخصة السياقة وشهادة التأمين ووجهك (صورة ذاتية). لا يمكن التحميل من معرض الصور. يفحص أحد أعضاء فريق VAYA هذه العناصر يدوياً للتأكد من أن الوثائق تبدو أصلية وسارية وأن الصورة الذاتية تطابق صورة الرخصة. لا تستعمل VAYA التعرف الآلي على الوجه. يمكننا القبول أو الرفض أو طلب إعادة الإرسال مع إعلامك بالسبب.',
        'تعني الموافقة أنه عند الفحص بدت الوثائق المقدمة أصلية وسارية وخاصة بك. ولا تضمن مهاراتك في القيادة ولا حالة سيارتك ولا صلاحية رخصتك أو تأمينك لاحقاً. يجب إعلامنا والتوقف عن نشر الرحلات إذا عُلّقت رخصتك أو سُحبت أو انتهى تأمينك.',
        'يمكن لـ VAYA أن تطلب منك إعادة التحقق (مثلاً عند انتهاء صلاحية وثيقة) وأن تقيّد قدرتك على نشر الرحلات وفق الفصل 17.',
      ],
    },
    {
      heading: '6. تقاسم التكاليف — المساهمة',
      body: [
        'الغرض من VAYA تقاسم التكاليف لا كسب المال. لا يجوز للسائق أن يطلب من الركاب إلا المساهمة في التكاليف الفعلية للرحلة (الوقود، معاليم الطريق السيارة، التوقف، نصيب من استهلاك السيارة وتأمينها). لا يجوز له تحقيق أي ربح ولا استعمال المنصة لممارسة نشاط تجاري أو مهني لنقل الأشخاص (تاكسي، لواج، نقل بالطلب أو ما شابه).',
        'تحسب المنصة لكل رحلة مساهمة موصى بها لكل مقعد انطلاقاً من مسافة المسار ومدته التقديرية، وفق معايير تكلفة مرجعية تُراجع دورياً، إضافة إلى حد أدنى وحد أقصى. يختار السائق مساهمة ضمن هذا النطاق، وترفض المنصة كل سعر خارجه. المساهمة المعروضة عند الحجز هي المبلغ المتفق عليه.',
        'ينطبق نطاق المساهمة على كل مقعد. ويبقى السائق مسؤولاً عن ألا يتجاوز مجموع ما يتلقاه من جميع ركاب الرحلة تكاليفه الفعلية لتلك الرحلة، وعليه تخفيض المساهمة عند الحاجة.',
        'لا تتلقى VAYA أي مبلغ ولا تحتفظ به ولا تحوّله. يدفع الراكب مساهمته مباشرة إلى السائق نقداً أو بأي وسيلة يتفقان عليها وفي الوقت الذي يتفقان عليه. لا يجوز طلب أي مبلغ آخر مقابل المقعد (مثلاً مقابل الأمتعة أو الانعطاف) ما لم يكن مذكوراً في الرحلة قبل الحجز.',
        'استخدام VAYA مجاني حالياً: لا تُفرض أي معاليم حجز أو خدمة. إذا قررنا فرض معاليم فسنعلمك مسبقاً (الفصل 20)، ولن تنطبق أبداً على حجز أُبرم قبل الإعلان عنها.',
        'كل عضو مسؤول عن احترام القواعد الجبائية وقواعد النقل المنطبقة عليه. لا يمكن لـ VAYA تقديم استشارة قانونية أو جبائية فردية.',
      ],
    },
    {
      heading: '7. نشر رحلة (السائقون)',
      body: [
        'يجب تقديم معلومات صحيحة: نقطة الانطلاق، الوجهة، تاريخ وساعة الانطلاق، المسار، نقاط التوقف التي تقبل خدمتها، عدد المقاعد المتاحة فعلاً، والسيارة المستعملة.',
        'تقترح المنصة خيارات مسار ونقاط توقف مرشحة على طول المسار المختار، وتختار أنت ما تعرضه منها. لا تُقبل أماكن لقاء مكتوبة بحرية. نقاط التوقف اقتراحات مبنية على بيانات الخرائط، وتبقى مسؤولاً عن التوقف فقط حيث يكون ذلك قانونياً وآمناً.',
        'يجب أن تقود الرحلة بنفسك بالسيارة المصرّح بها، وألا تعرض مقاعد أكثر مما تسمح به السيارة قانونياً مع أحزمة الأمان.',
        'قد تقترح المنصة حفظ رحلة تقوم بها بانتظام. لا تُنشر أي مسودة رحلة مقترحة دون تأكيدك.',
      ],
    },
    {
      heading: '8. طلب مقعد (الركاب)',
      body: [
        'تعرض نتائج البحث الرحلات التي تعتبرها المنصة متوافقة مع نقطة انطلاقك ووجهتك وتوقيتك، بما في ذلك رحلات تمر قرب مسارك. تُظهر كل نتيجة الملف العام للسائق وتقييمه ومستوى الثقة فيه قبل طلب المقعد.',
        'تختار نقطة الصعود (ونقطة النزول عند توفرها) وعدد المقاعد ثم ترسل طلب الحجز. إذا حددت نقطة الصعود بنفسك، تعرض لك المنصة الانعطاف والتوقيت الناتجين قبل الإرسال، ويمكن للسائق الرفض.',
        'يجب على السائق القبول أو الرفض ضمن الأجل المعروض في التطبيق، وإلا ينتهي الطلب ولا تكون ملزماً.',
        'يمكنك إرسال عدد محدود من طلبات الحجز للرحلة نفسها إلى سائقين مختلفين. عند قبول أحدها تُسحب البقية آلياً ويتم إعلامك.',
        'يُبرم الحجز عند قبول السائق، ويصبح كلاكما ملتزماً بالرحلة كما حُجزت، مع مراعاة الفصل 10.',
      ],
    },
    {
      heading: '9. أثناء الحجز والمشوار',
      body: [
        'على السائق والراكب: الحضور في الوقت المحدد إلى نقطة التوقف المتفق عليها؛ الإبلاغ بسرعة عن أي تغيير؛ التعامل باحترام؛ احترام القانون؛ وعدم حمل أي شيء غير قانوني أو خطير.',
        'على السائق: القيادة بحذر ووفق القانون؛ عدم القيادة تحت تأثير الكحول أو المخدرات أو أدوية تؤثر على القيادة؛ احترام المسار ونقاط التوقف المتفق عليها (يُقبل انعطاف معقول بسبب حركة المرور)؛ الحفاظ على نظافة السيارة وسلامتها؛ تمكين كل راكب من وضع حزام الأمان؛ وعدم طلب أكثر من المساهمة المتفق عليها.',
        'على الراكب: دفع المساهمة المتفق عليها؛ احترام السيارة والقواعد المعقولة التي أعلنها السائق قبل الرحلة (الأمتعة، التدخين، الأكل، الحيوانات)؛ وضع حزام الأمان؛ وعدم دفع السائق إلى مخالفة القانون.',
        'لا يجوز للراكب السفر مع طفل إلا باتفاق مسبق مع السائق ومع وسيلة التثبيت التي يفرضها القانون. لا يجوز للقاصرين الحجز أو السفر بمفردهم.',
        'عندما يبدأ السائق المشوار، يشارك تطبيقه موقع السيارة مع VAYA ما دام مفتوحاً، حتى يرى الركاب الوقت المقدّر للوصول، ثم السيارة على الخريطة بعد الصعود. تستعمل المنصة هذا الموقع لتحديث تقدم المشوار آلياً (الوصول إلى نقطة الصعود، نهاية المشوار، إلخ). لا يجوز للسائق التلاعب ببيانات الموقع لتضليل أعضاء آخرين أو VAYA.',
        'تُسوّى مسألة الأغراض المنسية مباشرة بين الأعضاء عبر مراسلة الحجز. لا تحتفظ VAYA بالأغراض ولا تعيدها.',
      ],
    },
    {
      heading: '10. الإلغاء وعدم الحضور والموثوقية',
      body: [
        'يمكن لكل طرف إلغاء الحجز في التطبيق مع اختيار سبب. تختلف العواقب حسب المدة المتبقية قبل موعد الانطلاق: 24 ساعة أو أكثر قبل الانطلاق، لا عواقب؛ أقل من 24 ساعة وثلاثون دقيقة على الأقل، نقطة موثوقية واحدة؛ أقل من 30 دقيقة قبل الانطلاق أو بعده، 3 نقاط موثوقية.',
        'إذا لم يحضر أحد الأعضاء، يمكن للطرف الآخر الإبلاغ عن عدم الحضور في التطبيق بعد 15 دقيقة من موعد الانطلاق المقرر. ويمكن للمنصة أيضاً تسجيل عدم الحضور آلياً عندما تُظهر بيانات الموقع وحالة المشوار بوضوح أن أحد الطرفين لم يأتِ أبداً إلى نقطة اللقاء. يضيف عدم الحضور المسجّل 5 نقاط موثوقية للعضو الغائب ويسجّل ضده تقييماً بنجمة واحدة.',
        'نقاط الموثوقية سجل داخلي تستعمله VAYA لرصد تكرار عدم الموثوقية، ولا يراها الأعضاء الآخرون. قد يؤدي تكرار الإلغاء المتأخر أو عدم الحضور إلى الإجراءات المنصوص عليها في الفصل 17.',
        'بما أن VAYA لا تتولى أي دفع، فلا تترتب على الإلغاء أو عدم الحضور أي عواقب مالية عبر المنصة. أي اتفاق بين الأعضاء بشأن مبلغ مدفوع يخصهم وحدهم.',
        'إذا اعتقدت أن عدم حضور سُجّل ضدك خطأً (بما في ذلك آلياً)، اتصل بدعم VAYA خلال 14 يوماً. سيفحص أحد أعضاء فريقنا الأمر ويحذف التقييم والنقاط إذا كان التسجيل خاطئاً.',
        'يمكننا تعديل الآجال أو النقاط المذكورة أعلاه. لا تنطبق التعديلات إلا على الحجوزات المبرمة بعد نشرها، وتُحدّث هذه الشروط تبعاً لذلك.',
        'السائق الذي يلغي رحلة يلغي الحجوزات المرتبطة بها، مع العواقب المذكورة أعلاه. ويمكن لـ VAYA أيضاً إلغاء رحلة لأسباب تتعلق بالسلامة أو المطابقة، ويتم إعلام الركاب المعنيين دون احتساب أي نقاط عليهم.',
      ],
    },
    {
      heading: '11. التواصل بين الأعضاء',
      body: [
        'عند قبول الحجز تُفتح محادثة خاصة بين السائق وهذا الراكب، ولا تقبل رسائل جديدة بعد انتهاء المشوار.',
        'عند قبول الحجز، وطالما بقي مقبولاً، يمكن لكل طرف رؤية رقم هاتف الطرف الآخر في التطبيق للاتصال به بشأن هذا الحجز. قبل القبول لا تُعرض أرقام الهواتف أبداً. لا يجوز استعمال رقم عضو آخر إلا لتنظيم هذا الحجز.',
        'لا تستعمل الرسائل لمشاركة محتوى محظور بموجب الفصل 12، أو لترتيب دفع خارج المساهمة المتفق عليها، أو لترتيب رحلات خارج المنصة للتهرب من هذه الشروط.',
      ],
    },
    {
      heading: '12. السلوكيات المحظورة',
      body: [
        'يُحظر: استعمال VAYA لغرض ربحي أو للنقل التجاري، أو طلب أكثر من المساهمة؛',
        'تقديم معلومات كاذبة عن نفسك أو عن رحلة أو سيارة أو وثيقة، أو انتحال هوية الغير؛ إنشاء عدة حسابات أو مشاركة حسابك أو بيعه؛',
        'مضايقة أي شخص أو تهديده أو إهانته أو التمييز ضده أو الاعتداء عليه، بما في ذلك بسبب الأصل أو الجنس أو الدين أو الإعاقة أو أي صفة يحميها القانون؛ أي تحرش أو سلوك جنسي غير مرغوب فيه؛',
        'القيادة أو السفر تحت تأثير الكحول أو المخدرات، أو حمل أسلحة أو بضائع غير قانونية أو مواد خطرة؛',
        'استعمال البيانات الشخصية لعضو آخر (رقم الهاتف، الموقع…) خارج الحجز المعني؛',
        'نشر محتوى غير قانوني أو تشهيري أو يحرض على الكراهية أو جنسي صريح أو يمس بحقوق الغير؛ كتابة تقييمات كاذبة أو لا علاقة لها بمشوار حقيقي أو مقابل منفعة؛',
        'التلاعب بالمنصة، بما في ذلك تزوير بيانات الموقع أو إجراء مشاوير وهمية للحصول على تقييمات أو التحايل على التحقق أو القيود أو إجراءات الأمان؛ استخراج بيانات المنصة بوسائل آلية أو تفكيك برمجياتها، إلا في الحدود التي يسمح بها القانون.',
      ],
    },
    {
      heading: '13. السلامة والإبلاغ',
      body: [
        'VAYA ليست خدمة طوارئ. في حالة الطوارئ اتصل مباشرة بمصالح النجدة (في تونس: الشرطة 197، الإسعاف SAMU 190، الحماية المدنية 198).',
        'يمكنك الإبلاغ عن عضو أو رحلة أو مشوار بالاتصال بدعم VAYA. اذكر ما حدث ومتى والحجز المعني.',
        'يفحص أحد أعضاء فريقنا كل بلاغ. يمكننا الاتصال بالأشخاص المعنيين وفحص بيانات الحجز والمشوار واتخاذ الإجراءات المنصوص عليها في الفصل 17. نُعلم صاحب البلاغ بمعالجته، وقد لا نتمكن من تفصيل الإجراءات المتخذة ضد عضو آخر.',
        'عندما يفرض القانون ذلك، أو عندما نعتقد بحسن نية بوجود خطر جسيم على حياة شخص أو سلامته، نتعاون مع السلطات المختصة ويمكننا تزويدها بالمعلومات ذات الصلة، كما هو مبين في سياسة الخصوصية.',
      ],
    },
    {
      heading: '14. التقييمات ومعلومات الثقة',
      body: [
        'بعد انتهاء المشوار، يمكن للسائق ولكل راكب تقييم بعضهم بعضاً خلال 24 ساعة: من نجمة إلى 5 نجوم، مع مؤشر اختياري للالتزام بالمواعيد وتعليق اختياري. لا يمكن لكل طرف تقييم الآخر إلا مرة واحدة في كل مشوار.',
        'يُعرض في ملفك العام متوسط تقييمك وعدد مشاويرك المنتهية ودرجتا الالتزام بالمواعيد والموثوقية ومستوى الثقة («Nouveau»، «Confiance»، «Top VAYA»). يرتبط مستوى الثقة بعدد المشاوير المنتهية ومتوسط التقييم وأقدمية الحساب.',
        'التعليقات لا يراها إلا العضو الذي تم تقييمه (وVAYA)، ولا تُنشر في الملفات الشخصية.',
        'يجب أن تكون التقييمات صادقة ومبنية على المشوار الفعلي. يمكننا حذف تقييم يخالف الفصل 12 أو ناتج عن خطأ، بما في ذلك عدم حضور سُجّل خطأً. لا نحذف التقييمات لكونها سلبية.',
      ],
    },
    {
      heading: '15. المسؤولية',
      body: [
        'كل عضو مسؤول عن سلوكه وعن تنفيذ الحجوزات التي يبرمها: السائق خاصة عن قيادته وسيارته، والراكب عن سلوكه وأغراضه. توجّه المطالبات المتعلقة بمشوار (حادث، ضرر، فقدان) إلى الشخص المسؤول ومؤمّنه وفق القانون المنطبق.',
        'VAYA مسؤولة عن الأضرار الناتجة عن إخلالها بهذه الشروط أو عن خطئها، وفق القانون المنطبق. ولا تكون VAYA مسؤولة عن: سلوك الأعضاء أو تنفيذ رحلة أو إلغائها أو حالة سيارة، إلا بقدر ما تسببت VAYA نفسها في الضرر أو ساهمت فيه؛ صحة المعلومات التي يقدمها الأعضاء؛ الفارق بين الواقع وتقديرات المنصة (المسارات، المدد، أوقات الوصول، نقاط التوقف، نطاق المساهمة) المعدّة بعناية معقولة؛ الخسائر غير المتوقعة بشكل معقول؛ أو الانقطاعات الناتجة عن أحداث خارجة عن سيطرتها المعقولة (الفصل 19).',
        'لا شيء في هذه الشروط يحدّ أو يستبعد المسؤولية عن الوفاة أو الضرر الجسدي الناتج عن إهمالنا، أو عن الاحتيال، أو عن الخطأ الجسيم أو المتعمد، أو أي مسؤولية لا يجوز الحد منها أو استبعادها وفق القانون المنطبق عليك، بما في ذلك القواعد الآمرة لحماية المستهلك.',
      ],
    },
    {
      heading: '16. التأمين',
      body: [
        'لا توفر VAYA ولا تبيع أي تأمين. تأمين السيارة الخاص بالسائق هو التغطية المنطبقة على الرحلة.',
        'على السائق التحقق لدى مؤمّنه من أن عقده يغطي نقل ركاب يتقاسمون التكاليف، وعدم نشر رحلات إذا لم يكن الأمر كذلك. ويمكن للراكب سؤال السائق عن التأمين قبل الحجز.',
        'يتحقق التحقق من السائق من تقديم شهادة تأمين بدت سارية عند الفحص، ولا يؤكد نطاق التغطية.',
      ],
    },
    {
      heading: '17. الإجراءات المتعلقة بالحسابات',
      body: [
        'يمكننا اتخاذ إجراءات عندما تكون لدينا أسباب معقولة للاعتقاد بأن عضواً خالف هذه الشروط أو القانون، أو عرّض سلامة الغير للخطر، أو قدّم وثائق تحقق مزوّرة؛ أو في حال تكرار الإلغاء المتأخر أو عدم الحضور؛ أو عندما يفرض ذلك القانون أو سلطة مختصة.',
        'حسب الخطورة والتكرار، يمكننا: توجيه تنبيه؛ حذف محتوى أو تقييم؛ إلغاء رحلة؛ تقييد إمكانية نشر الرحلات؛ تعليق الحساب؛ أو غلق الحساب.',
        'تكون الإجراءات متناسبة. ما لم يمنعنا القانون أو كان ذلك يمس بسلامة الغير أو بتحقيق جارٍ، نعلمك بالإجراء المتخذ وأسبابه والوقائع التي يستند إليها، في أجل أقصاه تاريخ سريانه.',
        'يمكنك طلب مراجعة إجراء بالاتصال بدعم VAYA خلال 30 يوماً. يتولى المراجعة عضو من فريقنا غير الذي اتخذ القرار.',
        'خلال التعليق لا يمكن للعضو استعمال المنصة. يمكن إلغاء الحجوزات الجارية مع إعلام الأعضاء المعنيين.',
      ],
    },
    {
      heading: '18. المحتوى والملكية الفكرية',
      body: [
        'يبقى محتواك ملكاً لك. تمنح VAYA ترخيصاً غير حصري ومجانياً وعالمياً، طوال مدة وجود محتواك على المنصة، لاستضافته ونسخه وتكييفه (مثلاً تغيير حجم صورة) وعرضه بالقدر اللازم لتشغيل المنصة وتأمينها وتحسينها. ينتهي هذا الترخيص بحذف محتواك، باستثناء النسخ التي يجب علينا الاحتفاظ بها وفق سياسة الخصوصية.',
        'يجب أن تملك الحقوق على المحتوى الذي تقدمه. لا تنشر صور أشخاص آخرين دون موافقتهم.',
        'المنصة وبرمجياتها وتصميمها وقواعد بياناتها واسم VAYA وشعارها ملك لـ VAYA أو للجهات المرخِّصة لها. نمنحك حقاً شخصياً غير قابل للتحويل وقابلاً للإلغاء لاستعمال التطبيق وفق الغرض المعدّ له. إذا أرسلت إلينا اقتراحات، يمكننا استعمالها دون أي التزام تجاهك.',
        'تُوفَّر الخرائط ومعلومات الأماكن من أطراف ثالثة (منها Google والمساهمون في OpenStreetMap) وفق شروطهم ونسبة الحقوق الخاصة بهم.',
      ],
    },
    {
      heading: '19. توفر المنصة',
      body: [
        'نسعى إلى إبقاء المنصة متاحة وآمنة دون أن نضمن نفاذاً متواصلاً. يمكننا تعليقها مؤقتاً للصيانة أو الأمان أو لأسباب خارجة عن سيطرتنا (أعطال الشبكة، انقطاع الكهرباء، قرارات السلطات). عندما يؤثر انقطاع مبرمج على حجوزات قائمة، نسعى إلى إعلام الأعضاء مسبقاً.',
      ],
    },
    {
      heading: '20. تعديل الشروط',
      body: [
        'يمكننا تعديل هذه الشروط لمواكبة تطور المنصة أو القانون أو ممارساتنا. نعلمك بالتعديلات الجوهرية في التطبيق قبل 30 يوماً على الأقل من سريانها، ما لم يفرض القانون أو خطر يمس السلامة تغييراً أسرع.',
        'إذا لم توافق على تعديل، يمكنك حذف حسابك قبل سريانه. لا تنطبق التعديلات على الحجوزات المبرمة قبل سريانها.',
      ],
    },
    {
      heading: '21. إنهاء العلاقة',
      body: [
        'يمكنك حذف حسابك في أي وقت من التطبيق (الملف الشخصي ← الشروط والخصوصية ← حذف حسابي). لا يمكن الحذف ما دام لديك حجز نشط أو رحلة مفتوحة، ويجب أولاً إلغاؤها أو إتمامها. الحذف نهائي. تشرح سياسة الخصوصية ما نحذفه وما نحتفظ به.',
        'يمكننا غلق حسابك وفق الفصل 17، أو في حال إيقاف المنصة، وفي هذه الحالة نعلمك قبل 30 يوماً على الأقل كلما أمكن ذلك.',
        'يبقى الفصلان 15 و18 ساريين بعد انتهاء العلاقة.',
      ],
    },
    {
      heading: '22. الشكاوى والنزاعات',
      body: [
        'لأي شكوى اتصل بدعم VAYA. نسعى إلى معالجتها في أجل معقول وإلى حلها ودياً أولاً.',
        'إذا كنت مستهلكاً، فلا شيء في هذه الشروط يحرمك من حماية الأحكام الآمرة لقانون البلد الذي تقيم فيه عادة، ولا من حق التقاضي أمام محاكم مكان إقامتك.',
      ],
    },
    {
      heading: '23. أحكام عامة',
      body: [
        'تشكّل هذه الشروط والمعلومات المعروضة في التطبيق بشأن رحلة أو حجز كامل الاتفاق بينك وبين VAYA بخصوص المنصة.',
        'إذا اعتُبر حكم ما باطلاً، تبقى بقية الأحكام سارية ويُعوَّض الحكم الباطل بحكم صحيح أقرب ما يكون إلى غرضه.',
        'لا يجوز لك التفويت في حسابك أو في حقوقك بموجب هذه الشروط. يمكننا نقل حقوقنا والتزاماتنا إلى جهة أخرى في إطار إعادة هيكلة أو تفويت في النشاط، دون الانتقاص من حقوقك، مع إعلامك بذلك.',
        'عدم تطبيقنا لحكم ما لا يعني التنازل عنه.',
      ],
    },
  ],
};

export const TERMS_CONTENT: Record<SupportedLocale, LegalDocument> = { fr, en, ar };
