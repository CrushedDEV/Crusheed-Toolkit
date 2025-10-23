export function mountWindowEnhancer(root){
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="title">Mejorador de Ventanas (Vibrance/Gamma/Brightness)</h2>
    <p class="small muted">Elige una ventana abierta para previsualizarla con filtros en tiempo real.</p>

    <div class="row" style="gap:12px; flex-wrap:wrap;">
      <div style="min-width:280px; flex:1;">
        <div class="label">Ventana</div>
        <div class="row" style="gap:8px; align-items:center;">
          <button class="ghost" id="reload">Cargar ventanas</button>
          <span class="small muted">Selecciona una ventana para previsualizar</span>
          <button class="primary" id="pick">Elegir ventana/pantalla</button>
        </div>
        <div id="sources" class="row" style="gap:8px; flex-wrap:wrap; min-height:44px;"></div>
      </div>
      <div style="min-width:260px; flex:1;">
        <div class="label">Ajustes</div>
        <div class="row" style="gap:8px; flex-direction:column; align-items:stretch;">
          <label class="small">Vibrance <input id="vibrance" type="range" min="-1" max="1" step="0.01" value="0.2" /></label>
          <label class="small">Saturación <input id="saturation" type="range" min="0" max="3" step="0.01" value="1.2" /></label>
          <label class="small">Brillo <input id="brightness" type="range" min="0" max="2" step="0.01" value="1.0" /></label>
          <label class="small">Contraste <input id="contrast" type="range" min="0" max="3" step="0.01" value="1.0" /></label>
          <label class="small">Gamma <input id="gamma" type="range" min="0.5" max="3" step="0.01" value="1.0" /></label>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top:12px;">
      <canvas id="canvas" style="width:100%; max-height:480px; background:#000; border:1px solid var(--border); border-radius:12px;"></canvas>
    </div>
  `;
  root.appendChild(card);

  const q = (sel)=>card.querySelector(sel);
  const list = q('#sources');
  const btnReload = q('#reload');
  const btnPick = q('#pick');
  const canvas = q('#canvas');
  const sliders = {
    vibrance: q('#vibrance'),
    saturation: q('#saturation'),
    brightness: q('#brightness'),
    contrast: q('#contrast'),
    gamma: q('#gamma'),
  };

  let currentStream = null;
  let video = null;
  let gl = null;
  let program = null;
  let tex = null;

  async function loadSources(){
    try{
      if (!window.ctk || !window.ctk.desktop){
        list.innerHTML = '<div class="small warn">No disponible: desktopCapturer no expuesto.</div>';
        return;
      }
      list.innerHTML = '<div class="small muted">Cargando…</div>';
      const sources = await window.ctk.desktop.getSources({ types:['window','screen'], thumbnailSize: { width: 320, height: 180 } });
      list.innerHTML = '';
      if (!sources || !sources.length){
        list.innerHTML = '<div class="small warn">No se encontraron ventanas. Abre alguna app y pulsa "Cargar ventanas".</div>';
        return;
      }
      sources.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'ghost';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.width = '150px';
        btn.title = s.name;
        const img = document.createElement('img');
        img.src = s.thumbnailDataUrl || s.appIconDataUrl || '';
        img.style.width = '100%'; img.style.height = 'auto'; img.style.borderRadius = '8px';
        const cap = document.createElement('div'); cap.className = 'small'; cap.textContent = s.name;
        btn.appendChild(img); btn.appendChild(cap);
        btn.addEventListener('click', ()=> startCapture(s.id));
        list.appendChild(btn);
      });
    }catch(err){
      list.innerHTML = `<div class="small warn">Error al cargar ventanas: ${String(err)}</div>`;
    }
  }

  async function pickDisplay(){
    try{
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
      if (currentStream){ currentStream.getTracks().forEach(t=>t.stop()); }
      currentStream = stream;
      if (!video){
        video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
      }
      video.srcObject = stream; await video.play();
      setupGL(); requestAnimationFrame(draw);
    }catch(err){
      list.innerHTML = `<div class="small warn">No se pudo capturar: ${String(err)}</div>`;
    }
  }

  async function startCapture(sourceId){
    if (currentStream){
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { 
          mandatory: { 
            chromeMediaSource: 'desktop', 
            chromeMediaSourceId: sourceId,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          } 
        }
      });
    }catch(err){
      // Fallback sin mandatory (algunas builds)
      stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:true });
    }
    currentStream = stream;

    if (!video){
      video = document.createElement('video');
      video.autoplay = true; video.muted = true; video.playsInline = true;
    }
    video.srcObject = stream;
    await video.play();

    setupGL();
    requestAnimationFrame(draw);
  }

  function setupGL(){
    gl = canvas.getContext('webgl');
    if (!gl) return;
    const vsrc = `
      attribute vec2 aPos; attribute vec2 aUV; varying vec2 vUV; 
      void main(){ vUV = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }
    `;
    const fsrc = `
      precision mediump float; varying vec2 vUV; uniform sampler2D uTex;
      uniform float uVibrance, uSaturation, uBrightness, uContrast, uGamma;
      vec3 applyVibrance(vec3 color, float vib){
        float avg = (color.r + color.g + color.b) / 3.0;
        float mx = max(max(color.r, color.g), color.b);
        float amt = (mx - avg) * (-vib * 3.0);
        return mix(color, vec3(mx), amt);
      }
      void main(){
        vec4 c = texture2D(uTex, vUV);
        c.rgb = pow(c.rgb, vec3(uGamma));
        c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
        c.rgb *= uBrightness;
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, uSaturation);
        c.rgb = applyVibrance(c.rgb, uVibrance);
        gl_FragColor = c;
      }
    `;
    function compile(type, src){ const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; }
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(program);
    gl.useProgram(program);

    const quad = new Float32Array([
      -1,-1, 0,0,  1,-1, 1,0,  -1,1, 0,1,  1,1, 1,1
    ]);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos'); const aUV = gl.getAttribLocation(program, 'aUV');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.uniform1f(gl.getUniformLocation(program, 'uVibrance'), parseFloat(sliders.vibrance.value));
    gl.uniform1f(gl.getUniformLocation(program, 'uSaturation'), parseFloat(sliders.saturation.value));
    gl.uniform1f(gl.getUniformLocation(program, 'uBrightness'), parseFloat(sliders.brightness.value));
    gl.uniform1f(gl.getUniformLocation(program, 'uContrast'), parseFloat(sliders.contrast.value));
    gl.uniform1f(gl.getUniformLocation(program, 'uGamma'), parseFloat(sliders.gamma.value));

    Object.values(sliders).forEach(inp => inp.addEventListener('input', ()=>{
      if (!gl) return;
      gl.uniform1f(gl.getUniformLocation(program, 'uVibrance'), parseFloat(sliders.vibrance.value));
      gl.uniform1f(gl.getUniformLocation(program, 'uSaturation'), parseFloat(sliders.saturation.value));
      gl.uniform1f(gl.getUniformLocation(program, 'uBrightness'), parseFloat(sliders.brightness.value));
      gl.uniform1f(gl.getUniformLocation(program, 'uContrast'), parseFloat(sliders.contrast.value));
      gl.uniform1f(gl.getUniformLocation(program, 'uGamma'), parseFloat(sliders.gamma.value));
    }));
  }

  function draw(){
    if (!gl || !video) return;
    const vw = video.videoWidth || 1280; const vh = video.videoHeight || 720;
    const cw = canvas.clientWidth; const ch = canvas.clientHeight || (canvas.clientWidth * vh / vw);
    canvas.width = cw; canvas.height = ch;
    gl.viewport(0,0, canvas.width, canvas.height);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(draw);
  }

  if (btnReload) btnReload.addEventListener('click', loadSources);
  if (btnPick) btnPick.addEventListener('click', pickDisplay);
  // Si desktopCapturer no está expuesto, guía al usuario a usar el picker nativo
  if (window.ctk && window.ctk.desktop){
    loadSources();
  } else {
    list.innerHTML = '<div class="small warn">Listado de ventanas no disponible. Usa "Elegir ventana/pantalla".</div>';
  }
}
