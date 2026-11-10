/**
 * Reading a hand-built raw tree whose repetitions, components or subcomponents
 * array has a hole or a `null` in it. The parser never leaves either, but a
 * caller building a `RawField` by hand can, and the readers would otherwise
 * stop on it with an untyped `TypeError`. A hole or a `null` reads as an empty
 * value, the same as an absent one: an empty repetition, an empty component,
 * an empty subcomponent. Positions stay where they are.
 *
 * @internal
 */

import type { RawComponent, RawField, RawRepetition } from "../parser/types.js";

/** The empty repetition a hole or `null` reads as. @internal */
const EMPTY_REPETITION: RawRepetition = Object.freeze({ components: Object.freeze([]) });

/** The empty component a hole or `null` reads as. @internal */
const EMPTY_COMPONENT: RawComponent = Object.freeze({ subcomponents: Object.freeze([]) });

/**
 * `items` with each entry passed through `dense`, as the same array when no
 * entry changed. Reads each entry once, by index, so a hole reaches `dense`
 * as `undefined` rather than being skipped.
 */
function denseArray<T>(items: readonly T[], dense: (item: T | undefined) => T): readonly T[] {
  let out: T[] | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const read = dense(item);
    if (out === undefined && read !== item) out = items.slice(0, i);
    out?.push(read);
  }
  return out ?? items;
}

/** A subcomponent with a hole or `null` read as `""`. */
function denseSubcomponent(sub: string | undefined): string {
  return sub ?? "";
}

/** A component with a hole or `null` read as empty, at either level. */
function denseComponent(comp: RawComponent | undefined): RawComponent {
  const present = comp ?? EMPTY_COMPONENT;
  const subcomponents = denseArray(present.subcomponents, denseSubcomponent);
  return subcomponents === present.subcomponents ? present : { ...present, subcomponents };
}

/** A repetition with a hole or `null` read as empty, at any level. */
function denseRepetition(rep: RawRepetition | undefined): RawRepetition {
  const present = rep ?? EMPTY_REPETITION;
  const components = denseArray(present.components, denseComponent);
  return components === present.components ? present : { components };
}

/**
 * The repetitions with every hole or `null` in them, at any depth, read as
 * empty. The same array when there is none, which is every parsed field.
 *
 * @internal
 */
export function denseRepetitions(repetitions: readonly RawRepetition[]): readonly RawRepetition[] {
  return denseArray(repetitions, denseRepetition);
}

/**
 * `field` with every hole or `null` in its repetitions, at any depth, read as
 * empty. The same object when there is none, which is every parsed field.
 *
 * @internal
 */
export function denseField(field: RawField): RawField {
  const repetitions = denseRepetitions(field.repetitions);
  return repetitions === field.repetitions ? field : { repetitions, isNull: field.isNull };
}
