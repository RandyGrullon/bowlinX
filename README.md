# BowlinX

Torneos y prácticas de boliche: jugadores, equipos, promedio, handicap y pinos por juego.
Cada juego cuenta en las estadísticas solo cuando se verifica con la **foto del marcador**.

- **Torneo** (una vez al año): inscritos con su promedio, equipos, handicap y clasificación.
  Regla 2025: handicap = (230 − promedio) × 80 %, individual con handicap, equipos por scratch
  (todo configurable por torneo).
- **Práctica** (los martes): pinos individuales; alimentan el promedio de cada jugador. Los jugadores
  confirman si van ("Voy") y el admin agrega a los confirmados con un toque.
- **Categorías A–D** por promedio (cortes configurables; 2025: A 200+, B 175, C 160) y **equipos
  automáticos** parejos que mezclan categorías.
- **Cuentas** (`/login` → *Crear cuenta*): correo + contraseña repetida, sin verificación de correo.
  Al entrar, el jugador elige quién es en la lista (o crea su perfil) y su cuenta queda vinculada.
- **Página pública del jugador** (`/j/<id>`, se ve sin login): promedio, juegos, mejor juego y serie,
  gráfica de sus últimos juegos, torneos (con su posición) y prácticas. Solo el dueño del perfil
  sube sus juegos con foto —de un evento o **por fecha** si ese día no había evento— y quedan
  **por aprobar** (lo de una fecha va a la práctica de ese día; se crea si no existe).
- **Ranking del club** (`/ranking`): promedio, mejor juego, mejor serie y asistencia por temporada.
- **Clasificación pública** (`/e/<id>`): el torneo o la práctica en vivo, para verla en la bolera.
- **Panel del admin**: anota juegos (borrador sin foto = vista previa), verifica con foto escaneada
  por IA (Gemini vía Firebase AI Logic), aprueba lo que suben los jugadores, **arma equipos parejos
  automáticamente**, exporta el torneo a **Excel**, descarga un **respaldo** de los datos y administra
  cuentas (desvincular, nombrar admins).
- **App instalable** (PWA): animación de apertura, abre sin conexión, avisa cuando hay versión nueva;
  botón "Instalar" en Android y guía para iPhone. Modo claro/oscuro.

React 19 + Vite + Tailwind 4 · Firebase Auth + Firestore (tiempo real, caché sin conexión) ·
Firebase AI Logic (Gemini, capa gratuita) · Vercel.

## Correr en local

```bash
pnpm install
cp .env.example .env.local   # y completa las variables VITE_FIREBASE_*
pnpm dev
```

Contra los emuladores (no toca datos reales; necesita Java 11+):

```bash
pnpm emulators   # en otra terminal
pnpm dev:emu
```

`pnpm test` corre las pruebas de los cálculos (handicap, totales, ranking, equipos, lectura de fotos).
`pnpm test:reglas` prueba `firestore.rules` contra el emulador (necesita Java 11+).

## Configurar Firebase (una sola vez)

1. **Reglas de Firestore**: publica `firestore.rules`, ya sea pegándolo en
   Consola → Firestore → Reglas, o con `npx firebase-tools login` y después `pnpm reglas`.
   Los admins fijos están en `isFixedAdmin()` de las reglas y en `src/lib/admins.ts` (deben coincidir);
   los demás admins se nombran desde la app (Jugadores → cuenta → *Hacer admin*).
2. **Authentication**: proveedor *Correo/contraseña* activo y, en Configuración → Acciones del
   usuario, **"Crear cuentas" activado** (los jugadores se registran solos, sin verificar el correo).
3. **AI Logic** (escaneo de fotos): Consola → AI Services → AI Logic → *Get started* →
   **Gemini Developer API**. No hay que copiar ninguna API key.
4. **App Check** (AI Logic lo exige): Consola → Security → App Check → registra la app web con
   **reCAPTCHA Enterprise** y pon la *site key* en `VITE_RECAPTCHA_SITE_KEY`. Para probar en
   localhost registra el valor de `VITE_APPCHECK_DEBUG_TOKEN` en *Manage debug tokens*.

Si la IA no puede leer una foto, la app lo avisa y se pueden anotar los juegos a mano mirando la
foto; la foto queda igual como comprobante.

## Desplegar en Vercel

Importa el repo en Vercel (detecta Vite solo) y agrega en *Settings → Environment Variables*
las mismas variables de `.env.example` (`VITE_FIREBASE_*` y `VITE_RECAPTCHA_SITE_KEY`).
`vercel.json` ya redirige las rutas de la app a `index.html`. Agrega también el dominio de Vercel
en el registro de reCAPTCHA Enterprise.

## Importar un torneo pasado

```bash
pnpm importar mi-torneo.json
```

Pide el correo y la contraseña del admin en la terminal. Los juegos importados cuentan como
verificados (resultado auditado del Excel, sin foto). `--reemplazar` vuelve a cargar un torneo que
ya existe. Los archivos de `scripts/datos/` no se suben al repo.

Formato del JSON:

```json
{
  "event": { "id": "torneo-2025", "type": "torneo", "name": "Torneo 2025", "date": "2025-10-25",
             "games": 3, "hcpBase": 230, "hcpPercent": 80, "individualRankBy": "hcp", "teamRankBy": "scratch" },
  "teams": ["Equipo 1"],
  "players": [{ "name": "Nombre", "average": 165, "handicap": 52, "team": "Equipo 1", "scores": [173, 159, 159] }]
}
```

## Datos (Firestore)

| Colección | Qué guarda |
|---|---|
| `users` | cuentas: correo, nombre, rol (`jugador`/`admin`) y jugador vinculado |
| `players` | nombre, promedio fijo opcional y cuenta vinculada (`uid`) |
| `events` | torneo o práctica: fecha, juegos, regla de handicap y clasificación, equipos |
| `entries` | participación `evento_jugador`: promedio de entrada, handicap fijo, pinos y foto de cada juego |
| `photos` | fotos comprimidas (~150 kB) de los marcadores |
| `submissions` | juegos subidos por jugadores, pendientes de aprobación |
