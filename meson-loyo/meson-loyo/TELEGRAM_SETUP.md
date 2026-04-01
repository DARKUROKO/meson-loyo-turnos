# 🤖 Cómo configurar el bot de Telegram

## Paso 1 — Crear el bot (2 minutos)

1. Abre Telegram y busca **@BotFather**
2. Escríbele `/newbot`
3. Ponle un nombre: `Mesón do Loyo Reservas`
4. Ponle un usuario (debe terminar en "bot"): `mesonloyobot` o similar
5. BotFather te dará un **token** como: `7234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
6. Guarda ese token — lo necesitarás

## Paso 2 — Saber tu ID de Telegram

1. Busca **@userinfobot** en Telegram
2. Escríbele cualquier cosa
3. Te responde con tu **ID numérico** (ej: `123456789`)

## Paso 3 — Añadir variables de entorno en Vercel

1. Ve a **vercel.com** → tu proyecto → **Settings** → **Environment Variables**
2. Añade estas dos variables:

| Nombre | Valor |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | El token que te dio BotFather |
| `TELEGRAM_AUTHORIZED_IDS` | Tu ID de Telegram (y el de Noelia si quiere, separados por coma) |

3. Pulsa **Save** y luego ve a **Deployments** → **Redeploy**

## Paso 4 — Registrar el webhook

Una vez desplegado, abre esta URL en el navegador (cambia los valores):

```
https://api.telegram.org/botTU_TOKEN/setWebhook?url=https://TU_APP.vercel.app/api/telegram
```

Si ves `{"ok":true}` el bot está conectado ✅

## Paso 5 — Probar

Escríbele al bot en Telegram:

```
Mesa 4 domingo 13:30 José 666123456
```

Debería responderte confirmando la reserva y aparecer automáticamente en la app.

## Comandos disponibles

- `/ayuda` — muestra ejemplos de uso
- `/lista` — reservas de hoy
- Cualquier mensaje con la reserva en lenguaje libre

## Ejemplos de mensajes

```
Mesa 4 domingo 13:30 José 666123456
Reserva 2 personas mañana 21:00 María
Mesa para 6 el sábado 14 de abril a las 14:00 a nombre de Ramón notas: terraza
Mesa 3 viernes 20:30 Ana 699887766
```
