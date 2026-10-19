import { describe, expect, it, vi } from "vitest";
import type { AppointmentListItem } from "./agenda";
import { agendaDayLabel, agendaWeekDays, loadAgendaWeek, parseAgendaView } from "./week";

describe("agenda de 7 días", () => {
  it("hoy y los 6 días siguientes, con etiquetas cortas", () => {
    const days = agendaWeekDays("2026-10-19", "2026-10-19");
    expect(days.map((d) => d.day)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(days[0]).toMatchObject({ label: "Hoy", isToday: true });
    expect(days[1]!.label).toBe("Mañana");
    expect(agendaDayLabel("2026-10-22", "2026-10-19")).toMatch(/^jue 22 oct$/);
    // Cruza fin de mes.
    expect(agendaWeekDays("2026-10-28", "2026-10-19").at(-1)!.day).toBe("2026-11-03");
  });

  it("vista por omisión: 7 días", () => {
    expect(parseAgendaView(undefined)).toBe("semana");
    expect(parseAgendaView("dia")).toBe("dia");
    expect(parseAgendaView("otra")).toBe("semana");
  });

  it("consulta cada día con los mismos filtros y devuelve el primer error", async () => {
    const item = { id: "a" } as AppointmentListItem;
    const listDay = vi.fn().mockResolvedValue({ ok: true, data: [item] });
    const r = await loadAgendaWeek({ listDay }, "c", "2026-10-19", "2026-10-19", { status: "programada" });
    expect(listDay).toHaveBeenCalledTimes(7);
    expect(listDay).toHaveBeenCalledWith("c", "2026-10-25", { status: "programada" });
    expect(r.ok && r.data.map((d) => d.items.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    const failing = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValue({ ok: false, error: { kind: "unavailable", message: "Sin red" } });
    const bad = await loadAgendaWeek({ listDay: failing }, "c", "2026-10-19", "2026-10-19");
    expect(bad.ok).toBe(false);
  });
});
