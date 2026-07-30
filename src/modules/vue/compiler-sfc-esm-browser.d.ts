// Declaration bridge for the deep esm-browser import in VueSyntaxSource.ts —
// the runtime module is the browser bundle (no lazy CJS template-engine
// requires, safe for `bun build --compile`); the types are the package's own.
declare module '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js' {
  export * from 'vue/compiler-sfc';
}
