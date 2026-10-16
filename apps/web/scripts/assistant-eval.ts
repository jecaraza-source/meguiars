/**
 * Evaluación del asistente de WhatsApp con la API real de Claude.
 *
 *   ANTHROPIC_API_KEY=… npm run eval:assistant -w @meguiars/web -- --yes [--model claude-sonnet-5-5] [--only precio-lavado,queja] [--repeat 2] [--out reporte.json]
 *
 * Corre cada escenario de EVAL_SCENARIOS con el motor real contra una base
 * simulada (datos fijos; no toca Supabase ni WhatsApp) y lo califica sin IA.
 * Cuesta dinero (tokens de la API): sin --yes sólo muestra cuántas llamadas haría.
 * Termina con código 1 si algún escenario falla.
 */
import { writeFileSync } from "node:fs";
import {
  ASSISTANT_MODELS,
  EVAL_SCENARIOS,
  estimateAssistantCost,
  evalSummary,
  runEvalScenario,
  type AssistantModel,
  type EvalRun,
} from "@meguiars/domain";
import { claudeLlm } from "../src/lib/claude-llm";

/** Salida del reporte en la terminal (el lint sólo permite console.warn/error). */
const say = (line: string) => process.stdout.write(`${line}\n`);

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : null;
};

const model = (flag("model") ?? "claude-opus-5-5") as AssistantModel;
if (!(ASSISTANT_MODELS as readonly string[]).includes(model)) {
  console.error(`Modelo no permitido: ${model}. Usa uno de: ${ASSISTANT_MODELS.join(", ")}`);
  process.exit(2);
}
const only =
  flag("only")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
const repeat = Math.min(Math.max(Number(flag("repeat") ?? 1) || 1, 1), 5);
const scenarios = only.length ? EVAL_SCENARIOS.filter((s) => only.includes(s.id)) : EVAL_SCENARIOS;

say(`Escenarios: ${scenarios.length} × ${repeat} con ${model}`);
if (!args.includes("--yes")) {
  say("Esto llama a la API real de Claude y tiene costo. Vuelve a correr con --yes para ejecutarlo.");
  process.exit(0);
}
if (!(process.env.ANTHROPIC_API_KEY ?? "").trim()) {
  console.error("Falta ANTHROPIC_API_KEY en el entorno.");
  process.exit(2);
}

const runs: EvalRun[] = [];
for (let r = 0; r < repeat; r++) {
  for (const s of scenarios) {
    const run = await runEvalScenario(s, claudeLlm, model);
    runs.push(run);
    const mark = run.failures.length === 0 ? "ok  " : "FALLA";
    say(`${mark} ${s.id} — ${s.title}`);
    if (run.failures.length) {
      for (const f of run.failures) say(`       · ${f}`);
      say(`       respuesta: ${(run.reply ?? "(sin respuesta)").replace(/\s+/g, " ").slice(0, 300)}`);
    }
  }
}

const total = runs.reduce(
  (a, r) => ({
    input: a.input + r.usage.input,
    output: a.output + r.usage.output,
    cacheRead: a.cacheRead + r.usage.cacheRead,
    cacheWrite: a.cacheWrite + r.usage.cacheWrite,
  }),
  { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
);
const summary = evalSummary(runs);
say(
  `\nAprobados: ${summary.passed} de ${summary.total}. Costo estimado: US$${estimateAssistantCost(model, total).toFixed(4)} (precio público; la factura real está en la consola de Anthropic).`,
);
const out = flag("out");
if (out) {
  writeFileSync(
    out,
    JSON.stringify(
      {
        model,
        at: new Date().toISOString(),
        summary,
        runs: runs.map((r) => ({
          id: r.scenario.id,
          status: r.status,
          handoff: r.handoff,
          tools: r.tools,
          reply: r.reply,
          failures: r.failures,
          usage: r.usage,
        })),
      },
      null,
      2,
    ),
  );
  say(`Reporte: ${out}`);
}
process.exit(summary.passed === summary.total ? 0 : 1);
