/**
 * The `@cosyte/hl7` **text codec** — a first-class, documented namespace for
 * getting the human string out of a field and safely encoding an arbitrary
 * string in.
 *
 * Exposed on the package as the `text` namespace object so a consumer can, in
 * one call:
 *
 * - `text.decode(field.text)` — resolve delimiter/hex/`\.br\` escapes to a value;
 * - `text.render(field.text)` — normalize formatting + highlight to a display model;
 * - `text.encode(anyString)`  — encode-safe: no delimiter injection (Phase T's primitive).
 *
 * ```ts
 * import { text } from "@cosyte/hl7";
 * text.render("Result \\H\\HIGH\\N\\\\.br\\see note").text; // "Result HIGH\nsee note"
 * text.encode("a|b^c").length > 0;                          // delimiter-safe
 * ```
 *
 * The same functions are also available as top-level named exports
 * (`decodeText`, `encodeText`, `renderText`) for tree-shaking-friendly imports.
 */

export { decodeText as decode, encodeText as encode } from "./codec.js";
export { renderText as render } from "./render.js";
