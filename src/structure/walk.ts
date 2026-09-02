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
 *   3. **Is the sequence derivable from the published order?** Asked against the
 *      published bounds themselves: each node may occur as few and as many times
 *      as the publication says at that locus, and no oftener.
 *
 * Question 3 is answered by simulating a tiny automaton built from the ordered
 * expectation, which is what makes a repeating group work: an `ORU^R01` may
 * legitimately carry `OBR OBX OBR OBX`, and a rule that demanded a segment never
 * appear after one that follows it in the publication would report that
 * conformant message. The simulation is linear in the message and in the
 * structure, never backtracks, and asks only whether the message so far is a
 * beginning the publication allows.
 *
 * THE ONE RELAXATION IS THE ONE THE COUNT CHECK HAS ALREADY REPORTED. Reading
 * the order with every bound honoured means an absent required segment stops
 * the sequence dead, and that would report a count defect twice: once as the
 * missing segment and again as everything that follows it being out of place.
 * So the bound the cardinality check reports for a segment name, and only that
 * bound, is dropped from the order automaton for that name: too few occurrences
 * drops its minimum, too many drops its maximum. Every other bound stands, which
 * is why a group's required leading segment can no longer be skipped on one
 * occurrence and consumed on the next.
 *
 * WHICH SEGMENT THE FINDING NAMES: THE ONE THAT ARRIVED LATE. Two segments in an
 * order the publication does not allow give two candidate loci, the one that
 * came early and the one that came late, and the finding names the late one -
 * the segment the publication puts first and the message delivered second.
 *
 * WHERE THE WALK STOPS IS NOT THAT SEGMENT. The automaton stops at the first
 * segment it cannot place, and where the publication could skip past the segment
 * the message delayed, it stops somewhere else entirely: an `ADT^A01` carrying
 * `GSP` before `PD1` is derivable as far as the `PD1`, because `PD1` is optional
 * and skipping it is how `GSP` was read, so the stop lands on `PD1` and the
 * segments AFTER the stop are in their published places. Naming the stop, or the
 * next allowed name after it, therefore names a healthy segment about as often
 * as it names the defect.
 *
 * So the question is asked directly: is there an adjacent pair the message
 * delivered in one order and the publication takes in the other. An exchange
 * that leaves a sequence the publication derives has found that pair, and its
 * SECOND member is the one delivered late; the earliest such pair is the answer,
 * because the message is read from the front.
 *
 * EVERY PAIR IS ASKED, AND WHAT IS BOUNDED IS THE COST RATHER THAN THE SEARCH.
 * Where a group occurs more than once the repairing pair can sit far in front of
 * the point the walk stopped, so any rule that picks candidate pairs out of that
 * stopping point names a healthy segment on exactly the messages it was not
 * measured over. Instead a single backward pass records, for each position, the
 * states from which the rest of the message still reads; a single forward pass
 * then carries the prefix and tries each pair against that record. The search is
 * exhaustive and still costs a fixed number of walks however long the message.
 *
 * Where no exchange derives, the defect is something other than two segments in
 * the wrong order and there is no second member to name. The finding then names
 * the first later occurrence of a name the publication allowed where the walk
 * stopped, which is the segment that belonged there - an `ADT^A01` carrying
 * `PV2` before `PV1` reports `PV1` either way - and failing that the segment
 * that could not be placed.
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
 * Which published bound the cardinality check already reports for one segment
 * name: `"minimum"` where the message carries too few, `"maximum"` where it
 * carries too many. That bound, and only it, is dropped from the order
 * automaton for that name.
 */
type ReportedBound = "minimum" | "maximum";

/** One consuming edge: the segment name a state reads, and where reading it leads. */
interface SegmentEdge {
  /** The segment name this edge consumes. */
  readonly name: string;
  /** The state reading it arrives at. */
  readonly to: number;
}

/**
 * The published order as an automaton over segment names.
 *
 * Every node of the expectation contributes an entry state and an exit state,
 * so entering a node, leaving it and coming back round to it are separate edges
 * rather than the same one. A node the publication makes optional gets an edge
 * that skips it; a node it lets repeat gets an edge back from its body's exit to
 * that body's entry; a node it bounds at a finite maximum above one gets that
 * many copies of its body, the ones past the minimum skippable. Nothing else is
 * added, so the automaton accepts exactly the beginnings the publication allows.
 */
interface OrderAutomaton {
  /** Edges that consume nothing, by state. */
  readonly epsilon: readonly (readonly number[])[];
  /** The edge a state consumes, where it has one. Absent for a structural state. */
  readonly consume: readonly (SegmentEdge | undefined)[];
  /** The state a walk of the whole structure starts from. */
  readonly start: number;
}

/** One node of the expectation, with the index its children point at. */
interface IndexedNode {
  /** The node's index in the expectation's node list. */
  readonly index: number;
  /** The node itself. */
  readonly node: StructureExpectationNode;
}

/** Build the order automaton for one variant's ordered expectation. */
function buildOrderAutomaton(
  nodes: readonly StructureExpectationNode[],
  reported: ReadonlyMap<string, ReportedBound>,
): OrderAutomaton {
  const epsilon: number[][] = [];
  const consume: (SegmentEdge | undefined)[] = [];

  const newState = (): number => {
    epsilon.push([]);
    consume.push(undefined);
    return epsilon.length - 1;
  };
  const connect = (from: number, to: number): void => {
    epsilon[from]?.push(to);
  };

  // Children by enclosing group, in publication order. A node whose parent is
  // not a group earlier in the list sits at the structure root, which is the
  // reading the occurrence bounds take of it too.
  const children = new Map<number, IndexedNode[]>();
  nodes.forEach((node, index) => {
    const enclosing =
      node.parent >= 0 && node.parent < index && nodes[node.parent]?.kind === "group"
        ? node.parent
        : -1;
    const siblings = children.get(enclosing);
    if (siblings === undefined) children.set(enclosing, [{ index, node }]);
    else siblings.push({ index, node });
  });

  /** Chain a run of nodes, each following the one before it. */
  function chain(from: number, run: readonly IndexedNode[]): number {
    let cursor = from;
    for (const child of run) {
      const [entry, exit] = repeated(child);
      connect(cursor, entry);
      cursor = exit;
    }
    return cursor;
  }

  /** ONE occurrence of a node: the segment it reads, or its children in order. */
  function body(child: IndexedNode): readonly [number, number] {
    const entry = newState();
    const exit = newState();
    if (child.node.kind === "segment") {
      consume[entry] = { name: child.node.name, to: exit };
      return [entry, exit];
    }
    connect(chain(entry, children.get(child.index) ?? []), exit);
    return [entry, exit];
  }

  /** A node as often as the publication lets it occur at this locus, and no oftener. */
  function repeated(child: IndexedNode): readonly [number, number] {
    const relaxed = child.node.kind === "segment" ? reported.get(child.node.name) : undefined;
    const min = relaxed === "minimum" ? 0 : child.node.min;
    const max = relaxed === "maximum" ? UNBOUNDED : child.node.max;
    const entry = newState();
    const exit = newState();
    if (max === UNBOUNDED) {
      // The last required occurrence carries the loop, so an unbounded node
      // costs one copy of its body per required occurrence and no more.
      let cursor = entry;
      const required = Math.max(min, 1);
      for (let copy = 0; copy < required; copy += 1) {
        const [bodyEntry, bodyExit] = body(child);
        connect(cursor, bodyEntry);
        if (copy === required - 1) connect(bodyExit, bodyEntry);
        cursor = bodyExit;
      }
      connect(cursor, exit);
      if (min === 0) connect(entry, exit);
      return [entry, exit];
    }
    let cursor = entry;
    for (let copy = 0; copy < max; copy += 1) {
      // Past the minimum, every further occurrence may be the one left out.
      if (copy >= min) connect(cursor, exit);
      const [bodyEntry, bodyExit] = body(child);
      connect(cursor, bodyEntry);
      cursor = bodyExit;
    }
    connect(cursor, exit);
    return [entry, exit];
  }

  // The structure root has no exit state: a message is one message, and where
  // it ends is the cardinality check's question rather than this one's.
  const start = newState();
  chain(start, children.get(-1) ?? []);
  return { epsilon, consume, start };
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
    for (const next of automaton.epsilon[state] ?? []) pending.push(next);
  }
  return reached;
}

/** The segment names the automaton can consume from any of these states. */
function expectedNames(automaton: OrderAutomaton, states: Iterable<number>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const state of states) {
    const edge = automaton.consume[state];
    if (edge !== undefined) names.add(edge.name);
  }
  return names;
}

/**
 * Where a walk that had reached `states` arrives after reading one segment
 * called `name`, empty when the publication does not allow that name here.
 */
function step(
  automaton: OrderAutomaton,
  states: Iterable<number>,
  name: string,
): ReadonlySet<number> {
  const advanced: number[] = [];
  for (const state of states) {
    const edge = automaton.consume[state];
    if (edge !== undefined && edge.name === name) advanced.push(edge.to);
  }
  return epsilonClosure(automaton, advanced);
}

/** Where the message's sequence and the published order part company. */
interface OrderDivergence {
  /** The observed segment the published order cannot place. */
  readonly segment: ObservedSegment;
  /** Its position in the observed sequence. */
  readonly index: number;
  /** The segment names the publication allows at that point. */
  readonly expected: ReadonlySet<string>;
}

/**
 * The first point the published order cannot place, or `undefined` when the
 * whole sequence is a beginning the publication allows.
 *
 * Every segment handed in must be one the variant names: an unexpected segment
 * is a different finding and would otherwise stop the walk at a position the
 * publication says nothing about.
 */
function firstDivergence(
  automaton: OrderAutomaton,
  observed: readonly ObservedSegment[],
): OrderDivergence | undefined {
  let active = epsilonClosure(automaton, [automaton.start]);
  for (const [index, segment] of observed.entries()) {
    const advanced = step(automaton, active, segment.name);
    if (advanced.size === 0) {
      return { segment, index, expected: expectedNames(automaton, active) };
    }
    active = advanced;
  }
  return undefined;
}

/** How many states one word of a state set holds. */
const STATES_PER_WORD = 32;

/** How many bytes that word occupies. */
const BYTES_PER_WORD = 4;

/**
 * One set of automaton states per message position, packed into a single array.
 *
 * A position's set is `width` consecutive words, one bit per state. Packing it
 * this way is what makes a table over a whole message affordable: the widest
 * published structure builds an automaton of a few hundred states, so a position
 * costs a handful of words rather than a `Set`.
 */
interface StatesByPosition {
  /**
   * `width` words per position, position 0 first, behind a `DataView` because
   * that reads a word as a number rather than as a number that might be absent:
   * every index below is in range by construction, and a fallback written for
   * one that never is would be a branch no test could reach.
   */
  readonly words: DataView;
  /** Words one position's set occupies. */
  readonly width: number;
}

/** Byte offset of the word of a packed set that carries `state`. */
function wordOf(state: number): number {
  return Math.trunc(state / STATES_PER_WORD) * BYTES_PER_WORD;
}

/** The bit within that word. */
function bitOf(state: number): number {
  return 1 << (state % STATES_PER_WORD);
}

/** Byte offset where the set recorded at `position` begins. */
function setAt(table: StatesByPosition, position: number): number {
  return position * table.width * BYTES_PER_WORD;
}

/** Is `state` in the set recorded at `position`? */
function holds(table: StatesByPosition, position: number, state: number): boolean {
  return (table.words.getUint32(setAt(table, position) + wordOf(state)) & bitOf(state)) !== 0;
}

/** One reading state, and the state reading it arrives at. */
interface Consumer {
  /** The state that reads the segment. */
  readonly state: number;
  /** Where reading it leads. */
  readonly to: number;
}

/** The states one free edge away from each state, the other way round. */
function epsilonPredecessors(automaton: OrderAutomaton): (readonly number[])[] {
  const predecessors: number[][] = automaton.epsilon.map(() => []);
  automaton.epsilon.forEach((targets, from) => {
    for (const to of targets) predecessors[to]?.push(from);
  });
  return predecessors;
}

/** The states that read each segment name, so a backward step touches only those. */
function consumersByName(automaton: OrderAutomaton): ReadonlyMap<string, readonly Consumer[]> {
  const byName = new Map<string, Consumer[]>();
  automaton.consume.forEach((edge, state) => {
    if (edge === undefined) return;
    const reading = byName.get(edge.name);
    if (reading === undefined) byName.set(edge.name, [{ state, to: edge.to }]);
    else reading.push({ state, to: edge.to });
  });
  return byName;
}

/**
 * For every position of the message, the states from which the publication can
 * read the REST of it: the set at `k` holds each state a walk could sit in and
 * still consume `observed[k]` through to the end.
 *
 * The last entry, at `observed.length`, is every state - a message that has been
 * read to its end asks nothing more of the walk. Each earlier position is one
 * step backwards: the states that read the segment there into a state the next
 * position already allows, plus everything that reaches one of those for free.
 *
 * It is one backward pass over the message, and it is what lets the pair search
 * below ask its question of EVERY pair for the price of a walk or two, instead
 * of re-walking the message once per pair.
 */
function suffixStates(
  automaton: OrderAutomaton,
  observed: readonly ObservedSegment[],
): StatesByPosition {
  const width = Math.max(1, Math.ceil(automaton.epsilon.length / STATES_PER_WORD));
  const packed = new Uint32Array((observed.length + 1) * width);
  packed.fill(0xffffffff, observed.length * width);
  const table: StatesByPosition = { words: new DataView(packed.buffer), width };

  const consumers = consumersByName(automaton);
  const predecessors = epsilonPredecessors(automaton);
  // One scratch queue and one scratch marker, reused down the whole message:
  // a message is long and an automaton is not, so the per-position work has to
  // be the automaton's size and nothing else.
  const pending: number[] = [];
  const queued = new Uint8Array(automaton.epsilon.length);
  let position = observed.length;
  for (const segment of [...observed].reverse()) {
    position -= 1;
    const base = setAt(table, position);
    queued.fill(0);
    for (const reading of consumers.get(segment.name) ?? []) {
      if (queued[reading.state] === 1) continue;
      if (!holds(table, position + 1, reading.to)) continue;
      queued[reading.state] = 1;
      pending.push(reading.state);
    }
    // A state that reaches a reading state for free reads the same segment.
    for (;;) {
      const state = pending.pop();
      if (state === undefined) break;
      const at = base + wordOf(state);
      table.words.setUint32(at, table.words.getUint32(at) | bitOf(state));
      for (const before of predecessors[state] ?? []) {
        if (queued[before] === 1) continue;
        queued[before] = 1;
        pending.push(before);
      }
    }
  }
  return table;
}

/**
 * The EARLIEST adjacent pair whose exchange leaves a sequence the publication
 * derives, or `undefined` where no exchange does.
 *
 * EVERY pair is asked, with no bound on how far the search may look, because a
 * bound is only ever measured over the messages someone thought to try: the pair
 * that repairs an `OML^O21` carrying three orders sits six segments before the
 * point the walk stopped, and no rule drawn from that stopping point reaches it.
 * What needed bounding was the COST, and the suffix table above bounds that
 * instead - one backward pass, then one forward pass carrying the prefix, so the
 * whole search is a fixed number of walks however long the message is.
 *
 * Only pairs at or before the divergence are asked, and that is a proof rather
 * than a heuristic: exchanging a later pair leaves the segment the walk could not
 * place exactly where it is, so the same prefix fails again.
 *
 * The earliest is the answer because the message is read from the front: a later
 * pair whose exchange also derives repairs a sequence that was already wrong.
 */
function repairingExchange(
  automaton: OrderAutomaton,
  observed: readonly ObservedSegment[],
  divergenceIndex: number,
): number | undefined {
  const suffix = suffixStates(automaton, observed);
  let active = epsilonClosure(automaton, [automaton.start]);
  for (let at = 0; at <= divergenceIndex; at += 1) {
    const early = observed[at];
    const late = observed[at + 1];
    if (early === undefined || late === undefined) return undefined;
    // Exchanging one name for itself leaves the sequence the walk already refused.
    if (early.name !== late.name) {
      const read = step(automaton, step(automaton, active, late.name), early.name);
      for (const state of read) if (holds(suffix, at + 2, state)) return at;
    }
    active = step(automaton, active, early.name);
    if (active.size === 0) return undefined;
  }
  return undefined;
}

/**
 * The occurrence an ordering finding names: the segment that arrived late.
 *
 * The case being reported is two segments in an order the publication does not
 * allow, so the question asked first is that one exactly: is there an adjacent
 * pair the message delivered in one order and the publication takes in the
 * other. Where there is, the finding names the SECOND of the two, which is the
 * segment the publication puts first and the message delivered late.
 *
 * Where no exchange derives, the defect is not two segments in the wrong order
 * and there is no second member to name. Then the first later occurrence of a
 * name the publication allowed where the sequence diverged is named - that is
 * the segment which belonged where the divergence arrived - and failing that the
 * segment that could not be placed.
 */
function misplacedSegment(
  automaton: OrderAutomaton,
  observed: readonly ObservedSegment[],
  divergence: OrderDivergence,
): ObservedSegment {
  const site = repairingExchange(automaton, observed, divergence.index);
  const late = site === undefined ? undefined : observed[site + 1];
  if (late !== undefined) return late;
  for (let index = divergence.index + 1; index < observed.length; index += 1) {
    const candidate = observed[index];
    if (candidate !== undefined && divergence.expected.has(candidate.name)) return candidate;
  }
  return divergence.segment;
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
 * The cardinality check runs first because what it reports is what the order
 * walk relaxes: one defect, one finding.
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

  const cardinality: StructureFinding[] = [];
  const reported = new Map<string, ReportedBound>();
  const byName = [...bounds.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
  for (const [name, bound] of byName) {
    const count = counts.get(name) ?? 0;
    if (count < bound.min) {
      reported.set(name, "minimum");
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
      reported.set(name, "maximum");
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

  const ordering: StructureFinding[] = [];
  const automaton = buildOrderAutomaton(schema.nodes, reported);
  const divergence = firstDivergence(automaton, named);
  if (divergence !== undefined) {
    const misplaced = misplacedSegment(automaton, named, divergence);
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

  return [...ordering, ...cardinality, ...unexpected];
}
