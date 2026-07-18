/**
 * MEDITECH (MAGIC / 6.x / Expanse) HL7 quirks. Ships minute-precision
 * timestamps (`YYYYMMDDHHMM`, no seconds) and two DFT charge-capture
 * Z-segments: `ZF1` (provider-encounter copay data) and `ZF2`
 * (encounter-procedure data). BIP-03.
 *
 * Grounded in **publicly downloadable** MEDITECH interface specifications
 * (ADR 0018 — public specs count as real artifacts), not invented:
 *
 * - The **minute-precision** date/time format is confirmed by *two*
 *   public MEDITECH specs: "MEDITECH Admissions and Registration to Other
 *   Vendor Ancillary" (Version 2.4, © 2021 Medical Information Technology,
 *   Inc.) — "Date and Time in Admissions. Format is YYYYMMDDHHMM" — and
 *   "MEDITECH Ancillary Charges (LAB/PHA/ITS/IDM)" (Version 2.1, © 2021),
 *   whose MSH-7 is length **12** (= `YYYYMMDDHHMM`) and whose EVN-2/PID-7
 *   are documented "Format is YYYYMMDDHHMM". Minute precision is
 *   HL7-conformant (TS/DTM permit variable precision), so declaring it here
 *   is not about accepting an illegal value — it records MEDITECH's
 *   characteristic no-seconds convention so date resolution across a
 *   MEDITECH feed is explicit rather than incidental.
 * - `ZF1` and `ZF2` are the DFT (charge) Z-segments defined verbatim in
 *   the Ancillary Charges spec (Version 2.1): `ZF1` = "PROVIDER ENCOUNTER
 *   COPAY DATA" (ZF1-1 PROVIDER ENCOUNTER, ZF1-2 MIS SERVICE GROUP, ZF1-3
 *   SERVICE GROUP COPAY, ZF1-4 VISIT COPAY, ZF1-5 COPAY MINIMUM, ZF1-6
 *   COPAY MAXIMUM); `ZF2` = "ENCOUNTER PROCEDURE DATA" (ZF2-1 SET ID, ZF2-2
 *   PROVIDER ENCOUNTER, ZF2-3 ENCOUNTER DATE, ZF2-4 ENCOUNTER PROCEDURE,
 *   ZF2-5 ENCOUNTER PROCEDURE QUANTITY, ZF2-6 ENCOUNTER PROCEDURE CHARGE,
 *   ZF2-7 PRV PROCEDURE AMOUNT PAID, ZF2-8 PRV PROCEDURE AMOUNT DUE).
 *
 * (This replaced an earlier `ZVI` "visit info" segment that was a
 * community-sourced prior with no citable public grounding — HL7-I
 * re-grounding, ADR 0018. Field positions here are transcribed directly
 * from the spec's segment tables.)
 *
 * Authored from the public `defineProfile()` API — zero privileged
 * internal coupling. Consumers extend this profile via
 * `defineProfile({ name: '...', extends: profiles.meditech, ... })`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.meditech);
 * const zf1 = msg.allSegments().find((s) => s.type === "ZF1");
 * console.log(zf1?.get("visitCopay")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in MEDITECH MAGIC/6.x/Expanse profile (BIP-03). See file header for
 * rationale and spec citations; use via `parseHL7(raw, profiles.meditech)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.meditech);
 * ```
 */
export const meditech = defineProfile({
  name: "meditech",
  description:
    "MEDITECH MAGIC/6.x/Expanse — minute-precision timestamps and DFT charge Z-segments (ZF1/ZF2)",
  dateFormats: ["YYYYMMDDHHmm"],
  customSegments: {
    ZF1: {
      fields: {
        providerEncounter: 1,
        misServiceGroup: 2,
        serviceGroupCopay: 3,
        visitCopay: 4,
        copayMinimum: 5,
        copayMaximum: 6,
      },
    },
    ZF2: {
      fields: {
        setId: 1,
        providerEncounter: 2,
        encounterDate: 3,
        encounterProcedure: 4,
        encounterProcedureQuantity: 5,
        encounterProcedureCharge: 6,
        prvProcedureAmountPaid: 7,
        prvProcedureAmountDue: 8,
      },
    },
  },
});
