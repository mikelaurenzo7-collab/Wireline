// Ambient stub for the `pg` (node-postgres) driver.
//
// node-postgres ships no bundled types. Installing `@types/pg` instead
// over-narrows the drizzle query-builder result types (e.g. `.returning()`
// resolves to a non-iterable `QueryResult` union), which breaks existing
// array-destructuring call sites under the regular tsconfig.
//
// Declaring the module here keeps `pg` imports explicitly `any` — which is
// how the loosely-typed drizzle wrapper already treats them — so the strict
// tsconfig's `noImplicitAny` is satisfied without that regression.
declare module "pg";
