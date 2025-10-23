export function mountMcStartBatModule(root){
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="title">Generador start.bat para servidores</h2>
    <p class="small muted">Configura memoria, nombre del JAR y flags (Aikar) para optimizar tu servidor Paper/Spigot/Purpur.</p>

    <div class="row" style="margin-top:8px; flex-wrap:wrap;">
      <div style="flex:1; min-width:220px;">
        <div class="label">RAM mínima (Xms)</div>
        <input id="ram-min" type="text" placeholder="1G" value="1G" />
      </div>
      <div style="flex:1; min-width:220px;">
        <div class="label">RAM máxima (Xmx)</div>
        <input id="ram-max" type="text" placeholder="4G" value="4G" />
      </div>
      <div style="flex:1; min-width:220px;">
        <div class="label">Nombre del JAR</div>
        <input id="jar-name" type="text" placeholder="server.jar" value="server.jar" />
      </div>
    </div>

    <div class="row" style="margin-top:8px; flex-wrap:wrap;">
      <div style="flex:1; min-width:220px;">
        <div class="label">Preset de flags</div>
        <select id="flags-preset">
          <option value="aikar" selected>Aikar (Paper/Purpur)</option>
          <option value="vanilla">Vanilla (sin flags)</option>
        </select>
      </div>
      <div style="flex:1; min-width:220px;">
        <div class="label">Ruta de Java (opcional)</div>
        <input id="java-path" type="text" placeholder="C:\\Program Files\\Java\\bin\\java.exe" />
      </div>
      <div style="flex:1; min-width:220px; display:flex; align-items:flex-end; gap:8px;">
        <label class="small" style="display:flex; align-items:center; gap:8px;">
          <input id="agree-eula" type="checkbox" /> Aceptar EULA automáticamente
        </label>
      </div>
    </div>

    <div class="row" style="margin-top:12px;">
      <button class="ghost" id="preview">Previsualizar</button>
      <button class="primary" id="download">Descargar start.bat</button>
    </div>

    <div class="label" style="margin-top:12px;">Contenido generado</div>
    <pre id="output" style="background:#0a0a0a; border:1px solid var(--border); border-radius:12px; padding:12px; white-space:pre-wrap; word-break:break-word; max-height:240px; overflow:auto;"></pre>
  `;

  root.appendChild(card);

  const q = (sel)=>card.querySelector(sel);
  const ramMin = q('#ram-min');
  const ramMax = q('#ram-max');
  const jar = q('#jar-name');
  const preset = q('#flags-preset');
  const javaPath = q('#java-path');
  const agree = q('#agree-eula');
  const output = q('#output');
  const btnPrev = q('#preview');
  const btnDown = q('#download');

  const AIKAR_FLAGS = [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
  ];

  function buildBat(){
    const xms = (ramMin.value || '1G').trim();
    const xmx = (ramMax.value || '4G').trim();
    const jarName = (jar.value || 'server.jar').trim();
    const jPath = (javaPath.value || '').trim();

    const javaCmd = jPath ? `"${jPath}"` : 'java';
    const flags = preset.value === 'aikar' ? AIKAR_FLAGS.join(' ') : '';

    const eulaPart = agree.checked
      ? `\nif not exist eula.txt (\n  echo eula=true>eula.txt\n)`
      : '';

    const content = `@echo off
chcp 65001 > nul
set XMS=${xms}
set XMX=${xmx}
set JAR=${jarName}
${eulaPart}
:loop
${javaCmd} -Xms%XMS% -Xmx%XMX% ${flags} -jar %JAR% --nogui

echo.
echo El servidor se ha detenido. Reiniciando en 5 segundos...
Timeout /T 5 /Nobreak >nul
goto loop
`;
    return content;
  }

  function updatePreview(){
    output.textContent = buildBat();
  }

  [ramMin, ramMax, jar, preset, javaPath, agree].forEach(el => el.addEventListener('input', updatePreview));
  btnPrev.addEventListener('click', updatePreview);
  btnDown.addEventListener('click', ()=>{
    updatePreview();
    const blob = new Blob([output.textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'start.bat';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  updatePreview();
}
