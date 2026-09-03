/**
 * The emitted Zod artifact: that it is TypeScript a compiler accepts, that it
 * reaches for `zod` exactly once and for nothing else, that it agrees member for
 * member with the JSON Schema document, and that emitting it put no dependency
 * on this package.
 *
 * THE COMPILER IS THE ONE ALREADY IN THE DEVDEPENDENCIES. `zod` is NOT
 * installed here and must not be: the artifact is SOURCE TEXT a consumer pastes
 * into a codebase where their own `zod` resolves. So the check is a SYNTACTIC
 * one, `Program.getSyntacticDiagnostics` over a program holding the emitted
 * text and nothing else, which resolves no module at all. A semantic check
 * would need the dependency this whole change exists to avoid, and would be
 * measuring the consumer's install rather than our output.
 *
 * THE AGREEMENT CHECK READS THE ARTIFACT, NOT THE MODEL BOTH ARTIFACTS CAME
 * FROM. Both renderers read one shape declaration, so asserting against that
 * declaration would prove only that it was read twice. The Zod side here is
 * recovered from the emitted TEXT by walking its syntax tree, and compared
 * against the emitted JSON Schema document: a renderer that dropped a member,
 * mis-spelled one, or lost an `.optional()` fails, and no shared input can hide
 * it.
 */

import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { messageJsonSchema, messageZodSource } from "../src/index.js";
import type { JsonSchemaDocument } from "../src/index.js";

/** One object schema recovered from the emitted Zod source. */
interface RecoveredObject {
  /** The definition name, with the `Schema` suffix of the `const` removed. */
  readonly name: string;
  /** Member names in declaration order. */
  readonly members: readonly string[];
  /** The members the source marks `.optional()`. */
  readonly optional: readonly string[];
}

const EMITTED_FILE_NAME = "emitted.zod.ts";

function parseEmitted(source: string): ts.SourceFile {
  return ts.createSourceFile(
    EMITTED_FILE_NAME,
    source,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * The SYNTAX errors the compiler reports over the emitted text, as messages.
 *
 * `getSyntacticDiagnostics` is the published route and is the right one twice
 * over: it is what "parses with zero syntax diagnostics" means, and it resolves
 * no module, so `zod` being absent from this repository's installs is not a
 * finding. The host below serves exactly one file and `noLib` keeps the
 * standard library out of it, so nothing on disk can influence the answer.
 */
function syntaxDiagnostics(source: string): string[] {
  const file = parseEmitted(source);
  const host: ts.CompilerHost = {
    fileExists: (name) => name === EMITTED_FILE_NAME,
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (name) => (name === EMITTED_FILE_NAME ? file : undefined),
    readFile: (name) => (name === EMITTED_FILE_NAME ? source : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };
  const program = ts.createProgram(
    [EMITTED_FILE_NAME],
    { noEmit: true, noLib: true, target: ts.ScriptTarget.ES2023 },
    host,
  );
  const parsed = program.getSourceFile(EMITTED_FILE_NAME);
  if (parsed === undefined) throw new Error("the compiler did not read the emitted source");
  return program
    .getSyntacticDiagnostics(parsed)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
}

/** The `z.object({...})` literal inside an expression, wherever the chain put it. */
function findZodObjectLiteral(node: ts.Node): ts.ObjectLiteralExpression | undefined {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" &&
    node.expression.name.text === "object"
  ) {
    const first = node.arguments[0];
    if (first !== undefined && ts.isObjectLiteralExpression(first)) return first;
  }
  let found: ts.ObjectLiteralExpression | undefined;
  node.forEachChild((child) => {
    found ??= findZodObjectLiteral(child);
  });
  return found;
}

/** Whether an expression's outermost call is `.optional()`. */
function isOptionalCall(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "optional"
  );
}

/** Every `export const <Name>Schema = z.object({...})` the emitted source declares. */
function recoverObjects(file: ts.SourceFile): RecoveredObject[] {
  const recovered: RecoveredObject[] = [];
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      const literal = findZodObjectLiteral(declaration.initializer);
      if (literal === undefined) continue;
      const members: string[] = [];
      const optional: string[] = [];
      for (const property of literal.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
          throw new Error(`unexpected property shape in ${declaration.name.text}`);
        }
        members.push(property.name.text);
        if (isOptionalCall(property.initializer)) optional.push(property.name.text);
      }
      recovered.push({
        name: declaration.name.text.replace(/Schema$/, ""),
        members,
        optional,
      });
    }
  }
  return recovered;
}

/** The same view of the emitted JSON Schema document, keyed the same way. */
function fromJsonSchema(document: JsonSchemaDocument): RecoveredObject[] {
  const view = (
    name: string,
    properties: Record<string, unknown>,
    required: readonly string[],
  ) => ({
    name,
    members: Object.keys(properties),
    optional: Object.keys(properties).filter((member) => !required.includes(member)),
  });
  const out = Object.entries(document.$defs).map(([name, definition]) =>
    view(name, { ...(definition.properties ?? {}) }, definition.required ?? []),
  );
  out.push(view("SerializedMessage", { ...(document.properties ?? {}) }, document.required ?? []));
  return out;
}

describe("AC6: the emitted Zod artifact is TypeScript with one `zod` import", () => {
  const source = messageZodSource();
  const file = parseEmitted(source);

  it("parses with zero syntax diagnostics under the repository's own compiler", () => {
    expect(syntaxDiagnostics(source)).toEqual([]);
  });

  it("the diagnostic channel is live, so the assertion above is not vacuous", () => {
    // A deliberate syntax error must be reported, or the reader above is
    // measuring nothing and every malformed emission would pass.
    expect(
      syntaxDiagnostics(`${source}\nexport const broken = z.object({;`).length,
    ).toBeGreaterThan(0);
  });

  it("declares exactly one import statement, and its specifier is `zod`", () => {
    const imports = file.statements.filter((statement) => ts.isImportDeclaration(statement));
    expect(imports).toHaveLength(1);
    const [only] = imports;
    const specifier =
      only !== undefined && ts.isImportDeclaration(only) ? only.moduleSpecifier : undefined;
    expect(
      specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined,
    ).toBe("zod");
  });

  it("reaches for no module by any other route", () => {
    expect(source).not.toContain("require(");
    expect(source).not.toContain("import(");
    // One occurrence of the word, the import line itself, plus the header
    // sentence that tells a consumer whose dependency it is.
    expect(source.match(/from "zod"/g)).toHaveLength(1);
  });

  it("declares one exported schema per definition, plus the inferred type alias", () => {
    const recovered = recoverObjects(file);
    expect(recovered.map((entry) => entry.name)).toEqual([
      "SerializedEncodingCharacters",
      "SerializedComponent",
      "SerializedRepetition",
      "SerializedField",
      "SerializedSegment",
      "SerializedPosition",
      "SerializedWarning",
      "SerializedProfile",
      "SerializedMessage",
    ]);
    expect(source).toContain(
      "export type SerializedMessage = z.infer<typeof SerializedMessageSchema>;",
    );
  });

  it("declares every definition before the definition that references it", () => {
    const declaredAt = new Map<string, number>();
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      const match = /^export const (\w+Schema) = z$/.exec(line);
      if (match?.[1] !== undefined) declaredAt.set(match[1], index);
    });
    const usedTooEarly: string[] = [];
    const references: string[] = [];
    lines.forEach((line, index) => {
      const match = /^\s{4}\w+: (?:z\.array\()?(\w+Schema)/.exec(line);
      const referenced = match?.[1];
      if (referenced === undefined) return;
      references.push(referenced);
      const at = declaredAt.get(referenced);
      if (at === undefined || at > index) usedTooEarly.push(referenced);
    });
    expect(usedTooEarly).toEqual([]);
    // A `const` is in its temporal dead zone until it is evaluated, so this
    // ordering is what stops the emitted module throwing on import. The counts
    // keep the emptiness above from being a scan that matched nothing.
    expect(declaredAt.size).toBe(9);
    expect(references.length).toBeGreaterThanOrEqual(7);
  });

  it("carries no string literal beyond the module specifier and the registry codes", () => {
    const literals: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node)) literals.push(node.text);
      node.forEachChild(visit);
    };
    visit(file);
    const permitted = new Set<string>([
      "zod",
      ...(messageJsonSchema().$defs["SerializedWarning"]?.properties?.["code"]?.enum ?? []),
    ]);
    expect(literals.filter((value) => !permitted.has(value))).toEqual([]);
  });
});

describe("AC7: the two artifacts agree member for member, at every level", () => {
  const zod = recoverObjects(parseEmitted(messageZodSource()));
  const json = fromJsonSchema(messageJsonSchema());

  it("names the same set of definitions", () => {
    const sortNames = (entries: readonly RecoveredObject[]): string[] =>
      entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "en"));
    expect(sortNames(zod)).toEqual(sortNames(json));
  });

  it("declares the same members on each definition", () => {
    for (const definition of json) {
      const other = zod.find((entry) => entry.name === definition.name);
      expect(other?.members, definition.name).toEqual(definition.members);
    }
  });

  it("agrees about which members are optional", () => {
    for (const definition of json) {
      const other = zod.find((entry) => entry.name === definition.name);
      expect([...(other?.optional ?? [])].sort(), definition.name).toEqual(
        [...definition.optional].sort(),
      );
    }
  });

  it("neither artifact names a member the other omits", () => {
    const flatten = (entries: readonly RecoveredObject[]): string[] =>
      entries
        .flatMap((entry) => entry.members.map((member) => `${entry.name}.${member}`))
        .sort((a, b) => a.localeCompare(b, "en"));
    expect(flatten(zod)).toEqual(flatten(json));
  });

  it("compared a shape worth comparing, so the equalities above are not vacuous", () => {
    expect(json.length).toBe(9);
    expect(json.flatMap((entry) => entry.members).length).toBeGreaterThanOrEqual(20);
    expect(json.flatMap((entry) => entry.optional).length).toBeGreaterThan(0);
  });
});

describe("AC14: emitting Zod added no dependency to this package", () => {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );

  /** Narrow the manifest without an `as` cast; this check must not lie about its input. */
  function dependencyBlock(key: string): Record<string, unknown> {
    if (typeof manifest !== "object" || manifest === null) {
      throw new Error("package.json did not parse to an object");
    }
    const record: Record<string, unknown> = { ...manifest };
    const block = record[key];
    if (block === undefined) return {};
    if (typeof block !== "object" || block === null) {
      throw new Error(`package.json \`${key}\` is not an object`);
    }
    return { ...block };
  }

  it("declares an empty runtime dependencies object", () => {
    expect(dependencyBlock("dependencies")).toEqual({});
  });

  it("declares `zod` in neither the runtime nor the development set", () => {
    expect(Object.keys(dependencyBlock("dependencies"))).not.toContain("zod");
    expect(Object.keys(dependencyBlock("devDependencies"))).not.toContain("zod");
  });

  it("declares no JSON Schema validator in either set", () => {
    const validators = ["ajv", "@cfworker/json-schema", "djv", "jsonschema", "is-my-json-valid"];
    const declared = [
      ...Object.keys(dependencyBlock("dependencies")),
      ...Object.keys(dependencyBlock("devDependencies")),
    ];
    expect(declared.filter((name) => validators.includes(name))).toEqual([]);
  });

  it("holds no `zod` value or import anywhere under src/", () => {
    const sourceText = readFileSync(
      new URL("../src/serialize/schema/zod.ts", import.meta.url),
      "utf8",
    );
    // The emitter builds the specifier as data. It never imports it, which is
    // what keeps `pnpm typecheck` and `pnpm build` free of the dependency.
    expect(sourceText).not.toMatch(/^\s*import .* from "zod"/m);
    expect(sourceText).not.toContain('require("zod")');
  });
});
