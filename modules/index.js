import { mountYouTubeModule } from './youtube/ui.js';
import { mountAnalyzerModule } from './analyzer/ui.js';
import { mountMixedKeyModule } from './mixedkey/ui.js';
import { mountMcStartBatModule } from './mc_startbat/ui.js';
import { mountConverterModule } from './converter/ui.js';

function mountAbout(root) {
  root.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="title">Crushed Toolkit</h2>
    <p class="muted">App modular en Electron. Próximamente: recortar, convertir y más.</p>
  `;
  root.appendChild(card);
}

export const modules = {
  youtube: { title: 'Descargador YouTube', mount: mountYouTubeModule },
  analyzer: { title: 'Analizador BPM/Tonalidad', mount: mountAnalyzerModule },
  mixedkey: { title: 'Compatibles (Camelot)', mount: mountMixedKeyModule },
  mc_startbat: { title: 'Minecraft • Generador start.bat', mount: mountMcStartBatModule },
  converter: { title: 'Conversor/Optimizador de Imágenes', mount: mountConverterModule },
  about: { title: 'Acerca de', mount: mountAbout }
};
