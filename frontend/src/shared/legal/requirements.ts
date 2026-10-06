/** Source-backed requirement catalogue; operational applicability is reviewed, never inferred as legal certification. */
export const requirements = [
  {
    id: "privacy",
    sectors: [],
    source: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
    text: [
      "GDPR: purposes, legal bases, processors, transfers, retention and data-subject rights.",
      "DSGVO: Zwecke, Rechtsgrundlagen, Auftragsverarbeiter, Transfers, Aufbewahrung und Betroffenenrechte.",
      "RGPD : finalités, bases légales, sous-traitants, transferts, conservation et droits.",
      "RGPD: finalidades, bases legales, encargados, transferencias, conservación y derechos.",
    ],
  },
  {
    id: "cookies",
    sectors: [],
    source:
      "https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf",
    text: [
      "Optional tracking requires an affirmative choice; refusal and withdrawal must remain easy.",
      "Optionales Tracking braucht eine aktive Auswahl; Ablehnen und Widerrufen müssen einfach bleiben.",
      "Le suivi facultatif requiert un accord actif ; refus et retrait doivent être simples.",
      "El seguimiento opcional exige elección activa; rechazar y retirar debe ser fácil.",
    ],
  },
  {
    id: "consumer",
    sectors: [],
    source:
      "https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm",
    text: [
      "B2C: seller identity, total price, delivery, contract information, guarantees and withdrawal. B2B differs.",
      "B2C: Anbieteridentität, Gesamtpreis, Lieferung, Vertragsinformationen, Gewährleistung und Widerruf. B2B unterscheidet sich.",
      "B2C : vendeur, prix total, livraison, contrat, garanties et rétractation. Le B2B diffère.",
      "B2C: vendedor, precio total, entrega, contrato, garantías y desistimiento. B2B difiere.",
    ],
  },
  {
    id: "withdrawal",
    sectors: [],
    source: "https://eur-lex.europa.eu/eli/dir/2023/2673/oj/eng",
    text: [
      "Online withdrawal function from 19 June 2026; confirm receipt on a durable medium. Review national implementation and exceptions.",
      "Online-Widerrufsfunktion ab 19. Juni 2026; Eingang auf dauerhaftem Datenträger bestätigen. Nationale Umsetzung und Ausnahmen prüfen.",
      "Fonction de rétractation en ligne dès le 19 juin 2026 ; confirmation durable. Vérifiez les règles nationales et exceptions.",
      "Función de desistimiento online desde el 19 de junio de 2026; confirmación duradera. Revisa normas nacionales y excepciones.",
    ],
  },
  {
    id: "prices",
    sectors: [],
    source:
      "https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-pricing/index_en.htm",
    text: [
      "Gross totals, unit prices where required, and genuine 30-day lowest prior prices for announced reductions.",
      "Brutto-Gesamtpreise, erforderliche Grundpreise und echte niedrigste 30-Tage-Preise bei angekündigten Reduzierungen.",
      "Prix TTC, prix unitaires requis et véritable prix le plus bas sur 30 jours pour les réductions.",
      "Precios brutos, precios unitarios requeridos y precio mínimo real de 30 días en reducciones.",
    ],
  },
  {
    id: "reviews",
    sectors: [],
    source:
      "https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-commercial-practices/index_en.htm",
    text: [
      "Disclose how reviews are verified; no invented reviews, deceptive discounts or unsupported environmental claims.",
      "Bewertungsprüfung erklären; keine erfundenen Bewertungen, irreführenden Rabatte oder unbelegten Umweltaussagen.",
      "Expliquez la vérification des avis ; aucun faux avis, remise trompeuse ou allégation écologique sans preuve.",
      "Explica cómo verificas reseñas; sin reseñas falsas, descuentos engañosos ni alegaciones ambientales sin pruebas.",
    ],
  },
  {
    id: "accessibility",
    sectors: [],
    source:
      "https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/accessibility/index_en.htm",
    text: [
      "EAA e-commerce accessibility from June 2025, including identification and payments; assess exemptions and document any justified exception.",
      "EAA-Barrierefreiheit seit Juni 2025, einschließlich Identifikation und Zahlung; Ausnahmen prüfen und begründet dokumentieren.",
      "Accessibilité EAA depuis juin 2025, identification et paiement inclus ; vérifiez et documentez les exceptions.",
      "Accesibilidad EAA desde junio de 2025, incluida identificación y pago; revisa y documenta excepciones.",
    ],
  },
  {
    id: "safety",
    sectors: [
      "general",
      "textiles",
      "cosmetics",
      "electronics",
      "ageRestricted",
    ],
    source: "https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng",
    text: [
      "GPSR online offers: manufacturer/contact, EU responsible person when applicable, identification and market-language warnings. Some sectors have special regimes.",
      "GPSR-Onlineangebote: Hersteller/Kontakt, ggf. EU-Verantwortlicher, Identifikation und Warnhinweise in Marktsprache. Für manche Branchen gelten Sonderregime.",
      "GPSR : fabricant/contact, responsable UE si requis, identification et avertissements dans la langue du marché. Régimes sectoriels possibles.",
      "GPSR: fabricante/contacto, responsable UE si procede, identificación y advertencias en idioma del mercado. Hay regímenes sectoriales.",
    ],
  },
  {
    id: "textiles",
    sectors: ["textiles"],
    source: "https://eur-lex.europa.eu/eli/reg/2011/1007/oj",
    text: [
      "Textile fibre composition and non-textile parts of animal origin, including online purchase information.",
      "Textilfaserzusammensetzung und nichttextile Teile tierischen Ursprungs, auch vor dem Onlinekauf.",
      "Composition des fibres et parties non textiles d’origine animale, aussi avant achat en ligne.",
      "Composición de fibras y partes no textiles de origen animal, también antes de comprar online.",
    ],
  },
  {
    id: "food",
    sectors: ["food"],
    source: "https://eur-lex.europa.eu/eli/reg/2011/1169/oj",
    text: [
      "Food information before purchase: ingredients/allergens, quantities, nutrition and operator details as applicable; supplements/claims need further review.",
      "Lebensmittelinformationen vor Kauf: Zutaten/Allergene, Mengen, Nährwerte und Betreiberangaben soweit anwendbar; Ergänzungsmittel/Claims gesondert prüfen.",
      "Informations alimentaires préalables : ingrédients/allergènes, quantité, nutrition et exploitant selon le cas ; compléments/allégations à vérifier.",
      "Información alimentaria previa: ingredientes/alérgenos, cantidad, nutrición y operador según corresponda; revisar suplementos y alegaciones.",
    ],
  },
  {
    id: "cosmetics",
    sectors: ["cosmetics"],
    source: "https://eur-lex.europa.eu/eli/reg/2009/1223/oj",
    text: [
      "Cosmetics: responsible person, safety assessment, notification, ingredients and product-specific warnings. Product legality is not established by a form.",
      "Kosmetik: verantwortliche Person, Sicherheitsbewertung, Notifizierung, Inhaltsstoffe und produktspezifische Hinweise. Ein Formular beweist keine Verkehrsfähigkeit.",
      "Cosmétiques : responsable, sécurité, notification, ingrédients et avertissements. Un formulaire ne prouve pas la légalité.",
      "Cosméticos: responsable, seguridad, notificación, ingredientes y advertencias. Un formulario no demuestra legalidad.",
    ],
  },
  {
    id: "electronics",
    sectors: ["electronics"],
    source:
      "https://europa.eu/youreurope/business/product-requirements/labels-markings/ce-marking/index_en.htm",
    text: [
      "Electronics: applicable CE/conformity, WEEE/battery obligations, energy labels/product sheets and country producer registrations.",
      "Elektronik: anwendbare CE/Konformität, Elektro-/Batteriepflichten, Energielabel/Datenblätter und nationale Herstellerregistrierungen.",
      "Électronique : CE/conformité applicable, DEEE/batteries, énergie/fiches et inscriptions nationales.",
      "Electrónica: CE/conformidad aplicable, RAEE/baterías, etiquetas/fichas energéticas y registros nacionales.",
    ],
  },
  {
    id: "ageRestricted",
    sectors: ["ageRestricted"],
    source: "https://eur-lex.europa.eu/eli/dir/2014/40/oj",
    text: [
      "Alcohol/tobacco and other restricted goods: country-specific age, advertising, distance-sale and delivery controls. A checkbox is not age verification.",
      "Alkohol/Tabak und weitere beschränkte Waren: nationale Alters-, Werbe-, Fernabsatz- und Lieferregeln. Eine Checkbox ist keine Altersprüfung.",
      "Alcool/tabac : règles nationales d’âge, publicité, vente et livraison. Une case n’est pas une vérification d’âge.",
      "Alcohol/tabaco: reglas nacionales de edad, publicidad, venta y entrega. Una casilla no verifica edad.",
    ],
  },
  {
    id: "digital",
    sectors: ["digital"],
    source: "https://eur-lex.europa.eu/eli/dir/2019/770/oj",
    text: [
      "Digital content: functionality/compatibility, update and conformity duties; immediate delivery requires separate express request and loss-of-withdrawal acknowledgement where applicable.",
      "Digitale Inhalte: Funktion/Kompatibilität, Updates und Vertragsmäßigkeit; Sofortbereitstellung braucht ggf. gesondertes Verlangen und Bestätigung zum Widerrufsverlust.",
      "Contenu numérique : compatibilité, mises à jour et conformité ; fourniture immédiate avec demande expresse et reconnaissance si requis.",
      "Contenido digital: compatibilidad, actualizaciones y conformidad; entrega inmediata con solicitud expresa y reconocimiento si procede.",
    ],
  },
  {
    id: "subscriptions",
    sectors: ["subscriptions"],
    source: "https://www.gesetze-im-internet.de/bgb/__312k.html",
    text: [
      "Recurring contracts: duration, renewal and termination; German cancellation-button rules and national differences need a dedicated subscription implementation.",
      "Dauerverträge: Laufzeit, Verlängerung und Kündigung; deutscher Kündigungsbutton und nationale Unterschiede brauchen eine eigene Abo-Implementierung.",
      "Abonnements : durée, renouvellement et résiliation ; règles nationales et bouton allemand nécessitent une implémentation dédiée.",
      "Suscripciones: duración, renovación y cancelación; las reglas nacionales requieren implementación específica.",
    ],
  },
  {
    id: "regulated",
    sectors: ["regulated"],
    source:
      "https://europa.eu/youreurope/business/product-requirements/compliance/index_en.htm",
    text: [
      "Medical, pharmaceutical and regulated services require sector permissions, evidence and country review; unsupported regulated selling must not be enabled by this profile alone.",
      "Medizinische, pharmazeutische und regulierte Dienste benötigen Zulassungen, Nachweise und Länderprüfung; dieses Profil allein schaltet keinen rechtssicheren Verkauf frei.",
      "Services médicaux/pharmaceutiques : autorisations, preuves et examen national ; ce profil seul ne permet pas la vente conforme.",
      "Servicios médicos/farmacéuticos: permisos, pruebas y revisión nacional; este perfil no autoriza venta conforme.",
    ],
  },
  {
    id: "packaging",
    sectors: [],
    source:
      "https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en",
    text: [
      "Packaging/EPR: market registrations and reporting; PPWR provisions apply in phases from August 2026. Check each obligation’s own effective date.",
      "Verpackung/EPR: Marktregistrierungen und Meldungen; PPWR-Pflichten gelten gestaffelt seit August 2026. Für jede Pflicht den eigenen Starttermin prüfen.",
      "Emballages/REP : inscriptions et déclarations ; PPWR par étapes dès août 2026. Vérifiez chaque date d’application.",
      "Envases/RAP: registros e informes; PPWR por fases desde agosto de 2026. Comprueba cada fecha de aplicación.",
    ],
  },
  {
    id: "ai",
    sectors: [],
    source:
      "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
    text: [
      "AI transparency: identify chatbot interaction, disclose automated personalized prices where applicable, review profiling and provider data transfers.",
      "KI-Transparenz: Chatbot-Interaktion kennzeichnen, ggf. automatisiert personalisierte Preise offenlegen, Profiling und Provider-Transfers prüfen.",
      "Transparence IA : identifier le chatbot, signaler les prix personnalisés automatisés si requis, vérifier profilage et transferts.",
      "Transparencia IA: identificar chatbot, informar precios personalizados automatizados si procede, revisar perfiles y transferencias.",
    ],
  },
  {
    id: "disputes",
    sectors: [],
    source: "https://consumer-redress.ec.europa.eu/site-relocation_en",
    text: [
      "Review national ADR information duties. The EU ODR platform closed on 20 July 2025; do not publish its obsolete link.",
      "Nationale Informationspflichten zur Streitbeilegung prüfen. Die EU-OS-Plattform wurde am 20. Juli 2025 geschlossen; keinen veralteten Link veröffentlichen.",
      "Vérifiez les obligations nationales de médiation. La plateforme RLL UE a fermé le 20 juillet 2025 ; aucun ancien lien.",
      "Revisa las obligaciones nacionales de resolución. La plataforma RLL UE cerró el 20 de julio de 2025; no publiques el enlace obsoleto.",
    ],
  },
] as const;
