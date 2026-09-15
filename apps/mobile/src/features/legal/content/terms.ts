import type { SupportedLocale } from '@vaya/config';
import type { LegalDocument } from './types';

/**
 * In-app rendering of VAYA's Terms & Conditions. French is the canonical,
 * governing text — see `docs/legal/terms-and-conditions.md` and
 * `docs/legal/README.md` (governing-language note + legal-review status).
 * English/Arabic are faithful translations for accessibility, not
 * independent legal texts; the Arabic translation has not been reviewed by
 * a native legal-Arabic speaker (tracked in `docs/legal/README.md`).
 */
const fr: LegalDocument = {
  title: "Conditions Générales d'Utilisation",
  version: '1.0',
  effectiveDateLabel: 'Version 1.0',
  languageNote:
    "Langue faisant foi : français. En cas de divergence avec une traduction, la version française prévaut.",
  sections: [
    {
      heading: 'Préambule',
      body: [
        "VAYA (« la Plateforme », « nous », « VAYA ») est une plateforme numérique qui met en relation des conducteurs disposant de sièges libres dans un trajet qu'ils effectuent déjà pour leur propre compte (« Conducteurs ») avec des personnes souhaitant effectuer le même trajet ou une partie de celui-ci (« Passagers »), afin qu'ils partagent les frais de ce trajet — une pratique communément appelée covoiturage.",
        "En créant un compte ou en utilisant la Plateforme, vous acceptez d'être lié par les présentes Conditions Générales d'Utilisation (« CGU ») ainsi que par la Politique de confidentialité de VAYA, qui en fait partie intégrante. Si vous n'acceptez pas les présentes CGU, vous ne devez pas créer de compte ni utiliser la Plateforme.",
      ],
    },
    {
      heading: '1. Définitions',
      body: [
        'Plateforme : l\'application mobile VAYA et l\'ensemble des services numériques permettant sa mise en relation.',
        'Conducteur : un Membre qui propose un Trajet en partageant les frais de celui-ci avec un ou plusieurs Passagers, au moyen de son propre véhicule, dans le cadre d\'un déplacement qu\'il effectue pour son propre compte.',
        'Passager : un Membre qui réserve une ou plusieurs places dans un Trajet publié par un Conducteur.',
        'Trajet : un déplacement en véhicule publié par un Conducteur, incluant point de départ, destination, date et heure de départ, places disponibles et Contribution par place.',
        "Contribution / Participation aux frais : la somme, calculée et plafonnée selon l'article 4, qu'un Passager verse directement au Conducteur en contrepartie de sa place. La Contribution n'est jamais un tarif de transport et ne constitue en aucun cas un prix de vente d'un service de transport.",
        "Frais de service VAYA : la rémunération, le cas échéant, perçue par VAYA en contrepartie de la mise à disposition de la Plateforme — distincte et indépendante de la Contribution versée au Conducteur.",
      ],
    },
    {
      heading: "2. Rôle de VAYA — Statut d'intermédiaire technique",
      body: [
        "VAYA n'est pas une entreprise de transport, n'est pas un transporteur, et n'agit à aucun moment en qualité de transporteur. VAYA ne possède, n'exploite, ne loue et ne gère aucun véhicule ; n'emploie aucun conducteur ; n'effectue elle-même aucun trajet et ne s'engage envers aucun Membre à ce qu'un Trajet ait lieu.",
        "VAYA se limite à fournir un outil technique de mise en relation, de recherche d'itinéraire, de calcul d'une Contribution indicative, de réservation, d'évaluation mutuelle et de messagerie entre Membres.",
        "Le contrat de transport, lorsqu'il existe, se forme exclusivement entre le Conducteur et le(s) Passager(s) — VAYA n'en est pas partie, et n'est donc responsable ni de l'exécution du Trajet, ni de son annulation, ni du comportement d'un Membre (voir article 12).",
        "Cette qualification correspond à la pratique retenue par les principales plateformes de covoiturage internationales, dont les tribunaux ont confirmé qu'un prestataire qui se borne à mettre en relation des utilisateurs agit comme prestataire de services de la société de l'information, et non comme transporteur.",
      ],
    },
    {
      heading: '3. Éligibilité et création de compte',
      body: [
        "L'utilisation de VAYA est réservée aux personnes physiques âgées d'au moins 18 ans, disposant de la pleine capacité juridique de contracter.",
        'Pour publier un Trajet en tant que Conducteur, le Membre doit en outre détenir un permis de conduire valide, être propriétaire du véhicule ou disposer de l\'autorisation de son propriétaire, disposer d\'une assurance automobile valide, et avoir complété la procédure de vérification d\'identité de VAYA (« KYC », article 10).',
        "Chaque Membre ne peut détenir qu'un seul compte. La création de comptes multiples, ou l'usage d'un compte au nom d'un tiers sans son consentement, est interdite (article 11).",
        "Le Membre s'engage à fournir des informations exactes et à jour.",
      ],
    },
    {
      heading: "4. Le partage des frais — principe fondamental du covoiturage",
      body: [
        "Cet article est la disposition la plus importante des présentes CGU. VAYA est une plateforme de covoiturage, c'est-à-dire de partage des frais d'un trajet que le Conducteur effectue de toute façon pour son propre compte — jamais un service de transport commercial, de transport à la demande, ni un service assimilable à un taxi ou à une VTC.",
        "La Contribution demandée par un Conducteur ne peut en aucun cas excéder les frais réellement exposés pour le Trajet, ni générer un profit. Les frais pouvant être pris en compte sont limitativement : le carburant, l'usure et l'entretien courant du véhicule au prorata du kilométrage, les péages et le stationnement liés au Trajet, et une quote-part raisonnable de la prime d'assurance. Ne sont en aucun cas inclus : la rémunération du temps de conduite, ni aucune marge bénéficiaire.",
        "VAYA calcule et affiche systématiquement une Contribution suggérée, ainsi qu'une fourchette minimale et maximale, à partir de la distance et de la durée réelles du Trajet et de coûts de référence révisés périodiquement. Le Conducteur peut ajuster son prix uniquement à l'intérieur de cette fourchette plafonnée — toute tentative de fixer un prix hors fourchette est techniquement refusée par la Plateforme.",
        "VAYA se réserve le droit de facturer, en sus, des Frais de service distincts (article 7), qui rémunèrent l'accès à la Plateforme et non le Trajet lui-même.",
        "Le non-respect de ce principe par un Conducteur constitue un manquement grave pouvant entraîner la suspension ou la suppression de son compte (article 16).",
      ],
    },
    {
      heading: '5. Obligations du Conducteur',
      body: [
        'Le Conducteur s\'engage à : publier des informations exactes sur son Trajet ; conduire lui-même le Trajet ; détenir en permanence un permis de conduire valide, une assurance valide, et un véhicule en bon état ; respecter le Code de la route tunisien ; ne jamais demander une Contribution supérieure à la fourchette calculée par la Plateforme ; informer les Passagers en cas d\'annulation et se conformer à la politique d\'annulation de VAYA ; adopter un comportement respectueux et non-discriminatoire.',
      ],
    },
    {
      heading: '6. Obligations du Passager',
      body: [
        "Le Passager s'engage à : se présenter au point de prise en charge convenu à l'heure indiquée ; verser au Conducteur, en main propre, la Contribution correspondant à sa Réservation — VAYA ne collecte, ne détient et ne reverse à ce jour aucune somme d'argent entre Membres ; respecter le véhicule et les règles fixées par le Conducteur ; informer le Conducteur en cas d'annulation et se conformer à la politique d'annulation de VAYA.",
      ],
    },
    {
      heading: '7. Réservation, paiement et frais de service VAYA',
      body: [
        "La Réservation s'effectue via la Plateforme, à un point d'arrêt sélectionné parmi un ensemble restreint de points validés le long de l'itinéraire réel du Trajet — VAYA n'autorise pas la saisie libre d'un point de rendez-vous arbitraire.",
        "À ce jour, VAYA ne traite aucun paiement entre Membres. La Contribution est échangée directement entre le Conducteur et le Passager, en espèces ou par tout autre moyen qu'ils conviennent entre eux, au moment du Trajet. VAYA n'est ni dépositaire, ni garant, ni intermédiaire de paiement pour cette somme.",
        "VAYA se réserve le droit d'introduire, à l'avenir, des Frais de service facturés au Passager et/ou au Conducteur, distincts de la Contribution, après information préalable claire des Membres. À la date des présentes CGU, aucun Frais de service n'est activé.",
      ],
    },
    {
      heading: '8. Annulation et absence (no-show)',
      body: [
        "Les Trajets confirmés peuvent être annulés par le Conducteur ou par le Passager à tout moment avant le départ, selon la politique de VAYA.",
        "Cette politique repose sur des conséquences réputationnelles (points de pénalité de fiabilité), et non sur des pénalités financières — VAYA ne traitant aujourd'hui aucun paiement entre Membres, il n'existe aucun remboursement à effectuer.",
        "Une absence non signalée (« no-show ») constitue un manquement plus grave qu'une annulation tardive et entraîne une pénalité de fiabilité plus importante ainsi qu'une note automatique.",
      ],
    },
    {
      heading: "9. Système d'évaluation et de confiance",
      body: [
        "À l'issue de chaque Trajet, le Conducteur et le Passager peuvent s'évaluer mutuellement, dans un délai limité après le Trajet. Les évaluations contribuent à un niveau de confiance affiché publiquement sur le profil de chaque Membre, visible avant toute Réservation.",
        "Les commentaires détaillés restent visibles uniquement par les deux parties au Trajet concerné. Toute évaluation doit refléter une expérience réelle et sincère.",
      ],
    },
    {
      heading: "10. Vérification d'identité (KYC) et documents",
      body: [
        'Tout Membre souhaitant devenir Conducteur doit se soumettre à une procédure de vérification d\'identité comprenant la capture en direct d\'une photographie du visage (« selfie »), du permis de conduire et de l\'attestation d\'assurance. VAYA n\'accepte que des documents capturés en direct par l\'appareil photo de l\'application — jamais un import depuis une galerie de photos existante.',
        "Ces données constituent des données à caractère personnel sensibles. Leur traitement est soumis au consentement explicite et éclairé du Membre (voir article 15 et la Politique de confidentialité).",
        "VAYA se réserve le droit de refuser, suspendre ou retirer le statut de Conducteur vérifié à tout Membre dont les documents apparaissent falsifiés, expirés, ou ne correspondant pas à la personne du Membre.",
      ],
    },
    {
      heading: '11. Comportements interdits',
      body: [
        "Sont strictement interdits : l'exercice, sous couvert de covoiturage, d'une activité de transport rémunéré au sens commercial du terme ; la création de comptes multiples ou l'usurpation d'identité ; la publication d'informations fausses ou frauduleuses ; tout harcèlement, menace, discrimination ou propos injurieux ; toute tentative de contournement des mécanismes de sécurité ou de vérification ; l'utilisation de la Plateforme à des fins illégales ; toute extraction ou réutilisation automatisée non autorisée du contenu de la Plateforme.",
        "Tout manquement peut entraîner, sans préavis, la suspension ou la suppression du compte du Membre concerné, ainsi qu'un signalement aux autorités compétentes le cas échéant.",
      ],
    },
    {
      heading: '12. Responsabilité et limitations',
      body: [
        "Conformément à son rôle d'intermédiaire technique, VAYA n'est pas responsable de l'exactitude des informations publiées par un Membre, de l'annulation ou de la modification d'un Trajet, du comportement d'un Membre, ni de l'état ou de l'assurance du véhicule utilisé.",
        "Ces limitations ne sauraient exclure la responsabilité de VAYA en cas de faute prouvée directement imputable au fonctionnement technique de la Plateforme, ni porter atteinte aux droits impératifs reconnus aux consommateurs par la loi n° 92-117 relative à la protection du consommateur.",
      ],
    },
    {
      heading: '13. Assurance — absence de garantie VAYA',
      body: [
        "VAYA ne fournit, ne vend et ne souscrit elle-même aucun produit d'assurance. L'assurance automobile souscrite par le Conducteur demeure la seule couverture applicable en cas d'accident. Il appartient à chaque Conducteur de vérifier que sa police couvre le transport de passagers à titre de covoiturage.",
      ],
    },
    {
      heading: '14. Propriété intellectuelle',
      body: [
        "L'ensemble des éléments de la Plateforme (marque, logo, interface, base de données, code source) est protégé par le droit de la propriété intellectuelle et demeure la propriété exclusive de VAYA ou de ses concédants.",
      ],
    },
    {
      heading: '15. Données personnelles',
      body: [
        "Le traitement des données personnelles des Membres, y compris les données biométriques collectées lors de la vérification d'identité, est décrit intégralement dans la Politique de confidentialité de VAYA, qui fait partie intégrante des présentes CGU et détaille notamment vos droits d'accès, de rectification, d'opposition et de suppression.",
      ],
    },
    {
      heading: '16. Suspension, résiliation et suppression de compte',
      body: [
        'VAYA peut suspendre l\'accès d\'un Membre à tout moment, sans préavis, en cas de manquement grave ou répété aux présentes CGU, de fraude avérée ou suspectée, ou de signalement sérieux d\'un autre Membre.',
        'Tout Membre peut demander la suppression de son compte directement depuis l\'application (Profil → Conditions et vie privée → Supprimer mon compte).',
        "Pour préserver les engagements du Membre envers d'autres Membres, une demande de suppression est refusée tant que le Membre a une Réservation active en tant que Passager, ou un Trajet publié et non terminé en tant que Conducteur.",
        "Dès la suppression, VAYA anonymise irréversiblement les données d'identification directe du Membre et efface ses documents de vérification d'identité. Les données strictement nécessaires à la tenue des engagements pris envers d'autres Membres sont conservées sous forme anonymisée uniquement. Le détail complet figure dans la Politique de confidentialité, section « Suppression de compte ».",
        'La suppression du compte est définitive et ne peut être annulée une fois exécutée.',
      ],
    },
    {
      heading: '17. Cadre réglementaire tunisien et évolution du service',
      body: [
        "Le Membre reconnaît que la Tunisie ne dispose pas, à ce jour, d'un cadre légal spécifique au covoiturage. VAYA opère sur la base du principe de partage des frais sans but lucratif décrit à l'article 4, conforme aux standards internationalement reconnus en matière de covoiturage.",
        "VAYA se réserve le droit d'adapter à tout moment les modalités du service afin de se conformer à toute évolution du cadre légal ou réglementaire tunisien applicable au covoiturage ou au transport de personnes.",
      ],
    },
    {
      heading: '18. Modification des CGU',
      body: [
        "VAYA peut modifier les présentes CGU à tout moment. Toute modification substantielle est portée à la connaissance des Membres avant son entrée en vigueur. La poursuite de l'utilisation de la Plateforme après l'entrée en vigueur des CGU modifiées vaut acceptation de celles-ci.",
      ],
    },
    {
      heading: '19. Droit applicable et juridiction compétente',
      body: [
        "Les présentes CGU sont soumises au droit tunisien, notamment au Code des obligations et des contrats. Tout litige relève de la compétence exclusive des tribunaux tunisiens, sous réserve des règles impératives de compétence territoriale prévues par le droit tunisien de la consommation.",
      ],
    },
    {
      heading: '20. Contact',
      body: [
        'Pour toute question relative aux présentes CGU : contact@vaya.tn',
        'Pour toute question relative à vos données personnelles : privacy@vaya.tn',
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Terms & Conditions',
  version: '1.0',
  effectiveDateLabel: 'Version 1.0',
  languageNote:
    'The French version is the governing text. In case of any conflict with this translation, the French version prevails.',
  sections: [
    {
      heading: 'Preamble',
      body: [
        'VAYA ("the Platform", "we", "VAYA") is a digital platform that connects drivers with spare seats on a trip they are already making for their own purposes ("Drivers") with people wishing to make the same trip, or part of it ("Passengers"), so that they can share the cost of that trip — a practice commonly known as carpooling.',
        'By creating an account or using the Platform in any way, you agree to be bound by these Terms & Conditions ("Terms") and by VAYA\'s Privacy Policy, which forms an integral part of them. If you do not agree to these Terms, you must not create an account or use the Platform.',
      ],
    },
    {
      heading: '1. Definitions',
      body: [
        'Platform: the VAYA mobile application and the digital services that power it.',
        'Driver: a Member who offers a Trip and shares its cost with one or more Passengers, using their own vehicle, as part of a journey they are making for their own purposes.',
        'Passenger: a Member who books one or more seats on a Trip published by a Driver.',
        'Trip: a journey by vehicle published by a Driver, including a departure point, a destination, a departure date and time, available seats, and a Contribution per seat.',
        'Contribution / Cost-sharing amount: the sum, computed and capped under Article 4 below, that a Passenger pays directly to the Driver in exchange for their seat. The Contribution is never a transport fare and never constitutes the sale price of a transport service.',
        "VAYA service fee: any fee VAYA may charge in exchange for making the Platform available — distinct and independent from the Contribution paid to the Driver.",
      ],
    },
    {
      heading: "2. VAYA's role — technical intermediary status",
      body: [
        'VAYA is not a transport company, is not a carrier, and never acts as a carrier at any point. VAYA does not own, operate, lease, or manage any vehicle; does not employ any driver; does not itself perform any trip; and makes no commitment to any Member that a Trip will actually take place.',
        "VAYA's role is limited to providing a technical tool for matching, route search, indicative Contribution computation, booking, mutual rating, and messaging between Members.",
        "The transport contract, where one exists, is formed exclusively between the Driver and the Passenger(s) — VAYA is not a party to it, and is therefore not liable for the performance of the Trip, its cancellation, or the conduct of a Member (see Article 12).",
        'This classification mirrors the position taken by the leading international carpooling platforms, whose courts have confirmed that a provider that merely connects users acts as an information-society service provider, not a carrier.',
      ],
    },
    {
      heading: '3. Eligibility and account creation',
      body: [
        'Use of VAYA is reserved for individuals aged at least 18 with full legal capacity to contract.',
        'To publish a Trip as a Driver, a Member must additionally hold a valid driving licence, own the vehicle used or have the owner\'s authorization to use it, hold valid motor insurance, and have completed VAYA\'s identity verification procedure ("KYC", Article 10).',
        'Each Member may only hold one account. Creating multiple accounts, or using an account in the name of a third party without their consent, is prohibited (Article 11).',
        'The Member undertakes to provide accurate, up-to-date information.',
      ],
    },
    {
      heading: '4. Cost-sharing — the foundational principle of carpooling',
      body: [
        'This article is the most important provision of these Terms. VAYA is a carpooling platform — that is, a platform for sharing the cost of a trip the Driver is making anyway for their own purposes — never a commercial transport service, an on-demand transport service, or anything resembling a taxi or a chauffeured private-hire service.',
        "The Contribution a Driver asks of Passengers may never exceed the costs actually incurred for the Trip, nor generate a profit. Costs that may be taken into account are strictly limited to: fuel; wear and routine maintenance of the vehicle, pro-rated to the distance driven; tolls and parking directly related to the Trip; and a reasonable share of the insurance premium. The Driver's driving time is never compensated, and no profit margin may ever be included.",
        "VAYA systematically computes and displays a suggested Contribution, along with a minimum and maximum range, based on the Trip's real distance and duration and on reference costs revised periodically. A Driver may only adjust their price within this capped range — any attempt to set a price outside this range is technically rejected by the Platform.",
        'VAYA reserves the right to charge, in addition, a separate service fee (Article 7), which compensates for access to the Platform, not for the Trip itself.',
        "A Driver's failure to respect this principle is a serious breach of these Terms and may lead to the suspension or deletion of their account (Article 16).",
      ],
    },
    {
      heading: "5. Driver's obligations",
      body: [
        "The Driver undertakes to: publish accurate information about their Trip; personally drive the Trip; at all times hold a valid driving licence, valid insurance, and a vehicle in good working order; comply with Tunisian road traffic law; never request a Contribution above the range computed by the Platform; inform Passengers promptly of any cancellation and follow VAYA's cancellation policy; and behave respectfully and without discrimination.",
      ],
    },
    {
      heading: "6. Passenger's obligations",
      body: [
        "The Passenger undertakes to: arrive at the agreed pickup point at the stated time; pay the Driver, in person, the Contribution corresponding to their Booking — VAYA does not currently collect, hold, or transfer any money between Members; respect the vehicle and the Driver's rules; and inform the Driver promptly of any cancellation, following VAYA's cancellation policy.",
      ],
    },
    {
      heading: '7. Booking, payment, and VAYA service fees',
      body: [
        "Booking is made through the Platform, at a pickup point selected from a limited set of points validated along the Trip's real route — VAYA does not allow free-form entry of an arbitrary meeting point.",
        'VAYA does not currently process any payment between Members. The Contribution is exchanged directly between the Driver and the Passenger, in cash or by any other means they agree between themselves, at the time of the Trip. VAYA is neither a custodian, guarantor, nor payment intermediary for this sum.',
        'VAYA reserves the right to introduce, in the future, service fees charged to the Passenger and/or the Driver, distinct from the Contribution, after clear prior notice to Members. As of the date of these Terms, no service fee is active.',
      ],
    },
    {
      heading: '8. Cancellation and no-show',
      body: [
        "Confirmed Trips may be cancelled by the Driver or the Passenger at any time before departure, under VAYA's policy.",
        'This policy relies on reputational consequences (reliability penalty points), not financial penalties — since VAYA does not currently process any payment between Members, there is nothing to refund.',
        'An unreported absence ("no-show") is a more serious breach than a late cancellation and carries a heavier reliability penalty as well as an automatic rating.',
      ],
    },
    {
      heading: '9. Rating and trust system',
      body: [
        "At the end of each Trip, the Driver and the Passenger may rate each other, within a limited window after the Trip. Ratings feed into a trust level displayed publicly on each Member's profile, visible before any Booking.",
        'Detailed comments remain visible only to the two parties to that Trip. Every rating must reflect a genuine, honest experience.',
      ],
    },
    {
      heading: '10. Identity verification (KYC) and documents',
      body: [
        'Any Member wishing to become a Driver must complete an identity verification procedure that includes a live capture of a facial photograph ("selfie"), of their driving licence, and of their insurance certificate. VAYA only accepts documents captured live through the application\'s camera — never an upload from an existing photo gallery.',
        'This data constitutes sensitive personal data. Its processing is subject to the Member\'s explicit, informed consent (see Article 15 and the Privacy Policy).',
        "VAYA reserves the right to refuse, suspend, or withdraw verified-Driver status from any Member whose documents appear falsified, expired, or do not match the Member's identity.",
      ],
    },
    {
      heading: '11. Prohibited conduct',
      body: [
        'The following are strictly prohibited: carrying out, under the guise of carpooling, a commercial paid-transport activity; creating multiple accounts or impersonating a third party; publishing false or fraudulent information; any harassment, threats, discrimination, or abusive language; any attempt to circumvent the Platform\'s security or verification mechanisms; using the Platform for unlawful purposes; and any unauthorized automated extraction or reuse ("scraping") of the Platform\'s content.',
        'Any breach of this article may result, without notice, in the suspension or deletion of the Member\'s account, and, where applicable, a report to the competent authorities.',
      ],
    },
    {
      heading: '12. Liability and limitations',
      body: [
        "In line with its role as a technical intermediary, VAYA is not liable for the accuracy of information published by a Member, for the cancellation or modification of a Trip, for the conduct of a Member, or for the condition or insurance status of a vehicle used.",
        "These limitations do not exclude VAYA's liability for proven fault directly attributable to a technical failure of the Platform, nor do they affect the mandatory rights granted to consumers under Law No. 92-117 on consumer protection.",
      ],
    },
    {
      heading: '13. Insurance — no VAYA guarantee',
      body: [
        "VAYA does not provide, sell, or underwrite any insurance product itself. The motor insurance taken out by the Driver remains the only coverage applicable in the event of an accident. It is each Driver's responsibility to confirm that their policy covers carrying passengers on a carpooling basis.",
      ],
    },
    {
      heading: '14. Intellectual property',
      body: [
        "All elements of the Platform (brand, logo, interface, database, source code) are protected by intellectual property law and remain the exclusive property of VAYA or its licensors.",
      ],
    },
    {
      heading: '15. Personal data',
      body: [
        "The processing of Members' personal data, including biometric data collected during identity verification, is fully described in VAYA's Privacy Policy, which forms an integral part of these Terms and details your rights of access, rectification, objection, and deletion.",
      ],
    },
    {
      heading: '16. Suspension, termination, and account deletion',
      body: [
        "VAYA may suspend a Member's access at any time, without notice, in the event of a serious or repeated breach of these Terms, proven or suspected fraud, or a serious report from another Member.",
        'Any Member may request deletion of their account directly from the app (Profile → Terms & Privacy → Delete my account).',
        'To protect commitments a Member has made to other Members, a deletion request is declined while the Member has an active Booking as a Passenger, or a published, unfinished Trip as a Driver.',
        "Upon deletion, VAYA irreversibly anonymizes the Member's directly identifying data and erases their identity-verification documents. Data strictly necessary to honor commitments already made to other Members is retained in anonymized form only. Full detail is in the Privacy Policy, 'Account deletion' section.",
        'Account deletion is final and cannot be undone once carried out.',
      ],
    },
    {
      heading: '17. Tunisian regulatory framework and service evolution',
      body: [
        "The Member acknowledges that Tunisia currently has no carpooling-specific legal framework. VAYA operates its carpooling service on the non-profit cost-sharing principle described in Article 4, consistent with internationally recognized carpooling standards.",
        "VAYA reserves the right to adapt the service at any time (including the Contribution calculation method, applicable thresholds, or availability in certain areas) to comply with any change in the Tunisian legal or regulatory framework applicable to carpooling or passenger transport.",
      ],
    },
    {
      heading: '18. Changes to these Terms',
      body: [
        'VAYA may amend these Terms at any time. Any material change is communicated to Members before it takes effect. Continued use of the Platform after amended Terms take effect constitutes acceptance of them.',
      ],
    },
    {
      heading: '19. Governing law and jurisdiction',
      body: [
        'These Terms are governed by Tunisian law, including the Code des obligations et des contrats. Any dispute falls within the exclusive jurisdiction of the Tunisian courts, subject to the mandatory territorial-jurisdiction rules of Tunisian consumer law.',
      ],
    },
    {
      heading: '20. Contact',
      body: [
        'For any question about these Terms: contact@vaya.tn',
        'For any question about your personal data: privacy@vaya.tn',
      ],
    },
  ],
};

const ar: LegalDocument = {
  title: 'شروط الاستخدام',
  version: '1.0',
  effectiveDateLabel: 'الإصدار 1.0',
  languageNote:
    'اللغة الفرنسية هي اللغة المعتمدة قانونًا. في حال وجود أي تعارض مع هذه الترجمة، تُعتمد النسخة الفرنسية.',
  sections: [
    {
      heading: 'تمهيد',
      body: [
        'فايا (VAYA) ("المنصة"، "نحن") هي منصة رقمية تربط بين السائقين الذين لديهم مقاعد شاغرة في رحلة يقومون بها أصلًا لحسابهم الخاص ("السائقون") والأشخاص الراغبين في القيام بنفس الرحلة أو جزء منها ("الركاب")، وذلك لتقاسم تكاليف هذه الرحلة — وهي ممارسة تُعرف عمومًا بالنقل التشاركي (Covoiturage).',
        'بإنشائك حسابًا أو استخدامك للمنصة بأي شكل من الأشكال، فإنك توافق على الالتزام بشروط الاستخدام هذه وبسياسة الخصوصية الخاصة بفايا، التي تُعد جزءًا لا يتجزأ منها. إذا كنت لا توافق على هذه الشروط، يجب عليك عدم إنشاء حساب أو استخدام المنصة.',
      ],
    },
    {
      heading: '1. التعريفات',
      body: [
        'المنصة: تطبيق فايا للهاتف المحمول وجميع الخدمات الرقمية التي تُتيح الربط بين المستخدمين.',
        'السائق: عضو يقترح رحلة ويتقاسم تكاليفها مع راكب واحد أو أكثر، باستخدام مركبته الخاصة، في إطار تنقل يقوم به لحسابه الخاص.',
        'الراكب: عضو يحجز مقعدًا واحدًا أو أكثر في رحلة نشرها سائق.',
        'الرحلة: تنقل بمركبة ينشره سائق، ويتضمن نقطة الانطلاق والوجهة وتاريخ ووقت المغادرة وعدد المقاعد المتاحة والمساهمة لكل مقعد.',
        'المساهمة / المشاركة في التكاليف: المبلغ المحسوب والمحدد سقفه وفق المادة 4 أدناه، والذي يدفعه الراكب مباشرة إلى السائق مقابل مقعده. لا تُعد المساهمة بأي حال من الأحوال أجرة نقل، ولا تشكل ثمن بيع لخدمة نقل.',
        'رسوم خدمة فايا: المقابل الذي قد تتقاضاه فايا مقابل إتاحة المنصة — وهو منفصل ومستقل تمامًا عن المساهمة المدفوعة للسائق.',
      ],
    },
    {
      heading: '2. دور فايا — صفة الوسيط التقني',
      body: [
        'فايا ليست شركة نقل، وليست ناقلًا، ولا تعمل بصفة ناقل في أي وقت من الأوقات. فايا لا تملك ولا تُشغّل ولا تؤجر ولا تدير أي مركبة، ولا تُوظف أي سائق، ولا تقوم بنفسها بأي رحلة، ولا تلتزم تجاه أي عضو بأن رحلة ما ستتم فعليًا.',
        'يقتصر دور فايا على توفير أداة تقنية للربط بين المستخدمين والبحث عن المسارات وحساب مساهمة إرشادية والحجز والتقييم المتبادل والمراسلة بين الأعضاء.',
        'يُبرم عقد النقل، إن وُجد، حصريًا بين السائق والراكب (الركاب) — وليست فايا طرفًا فيه، وبالتالي فهي غير مسؤولة عن تنفيذ الرحلة أو إلغائها أو سلوك أي عضو (انظر المادة 12).',
        'يتوافق هذا التوصيف مع الممارسة المعتمدة من قبل منصات النقل التشاركي الدولية الرائدة، والتي أكدت المحاكم بشأنها أن مزود خدمة يقتصر دوره على الربط بين المستخدمين يُعامل كمزود خدمة لمجتمع المعلومات، وليس كناقل.',
      ],
    },
    {
      heading: '3. الأهلية وإنشاء الحساب',
      body: [
        'يقتصر استخدام فايا على الأشخاص الطبيعيين البالغين 18 سنة على الأقل، ممن يتمتعون بالأهلية القانونية الكاملة للتعاقد.',
        'لنشر رحلة بصفة سائق، يجب على العضو إضافة إلى ذلك أن يحمل رخصة سياقة سارية المفعول، وأن يكون مالكًا للمركبة المستخدمة أو حاصلًا على إذن مالكها لاستخدامها، وأن يحمل تأمينًا ساري المفعول للمركبة، وأن يكون قد أتم إجراء التحقق من الهوية المعتمد لدى فايا ("KYC"، المادة 10).',
        'لا يجوز لكل عضو أن يمتلك سوى حساب واحد. يُحظر إنشاء حسابات متعددة أو استخدام حساب باسم طرف ثالث دون موافقته (المادة 11).',
        'يلتزم العضو بتقديم معلومات دقيقة ومحدّثة.',
      ],
    },
    {
      heading: '4. تقاسم التكاليف — المبدأ الأساسي للنقل التشاركي',
      body: [
        'تُعد هذه المادة أهم بند في شروط الاستخدام هذه. فايا هي منصة نقل تشاركي، أي منصة لتقاسم تكاليف رحلة يقوم بها السائق أصلًا لحسابه الخاص — وليست أبدًا خدمة نقل تجارية، ولا خدمة نقل عند الطلب، ولا أي خدمة تُشبه سيارات الأجرة أو خدمات النقل الخاص بسائق.',
        'لا يجوز أن تتجاوز المساهمة التي يطلبها السائق بأي حال من الأحوال التكاليف الفعلية المتكبدة عن الرحلة، ولا أن تُحقق ربحًا. تقتصر التكاليف التي يمكن أخذها بعين الاعتبار على: الوقود، واستهلاك المركبة وصيانتها الدورية بالتناسب مع المسافة المقطوعة، ورسوم الطرق ومواقف السيارات المرتبطة مباشرة بالرحلة، وحصة معقولة من قسط التأمين. لا تشمل المساهمة بأي حال أجرة عن وقت القيادة، ولا أي هامش ربح.',
        'تحسب فايا وتعرض بشكل منهجي مساهمة مقترحة، إلى جانب حد أدنى وحد أقصى، استنادًا إلى المسافة والمدة الفعليتين للرحلة وتكاليف مرجعية تُراجَع دوريًا. لا يمكن للسائق تعديل سعره إلا ضمن هذا النطاق المحدد سقفه — وتُرفض تقنيًا أي محاولة لتحديد سعر خارج هذا النطاق من قبل المنصة.',
        'تحتفظ فايا بحق فرض رسوم خدمة إضافية ومنفصلة (المادة 7)، تُقابل الوصول إلى المنصة وليس الرحلة نفسها.',
        'يشكل عدم احترام السائق لهذا المبدأ إخلالًا جسيمًا قد يؤدي إلى تعليق حسابه أو حذفه (المادة 16).',
      ],
    },
    {
      heading: '5. التزامات السائق',
      body: [
        'يلتزم السائق بما يلي: نشر معلومات دقيقة عن رحلته؛ قيادة الرحلة بنفسه؛ الاحتفاظ الدائم برخصة سياقة سارية وتأمين ساري ومركبة في حالة جيدة؛ احترام قانون الطرقات التونسي؛ عدم طلب مساهمة تتجاوز النطاق الذي تحسبه المنصة؛ إبلاغ الركاب فورًا في حال الإلغاء والالتزام بسياسة الإلغاء لدى فايا؛ التحلي بسلوك محترم وخالٍ من التمييز.',
      ],
    },
    {
      heading: '6. التزامات الراكب',
      body: [
        'يلتزم الراكب بما يلي: الحضور إلى نقطة الالتقاء المتفق عليها في الوقت المحدد؛ دفع المساهمة المطابقة لحجزه مباشرة إلى السائق — لا تقوم فايا حاليًا بتحصيل أو حيازة أو تحويل أي مبلغ مالي بين الأعضاء؛ احترام المركبة والقواعد التي يضعها السائق؛ إبلاغ السائق فورًا في حال الإلغاء والالتزام بسياسة الإلغاء لدى فايا.',
      ],
    },
    {
      heading: '7. الحجز والدفع ورسوم خدمة فايا',
      body: [
        'يتم الحجز عبر المنصة، عند نقطة توقف يتم اختيارها من ضمن مجموعة محدودة من النقاط المعتمدة على طول المسار الفعلي للرحلة — لا تسمح فايا بإدخال نقطة التقاء عشوائية بحرية.',
        'لا تقوم فايا حاليًا بمعالجة أي عملية دفع بين الأعضاء. تُتبادل المساهمة مباشرة بين السائق والراكب، نقدًا أو بأي وسيلة أخرى يتفقان عليها، وقت الرحلة. فايا ليست وديعًا ولا ضامنًا ولا وسيطًا ماليًا لهذا المبلغ.',
        'تحتفظ فايا بحق استحداث رسوم خدمة تُفرض على الراكب و/أو السائق مستقبلًا، منفصلة عن المساهمة، بعد إعلام مسبق وواضح للأعضاء. لا توجد، بتاريخ هذه الشروط، أي رسوم خدمة مفعّلة.',
      ],
    },
    {
      heading: '8. الإلغاء والتغيب (عدم الحضور)',
      body: [
        'يمكن إلغاء الرحلات المؤكدة من قبل السائق أو الراكب في أي وقت قبل المغادرة، وفق سياسة فايا.',
        'تعتمد هذه السياسة على عواقب تتعلق بالسمعة (نقاط جزاء الموثوقية)، وليس على عقوبات مالية — إذ لا تقوم فايا حاليًا بمعالجة أي دفع بين الأعضاء، وبالتالي لا يوجد أي مبلغ يتوجب استرداده.',
        'يُعد التغيب دون إبلاغ إخلالًا أكثر جسامة من الإلغاء المتأخر، ويترتب عليه جزاء موثوقية أكبر وتقييم تلقائي منخفض.',
      ],
    },
    {
      heading: '9. نظام التقييم والثقة',
      body: [
        'في نهاية كل رحلة، يمكن للسائق والراكب تقييم بعضهما البعض، خلال مهلة محددة بعد الرحلة. تساهم التقييمات في مستوى ثقة يُعرض علنًا على الملف الشخصي لكل عضو، ويكون مرئيًا قبل أي حجز.',
        'تبقى التعليقات التفصيلية مرئية فقط لطرفي الرحلة المعنية. يجب أن يعكس كل تقييم تجربة حقيقية وصادقة.',
      ],
    },
    {
      heading: '10. التحقق من الهوية (KYC) والوثائق',
      body: [
        'يجب على كل عضو يرغب في أن يصبح سائقًا أن يخضع لإجراء التحقق من الهوية، الذي يشمل التقاط صورة مباشرة للوجه ("سيلفي")، ورخصة السياقة، وشهادة التأمين. لا تقبل فايا سوى الوثائق الملتقطة مباشرة عبر كاميرا التطبيق — ولا تقبل أبدًا استيرادها من معرض صور موجود مسبقًا.',
        'تُعد هذه البيانات بيانات شخصية حساسة. تخضع معالجتها لموافقة صريحة ومستنيرة من العضو (انظر المادة 15 وسياسة الخصوصية).',
        'تحتفظ فايا بحق رفض أو تعليق أو سحب صفة السائق الموثّق من أي عضو تبدو وثائقه مزوّرة أو منتهية الصلاحية أو لا تطابق هويته.',
      ],
    },
    {
      heading: '11. السلوكيات المحظورة',
      body: [
        'يُحظر منعًا باتًا: ممارسة نشاط نقل مدفوع الأجر بالمعنى التجاري تحت غطاء النقل التشاركي؛ إنشاء حسابات متعددة أو انتحال هوية الغير؛ نشر معلومات كاذبة أو احتيالية؛ أي تحرش أو تهديد أو تمييز أو ألفاظ مسيئة؛ أي محاولة للالتفاف على آليات الأمان أو التحقق في المنصة؛ استخدام المنصة لأغراض غير قانونية؛ وأي استخراج أو إعادة استخدام آلي غير مصرح به لمحتوى المنصة.',
        'قد يؤدي أي إخلال بهذه المادة، دون إشعار مسبق، إلى تعليق حساب العضو المعني أو حذفه، وكذلك إلى إبلاغ السلطات المختصة عند الاقتضاء.',
      ],
    },
    {
      heading: '12. المسؤولية وحدودها',
      body: [
        'تماشيًا مع دورها كوسيط تقني، لا تتحمل فايا مسؤولية دقة المعلومات التي ينشرها عضو، ولا إلغاء رحلة أو تعديلها، ولا سلوك أي عضو، ولا حالة المركبة المستخدمة أو صلاحية تأمينها.',
        'لا تستبعد هذه الحدود مسؤولية فايا في حال ثبوت خطأ يُعزى مباشرة إلى عطل تقني في المنصة، كما لا تمس بالحقوق الآمرة المقررة للمستهلكين بموجب القانون عدد 117 لسنة 1992 المتعلق بحماية المستهلك.',
      ],
    },
    {
      heading: '13. التأمين — عدم وجود ضمان من فايا',
      body: [
        'لا تقدم فايا ولا تبيع ولا تكتتب في أي منتج تأمين بنفسها. يبقى تأمين المركبة الذي يكتتب فيه السائق هو التغطية الوحيدة المعمول بها في حال وقوع حادث. يقع على عاتق كل سائق التحقق من أن وثيقة تأمينه تغطي نقل الركاب في إطار النقل التشاركي.',
      ],
    },
    {
      heading: '14. الملكية الفكرية',
      body: [
        'جميع عناصر المنصة (العلامة، الشعار، الواجهة، قاعدة البيانات، الشيفرة المصدرية) محمية بموجب قانون الملكية الفكرية وتبقى ملكًا حصريًا لفايا أو للجهات المرخِّصة لها.',
      ],
    },
    {
      heading: '15. البيانات الشخصية',
      body: [
        'تُوصف معالجة البيانات الشخصية للأعضاء، بما في ذلك البيانات البيومترية المجمّعة أثناء التحقق من الهوية، بشكل كامل في سياسة الخصوصية الخاصة بفايا، التي تُعد جزءًا لا يتجزأ من شروط الاستخدام هذه، وتُفصّل على وجه الخصوص حقوقكم في الوصول والتصحيح والاعتراض والحذف.',
      ],
    },
    {
      heading: '16. تعليق الحساب وإنهاؤه وحذفه',
      body: [
        'يمكن لفايا تعليق وصول أي عضو إلى المنصة في أي وقت ودون إشعار مسبق، في حال حدوث إخلال جسيم أو متكرر بهذه الشروط، أو ثبوت احتيال أو الاشتباه فيه، أو تلقي بلاغ جدي من عضو آخر.',
        'يمكن لأي عضو أن يطلب حذف حسابه مباشرة من داخل التطبيق (الملف الشخصي ← الشروط والخصوصية ← حذف حسابي).',
        'حفاظًا على الالتزامات التي تعهد بها العضو تجاه أعضاء آخرين، يُرفض طلب الحذف طالما كان للعضو حجز نشط بصفته راكبًا، أو رحلة منشورة وغير منتهية بصفته سائقًا.',
        'فور تنفيذ الحذف، تقوم فايا بإخفاء هوية بيانات التعريف المباشر للعضو بشكل نهائي لا رجعة فيه، وتمحو وثائق التحقق من هويته. تُحفظ البيانات الضرورية فقط لصون الالتزامات المتعهد بها تجاه أعضاء آخرين بصيغة مجهّلة الهوية حصرًا. التفاصيل الكاملة واردة في سياسة الخصوصية، قسم "حذف الحساب".',
        'يُعد حذف الحساب نهائيًا ولا يمكن التراجع عنه بعد تنفيذه.',
      ],
    },
    {
      heading: '17. الإطار التنظيمي التونسي وتطور الخدمة',
      body: [
        'يقر العضو بأن تونس لا تملك، حتى تاريخه، إطارًا قانونيًا خاصًا بالنقل التشاركي. تُشغّل فايا خدمتها للنقل التشاركي وفق مبدأ تقاسم التكاليف دون هدف الربح الموصوف في المادة 4، بما يتماشى مع المعايير المعترف بها دوليًا في مجال النقل التشاركي.',
        'تحتفظ فايا بحق تكييف كيفيات الخدمة في أي وقت (بما في ذلك طريقة حساب المساهمة، أو الحدود المعمول بها، أو توفر الخدمة في بعض المناطق) للامتثال لأي تطور في الإطار القانوني أو التنظيمي التونسي المعمول به على النقل التشاركي أو نقل الأشخاص.',
      ],
    },
    {
      heading: '18. تعديل شروط الاستخدام',
      body: [
        'يجوز لفايا تعديل شروط الاستخدام هذه في أي وقت. يُبلَّغ الأعضاء بأي تعديل جوهري قبل دخوله حيز التنفيذ. يُعد استمرار استخدام المنصة بعد دخول الشروط المعدَّلة حيز التنفيذ بمثابة قبول لها.',
      ],
    },
    {
      heading: '19. القانون المعمول به والاختصاص القضائي',
      body: [
        'تخضع شروط الاستخدام هذه للقانون التونسي، ولا سيما مجلة الالتزامات والعقود. يعود الاختصاص الحصري في أي نزاع إلى المحاكم التونسية، مع مراعاة قواعد الاختصاص الترابي الآمرة المقررة في قانون حماية المستهلك التونسي.',
      ],
    },
    {
      heading: '20. الاتصال بنا',
      body: [
        'لأي استفسار بخصوص شروط الاستخدام هذه: contact@vaya.tn',
        'لأي استفسار بخصوص بياناتكم الشخصية: privacy@vaya.tn',
      ],
    },
  ],
};

export const TERMS_CONTENT: Record<SupportedLocale, LegalDocument> = { fr, en, ar };
