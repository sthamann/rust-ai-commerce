/** Released native views use authorized bounded actions, typed writes and per-field content inheritance. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import NativeAppView from "../../src/shared/apps/native/NativeAppView";
import NativeRecordForm from "../../src/shared/apps/native/NativeRecordForm";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
import { template } from "../../src/admin/developer/app-model";
import SandboxPreview from "../../src/admin/developer/SandboxPreview";
it("reads a bounded page, renders literal source text and rejects unlisted actions", async () => {
  const m = template();
  const v = {
    ...m.views![0],
    blocks: [m.views![0].blocks[0], m.views![0].blocks[1]],
  };
  v.blocks[0].text = { es: "<script>source</script>" };
  const request = vi.fn(async () => ({
    elements: [
      {
        id: "a",
        revision: 1,
        title: { es: "Origen" },
        instructions: { es: "Texto" },
      },
    ],
    nextCursor: "a",
  }));
  render(
    <NativeAppView
      app={m.id}
      native={{ view: v, entities: m.entities }}
      allowedActions={["list_guides"]}
      request={request}
      mainLocale="es-ES"
      locales={["es-ES", "en-GB"]}
    />,
    { wrapper: LocaleProvider },
  );
  expect(await screen.findByText("Origen")).toBeVisible();
  expect(screen.getByText("<script>source</script>")).toBeVisible();
  expect(request).toHaveBeenCalledWith(
    `/api/apps/${m.id}/actions/list_guides`,
    { limit: 50 },
  );
  await userEvent.click(screen.getByRole("button", { name: "Load next page" }));
  expect(request).toHaveBeenLastCalledWith(
    `/api/apps/${m.id}/actions/list_guides`,
    { limit: 50, after: "a" },
  );
});
it("edits the selected record with its revision and keeps only the entered translation", async () => {
  const entity = template().entities[0],
    save = vi.fn(async () => {}),
    saved = vi.fn();
  render(
    <ContentLanguage
      locales={["en-GB", "es-ES"]}
      mainLocale="es-ES"
      language="en-GB"
    >
      <NativeRecordForm
        entity={entity}
        records={[
          {
            id: "r",
            revision: 7,
            title: { es: "Origen" },
            instructions: { es: "Contenido" },
          },
        ]}
        save={save}
        saved={saved}
      />
    </ContentLanguage>,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Record"), "r");
  expect(screen.getByLabelText("Title")).toHaveAttribute(
    "placeholder",
    "Origen",
  );
  await user.type(screen.getByLabelText("Title"), "Title");
  await user.click(screen.getByRole("button", { name: "Save record" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({
    id: "r",
    revision: 7,
    fields: {
      title: { es: "Origen", "en-GB": "Title" },
      instructions: { es: "Contenido" },
    },
  });
});
it("fails closed for unlisted reads and refuses public forms in the renderer", async () => {
  const m = template(),
    request = vi.fn(async () => ({ elements: [] }));
  render(
    <NativeAppView
      app={m.id}
      native={{ view: m.views![0], entities: m.entities }}
      request={request}
      allowedActions={[]}
      public
    />,
    { wrapper: LocaleProvider },
  );
  expect(
    screen.queryByRole("button", { name: "Save record" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check identifiers",
  );
  expect(request).not.toHaveBeenCalled();
});
it("loads the installed version and rejects stale staged previews", async () => {
  const request = vi.fn(async () => ({
    surfaces: [
      { app: "app", version: "2.0.0", surface: { id: "view" }, native: {} },
    ],
  }));
  render(
    <SandboxPreview app="app" version="1.0.0" view="view" request={request} />,
    { wrapper: LocaleProvider },
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Save and install",
  );
  expect(request).toHaveBeenCalledWith("/store-api/apps/surfaces");
});

it("one editor language scope drives real writes and immediately refreshes the sibling table", async () => {
  const m = template();
  let records: any[] = [];
  const request = vi.fn(async (path: string, body?: any) => {
    if (path.endsWith("save_guides")) {
      records = [{ id: body.id, revision: 1, ...body.fields }];
      return records[0];
    }
    return { elements: records, nextCursor: null };
  });
  render(
    <ContentLanguage locales={["en-GB", "es-ES"]} mainLocale="en-GB">
      <NativeAppView
        app={m.id}
        native={{ view: m.views![0], entities: m.entities }}
        allowedActions={["list_guides", "save_guides"]}
        request={request}
        inheritContentLanguage
      />
    </ContentLanguage>,
    { wrapper: LocaleProvider },
  );
  await screen.findByText("No records yet");
  expect(screen.queryByLabelText("Content language")).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Title"), "Verified native write");
  await user.click(screen.getByRole("button", { name: "Save record" }));
  expect(
    await screen.findByRole("cell", { name: "Verified native write" }),
  ).toBeVisible();
  expect(
    request.mock.calls.find((c) => c[0].endsWith("save_guides"))![1].fields
      .title,
  ).toEqual({ "en-GB": "Verified native write" });
});
