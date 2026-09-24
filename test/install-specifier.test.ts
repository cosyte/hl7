import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { installSpecifiers } from "./_helpers/first-use.js";

/**
 * The install command a reader copies has to fetch THIS package. The subject is package identity:
 * each specifier the two first-use documents print is compared with `package.json` `name`, and a
 * mismatch names both strings.
 */
const root = join(import.meta.dirname, "..");
const { name } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string };

describe("the documented install specifier", () => {
  for (const doc of ["docs-content/installation.md", "README.md"]) {
    it(`AC-HL6: every install command in ${doc} names package.json name`, () => {
      const specs = installSpecifiers(readFileSync(join(root, doc), "utf8"));
      expect(specs.length, `${doc} prints no install command`).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(spec, `${doc} installs "${spec}", package.json name is "${name}"`).toBe(name);
      }
    });
  }

  it("AC-HL6: a specifier that is not the package name is read as the name it prints", () => {
    expect(installSpecifiers("npm install @cosyte/hl8\npnpm add -D @cosyte/hl7@0.0.1")).toEqual([
      "@cosyte/hl8",
      "@cosyte/hl7",
    ]);
  });

  it("AC-HL6: every install command form a reader may copy is read, inline code included", () => {
    const forms = [
      "pnpm i @cosyte/hl8",
      "pnpm install @cosyte/hl8",
      "npm add @cosyte/hl8",
      "deno add npm:@cosyte/hl8",
      "run `npm install @cosyte/hl8` first",
      "then run npm install @cosyte/hl8.",
    ];
    for (const form of forms) expect(installSpecifiers(form), form).toEqual(["@cosyte/hl8"]);
    expect(installSpecifiers("pnpm install\npnpm install --frozen-lockfile")).toEqual([]);
    expect(installSpecifiers("pnpm add file:../hl7")).toEqual([]);
  });
});
