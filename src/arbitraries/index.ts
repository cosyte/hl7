/**
 * fast-check generators for HL7 v2, at `@cosyte/hl7/arbitraries`: encoding characters, escape
 * sequences, values, components, repetitions, fields, segments, message types, whole messages,
 * messy message text, hostile input, and an animal patient's species, breed, strain and production
 * class. We use them to test this library, and you can use them to test code you build on it.
 *
 * `fast-check` is an optional peer dependency: install it to use this entry point. The main
 * entry point, `@cosyte/hl7`, never loads it.
 *
 * Every generated value is synthetic and random. Nothing in one looks like a patient's name,
 * date of birth, address or identifier.
 *
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseHL7 } from "@cosyte/hl7";
 * import { message } from "@cosyte/hl7/arbitraries";
 *
 * fc.assert(
 *   fc.property(message(), (msg) => parseHL7(msg.toString()).toString() === msg.toString()),
 * );
 * ```
 *
 * @packageDocumentation
 */

export { encodingCharacters, escapeSequence } from "./encoding.js";
export type { EncodingCharactersOptions, EscapeSequenceOptions } from "./encoding.js";
export { component, field, repetition, segment, value } from "./tree.js";
export type { SegmentOptions, TreeOptions, ValueOptions } from "./tree.js";
export { hostileInput, message, messageText, messageType } from "./message.js";
export type { HostileInputOptions, MessageOptions, MessageType } from "./message.js";
export { breed, productionClass, species, strain } from "./patient.js";
