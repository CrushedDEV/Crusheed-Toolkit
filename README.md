> [!WARNING]
> Esta aplicación se proporciona con fines educativos y de demostración. El uso de las herramientas incluidas debe cumplir las leyes de tu jurisdicción y los términos de servicio de las plataformas o contenidos implicados. Los autores y colaboradores no asumen responsabilidad por usos indebidos, infracciones de derechos de autor o cualquier daño derivado del uso del software. Al utilizar esta aplicación, aceptas que lo haces bajo tu propia responsabilidad.

# Crushed Toolkit

Aplicación de escritorio (Electron) con herramientas modulares:

- Descargador de YouTube con barra de progreso y apertura de carpeta.
- Analizador de audio (BPM y tonalidad) con escritura de metadatos ID3.
- Compatibilidad de mezclas (Camelot) con tolerancia BPM (slider visual).
- Convertidor de archivos:
  - Imágenes: conversión/optimización a AVIF/WebP/JPEG/PNG, redimensionado de alta calidad y previsualización.
  - Documentos: DOCX → HTML (vista), DOCX → PDF (sin dependencias externas).

## Requisitos

- Windows 10/11.
- Node.js 18+ para desarrollo.

## Desarrollo

```bash
npm install
npm start
```

Durante `npm start` no se busca actualización (solo en builds empaquetadas).

## Build y publicación (auto-update)

La app integra `electron-builder` + `electron-updater` con proveedor GitHub.

1. Configura el repositorio en `package.json` (campo `repository`).
2. Crea un token de GitHub con permiso `repo` y expórtalo:
   - PowerShell: `setx GH_TOKEN "TU_TOKEN"` (abre nueva terminal tras esto)
3. Sube la versión en `package.json` (ej. 0.1.6) y ejecuta:

```bash
npm install
npm run publish
```

Esto crea un Release en GitHub con el instalador y `latest.yml`.
Los usuarios verán un banner en la app cuando exista una nueva versión, con botón “Reiniciar y actualizar”.

## Uso

- Navega por los módulos desde la barra lateral.
- En Convertidor de Archivos:
  - Arrastra archivos al área o usa “Seleccionar archivos…”.
  - Imágenes: ajusta formato, calidad y tamaño; convierte en lote (ZIP) o previsualiza.
  - DOCX: usa “DOCX → HTML (vista)” o “DOCX → PDF”.

## Licencia

MIT
