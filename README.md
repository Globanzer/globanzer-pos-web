# Globanzer POS — sitio web

Sitio de una sola página (en español) para Globanzer POS. Estático: sin build, sin frameworks.

## Estructura

```
index.html                         Página completa (secciones: hero, cómo funciona, funciones,
                                   la caja, nada se guarda hasta que digas sí, Globi, precios,
                                   empieza hoy, footer)
formulario.html                    Ficha de instalación en línea (secciones A a G + declaración)
terminos.html, privacidad.html     Términos del servicio y Política de privacidad
assets/css/styles.css              Estilos, mobile-first (breakpoints 560px y 900px)
assets/js/main.js                  Animaciones con GSAP + ScrollTrigger (desde cdnjs)
assets/js/ficha.js                 Validación y envío de la ficha en línea (Turnstile + POST /api/ficha)
assets/img/                        logo.png, foto_tienda.jpg, foto_factura.jpg, foto_caja.jpg (fotos de fondo),
                                   caja.jpg, globi.jpg (renders 3D); tienda.jpg y factura.jpg ya no se usan
functions/api/ficha.js             Cloudflare Pages Function que recibe la ficha
assets/ficha-instalacion-globanzer-pos.pdf   Ficha de instalación descargable
```

## Notas

- Librerías externas: solo GSAP 3.15.0 y ScrollTrigger desde `cdnjs.cloudflare.com`, y la fuente
  Plus Jakarta Sans desde Google Fonts (con respaldo `system-ui`).
- Sin JavaScript o con `prefers-reduced-motion: reduce`, todo el contenido se ve de forma estática;
  las animaciones se registran con `gsap.matchMedia()`.
- En escritorio (>= 900px) el hero y "Cómo funciona" quedan fijados (pin) mientras el chat se escribe
  y la imagen gira en 3D. En móvil no hay pin: las animaciones siguen el scroll normal.
- Imágenes bajo el primer pantallazo usan `loading="lazy"` con `width`/`height`.
- Para probar localmente basta abrir `index.html` en el navegador (la ficha en línea necesita la
  Function, que solo corre en Cloudflare Pages o con `wrangler pages dev`).
- Paleta: base neutra muy oscura (`#0B0D12` / `#111318`), degradado de marca `#4F7CFF → #8B5CF6` solo
  como acento y ámbar `#F5A524` para detalles (números de pasos, checks, etiquetas de precio).

## Ficha en línea (Cloudflare Pages Function)

`formulario.html` envía la ficha en JSON a `POST /api/ficha` (`functions/api/ficha.js`). La función valida
Turnstile y los campos obligatorios, limita el cuerpo a ~20 KB, acepta solo peticiones desde
`https://pos.globanzer.com` y `*.pages.dev`, publica la ficha en un canal de Discord por webhook y, si hay
clave de Resend, manda una copia por correo. No guarda la ficha ni la escribe en los logs.

Antes de publicar, reemplaza `__TURNSTILE_SITE_KEY__` en `formulario.html` (atributo `data-sitekey`) por la
site key de Turnstile. Mientras tenga el marcador, el widget no se carga y el servidor rechazará el envío.

Variables de entorno (Cloudflare Pages → Settings → Environment variables; solo nombres, sin valores aquí):

| Variable | Uso |
| --- | --- |
| `TURNSTILE_SECRET` | Secret key de Turnstile (obligatoria) |
| `DISCORD_FICHAS_WEBHOOK` | URL del webhook del canal de Discord donde llegan las fichas (obligatoria) |
| `RESEND_API_KEY` | API key de Resend (opcional; sin ella no se envía correo) |
| `FICHA_EMAIL_FROM` | Remitente verificado en Resend (si se usa correo) |
| `FICHA_EMAIL_TO` | Destinatario(s) de la copia, separados por coma (si se usa correo) |

## Reglas de texto (del dueño)

Siempre "hasta dos cajas"; no mencionar límites de mensajes del asistente; no usar "homologado" ni
"factura fiscal"; no nombrar proveedores de IA ("asistente con IA"); sin testimonios ni cifras inventadas.
