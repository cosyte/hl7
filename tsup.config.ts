import { cosyteTsup } from "@cosyte/tsup-config";

/**
 * tsup build for @cosyte/hl7: dual ESM + CJS + `.d.ts` from the shared @cosyte/tsup-config standard
 * (ES2023, Node platform, `.mjs`/`.cjs` out-extensions). Matches the `exports` map in package.json.
 *
 * Three entry points. `tables` (the `@cosyte/hl7/tables` subpath) imports nothing outside
 * `src/tables/`, and the main entry never imports it, so its data costs the main entry nothing.
 * `arbitraries` (the `@cosyte/hl7/arbitraries` subpath) imports the library by
 * its own package name, and the build leaves that import in place, so the subpath loads the same
 * `dist/index` a consumer's own `import "@cosyte/hl7"` loads: one `Hl7Message` class, not a second
 * bundled copy. The plugin below is what keeps it: tsup bundles any import that `paths` in
 * `tsconfig.json` maps, even one it is told is external, and `paths` maps the package's own name
 * to `src/index.ts` for the type checker. `fast-check` is the subpath's optional peer dependency
 * and stays external too; nothing `src/index.ts` reaches imports it.
 */
export default cosyteTsup({
  entry: {
    index: "src/index.ts",
    arbitraries: "src/arbitraries/index.ts",
    tables: "src/tables/index.ts",
  },
  external: ["@cosyte/hl7", "fast-check"],
  esbuildPlugins: [
    {
      name: "keep-own-package-external",
      setup(build) {
        build.onResolve({ filter: /^@cosyte\/hl7$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
});
