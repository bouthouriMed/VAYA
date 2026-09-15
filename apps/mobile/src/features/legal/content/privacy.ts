import type { SupportedLocale } from '@vaya/config';
import type { LegalDocument } from './types';

/**
 * In-app rendering of VAYA's Privacy Policy. French is the canonical,
 * governing text — see `docs/legal/privacy-policy.md` and
 * `docs/legal/README.md` (governing-language note + legal-review status,
 * including the still-open INPDP declaration/authorization action items).
 */
const fr: LegalDocument = {
  title: 'Politique de confidentialité',
  version: '1.0',
  effectiveDateLabel: 'Version 1.0',
  languageNote:
    'Langue faisant foi : français. En cas de divergence avec une traduction, la version française prévaut.',
  sections: [
    {
      heading: '1. Préambule et responsable du traitement',
      body: [
        "Cette politique décrit comment VAYA collecte, utilise, partage et protège les données à caractère personnel de ses utilisateurs (« Membres »), conformément à la loi organique n° 2004-63 du 27 juillet 2004 relative à la protection des données à caractère personnel.",
        'Le responsable du traitement est VAYA, joignable à privacy@vaya.tn pour toute question relative à vos données personnelles. Cette politique fait partie intégrante des Conditions Générales d\'Utilisation de VAYA.',
      ],
    },
    {
      heading: '2. Données collectées',
      body: [
        'Données fournies directement : nom complet, numéro de téléphone, adresse électronique, langue préférée, photographie de profil (facultative).',
        'Pour les Conducteurs uniquement — données de vérification d\'identité (« KYC ») : photographie du visage en direct (« selfie »), photographie du permis de conduire, photographie de l\'attestation d\'assurance, informations sur le véhicule. Ces photographies sont exclusivement capturées en direct par l\'appareil photo de l\'application — jamais importées depuis une galerie existante.',
        "Contenu des échanges dans la messagerie intégrée entre Membres ayant une Réservation en commun, et évaluations laissées après un Trajet.",
        "Données collectées automatiquement : localisation de départ/destination lors d'une recherche ou publication de Trajet ; position GPS en temps réel du Conducteur pendant un Trajet actif ; identifiant de l'appareil pour les notifications push ; journaux techniques et de diagnostic.",
        "VAYA ne collecte, à ce jour, aucune donnée de paiement : la Contribution est échangée directement entre Membres, hors de la Plateforme.",
      ],
    },
    {
      heading: '3. Finalités et bases légales du traitement',
      body: [
        "Création et gestion du compte (identité, téléphone) : exécution du contrat.",
        "Vérification d'identité du Conducteur (selfie, permis, assurance) : consentement explicite, donnée sensible.",
        "Mise en relation et réservation de Trajets, suivi en temps réel d'un Trajet actif, messagerie entre Membres d'une même Réservation, système d'évaluation : exécution du contrat.",
        "Notifications : exécution du contrat. Sécurité et prévention de la fraude, statistiques agrégées et anonymisées, diagnostics techniques : intérêt légitime.",
      ],
    },
    {
      heading: '4. Traitement des données biométriques et documents KYC',
      body: [
        "La photographie du visage capturée lors de la vérification d'identité constitue une donnée biométrique, catégorie de donnée sensible en droit tunisien. Son traitement repose sur le consentement explicite et éclairé du Membre, qui peut être retiré à tout moment (ce retrait entraînant l'impossibilité de conserver le statut de Conducteur vérifié).",
        "Cette photographie et les documents associés sont utilisés exclusivement pour vérifier l'identité du Conducteur et ne sont jamais communiqués à d'autres Membres ni utilisés à des fins de reconnaissance faciale à l'égard de tiers.",
        "Conformément au régime renforcé applicable au traitement de données biométriques, VAYA soumet ce traitement à l'autorisation préalable de l'Instance Nationale de Protection des Données Personnelles (INPDP), en sus de la déclaration générale de ses traitements. Le suivi de cette démarche est documenté à docs/legal/README.md.",
      ],
    },
    {
      heading: '5. Destinataires et sous-traitants des données',
      body: [
        "VAYA ne vend jamais les données personnelles de ses Membres. Un Passager voit le prénom, la note et le niveau de confiance d'un Conducteur avant de réserver ; un Conducteur voit l'identité d'un Passager ayant réservé chez lui. Le numéro de téléphone n'est jamais communiqué à un autre Membre via l'application.",
        "Des sous-traitants techniques (hébergement, envoi de SMS, stockage de fichiers, notifications push, suivi technique des erreurs) traitent certaines données sur instruction exclusive de VAYA et dans le cadre d'un engagement contractuel de confidentialité.",
        "Les données peuvent être communiquées aux autorités compétentes lorsque la loi l'exige ou dans le cadre d'une procédure judiciaire régulière.",
      ],
    },
    {
      heading: '6. Transferts de données hors de Tunisie',
      body: [
        "Certains sous-traitants techniques de VAYA sont susceptibles d'héberger tout ou partie des données en dehors du territoire tunisien. Conformément aux articles 47 et 50 à 52 de la loi organique n° 2004-63, un tel transfert fait l'objet d'une demande d'autorisation préalable auprès de l'INPDP, distincte de la déclaration générale des traitements. Le statut de cette démarche est suivi à docs/legal/README.md.",
      ],
    },
    {
      heading: '7. Durée de conservation',
      body: [
        "Compte actif : pendant toute la durée d'activité du compte. Documents KYC : pendant la durée du statut de Conducteur vérifié, puis effacés en cas de suppression du compte. Position GPS en temps réel : uniquement pendant la durée d'un Trajet actif. Journaux techniques : durée strictement nécessaire à la résolution des incidents. Données conservées à des fins probatoires en cas de litige : limitée à la durée strictement nécessaire, dans le respect des délais de prescription applicables.",
      ],
    },
    {
      heading: '8. Sécurité des données',
      body: [
        "VAYA met en œuvre des mesures techniques et organisationnelles raisonnables pour protéger les données personnelles : chiffrement des communications, contrôle d'accès aux seules personnes habilitées, journalisation des accès aux données sensibles. VAYA s'engage à informer les Membres concernés et l'INPDP, conformément à la réglementation applicable, en cas d'incident de sécurité affectant significativement leurs données.",
      ],
    },
    {
      heading: '9. Vos droits sur vos données',
      body: [
        "Conformément aux articles 32, 42 et 55 de la loi organique n° 2004-63, vous disposez d'un droit d'accès, d'un droit de rectification, d'un droit d'opposition, et d'un droit à l'effacement (suppression).",
        "Ces droits peuvent être exercés directement depuis l'application (Profil → Informations personnelles, ou Profil → Conditions et vie privée → Supprimer mon compte), ou en écrivant à privacy@vaya.tn. En cas de désaccord persistant, vous pouvez saisir l'Instance Nationale de Protection des Données Personnelles (INPDP).",
      ],
    },
    {
      heading: '10. Suppression de compte',
      body: [
        "Comment demander la suppression : depuis l'application, Profil → Conditions et vie privée → Supprimer mon compte. Une confirmation explicite est demandée, la suppression étant définitive.",
        "Quand la suppression peut être refusée : tant que le compte a une Réservation active (en attente ou acceptée) en tant que Passager, ou un Trajet publié et non terminé en tant que Conducteur. L'application indique ce blocage et invite à régulariser la situation avant de renouveler la demande.",
        "Ce qui est effacé : les données d'identification directe (nom, téléphone, adresse électronique, photographie de profil) sont irréversiblement anonymisées ; les documents KYC (selfie, permis, assurance) sont supprimés du stockage de fichiers ; toutes les sessions actives du compte sont immédiatement révoquées.",
        "Ce qui est conservé, et pourquoi : les enregistrements strictement nécessaires à la tenue des engagements pris envers d'autres Membres (existence d'une Réservation ou d'une évaluation passée) sont conservés sous forme anonymisée uniquement, sans qu'aucune donnée ne permette plus d'identifier le Membre supprimé — sauf obligation légale de conservation qui s'imposerait par ailleurs à VAYA, auquel cas seules les données strictement nécessaires sont conservées pour la durée strictement nécessaire.",
        "La suppression de compte est irréversible : un Membre souhaitant réutiliser VAYA après suppression doit créer un nouveau compte.",
      ],
    },
    {
      heading: '11. Mineurs',
      body: [
        "L'utilisation de VAYA n'est pas destinée aux personnes de moins de 18 ans. VAYA ne collecte pas sciemment de données concernant des mineurs ; si VAYA venait à en avoir connaissance, les données concernées seraient supprimées dans les meilleurs délais.",
      ],
    },
    {
      heading: '12. Modification de la présente politique',
      body: [
        "VAYA peut modifier la présente politique à tout moment. Toute modification substantielle est portée à la connaissance des Membres avant son entrée en vigueur.",
      ],
    },
    {
      heading: '13. Contact et réclamation',
      body: [
        'Pour exercer vos droits ou pour toute question relative à cette politique : privacy@vaya.tn',
        "Pour toute réclamation relative au traitement de vos données personnelles, vous pouvez également saisir l'Instance Nationale de Protection des Données Personnelles (INPDP).",
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Privacy Policy',
  version: '1.0',
  effectiveDateLabel: 'Version 1.0',
  languageNote:
    'The French version is the governing text. In case of any conflict with this translation, the French version prevails.',
  sections: [
    {
      heading: '1. Preamble and data controller',
      body: [
        'This policy describes how VAYA collects, uses, shares, and protects the personal data of its users ("Members"), in accordance with Organic Law No. 2004-63 of 27 July 2004 on the protection of personal data.',
        "The data controller is VAYA, reachable at privacy@vaya.tn for any question about your personal data. This policy forms an integral part of VAYA's Terms & Conditions.",
      ],
    },
    {
      heading: '2. Data collected',
      body: [
        'Data provided directly: full name, phone number, email address, preferred language, profile photo (optional).',
        'For Drivers only — identity verification ("KYC") data: a live facial photograph ("selfie"), a photograph of the driving licence, a photograph of the insurance certificate, and vehicle information. These photographs are captured exclusively live through the app\'s camera — never uploaded from an existing photo gallery.',
        'Content of messages exchanged in the in-app messaging between Members sharing a Booking, and ratings left after a Trip.',
        'Data collected automatically: departure/destination location when searching for or publishing a Trip; real-time GPS position of the Driver during an active Trip; device identifier for push notifications; technical and diagnostic logs.',
        'VAYA does not currently collect any payment data: the Contribution is exchanged directly between Members, outside the Platform.',
      ],
    },
    {
      heading: '3. Purposes and legal bases',
      body: [
        'Account creation and management (identity, phone): performance of the contract.',
        "Driver identity verification (selfie, licence, insurance): explicit consent, sensitive data.",
        'Matching and Trip booking, real-time tracking of an active Trip, messaging between Members sharing a Booking, rating system: performance of the contract.',
        'Notifications: performance of the contract. Security and fraud prevention, aggregated/anonymized statistics, technical diagnostics: legitimate interest.',
      ],
    },
    {
      heading: '4. Processing of biometric data and KYC documents',
      body: [
        "The facial photograph captured during identity verification constitutes biometric data, a category of sensitive data under Tunisian law. Its processing relies on the Member's explicit, informed consent, which may be withdrawn at any time (withdrawal then makes it impossible to retain verified-Driver status).",
        'This photograph and the associated documents are used exclusively to verify the Driver\'s identity and are never shared with other Members nor used for facial-recognition purposes against third parties.',
        'In accordance with the enhanced regime applicable to biometric data processing, VAYA submits this processing to the prior authorization of the Instance Nationale de Protection des Données Personnelles (INPDP), in addition to the general declaration of its processing activities. The status of this process is tracked in docs/legal/README.md.',
      ],
    },
    {
      heading: '5. Recipients and data processors',
      body: [
        "VAYA never sells its Members' personal data. A Passenger sees a Driver's first name, rating, and trust level before booking; a Driver sees the identity of a Passenger who booked with them. A phone number is never shared with another Member through the app.",
        'Technical processors (hosting, SMS delivery, file storage, push notifications, technical error monitoring) process certain data solely on VAYA\'s instructions and under a contractual confidentiality commitment.',
        'Data may be shared with competent authorities where required by law or under a lawful judicial procedure.',
      ],
    },
    {
      heading: '6. Data transfers outside Tunisia',
      body: [
        'Some of VAYA\'s technical processors may host some or all data outside Tunisian territory. In accordance with Articles 47 and 50-52 of Organic Law No. 2004-63, such a transfer requires a separate prior authorization request to the INPDP, distinct from the general processing declaration. The status of this process is tracked in docs/legal/README.md.',
      ],
    },
    {
      heading: '7. Retention periods',
      body: [
        "Active account: for the entire duration the account is active. KYC documents: for the duration of verified-Driver status, then erased upon account deletion. Real-time GPS position: only for the duration of an active Trip. Technical logs: strictly as long as needed to resolve incidents. Data retained as evidence in the event of a dispute: limited to what is strictly necessary, within applicable limitation periods.",
      ],
    },
    {
      heading: '8. Data security',
      body: [
        'VAYA implements reasonable technical and organizational measures to protect personal data: encryption of communications, access control limited to authorized staff, and logging of access to sensitive data. VAYA commits to informing affected Members and the INPDP, in accordance with applicable regulation, in the event of a security incident significantly affecting their data.',
      ],
    },
    {
      heading: '9. Your rights over your data',
      body: [
        'In accordance with Articles 32, 42, and 55 of Organic Law No. 2004-63, you have a right of access, a right of rectification, a right to object, and a right to erasure (deletion).',
        'These rights can be exercised directly from the app (Profile → Personal information, or Profile → Terms & Privacy → Delete my account), or by writing to privacy@vaya.tn. In the event of a persistent disagreement, you may refer the matter to the Instance Nationale de Protection des Données Personnelles (INPDP).',
      ],
    },
    {
      heading: '10. Account deletion',
      body: [
        'How to request deletion: from the app, Profile → Terms & Privacy → Delete my account. Explicit confirmation is required, as deletion is final.',
        "When deletion may be declined: while the account has an active Booking (pending or accepted) as a Passenger, or a published, unfinished Trip as a Driver. The app clearly indicates this and invites you to resolve the situation before trying again.",
        "What is erased: directly identifying data (name, phone number, email address, profile photo) is irreversibly anonymized; KYC documents (selfie, licence, insurance) are deleted from file storage; all active sessions on the account are immediately revoked.",
        "What is retained, and why: records strictly necessary to honor commitments already made to other Members (the existence of a past Booking or rating, for example) are retained in anonymized form only — with no data left that could re-identify the deleted Member — unless a legal retention obligation otherwise applies to VAYA, in which case only the data strictly necessary for that obligation is retained, for the strictly necessary duration.",
        'Account deletion is irreversible: a Member wishing to use VAYA again after deletion must create a new account.',
      ],
    },
    {
      heading: '11. Minors',
      body: [
        'VAYA is not intended for use by persons under 18. VAYA does not knowingly collect data about minors; should VAYA become aware of any, the data concerned would be deleted promptly.',
      ],
    },
    {
      heading: '12. Changes to this policy',
      body: [
        'VAYA may amend this policy at any time. Any material change is communicated to Members before it takes effect.',
      ],
    },
    {
      heading: '13. Contact and complaints',
      body: [
        'To exercise your rights or for any question about this policy: privacy@vaya.tn',
        'For any complaint about the processing of your personal data, you may also refer the matter to the Instance Nationale de Protection des Données Personnelles (INPDP).',
      ],
    },
  ],
};

const ar: LegalDocument = {
  title: 'سياسة الخصوصية',
  version: '1.0',
  effectiveDateLabel: 'الإصدار 1.0',
  languageNote:
    'اللغة الفرنسية هي اللغة المعتمدة قانونًا. في حال وجود أي تعارض مع هذه الترجمة، تُعتمد النسخة الفرنسية.',
  sections: [
    {
      heading: '1. تمهيد والجهة المسؤولة عن المعالجة',
      body: [
        'تصف هذه السياسة كيفية جمع فايا واستخدامها ومشاركتها وحمايتها للبيانات الشخصية لمستخدميها ("الأعضاء")، وفقًا للقانون الأساسي عدد 63 لسنة 2004 المؤرخ في 27 جويلية 2004 المتعلق بحماية المعطيات الشخصية.',
        'الجهة المسؤولة عن المعالجة هي فايا، ويمكن التواصل معها عبر privacy@vaya.tn لأي استفسار بخصوص بياناتكم الشخصية. تُعد هذه السياسة جزءًا لا يتجزأ من شروط استخدام فايا.',
      ],
    },
    {
      heading: '2. البيانات المجمّعة',
      body: [
        'البيانات المقدَّمة مباشرة: الاسم الكامل، رقم الهاتف، البريد الإلكتروني، اللغة المفضّلة، صورة الملف الشخصي (اختيارية).',
        'للسائقين فقط — بيانات التحقق من الهوية ("KYC"): صورة مباشرة للوجه ("سيلفي")، صورة رخصة السياقة، صورة شهادة التأمين، ومعلومات المركبة. تُلتقط هذه الصور حصريًا مباشرة عبر كاميرا التطبيق — ولا تُستورد أبدًا من معرض صور موجود مسبقًا.',
        'محتوى الرسائل المتبادلة عبر المراسلة الداخلية بين الأعضاء المشتركين في حجز واحد، والتقييمات المُدرجة بعد كل رحلة.',
        'بيانات تُجمع تلقائيًا: موقع الانطلاق/الوجهة عند البحث عن رحلة أو نشرها؛ الموقع الجغرافي للسائق في الوقت الفعلي أثناء رحلة نشطة؛ معرّف الجهاز لأغراض الإشعارات؛ سجلات تقنية وتشخيصية.',
        'لا تجمع فايا حاليًا أي بيانات متعلقة بالدفع: تُتبادل المساهمة مباشرة بين الأعضاء، خارج نطاق المنصة.',
      ],
    },
    {
      heading: '3. الأغراض والأسس القانونية للمعالجة',
      body: [
        'إنشاء الحساب وإدارته (الهوية، الهاتف): تنفيذ العقد.',
        'التحقق من هوية السائق (السيلفي، الرخصة، التأمين): الموافقة الصريحة، بيانات حساسة.',
        'الربط بين المستخدمين وحجز الرحلات، والتتبع في الوقت الفعلي لرحلة نشطة، والمراسلة بين أعضاء نفس الحجز، ونظام التقييم: تنفيذ العقد.',
        'الإشعارات: تنفيذ العقد. الأمان والوقاية من الاحتيال، والإحصائيات المجمّعة وغير القابلة لتحديد الهوية، والتشخيص التقني: المصلحة المشروعة.',
      ],
    },
    {
      heading: '4. معالجة البيانات البيومترية ووثائق التحقق',
      body: [
        'تُعد صورة الوجه الملتقطة أثناء التحقق من الهوية بيانات بيومترية، وهي فئة من البيانات الحساسة بموجب القانون التونسي. تخضع معالجتها لموافقة صريحة ومستنيرة من العضو، يمكن سحبها في أي وقت (مع العلم أن هذا السحب يؤدي إلى استحالة الاحتفاظ بصفة السائق الموثّق).',
        'تُستخدم هذه الصورة والوثائق المرفقة حصريًا للتحقق من هوية السائق، ولا تُشارك أبدًا مع أعضاء آخرين ولا تُستخدم لأغراض التعرف على الوجه تجاه أطراف ثالثة.',
        'وفقًا للنظام المشدّد المعمول به بخصوص معالجة البيانات البيومترية، تُخضع فايا هذه المعالجة للحصول على ترخيص مسبق من الهيئة الوطنية لحماية المعطيات الشخصية (INPDP)، إضافة إلى التصريح العام بعمليات المعالجة. يُتابَع وضع هذا الإجراء في docs/legal/README.md.',
      ],
    },
    {
      heading: '5. الجهات المتلقية للبيانات ومعالجوها',
      body: [
        'لا تبيع فايا أبدًا البيانات الشخصية لأعضائها. يرى الراكب الاسم الأول للسائق وتقييمه ومستوى الثقة به قبل الحجز؛ ويرى السائق هوية الراكب الذي حجز لديه. لا يُشارَك رقم الهاتف أبدًا مع عضو آخر عبر التطبيق.',
        'يقوم معالجو بيانات تقنيون (الاستضافة، إرسال الرسائل النصية، تخزين الملفات، الإشعارات، المتابعة التقنية للأعطال) بمعالجة بعض البيانات بناءً على تعليمات فايا حصرًا وبموجب التزام تعاقدي بالسرية.',
        'يمكن مشاركة البيانات مع السلطات المختصة عندما يقتضي القانون ذلك أو في إطار إجراء قضائي قانوني.',
      ],
    },
    {
      heading: '6. نقل البيانات خارج تونس',
      body: [
        'قد يستضيف بعض معالجي البيانات التقنيين لدى فايا كل أو جزءًا من البيانات خارج التراب التونسي. وفقًا للفصول 47 و50 إلى 52 من القانون الأساسي عدد 63 لسنة 2004، يخضع مثل هذا النقل لطلب ترخيص مسبق لدى الهيئة الوطنية لحماية المعطيات الشخصية (INPDP)، منفصل عن التصريح العام بعمليات المعالجة. يُتابَع وضع هذا الإجراء في docs/legal/README.md.',
      ],
    },
    {
      heading: '7. مدة الاحتفاظ بالبيانات',
      body: [
        'الحساب النشط: طيلة مدة نشاط الحساب. وثائق التحقق: طيلة مدة صفة السائق الموثّق، ثم تُمحى عند حذف الحساب. الموقع الجغرافي في الوقت الفعلي: فقط أثناء مدة الرحلة النشطة. السجلات التقنية: للمدة الضرورية فقط لحل الأعطال. البيانات المحفوظة لأغراض إثباتية في حال نزاع: محدودة بالمدة الضرورية فقط، مع مراعاة آجال التقادم المعمول بها.',
      ],
    },
    {
      heading: '8. أمن البيانات',
      body: [
        'تعتمد فايا تدابير تقنية وتنظيمية معقولة لحماية البيانات الشخصية: تشفير الاتصالات، تقييد الوصول للأشخاص المخوّلين فقط، وتسجيل عمليات الوصول إلى البيانات الحساسة. تلتزم فايا بإعلام الأعضاء المعنيين والهيئة الوطنية لحماية المعطيات الشخصية، وفقًا للتنظيم المعمول به، في حال وقوع حادثة أمنية تؤثر بشكل جوهري على بياناتهم.',
      ],
    },
    {
      heading: '9. حقوقكم على بياناتكم',
      body: [
        'وفقًا للفصول 32 و42 و55 من القانون الأساسي عدد 63 لسنة 2004، لكم الحق في الوصول إلى بياناتكم، وفي تصحيحها، وفي الاعتراض على معالجتها، وفي محوها (حذفها).',
        'يمكن ممارسة هذه الحقوق مباشرة من داخل التطبيق (الملف الشخصي ← المعلومات الشخصية، أو الملف الشخصي ← الشروط والخصوصية ← حذف حسابي)، أو بمراسلة privacy@vaya.tn. في حال استمرار الخلاف، يمكنكم عرض الأمر على الهيئة الوطنية لحماية المعطيات الشخصية (INPDP).',
      ],
    },
    {
      heading: '10. حذف الحساب',
      body: [
        'كيفية طلب الحذف: من داخل التطبيق، الملف الشخصي ← الشروط والخصوصية ← حذف حسابي. يُطلب تأكيد صريح قبل الحذف، كون العملية نهائية.',
        'متى يمكن رفض طلب الحذف: طالما كان للحساب حجز نشط (قيد الانتظار أو مقبول) بصفة راكب، أو رحلة منشورة وغير منتهية بصفة سائق. يوضح التطبيق هذا المانع ويدعوكم إلى تسوية الوضع قبل إعادة تقديم الطلب.',
        'ما الذي يُمحى: بيانات التعريف المباشر (الاسم، رقم الهاتف، البريد الإلكتروني، صورة الملف الشخصي) تُخفى هويتها بشكل نهائي لا رجعة فيه؛ وثائق التحقق (السيلفي، الرخصة، التأمين) تُحذف من مساحة التخزين؛ وتُلغى فورًا جميع الجلسات النشطة المرتبطة بالحساب.',
        'ما الذي يُحفظ، ولماذا: تُحفظ السجلات الضرورية فقط لصون الالتزامات المتعهد بها تجاه أعضاء آخرين (وجود حجز أو تقييم سابق، على سبيل المثال) بصيغة مجهّلة الهوية حصرًا — دون أي بيانات قد تسمح بإعادة التعرف على العضو المحذوف — إلا في حال وجود التزام قانوني بالاحتفاظ يقع على عاتق فايا، وعندها تُحفظ فقط البيانات الضرورية لذلك الالتزام وللمدة الضرورية فقط.',
        'يُعد حذف الحساب نهائيًا لا رجعة فيه: على العضو الراغب في استخدام فايا مجددًا بعد الحذف إنشاء حساب جديد.',
      ],
    },
    {
      heading: '11. القُصّر',
      body: [
        'لا يُوجَّه استخدام فايا للأشخاص دون سن 18 عامًا. لا تجمع فايا عن قصد أي بيانات تخص القُصّر؛ وفي حال علمها بذلك، تُحذف البيانات المعنية في أقرب الآجال.',
      ],
    },
    {
      heading: '12. تعديل هذه السياسة',
      body: [
        'يجوز لفايا تعديل هذه السياسة في أي وقت. يُبلَّغ الأعضاء بأي تعديل جوهري قبل دخوله حيز التنفيذ.',
      ],
    },
    {
      heading: '13. الاتصال والشكاوى',
      body: [
        'لممارسة حقوقكم أو لأي استفسار بخصوص هذه السياسة: privacy@vaya.tn',
        'لأي شكوى تتعلق بمعالجة بياناتكم الشخصية، يمكنكم أيضًا عرض الأمر على الهيئة الوطنية لحماية المعطيات الشخصية (INPDP).',
      ],
    },
  ],
};

export const PRIVACY_CONTENT: Record<SupportedLocale, LegalDocument> = { fr, en, ar };
