/** Browser bootstrap only; application selection and error recovery live in application/. */
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "./shared/i18n/i18n";
import ApplicationRouter from "./application/ApplicationRouter";
createRoot(document.getElementById("root")!).render(
  <LocaleProvider>
    <ApplicationRouter />
  </LocaleProvider>,
);
