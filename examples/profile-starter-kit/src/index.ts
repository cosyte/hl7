/**
 * {{PROFILE_NAME}} profile for {{YOUR_ORG}} HL7 integrations.
 *
 * Declares one Z-segment (ZAL — allergy detail) and one non-HL7 date
 * format (ISO date-only). Extends the built-in generic reference-lab
 * profile to inherit ASTM-era and ISO-date fallbacks for free.
 *
 * Customize by following CUSTOMIZING.md.
 */

import { defineProfile, profiles } from "@cosyte/hl7-parser";

/**
 * Sample profile exported by this starter kit. Swap the identifier
 * `MyProfile` for your PascalCase profile name during CUSTOMIZING.md
 * step 1.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * import { MyProfile } from "@{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}";
 *
 * const msg = parseHL7(raw, MyProfile);
 * const zal = msg.segments("ZAL")[0];
 * console.log(zal?.get("allergyId")?.value);
 * ```
 */
export const MyProfile = defineProfile({
  name: "{{PROFILE_NAME}}",
  description: "Profile for {{YOUR_ORG}} HL7 integrations",
  extends: profiles.genericLab,
  customSegments: {
    ZAL: {
      fields: {
        allergyId: 1,
        severity: 2,
        verifiedAt: 3,
      },
    },
  },
  dateFormats: ["YYYY-MM-DD"],
});
