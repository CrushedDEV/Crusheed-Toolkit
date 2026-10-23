import { mountYouTubeModule } from './youtube/ui.js';
import { mountAnalyzerModule } from './analyzer/ui.js';
import { mountMixedKeyModule } from './mixedkey/ui.js';
import { mountOrganizerModule } from './organizer/ui.js';
import { mountAudioBatchModule } from './audiobatch/ui.js';
import { mountVideoModule } from './video/ui.js';
import { mountMcServerModule } from './mc_server/ui.js';
import { mountMcStartBatModule } from './mc_startbat/ui.js';
import { mountMcOptionsModule } from './mc_options/ui.js';
import { mountMcManifestModule } from './mc_manifest/ui.js';
import { mountPortsModule } from './ports/ui.js';
import { mountDiskSpaceModule } from './diskspace/ui.js';
import { mountConverterModule } from './converter/ui.js';
import { mountTexturesModule } from './textures/ui.js';
import { mountSchedulerModule } from './scheduler/ui.js';

function mountAbout(root) {
  root.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="row" style="gap:16px; align-items:center;">
      <div class="brand-mark" style="width:48px; height:48px; font-size:22px; border-radius:14px;">C</div>
      <div>
        <h2 class="title" style="margin:0;">Crushed Toolkit</h2>
        <div class="small">Caja de herramientas de escritorio por CrushedDEV.</div>
      </div>
    </div>
    <p class="muted">Audio, vídeo, Minecraft, sistema y utilidades del día a día en una sola app. Se actualiza sola desde GitHub.</p>
    <div class="actions">
      <button class="ghost" id="about-repo">Ver en GitHub</button>
    </div>
  `;
  root.appendChild(card);
  card.querySelector('#about-repo').addEventListener('click', () => window.open('https://github.com/CrushedDEV/Crusheed-Toolkit', '_blank'));
}

export const modules = {
  youtube: { title: 'Descargador YouTube', description: 'Cola de descargas en MP4 o MP3, playlists y calidad a elegir.', mount: mountYouTubeModule },
  analyzer: { title: 'Analizador BPM/Tonalidad', description: 'Detecta tempo y tonalidad (con Camelot) y guárdalos en las etiquetas ID3.', mount: mountAnalyzerModule },
  mixedkey: { title: 'Compatibles (Camelot)', description: 'Encuentra pistas de tu librería que mezclan bien con otra.', mount: mountMixedKeyModule },
  organizer: { title: 'Organizador de librería', description: 'Analiza en lote, renombra con patrones, edita etiquetas y pon portadas.', mount: mountOrganizerModule },
  audiobatch: { title: 'Audio en lote', description: 'Convierte, recorta e iguala el volumen de muchos archivos a la vez.', mount: mountAudioBatchModule },
  video: { title: 'Comprimir vídeo y GIF', description: 'Ajusta un vídeo al límite de Discord o conviértelo en GIF.', mount: mountVideoModule },
  mc_server: { title: 'Servidor de Minecraft', description: 'Descarga Paper/Purpur/Fabric/Vanilla, edita server.properties y haz backups.', mount: mountMcServerModule },
  mc_startbat: { title: 'Generador start.bat', description: 'Script de arranque para servidores con flags de Aikar.', mount: mountMcStartBatModule },
  mc_options: { title: 'Editor options.txt', description: 'Cambia los ajustes de Minecraft Java sin abrir el juego.', mount: mountMcOptionsModule },
  mc_manifest: { title: 'manifest.json (Bedrock)', description: 'Valida packs de Bedrock, regenera UUIDs y sube versión.', mount: mountMcManifestModule },
  ports: { title: 'Puertos y procesos', description: 'Qué programa está usando cada puerto, y ciérralo con un clic.', mount: mountPortsModule },
  diskspace: { title: 'Espacio en disco', description: 'Carpetas que más ocupan, archivos grandes y duplicados.', mount: mountDiskSpaceModule },
  converter: { title: 'Conversor de archivos', description: 'Imágenes a AVIF/WebP/JPEG/PNG y documentos DOCX a PDF o HTML.', mount: mountConverterModule },
  textures: { title: 'Texturas Unity/VRChat', description: 'Reduce texturas a potencias de 2 y al tamaño que quieras, en lote.', mount: mountTexturesModule },
  scheduler: { title: 'Programador de tareas', description: 'Ejecuta comandos o backups con horario, dentro de la app o en Windows.', mount: mountSchedulerModule },
  about: { title: 'Acerca de', description: '', mount: mountAbout }
};
