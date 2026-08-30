import { describe, expect, it } from "vitest";

import {
  BUILTIN_DATE_FALLBACKS,
  dtmToDate,
  formatDtm,
  parseDtm,
  parseDtmCascade,
  SUPPORTED_DATE_TOKENS,
} from "../src/parser/dates.js";
import {
  DATE_TOKEN_SPECS,
  matchDateFormat,
  matchTokenParts,
  tokeniseDateFormat,
} from "../src/parser/date-tokens.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { DateFormatToken } from "../src/parser/date-tokens.js";
import type { Hl7Position } from "../src/parser/types.js";

const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 7 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/dates: parseDtm: precision fidelity", () => {
  it("year-only preserves precision without zero-fill", () => {
    const p = parseDtm("1970");
    expect(p).toMatchObject({ valid: true, precision: "year", year: 1970, hasTimezone: false });
    expect(p.month).toBeUndefined();
  });

  it("month precision", () => {
    expect(parseDtm("202501")).toMatchObject({ precision: "month", year: 2025, month: 1 });
  });

  it("day precision (a birth date stays day-only)", () => {
    expect(parseDtm("19880705")).toMatchObject({ precision: "day", year: 1988, month: 7, day: 5 });
  });

  it("hour precision", () => {
    expect(parseDtm("2025010215")).toMatchObject({ precision: "hour", hour: 15 });
  });

  it("minute precision", () => {
    expect(parseDtm("198807050000")).toMatchObject({ precision: "minute", minute: 0, day: 5 });
  });

  it("second precision", () => {
    expect(parseDtm("20250102153045")).toMatchObject({ precision: "second", second: 45 });
  });

  it("fractional precision preserves digits verbatim", () => {
    expect(parseDtm("20250102153045.5")).toMatchObject({
      precision: "fraction",
      fractionalSeconds: "5",
    });
    expect(parseDtm("20250102153045.0500").fractionalSeconds).toBe("0500");
  });

  it("rejects a fractional component without full second precision", () => {
    expect(parseDtm("202501.5").valid).toBe(false);
  });
});

describe("parser/dates: parseDtm: timezone fidelity (never assume UTC)", () => {
  it("flags a missing offset as no-timezone, never resolving it", () => {
    const p = parseDtm("20250102153045");
    expect(p.hasTimezone).toBe(false);
    expect(p.offsetMinutes).toBeUndefined();
  });

  it("captures a positive offset as signed minutes east of UTC", () => {
    expect(parseDtm("20250102153045+0500")).toMatchObject({
      hasTimezone: true,
      offsetMinutes: 300,
    });
  });

  it("captures a fractional-hour negative offset (-0930 → -570)", () => {
    expect(parseDtm("20250102-0930")).toMatchObject({ hasTimezone: true, offsetMinutes: -570 });
  });

  it("treats +0000 as a present zero offset (not a missing zone)", () => {
    expect(parseDtm("20250102153045+0000")).toMatchObject({
      hasTimezone: true,
      offsetMinutes: 0,
    });
  });
});

describe("parser/dates: parseDtm: fail-safe (invalid → valid:false, never a guess)", () => {
  it.each([
    ["month 00", "20250001"],
    ["month 13", "20251301"],
    ["day 00", "20250100"],
    ["day 32", "20250132"],
    ["hour 24", "2025010224"],
    ["minute 60", "202501021560"],
    ["second 60 (no leap seconds)", "20250102153060"],
    ["non-date text", "not-a-date"],
    ["odd digit length", "202501021"],
  ])("rejects %s", (_label, raw) => {
    const p = parseDtm(raw);
    expect(p.valid).toBe(false);
    expect(p.raw).toBe(raw);
    expect(p.year).toBeUndefined();
  });

  it("empty string is invalid with empty raw", () => {
    expect(parseDtm("")).toMatchObject({ raw: "", valid: false, hasTimezone: false });
  });
});

describe("parser/dates: dtmToDate: explicit, opt-in, honest", () => {
  it("uses an embedded offset to compute the exact instant", () => {
    expect(dtmToDate(parseDtm("20250102153045+0500"))?.toISOString()).toBe(
      "2025-01-02T10:30:45.000Z",
    );
    expect(dtmToDate(parseDtm("20250102103045-0500"))?.toISOString()).toBe(
      "2025-01-02T15:30:45.000Z",
    );
  });

  it("refuses to guess a zone for an offset-less value", () => {
    expect(dtmToDate(parseDtm("20250102153045"))).toBeUndefined();
  });

  it("applies a caller-supplied assumed offset (0 = explicit UTC)", () => {
    expect(dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2025-01-02T00:00:00.000Z",
    );
    // A day-only value with an assumed +offset shifts correctly, no rollover.
    expect(dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 300 })?.toISOString()).toBe(
      "2025-01-01T19:00:00.000Z",
    );
  });

  it("ignores assumeOffsetMinutes when the value carries its own offset", () => {
    expect(
      dtmToDate(parseDtm("20250102153045+0500"), { assumeOffsetMinutes: 0 })?.toISOString(),
    ).toBe("2025-01-02T10:30:45.000Z");
  });

  it("fills truncated fields to their lowest legal value for instant construction", () => {
    expect(dtmToDate(parseDtm("1970"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });

  it("carries fractional seconds into the instant (3-digit ms)", () => {
    const d = dtmToDate(parseDtm("20250102153045.5+0000"));
    expect(d?.getUTCMilliseconds()).toBe(500);
  });

  it("returns undefined for an invalid value", () => {
    expect(dtmToDate(parseDtm("garbage"), { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("does not remap a 1–99 AD year via the Date.UTC two-digit-year legacy", () => {
    // `Date.UTC(50, …)` would yield year 1950; the instant must stay year 50.
    expect(dtmToDate(parseDtm("0050+0000"))?.getUTCFullYear()).toBe(50);
    expect(dtmToDate(parseDtm("00090102+0000"))?.getUTCFullYear()).toBe(9);
  });
});

describe("parser/dates: formatDtm: lossless reconstruction (no zero-fill)", () => {
  it.each([
    "1970",
    "202501",
    "19880705",
    "2025010215",
    "198807050000",
    "20250102153045",
    "20250102153045.5",
    "20250102153045.0500",
    "20250102153045+0500",
    "20250102103045-0930",
    "20250102153045+0000",
    "20250102153045-0000", // byte-preserving: -0000 must not canonicalize to +0000
  ])("round-trips %s exactly", (raw) => {
    expect(formatDtm(parseDtm(raw))).toBe(raw);
  });

  it("returns raw unchanged for an invalid value", () => {
    expect(formatDtm(parseDtm("not-a-date"))).toBe("not-a-date");
  });
});

describe("parser/dates: parseDtm: result is frozen (immutable by default)", () => {
  it("freezes both valid and invalid results", () => {
    expect(Object.isFrozen(parseDtm("20250102153045-0500"))).toBe(true);
    expect(Object.isFrozen(parseDtm("not-a-date"))).toBe(true);
    expect(Object.isFrozen(parseDtm(""))).toBe(true);
  });
});

describe("parser/dates: parseDtmCascade: lenient fallback for non-composite callers", () => {
  it("strict HL7 DTM path never warns and returns full parts", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("20250102", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p).toMatchObject({ valid: true, precision: "day", year: 2025, month: 1, day: 2 });
    expect(p.matchedFormat).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("emits TIMESTAMP_FALLBACK_FORMAT and records the matched format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("01/02/2025", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p).toMatchObject({
      valid: true,
      year: 2025,
      month: 1,
      day: 2,
      matchedFormat: "MM/DD/YYYY",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("tries user formats in order: second matches when first fails", () => {
    const { emit, warnings } = collect();
    parseDtmCascade("01/02/2025", {
      userFormats: ["YYYY-MM-DD", "MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("falls back to built-ins when userFormats is empty", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("2025-01-02", { userFormats: [], emit, position: pos });
    expect(p).toMatchObject({ valid: true, year: 2025, month: 1, day: 2 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/YYYY-MM-DD|ISO-8601/);
  });

  it("parses ISO-8601 with a Z offset as timezone-present", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("2025-01-02T15:30:45Z", { userFormats: [], emit, position: pos });
    expect(p).toMatchObject({ valid: true, hasTimezone: true, offsetMinutes: 0, second: 45 });
    expect(dtmToDate(p)?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
    expect(warnings[0]?.message).toMatch(/ISO-8601/);
  });

  it("parses ISO-8601 with an explicit +HH:MM offset", () => {
    const p = parseDtmCascade("2025-01-02T15:30:45+05:00", { userFormats: [] });
    expect(p).toMatchObject({ hasTimezone: true, offsetMinutes: 300 });
  });

  it("returns invalid + no warning when nothing matches", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("notadate", { userFormats: [], emit, position: pos });
    expect(p.valid).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("empty input is invalid without consulting any format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p.valid).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("rejects trailing characters beyond a token format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("01/02/2025 99", {
      userFormats: ["MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(p.valid).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("rejects a token chunk that is not all digits", () => {
    const p = parseDtmCascade("1X/02/2025", { userFormats: ["MM/DD/YYYY"] });
    expect(p.valid).toBe(false);
  });

  it("rejects a token-format value that is calendar-out-of-range", () => {
    expect(parseDtmCascade("13/02/2025", { userFormats: ["MM/DD/YYYY"] }).valid).toBe(false);
  });

  it("BUILTIN_DATE_FALLBACKS lists all 4 built-in format names in order", () => {
    expect(BUILTIN_DATE_FALLBACKS).toEqual([
      "ISO-8601",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
      "MM/DD/YYYY HH:mm:ss",
    ]);
  });
});

describe("parser/dates: the published token vocabulary is what the matcher honours", () => {
  it("publishes exactly the vocabulary table", () => {
    expect(SUPPORTED_DATE_TOKENS).toEqual([
      "YYYY",
      "MM",
      "M",
      "MMM",
      "MMMM",
      "DD",
      "D",
      "HH",
      "H",
      "hh",
      "h",
      "mm",
      "ss",
      "SSSS",
      "A",
    ]);
  });

  it("carries no two-digit-year token and no timezone token", () => {
    expect(SUPPORTED_DATE_TOKENS).not.toContain("YY");
    expect(SUPPORTED_DATE_TOKENS).not.toContain("Z");
    expect(SUPPORTED_DATE_TOKENS).not.toContain("ZZ");
    expect(SUPPORTED_DATE_TOKENS).not.toContain("ZZZZ");
  });

  // The divergence this closes: `SSSS` used to be published and accepted by
  // the validator while the matcher could only see it as four literal `S`
  // characters, so a format carrying it constructed and then never matched.
  it.each(SUPPORTED_DATE_TOKENS)(
    "'%s' is tokenised as a token, never as literal characters",
    (token) => {
      const parts = tokeniseDateFormat(token);
      expect(parts).toHaveLength(1);
      expect(parts[0]?.kind).toBe("token");
      expect(DATE_TOKEN_SPECS[token as DateFormatToken]).toBeDefined();
    },
  );

  it("every published token has a spec, and every spec has a published token", () => {
    expect(Object.keys(DATE_TOKEN_SPECS).sort()).toEqual([...SUPPORTED_DATE_TOKENS].sort());
  });

  it("honours SSSS in a real match rather than treating it as four literals", () => {
    const p = parseDtmCascade("2025-01-02 15:30:45.0500", {
      userFormats: ["YYYY-MM-DD HH:mm:ss.SSSS"],
    });
    expect(p).toMatchObject({ valid: true, precision: "fraction", fractionalSeconds: "0500" });
    // The literal reading would demand the four characters "SSSS" in the input.
    expect(
      parseDtmCascade("2025-01-02 15:30:45.SSSS", {
        userFormats: ["YYYY-MM-DD HH:mm:ss.SSSS"],
      }).valid,
    ).toBe(false);
  });
});

describe("parser/dates: month-name tokens resolve case-insensitively to a month NUMBER", () => {
  it.each(["05-JUL-1988", "05-Jul-1988", "05-jul-1988"])(
    "%s under DD-MMM-YYYY is 1988-07-05 at day precision",
    (raw) => {
      const p = parseDtmCascade(raw, { userFormats: ["DD-MMM-YYYY"] });
      expect(p).toMatchObject({
        valid: true,
        precision: "day",
        year: 1988,
        month: 7,
        day: 5,
        matchedFormat: "DD-MMM-YYYY",
      });
    },
  );

  it("resolves all twelve abbreviations to 1 through 12, never 0-based", () => {
    const abbreviations = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    abbreviations.forEach((name, index) => {
      expect(matchDateFormat(`01-${name}-1988`, "DD-MMM-YYYY")?.month).toBe(index + 1);
    });
  });

  it("resolves all twelve full names to 1 through 12", () => {
    const names = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    names.forEach((name, index) => {
      expect(matchDateFormat(`${name} 1, 1988`, "MMMM D, YYYY")?.month).toBe(index + 1);
    });
  });

  it("refuses a name that is not one of the twelve", () => {
    expect(parseDtmCascade("05-JUX-1988", { userFormats: ["DD-MMM-YYYY"] }).valid).toBe(false);
    expect(matchDateFormat("05-JUX-1988", "DD-MMM-YYYY")).toBeUndefined();
  });

  it("does not accept an abbreviation where the full name is required", () => {
    expect(matchDateFormat("Jul 5, 1988", "MMMM D, YYYY")).toBeUndefined();
  });
});

describe("parser/dates: a 12-hour clock plus a meridiem yields the 24-hour value", () => {
  it.each([
    ["7/5/1988 12:00 AM", 0],
    ["7/5/1988 12:00 PM", 12],
    ["7/5/1988 2:30 PM", 14],
    ["7/5/1988 2:30 AM", 2],
    ["7/5/1988 11:59 PM", 23],
  ])("%s under M/D/YYYY h:mm A is hour %i", (raw, hour) => {
    const p = parseDtmCascade(raw, { userFormats: ["M/D/YYYY h:mm A"] });
    expect(p).toMatchObject({ valid: true, year: 1988, month: 7, day: 5, hour });
  });

  it("the meridiem does not survive into the parsed parts", () => {
    const p = parseDtmCascade("7/5/1988 2:30 PM", { userFormats: ["M/D/YYYY h:mm A"] });
    expect(Object.keys(p)).not.toContain("meridiem");
    expect(p.precision).toBe("minute");
    // Only `raw` (the value as it arrived) and `matchedFormat` may mention it.
    const { raw: _raw, matchedFormat: _matchedFormat, ...rest } = p;
    expect(JSON.stringify(rest)).not.toMatch(/[AaPp][Mm]/u);
    expect(matchDateFormat("7/5/1988 2:30 PM", "M/D/YYYY h:mm A")).toStrictEqual({
      year: 1988,
      month: 7,
      day: 5,
      hour: 14,
      minute: 30,
      second: undefined,
      fractionalSeconds: undefined,
    });
  });

  it("matches the meridiem in any case", () => {
    for (const raw of ["2:30 PM", "2:30 pm", "2:30 pM"]) {
      expect(matchDateFormat(raw, "h:mm A")?.hour).toBe(14);
    }
  });

  it("hh is the same conversion, zero-padded", () => {
    expect(matchDateFormat("02:30 PM", "hh:mm A")?.hour).toBe(14);
    expect(matchDateFormat("2:30 PM", "hh:mm A")).toBeUndefined();
  });

  it("reports no match for an hour outside the 12-hour range", () => {
    expect(matchDateFormat("13:00 PM", "h:mm A")).toBeUndefined();
    expect(matchDateFormat("00:00 AM", "hh:mm A")).toBeUndefined();
  });

  it("reports no match for a meridiem that is not AM or PM", () => {
    expect(matchDateFormat("2:30 XM", "h:mm A")).toBeUndefined();
  });
});

describe("parser/dates: single-digit-tolerant tokens accept both widths", () => {
  it("M/D/YYYY takes one or two digits at every position", () => {
    expect(parseDtmCascade("7/5/1988", { userFormats: ["M/D/YYYY"] })).toMatchObject({
      valid: true,
      year: 1988,
      month: 7,
      day: 5,
    });
    expect(parseDtmCascade("12/25/1988", { userFormats: ["M/D/YYYY"] })).toMatchObject({
      valid: true,
      year: 1988,
      month: 12,
      day: 25,
    });
    expect(parseDtmCascade("7/25/1988", { userFormats: ["M/D/YYYY"] })).toMatchObject({
      month: 7,
      day: 25,
    });
    expect(parseDtmCascade("12/5/1988", { userFormats: ["M/D/YYYY"] })).toMatchObject({
      month: 12,
      day: 5,
    });
  });

  it("H:mm takes one or two digits in the hour", () => {
    expect(matchDateFormat("9:05", "H:mm")).toStrictEqual({
      year: undefined,
      month: undefined,
      day: undefined,
      hour: 9,
      minute: 5,
      second: undefined,
      fractionalSeconds: undefined,
    });
    expect(matchDateFormat("19:05", "H:mm")).toMatchObject({ hour: 19, minute: 5 });
    expect(matchDateFormat("0:05", "H:mm")).toMatchObject({ hour: 0 });
  });

  it("a variable-width token takes the longest run that keeps the rest matchable", () => {
    // 12 is in range for M, and taking it leaves "/25/1988" to match; taking
    // just "1" would leave "2/25/1988", which does not.
    expect(matchDateFormat("12/25/1988", "M/D/YYYY")).toMatchObject({ month: 12, day: 25 });
    // 13 is out of range for M, so the two-digit run is refused outright
    // rather than backtracked into a wrong split.
    expect(matchDateFormat("13/45/1988", "M/D/YYYY")).toBeUndefined();
  });

  it("reports no match when a tolerant token's value is out of range", () => {
    expect(parseDtmCascade("13/45/1988", { userFormats: ["M/D/YYYY"] }).valid).toBe(false);
    expect(matchDateFormat("24:00", "H:mm")).toBeUndefined();
  });
});

describe("parser/dates: literal escaping with square brackets", () => {
  it("matches the bracketed text verbatim", () => {
    expect(
      parseDtmCascade("2025-01-02T15:30:45", { userFormats: ["YYYY-MM-DD[T]HH:mm:ss"] }),
    ).toMatchObject({ valid: true, year: 2025, month: 1, day: 2, hour: 15, second: 45 });
  });

  it("a bracketed literal is verbatim, so a different character does not match", () => {
    expect(matchDateFormat("2025-01-02 15:30:45", "YYYY-MM-DD[T]HH:mm:ss")).toBeUndefined();
    expect(matchDateFormat("2025-01-02t15:30:45", "YYYY-MM-DD[T]HH:mm:ss")).toBeUndefined();
  });

  it("an escape may hold several characters, including ones that spell tokens", () => {
    expect(matchDateFormat("5 of July 1988", "D [of] MMMM YYYY")).toMatchObject({
      year: 1988,
      month: 7,
      day: 5,
    });
    // "MM" inside brackets is the two literal characters, not the month token.
    expect(matchDateFormat("MM1988", "[MM]YYYY")).toMatchObject({ year: 1988 });
    expect(matchDateFormat("071988", "[MM]YYYY")).toBeUndefined();
  });

  it("tokenises a bracketed escape as one literal", () => {
    const parts = tokeniseDateFormat("YYYY[T]HH");
    expect(parts.map((p) => p.kind)).toEqual(["token", "literal", "token"]);
    expect(parts[1]).toMatchObject({ value: "T", source: "escaped" });
  });
});

describe("parser/dates: the matcher never throws and never guesses", () => {
  it.each([
    ["empty input", "", "MM/DD/YYYY"],
    ["input ends early", "01/02/20", "MM/DD/YYYY"],
    ["trailing characters", "01/02/2025 99", "MM/DD/YYYY"],
    ["a different separator", "01-02-2025", "MM/DD/YYYY"],
    ["a non-digit inside a numeric token", "1X/02/2025", "MM/DD/YYYY"],
    ["an empty format", "20250102", ""],
    ["a format that is all literals", "abc", "---"],
  ])("%s reports no match without throwing", (_label, input, format) => {
    expect(() => matchDateFormat(input, format)).not.toThrow();
    expect(matchDateFormat(input, format)).toBeUndefined();
  });

  it("emits no parts derived from a failed match", () => {
    const p = parseDtmCascade("13/45/1988", { userFormats: ["M/D/YYYY"] });
    expect(p.valid).toBe(false);
    expect(p.year).toBeUndefined();
    expect(p.month).toBeUndefined();
    expect(p.day).toBeUndefined();
  });

  it("refuses an unpaired 12-hour token or meridiem rather than inventing an hour", () => {
    // Neither format survives the definition-time validator; reaching the
    // matcher with one is only possible through the unvalidated parse option,
    // and the honest answer there is no match, not a wrong hour.
    expect(matchDateFormat("2:30", "h:mm")).toBeUndefined();
    expect(matchDateFormat("14:30 PM", "HH:mm A")).toBeUndefined();
  });

  it("refuses a fraction with no seconds, matching the strict parser's rule", () => {
    expect(matchDateFormat("1988-07-05 14:30.5", "YYYY-MM-DD HH:mm.SSSS")).toBeUndefined();
  });

  it("terminates promptly on a format built to force backtracking", () => {
    // Twelve variable-width tokens in a row, over an input whose last
    // character no numeric token can consume, so EVERY split is explored and
    // every one fails. Without the memo on (part, position) that is 2^12
    // paths; with it the walk is bounded by the state space.
    const format = "MD".repeat(12);
    const started = Date.now();
    expect(matchDateFormat("1".repeat(23) + "x", format)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("parser/dates: formats valid under the previous vocabulary are unchanged", () => {
  it.each([
    ["YYYY", "1988", { year: 1988, precision: "year" }],
    ["YYYY-MM-DD", "1988-07-05", { year: 1988, month: 7, day: 5, precision: "day" }],
    ["MM/DD/YYYY", "07/05/1988", { year: 1988, month: 7, day: 5, precision: "day" }],
    [
      "MM/DD/YYYY HH:mm:ss",
      "07/05/1988 14:30:45",
      { year: 1988, month: 7, day: 5, hour: 14, minute: 30, second: 45, precision: "second" },
    ],
    [
      "YYYYMMDD HHmm",
      "19880705 1430",
      { year: 1988, month: 7, day: 5, hour: 14, minute: 30, precision: "minute" },
    ],
    [
      "YYYYMMDDHHmm",
      "198807051430",
      { year: 1988, month: 7, day: 5, hour: 14, minute: 30, precision: "minute" },
    ],
  ])("%s still parses %s identically", (format, input, expected) => {
    expect(matchTokenParts(input, format)).toMatchObject(expected);
  });

  it("the built-in fallback list and its order are untouched", () => {
    expect(BUILTIN_DATE_FALLBACKS).toStrictEqual([
      "ISO-8601",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
      "MM/DD/YYYY HH:mm:ss",
    ]);
    expect(BUILTIN_DATE_FALLBACKS[0]).toBe("ISO-8601");
    expect(BUILTIN_DATE_FALLBACKS).toHaveLength(4);
  });

  it("the ISO-8601 sentinel still routes to the ISO parser, not the token matcher", () => {
    const p = parseDtmCascade("2025-01-02T15:30:45Z", { userFormats: [] });
    expect(p).toMatchObject({ matchedFormat: "ISO-8601", hasTimezone: true, offsetMinutes: 0 });
    // The sentinel is not a token format: matching it as one recovers nothing.
    expect(matchDateFormat("2025-01-02T15:30:45Z", "ISO-8601")).toBeUndefined();
  });
});
