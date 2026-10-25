import { describe, expect, it } from "vitest";
import { CRON_PRESETS, explainCron, formatInTimeZone, normalizeOffset } from "./cron";

const FROM = new Date("2026-10-22T12:00:00Z"); // a Thursday

function run(expr: string, timeZone = "UTC", count?: number) {
  const r = explainCron(expr, { timeZone, from: FROM, count });
  if (!r.ok) throw new Error(`expected success for ${expr}: ${r.error.message}`);
  return r.value;
}
function errorOf(expr: string, timeZone = "UTC") {
  const r = explainCron(expr, { timeZone, from: FROM });
  if (r.ok) throw new Error(`expected an error for ${expr}, got: ${r.value.description}`);
  return r.error.message;
}

describe("explainCron — the spec's worked example", () => {
  const e = run("*/15 9-17 * * 1-5", "Asia/Kolkata", 2);

  it("describes it in cronstrue's 24-hour wording", () => {
    expect(e.description).toBe("Every 15 minutes, between 09:00 and 17:59, Monday through Friday");
  });

  it("lists the next runs with the zone's own offset", () => {
    expect(e.nextRuns).toEqual(["2026-10-22T17:45:00+05:30", "2026-10-23T09:00:00+05:30"]);
  });

  it("names the five fields and their values", () => {
    expect(e.fields).toEqual([
      { name: "minute", value: "*/15" },
      { name: "hour", value: "9-17" },
      { name: "day of month", value: "*" },
      { name: "month", value: "*" },
      { name: "day of week", value: "1-5" },
    ]);
    expect(e.withSeconds).toBe(false);
  });

  it("defaults to five runs", () => {
    expect(run("* * * * *").nextRuns).toHaveLength(5);
  });
});

describe("explainCron — validation", () => {
  it("reports cronstrue's message without its Error: prefix", () => {
    expect(errorOf("61 * * * *")).toBe("minutes part must be >= 0 and <= 59");
  });

  it("rejects too few fields", () => {
    expect(errorOf("* * * *")).toMatch(/4/);
  });

  it("rejects the 7-field Quartz form by name, not via the generic field-count message", () => {
    // Asserting only /7 fields/ would also be satisfied by the "<n> fields; a
    // cron schedule needs 5" fallback, so the Quartz-specific explanation was
    // untested even though it reads better. Mutation proved it: deleting the
    // branch changed nothing.
    const message = errorOf("0 0 0 * * * *");
    expect(message).toContain("Quartz");
    expect(message).toContain("seconds");
  });

  it("asks for an expression when there is none", () => {
    expect(errorOf("")).toBe("Type or paste a cron expression.");
    expect(errorOf("   \n\t ")).toBe("Type or paste a cron expression.");
  });

  it("refuses an absurdly long expression instead of chewing on it", () => {
    expect(errorOf(`*/1 ${"9-17 * ".repeat(200)}`)).toContain("longer than 500");
  });

  it("lists the accepted @-shortcuts for an unknown one", () => {
    expect(errorOf("@nope")).toContain("@yearly");
  });
});

describe("explainCron — @-shortcuts", () => {
  const table: [string, string][] = [
    ["@yearly", "0 0 1 1 *"],
    ["@annually", "0 0 1 1 *"],
    ["@monthly", "0 0 1 * *"],
    ["@weekly", "0 0 * * 0"],
    ["@daily", "0 0 * * *"],
    ["@midnight", "0 0 * * *"],
    ["@hourly", "0 * * * *"],
  ];

  for (const [macro, expanded] of table) {
    it(`${macro} behaves exactly as ${expanded}`, () => {
      expect(run(macro).nextRuns).toEqual(run(expanded).nextRuns);
      expect(run(macro).description).toBe(run(expanded).description);
    });

    it(`${macro} shows the expanded fields, not the macro in every column`, () => {
      const e = run(macro);
      expect(e.fields.map((f) => f.value)).toEqual(expanded.split(" "));
      expect(e.withSeconds).toBe(false);
    });
  }

  it("accepts them in any case", () => {
    expect(run("@DAILY").description).toBe("At 00:00");
  });
});

describe("explainCron — seconds field", () => {
  it("flags 6-field expressions and names second first", () => {
    const e = run("30 0 */5 * * *");
    expect(e.withSeconds).toBe(true);
    expect(e.fields[0]).toEqual({ name: "second", value: "30" });
    expect(e.fields).toHaveLength(6);
  });

  it("honours the seconds value in the runs", () => {
    expect(run("30 0 * * * *", "UTC", 1).nextRuns[0]).toBe("2026-10-22T12:00:30+00:00");
  });
});

describe("explainCron — time zones", () => {
  it("rejects a zone the engine cannot format", () => {
    expect(errorOf("0 0 * * *", "Not/AZone")).toContain("Unknown time zone 'Not/AZone'");
  });

  it("accepts a zone Intl formats but its own list omits", () => {
    // Regression: Node 22's supportedValuesOf("timeZone") leaves out
    // "Asia/Kolkata" while the formatter handles it fine, so a list lookup
    // wrongly called that zone unknown.
    expect(run("0 0 * * *", "Asia/Kolkata", 1).nextRuns[0]).toBe("2026-10-23T00:00:00+05:30");
  });

  it("handles 45-minute and 14-hour offsets", () => {
    expect(run("0 0 * * *", "Asia/Kathmandu", 1).nextRuns[0]).toBe("2026-10-23T00:00:00+05:45");
    expect(run("0 0 * * *", "Pacific/Kiritimati", 1).nextRuns[0]).toBe("2026-10-24T00:00:00+14:00");
  });

  it("uses the offset in force on that date, not today's", () => {
    const winter = explainCron("30 12 * * *", { timeZone: "America/New_York", from: new Date("2026-01-05T12:00:00Z"), count: 1 });
    const summer = explainCron("30 12 * * *", { timeZone: "America/New_York", from: new Date("2026-07-05T12:00:00Z"), count: 1 });
    if (!winter.ok || !summer.ok) throw new Error("expected success");
    expect(winter.value.nextRuns[0]).toMatch(/-05:00$/);
    expect(summer.value.nextRuns[0]).toMatch(/-04:00$/);
  });

  it("does not invent a wall time the zone skipped", () => {
    // 02:30 on the US spring-forward morning does not exist in New York.
    const e = explainCron("30 2 * * *", { timeZone: "America/New_York", from: new Date("2026-03-07T12:00:00Z"), count: 1 });
    if (!e.ok) throw new Error("expected success");
    expect(e.value.nextRuns[0]).toBe("2026-03-08T03:30:00-04:00");
  });
});

describe("explainCron — valid schedules that never fire", () => {
  it("returns no runs for February 30 rather than a fabricated date", () => {
    const e = run("0 0 30 2 *", "UTC", 3);
    expect(e.nextRuns).toEqual([]);
    expect(e.description).toContain("February");
  });
});

describe("explainCron — run count", () => {
  it("clamps to a bounded number of runs", () => {
    expect(run("* * * * *", "UTC", 999).nextRuns).toHaveLength(20);
    expect(run("* * * * *", "UTC", 0).nextRuns).toHaveLength(1);
    expect(run("* * * * *", "UTC", -5).nextRuns).toHaveLength(1);
    expect(run("* * * * *", "UTC", 2.7).nextRuns).toHaveLength(2);
  });
});

describe("normalizeOffset", () => {
  it("covers every shape longOffset produces", () => {
    expect(normalizeOffset("GMT")).toBe("+00:00");
    expect(normalizeOffset("GMT+05:30")).toBe("+05:30");
    expect(normalizeOffset("GMT-04:00")).toBe("-04:00");
    expect(normalizeOffset("GMT+05:45")).toBe("+05:45");
    expect(normalizeOffset("GMT+14:00")).toBe("+14:00");
    expect(normalizeOffset("GMT-04")).toBe("-04:00");
    expect(normalizeOffset("GMT+0530")).toBe("+05:30");
    expect(normalizeOffset("nonsense")).toBe("+00:00");
  });
});

describe("formatInTimeZone", () => {
  it("renders the wall clock and offset of the target zone", () => {
    expect(formatInTimeZone(FROM, "UTC")).toBe("2026-10-22T12:00:00+00:00");
    expect(formatInTimeZone(FROM, "Asia/Kolkata")).toBe("2026-10-22T17:30:00+05:30");
    expect(formatInTimeZone(FROM, "America/New_York")).toBe("2026-10-22T08:00:00-04:00");
  });

  it("never renders midnight as hour 24", () => {
    const midnight = new Date("2026-10-23T00:00:00Z");
    expect(formatInTimeZone(midnight, "UTC")).toBe("2026-10-23T00:00:00+00:00");
    // A zone where the same instant is also a local midnight offset boundary.
    expect(formatInTimeZone(midnight, "Pacific/Kiritimati")).toBe("2026-10-23T14:00:00+14:00");
  });

  it("crosses a year boundary without corrupting the date", () => {
    expect(formatInTimeZone(new Date("2026-12-31T23:30:00Z"), "Asia/Tokyo")).toBe("2027-01-01T08:30:00+09:00");
  });
});

describe("explainCron — dialect disagreements are made visible", () => {
  it("refuses a reversed range because the run times are what a user acts on", () => {
    // cronstrue would describe "5-1 * * * *" as "Minutes 5 through 1 past the
    // hour"; croner refuses to compute it. The veto wins, and this test is what
    // keeps a library upgrade from quietly flipping that choice the other way.
    expect(errorOf("5-1 * * * *")).toContain("5-1");
  });

  it("rejects Jenkins' H rather than guessing at it", () => {
    expect(errorOf("H H * * *")).toContain("'H'");
  });

  it("accepts the day-field extensions but not in fields where they mean nothing", () => {
    expect(run("0 0 L * *").description).toContain("last day");
    expect(errorOf("L 2 * * *")).toContain("'L'");
  });
});

describe("explainCron — input it must not choke on", () => {
  const junk = ["", " ", "* * * * *", "*/0 * * * *", "5-1 * * * *", "@", "@@", "a b c d e", "0 0 * * MON-FRI", "0 0,30 * * *", "*", "- * * * *", "*/5 */3 */2 */2 */4", "? ? ? ? ?", "L W # 1 2", "0 0 1 1 0 0 0 0", "*/15 9-17 * * 1-5 #comment", "\t\n", "0".repeat(600)];

  it("never throws", () => {
    for (const expr of junk) {
      expect(() => explainCron(expr, { timeZone: "UTC", from: FROM })).not.toThrow();
    }
  });

  it("never throws on an unusable zone", () => {
    for (const tz of ["", "UTC", "utc", "Not/AZone", "Europe/London", "../etc"]) {
      expect(() => explainCron("0 0 * * *", { timeZone: tz, from: FROM })).not.toThrow();
    }
  });
});

describe("CRON_PRESETS", () => {
  it("covers the six schedules the spec lists", () => {
    expect(CRON_PRESETS.map((p) => p.expr)).toEqual(["* * * * *", "*/15 * * * *", "0 * * * *", "0 0 * * *", "0 9 * * 1-5", "0 0 1 * *"]);
  });

  it("every preset explains itself", () => {
    for (const p of CRON_PRESETS) {
      expect(run(p.expr).description.length).toBeGreaterThan(3);
    }
  });
});
