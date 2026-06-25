import { cosyteTsup } from "@cosyte/tsup-config";

/**
 * tsup build for the profile starter kit — dual ESM + CJS + `.d.ts` from the shared
 * @cosyte/tsup-config standard, matching the peer @cosyte/hl7 surface.
 */
export default cosyteTsup({ entry: ["src/index.ts"] });
