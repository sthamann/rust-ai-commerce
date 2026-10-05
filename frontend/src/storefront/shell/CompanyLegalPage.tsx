/** Directly reachable channel legal page; renders only the server's explicit public projection as text. */
import {
  useCompanyText,
  type CompanyWord,
} from "../../shared/i18n/company-i18n";
import { useStorefront } from "./StorefrontContext";
export default function CompanyLegalPage() {
  const { company } = useStorefront(),
    { co } = useCompanyText();
  const fields: CompanyWord[] = [
    "legalForm",
    "managingDirectors",
    "legalRepresentatives",
    "registerType",
    "registrationNumber",
    "registerCourt",
    "vatId",
    "economicId",
    "email",
    "phoneNumber",
    "website",
    "contentResponsible",
    "contentResponsibleAddress",
    "responsibilityScope",
    "supervisoryAuthority",
    "professionalChamber",
    "professionalTitle",
    "professionalCountry",
    "professionalRulesUrl",
    "shareCapital",
    "outstandingCapital",
    "liquidationNotice",
  ];
  return (
    <main className="shop-content company-legal-page">
      <h1>{co("legalPage")}</h1>
      <h2>{company.name}</h2>
      <p>{company.address}</p>
      <dl>
        {fields
          .filter((f) => company[f])
          .map((f) => (
            <div key={f}>
              <dt>{co(f)}</dt>
              <dd>{company[f]}</dd>
            </div>
          ))}
      </dl>
      {company.legalNotice && (
        <p className="company-legal-text">{company.legalNotice}</p>
      )}
    </main>
  );
}
