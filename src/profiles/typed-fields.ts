/**
 * Typed custom-segment field names: the compile-time view of a declaration the
 * runtime already honours.
 *
 * A profile author already tells the parser exactly which field names a custom
 * Z-segment carries (`customSegments: { ZDP: { fields: { departmentCode: 3 } } }`),
 * and at run time `seg.get("departmentCode")` resolves position 3. Until these
 * types existed the declaration was thrown away at the type level: the factory
 * returned the widened `Profile` interface and the reader was
 * `get(name: string)`, so `seg.get("departmentCod")` type-checked perfectly and
 * silently read nothing.
 *
 * Three properties keep this honest, and each is the reason a piece of it is
 * shaped the way it is:
 *
 * - **It is a view, not a behaviour.** Nothing here emits a value, and the
 *   runtime resolution path is untouched: the same positions resolve to the
 *   same fields, and every name that returned `undefined` before still does.
 * - **The fallback is permissive, everywhere the declaration is not statically
 *   known.** No profile, a value typed as the general {@link Profile}
 *   interface, a profile resolved from the process-wide default registry, an
 *   undeclared segment type, an empty field map: every one of them keeps the
 *   `string`-accepting signature, because an unknown declaration is a reason to
 *   say nothing rather than a reason to reject.
 * - **Nothing is typed as guaranteed-present.** A declared name whose position
 *   carries no value in the wire message still reads `undefined`, so the reader
 *   stays `Field | undefined` for a declared name exactly as for any other.
 *
 * Zero runtime deps and zero runtime code: this module is types only.
 */

import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { Profile } from "../parser/types.js";

/** A declaration map that declares nothing at all. @internal */
type NoCustomSegments = Readonly<Record<never, never>>;

/**
 * Collapse a union to the intersection of its members. Used to merge the
 * declarations of several parent profiles, whose union arrives from an array
 * index rather than as an intersection.
 * @internal
 */
type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/** Re-key an intersection as one object type so its keys read as a single map. @internal */
type Flatten<T> = { readonly [K in keyof T]: T[K] };

/** The declaration map an options object (or a profile) carries itself. @internal */
type OwnSegments<O> = O extends { readonly customSegments: infer C } ? C : NoCustomSegments;

/** The declaration maps of every parent named by `extends`, merged. @internal */
type ParentSegments<E> = E extends readonly unknown[]
  ? UnionToIntersection<OwnSegments<E[number]>>
  : OwnSegments<E>;

/** The declaration maps inherited through `extends`, or none. @internal */
type InheritedSegments<O> = O extends { readonly extends: infer E }
  ? ParentSegments<E>
  : NoCustomSegments;

/**
 * Every declaration an options object contributes: what it inherits through
 * `extends`, merged with what it declares itself. Merging is additive per
 * segment type, matching the runtime merge, which keeps a parent's field name
 * unless the child re-uses its POSITION.
 * @internal
 */
type DeclaredSegments<O> = Flatten<InheritedSegments<O> & OwnSegments<O>>;

/**
 * `string` for a name set that is empty or open-ended, the closed union
 * otherwise. Both openings are a declaration the compiler cannot close: an
 * empty field map declares nothing, and a map typed with an index signature
 * declares anything.
 * @internal
 */
type OpenOrClosed<N extends string> = [N] extends [never] ? string : string extends N ? string : N;

/** The names one segment declaration carries; `string` when it carries none. @internal */
type FieldNamesOf<D> = D extends { readonly fields: infer F }
  ? OpenOrClosed<Extract<keyof F, string>>
  : string;

/**
 * Resolve a segment type against a declaration map, canonical spelling first
 * then verbatim, in the same order the reader resolves it at run time. A
 * segment type the map does not declare falls back to `string`.
 * @internal
 */
type DeclaredFieldName<C, S extends string> =
  Uppercase<S> extends keyof C
    ? FieldNamesOf<C[Uppercase<S> & keyof C]>
    : S extends keyof C
      ? FieldNamesOf<C[S & keyof C]>
      : string;

/**
 * The field names profile `P` declares for segment type `S`, as a closed union
 * of string literals, or `string` when the compiler cannot know them.
 *
 * `string` is the answer for every case where a declaration is not statically
 * visible, and there are more of those than there are narrowing ones: a value
 * typed as the general {@link Profile} interface, a segment type the profile
 * does not declare, a segment declared with an empty field map, and a
 * declaration map typed with an index signature. Narrowing is per segment type,
 * never a flat union of every name the profile declares.
 *
 * @example
 * ```ts
 * import { defineProfile, type ProfileFieldName } from "@cosyte/hl7";
 * const epic = defineProfile({
 *   name: "epic",
 *   customSegments: { ZDP: { fields: { departmentCode: 3, departmentName: 4 } } },
 * });
 * type Zdp = ProfileFieldName<typeof epic, "ZDP">; // "departmentCode" | "departmentName"
 * type Zzz = ProfileFieldName<typeof epic, "ZZZ">; // string: undeclared segment type
 * ```
 */
export type ProfileFieldName<P, S extends string> = P extends {
  readonly customSegments: infer C;
}
  ? DeclaredFieldName<C, S>
  : string;

/**
 * The profile {@link defineProfile} produces for one options object: every
 * member of the general {@link Profile} interface, with `customSegments` at the
 * declarations that options object actually carries (its own, merged with every
 * parent's).
 *
 * It stays assignable to {@link Profile} with no cast, so a profile built by
 * the factory still passes to every API that accepts the general interface, and
 * a caller who annotates a variable with `Profile` simply gives the narrowing
 * up rather than hitting a type error.
 *
 * @example
 * ```ts
 * import { defineProfile, type Profile } from "@cosyte/hl7";
 * const epic = defineProfile({
 *   name: "epic",
 *   customSegments: { ZDP: { fields: { departmentCode: 3 } } },
 * });
 * const asGeneral: Profile = epic; // no cast: the narrowing is additive
 * console.log(asGeneral.name); // "epic"
 * ```
 */
export interface DefinedProfile<O> extends Omit<Profile, "customSegments"> {
  /** The merged declarations, at the literal segment types and field names. */
  readonly customSegments: DeclaredSegments<O>;
}

/**
 * A parsed message whose applied profile is statically known: every
 * {@link Hl7Message} member unchanged, with the segment-type-keyed accessors
 * scoped so a segment of a declared type exposes that type's declared field
 * names to {@link Segment.get}.
 *
 * It is a view, not a subclass: the parse allocates nothing extra and behaves
 * identically. Segments reached any other way (the undifferentiated
 * {@link Hl7Message.allSegments} walk) keep the `string`-accepting reader,
 * because the segment type is not knowable from a walk.
 *
 * @example
 * ```ts
 * import { defineProfile, parseHL7 } from "@cosyte/hl7";
 * const epic = defineProfile({
 *   name: "epic",
 *   customSegments: { ZDP: { fields: { departmentCode: 3, departmentName: 4 } } },
 * });
 * const msg = parseHL7(raw, epic);
 * const zdp = msg.part("ZDP");
 * console.log(zdp?.get("departmentCode")?.value); // narrowed, no cast
 * // zdp?.get("departmentCod"); // does not compile: not a declared ZDP name
 * console.log(msg.part("PID")?.field(5).value); // undeclared type: any name compiles
 * ```
 */
export interface ProfiledMessage<P> extends Hl7Message {
  /** Every segment of `segmentType`, with that type's declared field names. */
  segments<S extends string>(segmentType: S): readonly Segment<ProfileFieldName<P, S>>[];
  /** Alias for {@link ProfiledMessage.segments}, with the same narrowing. */
  getAll<S extends string>(segmentType: S): readonly Segment<ProfileFieldName<P, S>>[];
  /** The first segment of `segmentType`, with that type's declared field names. */
  part<S extends string>(segmentType: S): Segment<ProfileFieldName<P, S>> | undefined;
  /** Every segment of `segmentType`, with that type's declared field names. */
  parts<S extends string>(segmentType: S): readonly Segment<ProfileFieldName<P, S>>[];
}
