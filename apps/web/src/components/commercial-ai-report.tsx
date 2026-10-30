import { COMMERCIAL_AI_COPY, type presentCommercialAiReport } from "@meguiars/domain";

type Report = ReturnType<typeof presentCommercialAiReport>;

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-xs">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex list-disc flex-col gap-xs pl-lg text-sm">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** Reporte comercial redactado por IA (ADR 0051). */
export function CommercialAiReportView({ report }: { report: Report }) {
  return (
    <article className="flex flex-col gap-md">
      <p className="text-xs text-muted">
        {report.heading} · {report.createdLabel}
      </p>
      {report.statusLabel ? (
        <p className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
          {report.statusLabel}
        </p>
      ) : (
        <>
          <p className="text-sm">{report.summary}</p>
          <Section title={COMMERCIAL_AI_COPY.highlights} items={report.highlights} />
          <Section title={COMMERCIAL_AI_COPY.risks} items={report.risks} />
          <Section title={COMMERCIAL_AI_COPY.actions} items={report.actions} />
          <p className="text-xs text-muted">{COMMERCIAL_AI_COPY.disclaimer}</p>
        </>
      )}
    </article>
  );
}
