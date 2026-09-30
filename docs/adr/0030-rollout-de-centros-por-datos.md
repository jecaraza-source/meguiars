# ADR 0030 — Rollout de centros por datos: alta por RPC, checklist e importador

- Estado: aceptado
- Fecha: 2026-09-30

## Contexto

F5.2 pide pilotear en un centro y abrir los siguientes sin fork ni cambios de lógica. El modelo ya era multicentro (RLS por centro, catálogo y planes por organización con ajustes por centro), pero un centro sólo podía nacer por SQL (seed) y no había forma de saber si sus datos maestros estaban completos ni de cargarlos en volumen sin capturar uno por uno.

## Decisión

1. **Alta de centro por RPC** (`create_detail_center`): sólo el admin corporativo, con código normalizado, motivo y auditoría. El centro hereda catálogo, categorías, planes y métodos de cobro de la organización; sólo necesita equipo, bahías, técnicos y, si aplica, precios propios.
2. **Checklist calculado en la base** (`center_readiness`): los mismos criterios en web y móvil; obligatorio vs recomendado; "listo" = sin obligatorios faltantes.
3. **Importador sobre las RPC existentes**: el CSV se valida con los esquemas de los formularios y se compara con lo existente (vista previa); al aplicar, el servidor rearma el plan y llama las RPC con la sesión del usuario. No hay inserciones directas, ni llave de servicio, ni rutas paralelas de validación.
4. **Línea base y métricas en la base** (`center_baselines`, `pilot_metrics`, `client_error_reports`): el piloto se mide con los mismos datos operativos, por centro y día, y la comparación vive en el dominio.

## Consecuencias

- Abrir un centro es trabajo de datos: alta, checklist, importación, línea base y UAT.
- El importador cubre lo repetitivo (catálogo, bahías, técnicos, categorías, planes); B2B y usuarios siguen por pantalla porque requieren relaciones o contraseñas.
- Si una entidad nueva debe importarse, se agrega un tipo al importador reutilizando su esquema y su RPC.
