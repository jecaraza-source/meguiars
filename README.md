# Meguiar's Detail Center

Plataforma de operación multicentro de Meguiar's Detail Center. El eje operacional es la Orden de Servicio.

```
apps/web        Next.js 16 + TypeScript (Vercel)
apps/mobile     Expo + React Native + TypeScript
packages/core   dominio, validaciones, fechas, KPIs, cliente Supabase
supabase/       migraciones SQL y pruebas de RLS
docs/adr/       decisiones de arquitectura
```

Las reglas de arquitectura y calidad están en [AGENTS.md](AGENTS.md).

## Desarrollo

```bash
npm install
cp apps/web/.env.example apps/web/.env.local        # completa las llaves de Supabase
cp apps/mobile/.env.example apps/mobile/.env.local
npm run dev:web
npm run dev:mobile
```

## Calidad

```bash
npm run lint && npm run typecheck && npm test && npm run test:db
```

CI (`.github/workflows/ci.yml`) corre lint, typecheck, pruebas unitarias, build web y pruebas de RLS en cada PR.

## Despliegue
- **Web (Vercel):** importa el repo y define *Root Directory* = `apps/web`. Vercel detecta los npm workspaces. Configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Base de datos:** `npx supabase link --project-ref <ref> && npx supabase db push`.
- **Móvil:** EAS (`npx eas-cli@latest build`), con las variables `EXPO_PUBLIC_SUPABASE_*`.
