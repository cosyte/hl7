/**
 * The structural walk: everything one published structure variant has to say
 * about one message's segment sequence.
 *
 * Three questions are asked, and they are kept apart on purpose so that one
 * defect is reported as one thing:
 *
 *   1. **Is the segment named at all?** A segment the variant never mentions
 *      has no position to be out of and no count to exceed, so it is reported
 *      once, under its own code, and then left out of the other two questions.
 *   2. **Does it occur an allowed number of times?** Counted message-wide,
 *      against the minimum and maximum the publication implies along the path
 *      from the structure root: a segment inside an optional group is not
 *      required, and a segment inside a repeating group inherits its repetition.
 *   3. **Is the sequence derivable from the published order?** Asked with a
 *      SEGMENT's occurrence bounds relaxed to "any number of times", precisely
 *      so that a count violation cannot masquerade as an ordering violation.
 *      What is left is the ordering question alone: may this segment appear
 *      HERE, after the ones before it.
 *
 * Question 3 is answered by simulating a tiny automaton built from the ordered
 * expectation, which is what makes a repeating group work: an `ORU^R01` may
 * legitimately carry `OBR OBX OBR OBX`, and a rule that demanded a segment
 * never appear after one that follows it in the publication would report that
 * conformant message. The simulation is linear in the message and in the
 * structure, never backtracks, and reports the FIRST segment it cannot place:
 * once the sequence has diverged, every position after it is measured against a
 * place in the structure nothing established.
 *
 * THE RELAXATION STOPS AT THE GROUP, and that boundary is the whole reason the
 * check catches anything at all. A group the publication bounds at one
 * occurrence may not be re-entered, so its children may not come back round in
 * a different order: a `VXU^V04` carrying `PV2` before `PV1` inside a
 * `PATIENT_VISIT` group bounded at `[0..1]` is an ordering violation and is
 * reported as one. Relaxing that too would grant a loop the publication does not
 * and would accept any permutation of a non-repeating group's children.
 */

import type {
  PublishedStructureSchema,
  StructureExpectationNode,
} from "../parser/structure-types.js";
import { STRUCTURE_FINDING_CODES, type StructureFinding } from "./types.js";

/** One segment as the message carries it, with its 0-indexed occurrence. */
export interface ObservedSegment {
  /** The segment name, already bounded to the shape a segment id may take. */
  readonly name: string;
  /** 0-indexed occurrence of this segment name within the message. */
  readonly occurrence: number;
}

/** How many times a published structure lets one segment name occur, message-wide. */
interface OccurrenceBounds {
  /** Occurrences the publication requires. */
  readonly min: number;
  /** Occurrences the publication permits, `"*"` when unbounded. */
  readonly max: number | "*";
}

/** The publication's marker for "repeats without an upper bound". */
const UNBOUNDED = "*";

/** Multiply two occurrence counts, where nothing multiplied by unbounded is nothing. */
function multiplyOccurrences(left: number | "*", right: number | "*"): number | "*" {
  if (left === 0 || right === 0) return 0;
  if (left === UNBOUNDED || right === UNBOUNDED) return UNBOUNDED;
  return left * right;
}

/** Add two occurrence counts, where unbounded absorbs. */
function addOccurrences(left: number | "*", right: number | "*"): number | "*" {
  if (left === UNBOUNDED || right === UNBOUNDED) return UNBOUNDED;
  return left + right;
}

/**
 * The occurrence bounds one variant puts on each segment name it mentions.
 *
 * A node's own bounds are multiplied through its enclosing groups, so a segment
 * with a minimum of one inside a group with a minimum of zero contributes
 * nothing to the required count, and a segment inside a repeating group inherits
 * the repetition. Where a segment appears at several loci the loci are summed:
 * an `OBX` that may appear once per observation group and once per specimen
 * group may appear as many times as both allow.
 *
 * Parents always precede their children in the node list, so one pass suffices,
 * and a node whose `parent` is not an already-computed index is a node at the
 * structure root, which occurs exactly once.
 *
 * @internal
 */
export function occurrenceBounds(
  nodes: readonly StructureExpectationNode[],
): ReadonlyMap<string, OccurrenceBounds> {
  const minAt: number[] = [];
  const maxAt: (number | "*")[] = [];
  const bounds = new Map<string, OccurrenceBounds>();
  for (const node of nodes) {
    const nodeMin = (minAt[node.parent] ?? 1) * node.min;
    const nodeMax = multiplyOccurrences(maxAt[node.parent] ?? 1, node.max);
    minAt.push(nodeMin);
    maxAt.push(nodeMax);
    if (node.kind !== "segment") continue;
    const seen = bounds.get(node.name);
    bounds.set(
      node.name,
      seen === undefined
        ? { min: nodeMin, max: nodeMax }
        : { min: seen.min + nodeMin, max: addOccurrences(seen.max, nodeMax) },
    );
  }
  return bounds;
}

/**
 * The published order as an automaton, with a SEGMENT's occurrence bounds
 * relaxed to "any number of times" and a GROUP's published maximum honoured.
 *
 * State `0` is the structure root's entry. A segment node gets one state, which
 * consumes that segment name and stays put: that is the relaxation, and it is
 * why an over-repeated segment is a cardinality finding rather than an ordering
 * one. A group node gets TWO states, an entry and an exit, so that leaving a
 * group and re-entering it are separate edges rather than the same one. Entry
 * leads to the group's first child and, skipping it, straight to the exit; the
 * group's last child leads to the exit; and only a group the publication lets
 * occur more than once gets the edge back from exit to entry.
 */
interface OrderAutomaton {
  /** Edges that consume nothing, by state. */
  readonly epsilon: ReadonlyMap<number, readonly number[]>;
  /** The segment name a state consumes to stay put. Absent for a group state. */
  readonly consumes: ReadonlyMap<number, string>;
}

/** Whether the publication lets a node occur more than once at this locus. */
function repeats(node: StructureExpectationNode): boolean {
  return node.max === UNBOUNDED || node.max > 1;
}

/** Build the order automaton for one variant's ordered expectation. */
function buildOrderAutomaton(nodes: readonly StructureExpectationNode[]): OrderAutomaton {
  const epsilon = new Map<number, number[]>();
  const consumes = new Map<number, string>();
  /** Per node index: the state a walk arrives at, and the state it leaves from. */
  const entryOf: number[] = [];
  const exitOf: number[] = [];
  /** The exit state of the last child seen under each parent index (`-1` = root). */
  const lastChildExit = new Map<number, number>();
  /** State `0` is the structure root's entry; every other state is allocated here. */
  let stateCount = 1;

  const connect = (from: number, to: number): void => {
    const edges = epsilon.get(from);
    if (edges === undefined) epsilon.set(from, [to]);
    else edges.push(to);
  };

  for (const node of nodes) {
    // A node follows its previous sibling, or opens its parent's child chain.
    const from =
      lastChildExit.get(node.parent) ?? (node.parent < 0 ? 0 : (entryOf[node.parent] ?? 0));
    if (node.kind === "segment") {
      const state = stateCount++;
      entryOf.push(state);
      exitOf.push(state);
      consumes.set(state, node.name);
      connect(from, state);
      lastChildExit.set(node.parent, state);
      continue;
    }
    const entry = stateCount++;
    const exit = stateCount++;
    entryOf.push(entry);
    exitOf.push(exit);
    connect(from, entry);
    // Skipping the group: the ordering question relaxes every minimum, so an
    // absent group is the cardinality check's business, not this one.
    connect(entry, exit);
    // Repeating it: only where the publication grants a second occurrence.
    if (repeats(node)) connect(exit, entry);
    lastChildExit.set(node.parent, exit);
  }

  // A group's children lead to its exit. A childless group already has the
  // entry-to-exit edge, and the structure root has no exit: a message is one
  // message and never loops back.
  for (const [index, node] of nodes.entries()) {
    if (node.kind !== "group") continue;
    const childExit = lastChildExit.get(index);
    const exit = exitOf[index];
    if (childExit !== undefined && exit !== undefined) connect(childExit, exit);
  }

  return { epsilon, consumes };
}

/** Every state reachable from `states` without consuming a segment. */
function epsilonClosure(automaton: OrderAutomaton, states: Iterable<number>): ReadonlySet<number> {
  const reached = new Set<number>();
  const pending = [...states];
  for (;;) {
    const state = pending.pop();
    if (state === undefined) break;
    if (reached.has(state)) continue;
    reached.add(state);
    for (const next of automaton.epsilon.get(state) ?? []) pending.push(next);
  }
  return reached;
}

/**
 * The first segment the published order cannot place, or `undefined` when the
 * whole sequence is derivable from it.
 *
 * Every segment handed in must be one the variant names: an unexpected segment
 * is a different finding and would otherwise stop the walk at a position the
 * publication says nothing about.
 *
 * @internal
 */
export function firstUnplaceableSegment(
  nodes: readonly StructureExpectationNode[],
  observed: readonly ObservedSegment[],
): ObservedSegment | undefined {
  const automaton = buildOrderAutomaton(nodes);
  let active = epsilonClosure(automaton, [0]);
  for (const segment of observed) {
    const consumed: number[] = [];
    for (const state of active) {
      if (automaton.consumes.get(state) === segment.name) consumed.push(state);
    }
    if (consumed.length === 0) return segment;
    active = epsilonClosure(automaton, consumed);
  }
  return undefined;
}

/** Freeze one finding and its locus: nothing a caller holds is mutable. */
function frozen(finding: StructureFinding): StructureFinding {
  return Object.freeze({ ...finding, locus: Object.freeze({ ...finding.locus }) });
}

/**
 * Every finding one variant raises against one message's segment sequence, in a
 * stable order: the ordering finding, then cardinality findings by segment name,
 * then unexpected segments in the order the message carries them.
 *
 * @internal
 */
export function findingsForSchema(
  schema: PublishedStructureSchema,
  observed: readonly ObservedSegment[],
): readonly StructureFinding[] {
  const structureId = schema.structureId;
  const bounds = occurrenceBounds(schema.nodes);

  const unexpected: StructureFinding[] = [];
  const named: ObservedSegment[] = [];
  const counts = new Map<string, number>();
  for (const segment of observed) {
    if (!bounds.has(segment.name)) {
      unexpected.push(
        frozen({
          code: STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED,
          severity: "warning",
          locus: { segment: segment.name, occurrence: segment.occurrence, structureId },
          message:
            `Segment "${segment.name}" (occurrence ${String(segment.occurrence)}) is not named ` +
            `anywhere in published structure ${structureId}.`,
        }),
      );
      continue;
    }
    named.push(segment);
    counts.set(segment.name, (counts.get(segment.name) ?? 0) + 1);
  }

  const ordering: StructureFinding[] = [];
  const misplaced = firstUnplaceableSegment(schema.nodes, named);
  if (misplaced !== undefined) {
    ordering.push(
      frozen({
        code: STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
        severity: "error",
        locus: { segment: misplaced.name, occurrence: misplaced.occurrence, structureId },
        message:
          `Segment "${misplaced.name}" (occurrence ${String(misplaced.occurrence)}) appears where ` +
          `published structure ${structureId} does not allow it.`,
      }),
    );
  }

  const cardinality: StructureFinding[] = [];
  const byName = [...bounds.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
  for (const [name, bound] of byName) {
    const count = counts.get(name) ?? 0;
    if (count < bound.min) {
      cardinality.push(
        frozen({
          code: STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
          severity: "error",
          locus: { segment: name, structureId },
          message:
            `Segment "${name}" occurs ${String(count)} times; published structure ` +
            `${structureId} gives it a minimum of ${String(bound.min)}.`,
        }),
      );
      continue;
    }
    if (bound.max !== UNBOUNDED && count > bound.max) {
      cardinality.push(
        frozen({
          code: STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
          severity: "error",
          // The first occurrence past the maximum is 0-indexed at the maximum.
          locus: { segment: name, occurrence: bound.max, structureId },
          message:
            `Segment "${name}" occurs ${String(count)} times; published structure ` +
            `${structureId} gives it a maximum of ${String(bound.max)}.`,
        }),
      );
    }
  }

  return [...ordering, ...cardinality, ...unexpected];
}
