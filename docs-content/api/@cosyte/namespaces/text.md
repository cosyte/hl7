# text

The text codec as one namespace object: `text.decode`, `text.encode` and `text.render` are
`decodeText`, `encodeText` and `renderText` under shorter names.

## Example

```ts
import { text } from "@cosyte/hl7";

text.decode("Line one\\.br\\Line two"); // "Line one\nLine two"
```

## References

### decode

Renames and re-exports [decodeText](../../README.md#decodetext)

***

### encode

Renames and re-exports [encodeText](../../README.md#encodetext)

***

### render

Renames and re-exports [renderText](../../README.md#rendertext)
