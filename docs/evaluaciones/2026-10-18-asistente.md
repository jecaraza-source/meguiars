# Evaluación del asistente de WhatsApp — 2026-10-18

**Estado: no ejecutada.** La prueba de humo falló porque el entorno no tiene `ANTHROPIC_API_KEY`, así que no se corrieron los 28 escenarios.

| Dato | Valor |
| --- | --- |
| Modelo | `claude-opus-5-5` (predeterminado del script) |
| Aprobados / total | 0 / 0 — no se ejecutó ningún escenario |
| Costo estimado | US$ 0 — no hubo llamadas a la API |
| Tokens | 0 |
| Commit evaluado | `01ec39b` |

## Pasos realizados

1. Verificación de la variable: `ANTHROPIC_API_KEY` **no existe** en el entorno de la sesión.
2. `npm ci`: correcto.
3. Prueba de humo: `npm run eval:assistant -w @meguiars/web -- --yes --only saludo` terminó con código 2:

```text
> @meguiars/web@0.1.0 eval:assistant
> vite-node scripts/assistant-eval.ts --yes --only saludo

Escenarios: 1 × 1 con claude-opus-5-5
Falta ANTHROPIC_API_KEY en el entorno.
npm error Lifecycle script `eval:assistant` failed with error:
npm error code 2
npm error path /home/user/meguiars/apps/web
npm error workspace @meguiars/web@0.1.0
npm error location /home/user/meguiars/apps/web
npm error command failed
npm error command sh -c vite-node scripts/assistant-eval.ts --yes --only saludo
```

4. Corrida de los 28 escenarios: **no se ejecutó** (la tarea pide detenerse si la prueba de humo falla por autenticación).
5. No existe `reporte-eval.json`, por lo que no se generó `docs/evaluaciones/2026-10-18-asistente.json`.

## Escenarios fallidos

Ninguno evaluado.

## Para repetir la evaluación

1. Agregar `ANTHROPIC_API_KEY` en la configuración del ambiente de Claude Code (menú del ambiente → Editar → secretos o variables de entorno) e iniciar una sesión nueva para que la tome.
2. Correr de nuevo los pasos 3 y 4 y reemplazar este reporte con los resultados.
