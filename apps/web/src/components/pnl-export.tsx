"use client";

import { Button } from "./ui/button";

/** Descarga de un CSV ya armado (UTF-8 con BOM para Excel) e impresión (PDF desde el navegador). */
export function CsvExport({
  csv,
  filename,
  label,
  printLabel,
}: {
  csv: string;
  filename: string;
  label: string;
  printLabel?: string;
}) {
  const download = () => {
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap gap-sm print:hidden">
      <Button type="button" label={label} variant="secondary" size="sm" onClick={download} />
      {printLabel ? (
        <Button
          type="button"
          label={printLabel}
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
        />
      ) : null}
    </div>
  );
}
