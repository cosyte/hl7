/**
 * Derive the shipped message-structure registry from the vendored snapshot of
 * HL7's published, machine-readable message structures.
 *
 * Run it with `pnpm generate:structures`. It reads ONLY `vendor/hl7-v2ig/` and
 * writes `src/parser/generated/`. It never touches the network, at generation
 * time or at runtime, which is why the publication is vendored at all.
 *
 * WHAT IT DERIVES, and why each rule is the rule.
 *
 *   1. `control-manifests/messages.json` is the only file in the publication
 *      that maps a (message code, trigger event) pair to a structure id. Its
 *      entry displays are shaped `ADT^A04^ADT_A01: Register a Patient`, so the
 *      pair and the structure id are read off the display, not guessed.
 *
 *   2. VARIANT FAMILIES. The publication splits some structures into
 *      single-uppercase-letter variants (`ADT_A01-A` .. `-D`) while
 *      `messages.json` references the unsuffixed family name (`ADT_A01`).
 *      Nothing in the publication explains the letters and no version is
 *      attached to them, so the conservative reading is taken: the family of a
 *      referenced id is that id plus any id formed by appending a hyphen and
 *      EXACTLY ONE uppercase letter. The one-letter bound is load-bearing.
 *      `ACK-Scheduling` is a separate structure in this snapshot, and a looser
 *      rule would fold it into `ACK` and change what an acknowledgment
 *      requires.
 *
 *   3. EFFECTIVE MINIMUM. A segment counts as required for one variant when
 *      some occurrence of it has `min >= 1` AND every group enclosing that
 *      occurrence also has `min >= 1`, all the way up to the structure root.
 *      A required segment inside an optional group is therefore NOT required:
 *      that is what keeps a conformant OBX-free `ORU^R01` warning-free.
 *
 *   4. INTERSECTION ACROSS THE FAMILY. A segment is required for the pair only
 *      when every variant in the family gives it a minimum of one. Disagreement
 *      inside a family means the publication does not settle the question, and
 *      a warning heuristic must take the silent side of an unsettled question.
 *
 * WHAT IT REFUSES. An unreadable file, a file that is not valid JSON, a file
 * with no `differential.element` array, an element the tree cannot be built
 * from, and a read file with no recorded upstream URL all THROW, naming the
 * file. Every output is built in memory and written only once all of it
 * exists, so a refusal never leaves a partial registry on disk.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

/**
 * The message codes the shipped registry recognizes. Exactly the set the
 * hand-transcribed table recognized before it was re-sourced: widening it is
 * adding files to the snapshot and re-running this script, and it is a
 * deliberate separate decision rather than a side effect of a refresh.
 */
export const COVERED_MESSAGE_CODES: readonly string[] = [
  "ACK",
  "ADT",
  "DFT",
  "MDM",
  "OMG",
  "OMI",
  "OML",
  "OMP",
  "ORM",
  "ORU",
  "SIU",
  "VXU",
];

/**
 * Message codes matched on the code alone, with no trigger event.
 *
 * `ACK` is the only one. An acknowledgment carries the ACKNOWLEDGED message's
 * trigger event in MSH-9.2, not one of its own, so keying an acknowledgment on
 * MSH-9.2 would recognize the 250-odd events the publication happens to
 * enumerate and go silent on every other one. The publication corroborates the
 * collapse rather than merely permitting it: every `ACK^xx` entry references
 * the same `ACK` structure, and `assertCodeAloneIsSound` re-checks that here
 * instead of trusting this comment.
 */
const CODE_ALONE_CODES: ReadonlySet<string> = new Set(["ACK"]);

/**
 * A pair the publication does not carry, kept recognized anyway.
 *
 * `ORM^O01` is absent from the publication entirely: it is not in the
 * 305-entry message-structure manifest and its raw path answers 404. It is
 * also the commonest legacy order message, and the registry recognized it
 * before it was re-sourced, so dropping it would be a silent loss of coverage
 * dressed up as a derivation. It is retained with the expectation the previous
 * hand transcription carried, and marked in the registry as a retained
 * transcription carrying the reason.
 */
const RETAINED_TRANSCRIPTIONS: readonly RetainedEntry[] = [
  {
    messageCode: "ORM",
    triggerEvents: ["O01"],
    requiredSegments: ["ORC"],
    reason:
      "The vendored publication carries no ORM_O01: it is absent from the 305-entry " +
      "message-structure manifest and its raw path answers 404 (probed 2026-08-27). " +
      "The expectation is the v2.5.1 transcription this registry replaced, where the " +
      "common-order segment ORC anchored the order group.",
  },
];

/** A pair kept recognized without a published structure to derive it from. */
interface RetainedEntry {
  readonly messageCode: string;
  readonly triggerEvents: readonly string[];
  readonly requiredSegments: readonly string[];
  readonly reason: string;
}

/** One element of a `differential.element` array, after validation. */
interface StructureElement {
  readonly id: string;
  readonly parentId: string | undefined;
  readonly min: number;
  /** Segment name when the element is a segment, `undefined` for a group. */
  readonly segment: string | undefined;
}

/** A (message code, trigger event) pair read off `messages.json`. */
interface PublishedMessage {
  readonly messageCode: string;
  readonly triggerEvent: string;
  /** The referenced structure id; `""` when the publication names none. */
  readonly structureId: string;
}

/** A pair the generator could not resolve to a structure it can read. */
export interface UnresolvedPair {
  readonly messageCode: string;
  readonly triggerEvent: string;
  readonly referencedStructureId: string;
  readonly reason: string;
}

/** One derived registry entry, before it is rendered. */
export interface DerivedEntry {
  readonly messageCode: string;
  readonly triggerEvents: readonly string[];
  readonly structureId: string;
  readonly structureIds: readonly string[];
  readonly requiredSegments: readonly string[];
  readonly derivation: "published" | "retained-transcription";
  readonly retainedReason: string;
}

/** A vendored file the registry was derived from. */
export interface SnapshotFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string;
}

/** The publication the snapshot was taken from. */
export interface PublicationRef {
  readonly name: string;
  readonly repository: string;
  readonly repositoryUrl: string;
  readonly commit: string;
  readonly commitDate: string;
  readonly tree: string;
}

/** Everything one generator run produced, before anything is written. */
export interface GeneratedRegistry {
  readonly publication: PublicationRef;
  readonly snapshotTakenAt: string;
  readonly files: readonly SnapshotFile[];
  readonly entries: readonly DerivedEntry[];
  readonly families: readonly {
    readonly structureId: string;
    readonly members: readonly string[];
  }[];
  readonly pairs: readonly PublishedMessage[];
  readonly unresolved: readonly UnresolvedPair[];
  readonly unreferencedStructures: readonly string[];
}

const SEGMENT_TYPE_PREFIX = "http://hl7.org/v2/StructureDefinition/";
const VARIANT_SUFFIX = /^-[A-Z]$/;

/** Read a file as UTF-8, failing with the path when it cannot be read. */
function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (cause) {
    throw new Error(`Cannot read vendored file: ${file}`, { cause });
  }
}

/** Parse JSON, failing with the path when the bytes are not valid JSON. */
function readJson(file: string): unknown {
  const text = readText(file);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`Vendored file is not valid JSON: ${file}`, { cause });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate and flatten one structure definition's `differential.element` array.
 *
 * Fails naming the file when the array is missing, when an element carries no
 * usable `id`/`min`, or when an element's parent is not in the file: a tree
 * that cannot be walked cannot yield an effective minimum, and guessing one is
 * exactly what this generator exists to stop.
 */
export function readStructureElements(file: string): readonly StructureElement[] {
  const doc = readJson(file);
  if (!isRecord(doc)) throw new Error(`Vendored structure is not a JSON object: ${file}`);
  const differential = doc["differential"];
  const raw = isRecord(differential) ? differential["element"] : undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`Vendored structure carries no differential.element array: ${file}`);
  }

  const seen = new Set<string>();
  const elements: StructureElement[] = [];
  for (const item of raw) {
    if (!isRecord(item)) throw new Error(`differential.element carries a non-object: ${file}`);
    const id = item["id"];
    if (typeof id !== "string" || id === "") {
      throw new Error(`differential.element carries an element with no id: ${file}`);
    }
    const min = item["min"];
    if (typeof min !== "number" || !Number.isInteger(min) || min < 0) {
      throw new Error(`differential.element carries a non-integer min at "${id}": ${file}`);
    }
    const dot = id.lastIndexOf(".");
    const parentId = dot === -1 ? undefined : id.slice(0, dot);
    if (parentId !== undefined && !seen.has(parentId)) {
      throw new Error(`differential.element references an unknown parent "${parentId}": ${file}`);
    }
    const types = item["type"];
    const code = Array.isArray(types) && isRecord(types[0]) ? types[0]["code"] : undefined;
    const segment =
      typeof code === "string" && code.startsWith(SEGMENT_TYPE_PREFIX)
        ? code.slice(SEGMENT_TYPE_PREFIX.length)
        : undefined;
    seen.add(id);
    elements.push({ id, parentId, min, segment });
  }
  if (elements.length === 0) {
    throw new Error(`Vendored structure carries an empty differential.element array: ${file}`);
  }
  return elements;
}

/**
 * The segments one structure variant gives a minimum of one along the whole
 * path from the structure root.
 *
 * The root element is treated as present unconditionally (it is the message
 * itself, and the publication gives several roots `min: 0`); every other
 * ancestor must carry `min >= 1` for an occurrence to count.
 */
export function requiredSegmentsOfVariant(elements: readonly StructureElement[]): Set<string> {
  const effective = new Map<string, boolean>();
  const required = new Set<string>();
  for (const el of elements) {
    if (el.parentId === undefined) {
      effective.set(el.id, true);
      continue;
    }
    const parentEffective = effective.get(el.parentId) ?? false;
    const own = parentEffective && el.min >= 1;
    effective.set(el.id, own);
    if (own && el.segment !== undefined) required.add(el.segment);
  }
  return required;
}

/** Read a structure id's family out of the ids the snapshot actually carries. */
export function familyOf(structureId: string, available: ReadonlySet<string>): readonly string[] {
  const members: string[] = [];
  for (const id of available) {
    if (id === structureId) {
      members.push(id);
      continue;
    }
    if (id.startsWith(structureId) && VARIANT_SUFFIX.test(id.slice(structureId.length))) {
      members.push(id);
    }
  }
  return members.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Read the (message code, trigger event, structure id) triples off the
 * publication's message list. A display is shaped
 * `ADT^A04^ADT_A01: Register a Patient`; the structure id is empty for the
 * handful of merge messages the publication names no structure for.
 */
export function readPublishedMessages(file: string): readonly PublishedMessage[] {
  const doc = readJson(file);
  if (!isRecord(doc)) throw new Error(`Vendored manifest is not a JSON object: ${file}`);
  const entries = doc["entry"];
  if (!Array.isArray(entries)) {
    throw new Error(`Vendored manifest carries no entry array: ${file}`);
  }
  const out: PublishedMessage[] = [];
  for (const entry of entries) {
    const item = isRecord(entry) ? entry["item"] : undefined;
    const display = isRecord(item) ? item["display"] : undefined;
    if (typeof display !== "string") {
      throw new Error(`Vendored manifest carries an entry with no display: ${file}`);
    }
    const head = display.split(":", 1)[0] ?? "";
    const parts = head.split("^");
    if (parts.length !== 3) continue;
    const [messageCode, triggerEvent, structureId] = parts;
    if (messageCode === undefined || triggerEvent === undefined || structureId === undefined) {
      continue;
    }
    out.push({ messageCode, triggerEvent, structureId });
  }
  if (out.length === 0) {
    throw new Error(`Vendored manifest yielded no message definitions: ${file}`);
  }
  return out;
}

/** Read the structure ids the publication's own structure list names. */
export function readPublishedStructureIds(file: string): ReadonlySet<string> {
  const doc = readJson(file);
  if (!isRecord(doc)) throw new Error(`Vendored manifest is not a JSON object: ${file}`);
  const entries = doc["entry"];
  if (!Array.isArray(entries)) {
    throw new Error(`Vendored manifest carries no entry array: ${file}`);
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    const item = isRecord(entry) ? entry["item"] : undefined;
    const display = isRecord(item) ? item["display"] : undefined;
    if (typeof display !== "string") {
      throw new Error(`Vendored manifest carries an entry with no display: ${file}`);
    }
    ids.add(display);
  }
  if (ids.size === 0) {
    throw new Error(`Vendored manifest yielded no structure ids: ${file}`);
  }
  return ids;
}

/**
 * Refuse the code-alone collapse unless the publication agrees with it: every
 * message of a code-alone code must reference one and the same structure.
 */
function assertCodeAloneIsSound(code: string, structureIds: ReadonlySet<string>): void {
  if (structureIds.size > 1) {
    throw new Error(
      `Message code ${code} is matched on the code alone but the publication maps its ` +
        `trigger events to more than one structure (${[...structureIds].sort().join(", ")}). ` +
        `Matching on the code alone would silently pick one of them.`,
    );
  }
}

/** Read the snapshot's own provenance record. */
function readSnapshotMeta(vendorDir: string): {
  publication: PublicationRef;
  snapshotTakenAt: string;
  urls: ReadonlyMap<string, string>;
} {
  const file = path.join(vendorDir, "snapshot.json");
  const doc = readJson(file);
  if (!isRecord(doc)) throw new Error(`Snapshot provenance is not a JSON object: ${file}`);
  const publication = doc["publication"];
  const snapshotTakenAt = doc["snapshotTakenAt"];
  const files = doc["files"];
  if (!isRecord(publication) || typeof snapshotTakenAt !== "string" || !Array.isArray(files)) {
    throw new Error(`Snapshot provenance is missing publication/snapshotTakenAt/files: ${file}`);
  }
  const urls = new Map<string, string>();
  for (const f of files) {
    if (!isRecord(f) || typeof f["path"] !== "string" || typeof f["url"] !== "string") {
      throw new Error(`Snapshot provenance carries a file entry with no path/url: ${file}`);
    }
    urls.set(f["path"], f["url"]);
  }
  const str = (key: string): string => {
    const value = publication[key];
    if (typeof value !== "string") {
      throw new Error(`Snapshot provenance publication.${key} is missing: ${file}`);
    }
    return value;
  };
  return {
    publication: {
      name: str("name"),
      repository: str("repository"),
      repositoryUrl: str("repositoryUrl"),
      commit: str("commit"),
      commitDate: str("commitDate"),
      tree: str("tree"),
    },
    snapshotTakenAt,
    urls,
  };
}

/** Hash one vendored file and record it against its upstream URL. */
function snapshotFile(
  vendorDir: string,
  relPath: string,
  urls: ReadonlyMap<string, string>,
): SnapshotFile {
  const absolute = path.join(vendorDir, relPath);
  let bytes: Buffer;
  try {
    bytes = readFileSync(absolute);
  } catch (cause) {
    throw new Error(`Cannot read vendored file: ${absolute}`, { cause });
  }
  const url = urls.get(relPath);
  if (url === undefined) {
    throw new Error(`Vendored file has no recorded upstream URL in snapshot.json: ${relPath}`);
  }
  return {
    path: relPath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    url,
  };
}

/**
 * Derive the whole registry from a vendored snapshot directory. Pure with
 * respect to the filesystem it is handed: it reads that directory and nothing
 * else, and it writes nothing.
 */
export function deriveRegistry(vendorDir: string): GeneratedRegistry {
  const { publication, snapshotTakenAt, urls } = readSnapshotMeta(vendorDir);

  const structureDir = path.join(vendorDir, "message-structure");
  let structureFiles: readonly string[];
  try {
    structureFiles = readdirSync(structureDir)
      .filter((n) => n.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b, "en"));
  } catch (cause) {
    throw new Error(`Cannot list vendored structure directory: ${structureDir}`, { cause });
  }
  if (structureFiles.length === 0) {
    throw new Error(`Vendored structure directory carries no structures: ${structureDir}`);
  }

  const available = new Set(structureFiles.map((n) => n.slice(0, -".json".length)));
  const requiredByStructure = new Map<string, Set<string>>();
  for (const name of structureFiles) {
    const id = name.slice(0, -".json".length);
    const file = path.join(structureDir, name);
    requiredByStructure.set(id, requiredSegmentsOfVariant(readStructureElements(file)));
  }

  const messagesRel = path.join("control-manifests", "messages.json");
  const structuresRel = path.join("control-manifests", "message_structures.json");
  const published = readPublishedMessages(path.join(vendorDir, messagesRel));
  const publishedStructureIds = readPublishedStructureIds(path.join(vendorDir, structuresRel));

  const files: SnapshotFile[] = [
    snapshotFile(vendorDir, messagesRel, urls),
    snapshotFile(vendorDir, structuresRel, urls),
  ];
  for (const name of structureFiles) {
    files.push(snapshotFile(vendorDir, path.join("message-structure", name), urls));
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));

  const covered = new Set(COVERED_MESSAGE_CODES);
  const unresolved: UnresolvedPair[] = [];
  const resolvedPairs: PublishedMessage[] = [];
  const familyMembers = new Map<string, readonly string[]>();
  const grouped = new Map<string, { entry: PublishedMessage; triggerEvents: Set<string> }>();
  const referenced = new Set<string>();

  for (const message of published) {
    if (!covered.has(message.messageCode)) continue;
    if (message.structureId === "") {
      unresolved.push({
        messageCode: message.messageCode,
        triggerEvent: message.triggerEvent,
        referencedStructureId: "",
        reason: "The publication's message list names no structure for this pair.",
      });
      continue;
    }
    const family = familyOf(message.structureId, available);
    if (family.length === 0) {
      unresolved.push({
        messageCode: message.messageCode,
        triggerEvent: message.triggerEvent,
        referencedStructureId: message.structureId,
        reason: publishedStructureIds.has(message.structureId)
          ? "The publication lists this structure but the vendored snapshot does not carry it."
          : "Neither the publication's structure list nor the vendored snapshot carries this structure.",
      });
      continue;
    }
    referenced.add(message.structureId);
    familyMembers.set(message.structureId, family);
    resolvedPairs.push(message);
    const key = `${message.messageCode} ${message.structureId}`;
    const bucket = grouped.get(key);
    if (bucket === undefined) {
      grouped.set(key, { entry: message, triggerEvents: new Set([message.triggerEvent]) });
    } else {
      bucket.triggerEvents.add(message.triggerEvent);
    }
  }

  for (const code of CODE_ALONE_CODES) {
    const ids = new Set(
      resolvedPairs.filter((p) => p.messageCode === code).map((p) => p.structureId),
    );
    assertCodeAloneIsSound(code, ids);
    // The registry entry for a code-alone code matches ANY trigger event, so
    // no single published pair stands for it. Record it as its own row with an
    // empty trigger event, beside (not instead of) the published pairs, so the
    // provenance answers "which structure is behind this entry?" as well as
    // "which structure is behind ACK^A01?".
    for (const structureId of ids) {
      resolvedPairs.push({ messageCode: code, triggerEvent: "", structureId });
    }
  }

  const entries: DerivedEntry[] = [];
  for (const { entry, triggerEvents } of grouped.values()) {
    const family = familyMembers.get(entry.structureId) ?? [];
    let required: Set<string> | undefined;
    for (const member of family) {
      const memberRequired = requiredByStructure.get(member);
      if (memberRequired === undefined) {
        throw new Error(`Family member was not read: ${member}`);
      }
      if (required === undefined) {
        required = new Set(memberRequired);
      } else {
        for (const segment of [...required]) {
          if (!memberRequired.has(segment)) required.delete(segment);
        }
      }
    }
    entries.push({
      messageCode: entry.messageCode,
      triggerEvents: CODE_ALONE_CODES.has(entry.messageCode)
        ? []
        : [...triggerEvents].sort((a, b) => a.localeCompare(b, "en")),
      structureId: entry.structureId,
      structureIds: family,
      requiredSegments: [...(required ?? new Set<string>())].sort((a, b) =>
        a.localeCompare(b, "en"),
      ),
      derivation: "published",
      retainedReason: "",
    });
  }

  for (const retained of RETAINED_TRANSCRIPTIONS) {
    entries.push({
      messageCode: retained.messageCode,
      triggerEvents: [...retained.triggerEvents].sort((a, b) => a.localeCompare(b, "en")),
      structureId: "",
      structureIds: [],
      requiredSegments: [...retained.requiredSegments].sort((a, b) => a.localeCompare(b, "en")),
      derivation: "retained-transcription",
      retainedReason: retained.reason,
    });
  }

  entries.sort(
    (a, b) =>
      a.messageCode.localeCompare(b.messageCode, "en") ||
      a.structureId.localeCompare(b.structureId, "en"),
  );

  const families = [...familyMembers.entries()]
    .map(([structureId, members]) => ({ structureId, members }))
    .sort((a, b) => a.structureId.localeCompare(b.structureId, "en"));

  const pairs = [...resolvedPairs].sort(
    (a, b) =>
      a.messageCode.localeCompare(b.messageCode, "en") ||
      a.triggerEvent.localeCompare(b.triggerEvent, "en"),
  );

  unresolved.sort(
    (a, b) =>
      a.messageCode.localeCompare(b.messageCode, "en") ||
      a.triggerEvent.localeCompare(b.triggerEvent, "en"),
  );

  const unreferencedStructures = [...available]
    .filter((id) => {
      for (const members of familyMembers.values()) if (members.includes(id)) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b, "en"));

  return {
    publication,
    snapshotTakenAt,
    files,
    entries,
    families,
    pairs,
    unresolved,
    unreferencedStructures,
  };
}

const GENERATED_HEADER = `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 * Written by \`pnpm generate:structures\` (\`scripts/generate-message-structures.ts\`)
 * from the vendored snapshot in \`vendor/hl7-v2ig/\`. Re-running the generator in a
 * checkout with no network access reproduces this file byte for byte; a diff here
 * that the generator does not reproduce is an edit that should not have happened.
 *
 * Every expectation below is a segment the published structure definition gives a
 * minimum of one along the whole path from the structure root, intersected across
 * every variant of the referenced structure's family. Nothing here is hand-picked
 * except the one entry marked \`retained-transcription\`, which carries its reason.
 */`;

/** Render one string as a TypeScript double-quoted literal. */
function lit(value: string): string {
  return JSON.stringify(value);
}

/** Render the array of expectation objects for one entry. */
function renderExpectedGroups(segments: readonly string[]): string {
  if (segments.length === 0) return "[]";
  const items = segments
    .map((s) => `{ name: ${lit(s)}, anchorSegments: [${lit(s)}], requiredSegment: ${lit(s)} }`)
    .join(", ");
  return `[${items}]`;
}

/** Render the generated registry module. Formatted with the repo's prettier. */
export async function renderRegistryModule(
  model: GeneratedRegistry,
  repoRoot: string,
): Promise<string> {
  const entries = model.entries
    .map(
      (e) => `{
    messageCode: ${lit(e.messageCode)},
    triggerEvents: [${e.triggerEvents.map(lit).join(", ")}],
    expectedGroups: ${renderExpectedGroups(e.requiredSegments)},
    requiredSegments: [${e.requiredSegments.map(lit).join(", ")}],
    structureId: ${lit(e.structureId)},
    structureIds: [${e.structureIds.map(lit).join(", ")}],
    derivation: ${lit(e.derivation)},
    retainedReason: ${lit(e.retainedReason)},
  }`,
    )
    .join(",\n  ");

  const files = model.files
    .map(
      (f) =>
        `{ path: ${lit(f.path)}, bytes: ${String(f.bytes)}, sha256: ${lit(f.sha256)}, url: ${lit(f.url)} }`,
    )
    .join(",\n  ");

  const families = model.families
    .map(
      (f) => `{ structureId: ${lit(f.structureId)}, members: [${f.members.map(lit).join(", ")}] }`,
    )
    .join(",\n  ");

  const pairs = model.pairs
    .map(
      (p) =>
        `{ messageCode: ${lit(p.messageCode)}, triggerEvent: ${lit(p.triggerEvent)}, structureId: ${lit(p.structureId)} }`,
    )
    .join(",\n  ");

  const retained = model.entries
    .filter((e) => e.derivation === "retained-transcription")
    .map(
      (e) =>
        `{ messageCode: ${lit(e.messageCode)}, triggerEvent: ${lit(e.triggerEvents[0] ?? "")}, structureId: "" }`,
    )
    .join(",\n  ");

  const source = `${GENERATED_HEADER}

import type {
  MessageStructureDefinition,
  StructureRegistryProvenance,
} from "../structure-types.js";

/** The derived registry, one entry per (message code, referenced structure). */
export const GENERATED_MESSAGE_STRUCTURE_DEFINITIONS: readonly MessageStructureDefinition[] = [
  ${entries},
];

/** Where every expectation above came from. */
export const GENERATED_STRUCTURE_REGISTRY_PROVENANCE: StructureRegistryProvenance = {
  publication: {
    name: ${lit(model.publication.name)},
    repository: ${lit(model.publication.repository)},
    repositoryUrl: ${lit(model.publication.repositoryUrl)},
    commit: ${lit(model.publication.commit)},
    commitDate: ${lit(model.publication.commitDate)},
    tree: ${lit(model.publication.tree)},
  },
  snapshotTakenAt: ${lit(model.snapshotTakenAt)},
  files: [
  ${files},
  ],
  families: [
  ${families},
  ],
  pairs: [
  ${pairs},${retained === "" ? "" : `\n  ${retained},`}
  ],
};
`;

  const options = (await resolveConfig(path.join(repoRoot, REGISTRY_MODULE_PATH))) ?? {};
  return format(source, { ...options, parser: "typescript" });
}

/** Render the committed derivation report: coverage, families, unresolved pairs. */
export function renderDerivationReport(model: GeneratedRegistry): string {
  return `${JSON.stringify(
    {
      note:
        "Generated by scripts/generate-message-structures.ts from vendor/hl7-v2ig/. " +
        "It records what the derivation covered and, more importantly, what it could not " +
        "resolve: a pair listed under unresolvedPairs is one the parser stays silent on.",
      publication: model.publication,
      snapshotTakenAt: model.snapshotTakenAt,
      coveredMessageCodes: COVERED_MESSAGE_CODES,
      resolvedPairCount: model.pairs.length,
      registryEntryCount: model.entries.length,
      unresolvedPairs: model.unresolved,
      unreferencedStructures: model.unreferencedStructures,
      entries: model.entries.map((e) => ({
        messageCode: e.messageCode,
        triggerEvents: e.triggerEvents,
        structureId: e.structureId,
        structureIds: e.structureIds,
        requiredSegments: e.requiredSegments,
        derivation: e.derivation,
        ...(e.retainedReason === "" ? {} : { retainedReason: e.retainedReason }),
      })),
    },
    null,
    2,
  )}\n`;
}

/** Repo-root-relative paths this generator owns. */
export const REGISTRY_MODULE_PATH = "src/parser/generated/message-structures.ts";
/** Repo-root-relative path of the committed derivation report. */
export const DERIVATION_REPORT_PATH = "src/parser/generated/derivation-report.json";
/** Repo-root-relative path of the vendored publication snapshot. */
export const VENDOR_DIR = "vendor/hl7-v2ig";

/** Derive, render, then write. Nothing is written until all of it exists. */
export async function main(repoRoot: string): Promise<void> {
  const model = deriveRegistry(path.join(repoRoot, VENDOR_DIR));
  const moduleSource = await renderRegistryModule(model, repoRoot);
  const report = renderDerivationReport(model);
  mkdirSync(path.dirname(path.join(repoRoot, REGISTRY_MODULE_PATH)), { recursive: true });
  writeFileSync(path.join(repoRoot, REGISTRY_MODULE_PATH), moduleSource);
  writeFileSync(path.join(repoRoot, DERIVATION_REPORT_PATH), report);
  process.stdout.write(
    `generate:structures: ${String(model.entries.length)} registry entries from ` +
      `${String(model.files.length)} vendored files; ${String(model.pairs.length)} pairs resolved, ` +
      `${String(model.unresolved.length)} unresolved.\n`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}
