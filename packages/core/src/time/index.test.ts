import { describe, expect, it } from "vitest";
import { formatInCenterTimeZone, isValidTimeZone, toUtcIso } from ".";

describe("time", () => {
  it("valida zonas IANA", () => {
    expect(isValidTimeZone("America/Mexico_City")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("serializa a UTC", () => {
    expect(toUtcIso("2026-01-15T10:00:00-06:00")).toBe("2026-01-15T16:00:00.000Z");
    expect(() => toUtcIso("no-es-fecha")).toThrow(RangeError);
  });

  it("presenta el mismo instante según la zona del centro", () => {
    const utc = "2026-01-15T03:30:00Z";
    const opts = { locale: "en-US", dateStyle: "short", timeStyle: "short" } as const;
    expect(formatInCenterTimeZone(utc, "America/Mexico_City", opts)).toBe("1/14/26, 9:30 PM");
    expect(formatInCenterTimeZone(utc, "UTC", opts)).toBe("1/15/26, 3:30 AM");
  });

  it("rechaza zonas inválidas al presentar", () => {
    expect(() => formatInCenterTimeZone(new Date(), "Nope/Nope")).toThrow(RangeError);
  });
});
