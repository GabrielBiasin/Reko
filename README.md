# Reko — App (MVP, primera porción)

Webapp Next.js conectada a tu Supabase. Esta primera versión incluye:
login, navegación, dashboard básico y la pantalla de **Cargar venta** que escribe
de verdad en la base (cliente + mascota + producto + venta + predicción de recompra).

## Requisitos
- Node.js 18.18+ (https://nodejs.org)
- Tu proyecto Supabase (ya creado)

## Pasos para correrlo localmente

1. Copiá `.env.local.example` a `.env.local` y completá:
   - `NEXT_PUBLIC_SUPABASE_URL` (ya viene tu URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` -> Supabase -> Project Settings -> API ->
     "Project API keys" -> la clave **anon / publishable**.

2. Instalá dependencias y levantá el servidor:
   ```
   npm install
   npm run dev
   ```
3. Abrí http://localhost:3000

## IMPORTANTE — activar el hook de auth (1 sola vez)
Para que el aislamiento por local funcione, hay que activar un hook en Supabase:
- Supabase -> **Authentication -> Hooks** (o Auth Hooks)
- En **Custom Access Token**, elegí la función `custom_access_token_hook`
  (esquema `app`) y activala.

Sin esto, el login funciona pero las cargas van a fallar por permisos (RLS).

## Para ponerlo online (Vercel)
1. Subí esta carpeta a un repo de GitHub.
2. En vercel.com -> New Project -> importá el repo.
3. En Environment Variables cargá las mismas dos del `.env.local`.
4. Deploy. Te queda una URL pública.

## Estado
Primera porción del MVP. Faltan: lista de clientes, inbox de WhatsApp,
motor de predicción agendado, automatizaciones. Se suman de a una.
