> [!WARNING]
> Esta aplicación se proporciona con fines educativos y de demostración. El uso de las herramientas incluidas debe cumplir las leyes de tu jurisdicción y los términos de servicio de las plataformas o contenidos implicados. Los autores y colaboradores no asumen responsabilidad por usos indebidos, infracciones de derechos de autor o cualquier daño derivado del uso del software. Al utilizar esta aplicación, aceptas que lo haces bajo tu propia responsabilidad.

# Crushed Toolkit

Aplicación de escritorio (Electron) con herramientas modulares:

**Audio**
- **Descargador de YouTube**: cola de varias URLs, playlists completas, calidad a elegir (hasta 4K / MP3 320) y cancelar. yt-dlp se descarga solo y se actualiza automáticamente (como mucho una vez al día) en `~/.crushed-toolkit/bin`.
- **Analizador BPM/Tonalidad**: tempo y tonalidad mayor/menor (cromagrama + perfiles de Krumhansl) con clave Camelot; escribe ID3.
- **Compatibles (Camelot)**: pistas de tu librería que mezclan bien con otra, con tolerancia de BPM.
- **Organizador de librería**: análisis en lote, renombrado por patrón (`{artist} - {title} [{bpm} {camelot}]`), edición de etiquetas y portadas.
- **Audio en lote**: convertir a MP3/WAV/FLAC/M4A/OGG/OPUS, recortar e igualar volumen a −14 LUFS.

**Vídeo**
- **Comprimir vídeo y GIF**: ajusta un vídeo a 10/50/500 MB (o lo que quieras) con x264 a dos pasadas, recorte y GIF con paleta optimizada.

**Minecraft**
- **Servidor**: descarga Paper/Purpur/Fabric/Vanilla, acepta EULA, edita `server.properties` y hace backups ZIP del mundo (manuales o diarios).
- **Generador `start.bat`** con flags de Aikar.
- **Editor `options.txt`** de Minecraft Java.
- **manifest.json (Bedrock)**: validar, regenerar UUIDs y subir versión.

**Sistema**
- **Puertos y procesos**: qué programa usa cada puerto y cerrarlo.
- **Espacio en disco**: carpetas que más ocupan, archivos grandes y duplicados (a la papelera, recuperable).

**Utilidades**
- **Conversor de archivos**: imágenes a AVIF/WebP/JPEG/PNG y DOCX → PDF/HTML.
- **Texturas Unity/VRChat**: reduce en lote a potencias de 2 y tamaño máximo.
- **Programador de tareas**: comandos o backups con horario, dentro de la app (cron) o en el Programador de tareas de Windows.

FFmpeg viene incluido (`ffmpeg-static`), no hace falta instalarlo.

## Requisitos

- Windows 10/11.
- Node.js 20+ para desarrollo.

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

