# Globanzer POS — sitio web

Sitio de una sola página (en español) para Globanzer POS. Estático: sin build, sin frameworks.

## Estructura

```
index.html                         Página completa (secciones: hero, cómo funciona, funciones,
                                   la caja, nada se guarda hasta que digas sí, Globi, precios,
                                   empieza hoy, footer)
assets/css/styles.css              Estilos, mobile-first (breakpoints 560px y 900px)
assets/js/main.js                  Animaciones con GSAP + ScrollTrigger (desde cdnjs)
assets/img/                        logo.png, tienda.jpg, factura.jpg, caja.jpg, globi.jpg
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
- Para probar localmente basta abrir `index.html` en el navegador.

## Reglas de texto (del dueño)

Siempre "hasta dos cajas"; no mencionar límites de mensajes del asistente; no usar "homologado" ni
"factura fiscal"; no nombrar proveedores de IA ("asistente con IA"); sin testimonios ni cifras inventadas.
