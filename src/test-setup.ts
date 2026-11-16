import "@testing-library/jest-dom/vitest";

// Node 26 exposes an experimental `localStorage` global that is undefined
// unless `--localstorage-file` is set, shadowing jsdom's implementation.
if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: globalThis.sessionStorage,
    });
}
