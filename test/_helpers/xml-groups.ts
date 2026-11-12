import type { XmlMessageStructure } from "../../src/index.js";

/**
 * A small result structure of our own for the v2 XML writer's tests, rooted at `ORU_R01` because
 * the test messages name that structure in MSH-9.3. Its group names and its shape are made up for
 * these tests and are not taken from any HL7 schema: the package ships no group table, so a test
 * that writes groups passes this one, the way a caller passes the one their partner's schema gives.
 *
 * A report is a PID, an optional PV1 and one or more orders; an order is an OBR, its notes, its
 * results (an OBX and its notes) and its samples (an SPM and its OBX segments).
 */
export const LAB_GROUPS: XmlMessageStructure = {
  structure: "ORU_R01",
  items: [
    "MSH",
    {
      group: "REPORT+",
      items: [
        "PID",
        "PV1?",
        {
          group: "ORDER+",
          items: [
            "OBR",
            "NTE*",
            { group: "RESULT*", items: ["OBX", "NTE*"] },
            { group: "SAMPLE*", items: ["SPM", "OBX*"] },
          ],
        },
      ],
    },
  ],
};
