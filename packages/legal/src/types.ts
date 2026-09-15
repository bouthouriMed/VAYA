export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  version: string;
  effectiveDateLabel: string;
  languageNote: string;
  sections: LegalSection[];
}
