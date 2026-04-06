# Prompt para auditoría de rendimiento y calidad visual (Kapsely)

Actúa como **arquitecto senior de performance para React Native + Expo + Supabase**.

Quiero que revises el proyecto completo con enfoque en:
1) **Rendimiento general** (navegación, listas, renders, memoria, red).
2) **Optimización de medios** sin perder calidad visual perceptible.
3) **Persistencia de estado UX** (borrados y navegación).
4) **Mejora estética de cards/posts** en detalle de cápsula para notas de voz y texto.

## Alcance obligatorio
- Todas las pantallas y componentes críticos de UX.
- Página de detalles de cápsula:
  - artículos/items;
  - render de notas de texto y notas de voz;
  - assets PNG de cápsulas abiertas/cerradas;
  - chains.
- Perfil:
  - stickers;
  - imágenes y carga diferida.
- Feed:
  - navegación al tope al re-tap en tab Feed.
- Chat:
  - eliminar mensaje/conversación debe mantenerse al entrar/salir.

## Formato de respuesta que necesito
Devuélveme una tabla por cada hallazgo con:
- **Problema detectado**
- **Impacto** (CPU, memoria, red, TTI, jank, costo storage)
- **Evidencia** (archivo, función, patrón)
- **Solución propuesta**
- **Implementación exacta** (parche/código)
- **Riesgo de regresión**
- **Cómo validar** (métrica y test manual)

## Reglas de optimización de medios
- Imágenes:
  - Redimensionar para móvil (máx ancho recomendado 1080-1440 según caso).
  - Comprimir a WebP/JPEG con calidad adaptable (0.68-0.78).
  - Mantener enfoque en calidad perceptual, evitar artefactos agresivos.
  - Cache policy consistente (`memory-disk`) para assets repetidos.
- Video:
  - Resolución objetivo 720p para la mayoría de uploads.
  - Limitar duración según tipo de contenido.
  - Generar thumbnail optimizado.
- Audio:
  - Bitrate balanceado para voz (mantener claridad de habla).
- Storage:
  - Diseñar estrategia de compresión y naming para soportar gran volumen sin costo excesivo.

## Reglas de UI/UX específicas
- Notas de voz/texto en detalle de cápsula:
  - mantener identidad visual premium;
  - mejorar legibilidad, jerarquía visual y affordance de interacción.
- Feed:
  - al tocar tab Feed estando ya en Feed, hacer scroll top inmediato.
- Chat:
  - delete de conversación/mensaje debe persistir entre sesiones/pantallas.

## Entregables
1) Lista priorizada P0/P1/P2.
2) Parches listos para aplicar por archivo.
3) Checklist de QA funcional + performance.
4) Estimación de mejora esperada (porcentaje aproximado) por área.

Si encuentras un problema, responde con este patrón:
**"Problema X se soluciona así"** + parche + validación.
