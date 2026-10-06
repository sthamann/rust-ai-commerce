/** Browser platform shims for isolated component tests; no network or real provider calls. */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
const testWindow = (globalThis as unknown as { jsdom: { window: Window } })
  .jsdom.window;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testWindow.localStorage,
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: testWindow.sessionStorage,
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("rac-locale", "en-GB");
  history.replaceState(null, "", "/?shop=unit-shop#merchant");
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.reject(new Error("Unexpected network request in unit test")),
    ),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
