export function mountMcStartBatModule(root, params = {}){
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="grid grid-3">
      <div class="field">
        <div class="label">RAM mínima (Xms)</div>
        <input id="ram-min" type="text" placeholder="1G" value="1G" />
      </div>
      <div class="field">
        <div class="label">RAM máxima (Xmx)</div>
        <input id="ram-max" type="text" placeholder="4G" value="4G" />
      </div>
      <div class="field">
        <div class="label">Nombre del JAR</div>
        <input id="jar-name" type="text" placeholder="server.jar" value="server.jar" />
      </div>
      <div class="field">
        <div class="label">Preset de flags</div>
        <select id="flags-preset">
          <option value="aikar" selected>Aikar (Paper/Purpur)</option>
          <option value="vanilla">Vanilla (sin flags)</option>
        </select>
      </div>
      <div class="field">
        <div class="label">Ruta de Java (opcional)</div>
        <input id="java-path" type="text" placeholder="C:\\Program Files\\Java\\bin\\java.exe" />
      </div>
      <div class="field" style="justify-content:flex-end;">
        <label class="small" style="min-height:42px;">
          <input id="agree-eula" type="checkbox" /> Aceptar EULA automáticamente
        </label>
      </div>
    </div>

    <div class="actions">
      <button class="primary" id="download">Descargar start.bat</button>
      <button class="ghost" id="copy">Copiar</button>
      <button class="ghost" id="preview" hidden>Previsualizar</button>
    </div>

    <div class="field">
      <div class="label">Contenido generado</div>
      <pre id="output" class="code"></pre>
    </div>
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
  const btnCopy = q('#copy');
  btnCopy.addEventListener('click', async ()=>{
    updatePreview();
    try { await navigator.clipboard.writeText(output.textContent); btnCopy.textContent = '¡Copiado!'; }
    catch { btnCopy.textContent = 'No se pudo copiar'; }
    setTimeout(()=>{ btnCopy.textContent = 'Copiar'; }, 1500);
  });

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
${javaCmd} -Xms%XMS% -Xmx%XMX% ${flags} -jar %JAR% nogui

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

  [ramMin, ramMax, jar, preset, javaPath, agree].forEach(el => { el.addEventListener('input', updatePreview); el.addEventListener('change', updatePreview); });
  btnPrev.addEventListener('click', updatePreview);
  btnDown.addEventListener('click', async ()=>{
    updatePreview();
    const text = output.textContent.replace(/\r?\n/g, '\r\n');
    const r = await window.ctk.file.save({
      title: 'Guardar start.bat',
      defaultPath: params.folder ? `${params.folder}\\start.bat` : 'start.bat',
      filters: [{ name: 'Script de Windows', extensions: ['bat'] }],
      dataBase64: btoa(unescape(encodeURIComponent(text)))
    });
    if (r?.ok && r.filePath) window.ctk.shell.showItemInFolder(r.filePath);
  });

  // Opened from the Minecraft server tool: pre-fill the jar and offer to save straight into that folder
  if (params.jar) jar.value = params.jar;
  if (params.folder) {
    const btnSaveHere = document.createElement('button');
    btnSaveHere.className = 'primary';
    btnSaveHere.textContent = 'Guardar en la carpeta del servidor';
    btnSaveHere.addEventListener('click', async ()=>{
      updatePreview();
      const r = await window.ctk.mc.writeStartBat({ folder: params.folder, content: output.textContent });
      btnSaveHere.textContent = r.ok ? '¡Guardado!' : `Error: ${r.error}`;
      if (r.ok) window.ctk.shell.showItemInFolder(r.file);
    });
    btnDown.className = 'ghost';
    btnDown.before(btnSaveHere);
  }

  updatePreview();
}
