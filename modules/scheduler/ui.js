const $ = (sel, root=document) => root.querySelector(sel);

export function mountSchedulerModule(root){
  root.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="title">Programador de tareas</h2>
    <div class="row" style="margin-bottom:8px; align-items:center;">
      <button id="btn-new" class="primary">Nueva tarea</button>
      <div class="small muted" style="margin-left:8px;">En ejecución mientras la app esté abierta. Para ejecución sin app, usa destino Windows.</div>
    </div>

    <div id="wizard" class="card" style="display:none; gap:12px;">
      <div class="row" style="gap:12px; flex-wrap:wrap;">
        <div>
          <div class="label">Destino</div>
          <div class="row" style="gap:8px;">
            <label class="small"><input type="radio" name="w-target" value="app" checked /> En la app</label>
            <label class="small"><input type="radio" name="w-target" value="win" /> Windows</label>
          </div>
        </div>
        <div style="flex:1; min-width:260px;">
          <div class="label">Nombre</div>
          <input id="w-name" type="text" placeholder="Mi tarea" />
        </div>
      </div>

      <div class="row" style="gap:12px; flex-wrap:wrap;">
        <div>
          <div class="label">Preset de programación</div>
          <select id="w-preset">
            <option value="every">Cada X minutos/horas</option>
            <option value="daily">Diario a HH:MM</option>
            <option value="workdays">Laboral (L–V) a HH:MM</option>
            <option value="weekend">Fin de semana a HH:MM</option>
            <option value="monthly">Mensual (día N a HH:MM)</option>
          </select>
        </div>
        <div>
          <div class="label">Cada</div>
          <div class="row" style="gap:8px;">
            <input id="w-every-n" type="number" min="1" value="15" style="width:80px;" />
            <select id="w-every-unit">
              <option value="min">min</option>
              <option value="hour">horas</option>
            </select>
          </div>
        </div>
        <div>
          <div class="label">Hora</div>
          <input id="w-time" type="time" value="09:00" />
        </div>
        <div>
          <div class="label">Día del mes</div>
          <input id="w-dom" type="number" min="1" max="31" value="1" />
        </div>
      </div>

      <div class="row" style="gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:280px;">
          <div class="label">Comando / aplicación</div>
          <input id="w-cmd" type="text" placeholder="echo Hola" />
        </div>
        <div>
          <div class="label">Timeout (s)</div>
          <input id="w-timeout" type="number" min="0" value="0" />
        </div>
        <div>
          <div class="label">Jitter (s)</div>
          <input id="w-jitter" type="number" min="0" value="0" />
        </div>
      </div>

      <div class="row" style="gap:8px;">
        <button id="w-create" class="primary">Crear tarea</button>
        <button id="w-cancel" class="ghost">Cancelar</button>
        <div id="w-summary" class="small muted" style="margin-left:auto;"></div>
      </div>
    </div>

    <div class="label" style="margin-top:12px;">Tareas (app)</div>
    <div id="sj-list" class="card" style="background:#0a0a0a; border-radius:12px; padding:12px; max-height:320px; overflow:auto;"></div>

    <div class="label" style="margin-top:12px;">Tareas de Windows</div>
    <div id="ws-table" class="card" style="background:#0a0a0a; border-radius:12px; padding:12px; max-height:320px; overflow:auto;"></div>
  `;
  root.appendChild(card);

  // Wizard elements
  const btnNew = $('#btn-new', card);
  const wizard = $('#wizard', card);
  const wName = $('#w-name', card);
  const wPreset = $('#w-preset', card);
  const wEveryN = $('#w-every-n', card);
  const wEveryUnit = $('#w-every-unit', card);
  const wTime = $('#w-time', card);
  const wDom = $('#w-dom', card);
  const wCmd = $('#w-cmd', card);
  const wTimeout = $('#w-timeout', card);
  const wJitter = $('#w-jitter', card);
  const wSummary = $('#w-summary', card);
  const wCreate = $('#w-create', card);
  const wCancel = $('#w-cancel', card);
  const wTarget = () => (card.querySelector('input[name="w-target"]:checked')?.value || 'app');
  const sjList = $('#sj-list', card);
  const wsTable = $('#ws-table', card);

  function humanCron(cronExpr){
    // Simplificado para presets que generamos nosotros
    if (/^\*\/\d+\s\*\s\*\s\*\s\*$/.test(cronExpr)) {
      const n = cronExpr.match(/^\*\/(\d+)/)[1];
      return `Cada ${n} min`;
    }
    const m = cronExpr.split(' ');
    if (m.length===5 && m[0].match(/^\d+$/) && m[1].match(/^\d+$/)){
      return `Diario ${m[1].padStart(2,'0')}:${m[0].padStart(2,'0')}`;
    }
    return cronExpr;
  }

  function renderJobs(items){
    sjList.innerHTML = '';
    if (!items || !items.length){ sjList.innerHTML = '<div class="small muted">Sin tareas.</div>'; return; }
    for (const j of items){
      const cardRow = document.createElement('div');
      cardRow.className = 'card';
      cardRow.style.marginBottom = '8px';
      const header = document.createElement('div');
      header.className = 'row'; header.style.alignItems='center'; header.style.gap='8px';
      const title = document.createElement('div');
      title.innerHTML = `<strong>${j.name}</strong> <span class="small muted">(${humanCron(j.cron)})</span>`;
      const badges = document.createElement('div'); badges.className='row'; badges.style.gap='6px';
      const badgeNext = document.createElement('span'); badgeNext.className='value-badge'; badgeNext.textContent = j.nextRun ? new Date(j.nextRun).toLocaleString() : '—';
      const badgeLast = document.createElement('span'); badgeLast.className='value-badge'; badgeLast.textContent = j.lastRun ? new Date(j.lastRun).toLocaleString() : '—';
      const badgeExit = document.createElement('span'); badgeExit.className='value-badge'; badgeExit.textContent = `exit ${j.lastExit ?? '—'}`;
      badges.append(badgeNext, badgeLast, badgeExit);
      const actions = document.createElement('div');
      const btnRun = document.createElement('button'); btnRun.className='ghost'; btnRun.textContent='Ejecutar'; btnRun.onclick = async ()=>{ await window.ctk.scheduler.runNow(j.id); refresh(); };
      const btnToggle = document.createElement('button'); btnToggle.className='ghost'; btnToggle.textContent = j.enabled ? 'Pausar' : 'Reanudar'; btnToggle.onclick = async ()=>{ await window.ctk.scheduler.toggle(j.id, !j.enabled); refresh(); };
      const btnDel = document.createElement('button'); btnDel.className='ghost'; btnDel.textContent='Eliminar'; btnDel.onclick = async ()=>{ await window.ctk.scheduler.remove(j.id); refresh(); };
      actions.append(btnRun, btnToggle, btnDel);
      header.append(title, badges, actions);
      cardRow.appendChild(header);
      sjList.appendChild(cardRow);
    }
  }

  function csvToTable(csv){
    // muy básico: separar por comas respetando comillas dobles
    const rows = csv.trim().split(/\r?\n/);
    if (!rows.length) return document.createTextNode('Sin datos');
    const table = document.createElement('table'); table.style.width='100%'; table.className='small';
    const thead = document.createElement('thead'); const tbody = document.createElement('tbody');
    const parse = (line) => {
      const out=[]; let cur=''; let inQ=false;
      for (let i=0;i<line.length;i++){
        const ch=line[i];
        if (ch==='"') { if (inQ && line[i+1]==='"'){ cur+='"'; i++; } else { inQ=!inQ; } }
        else if (ch===',' && !inQ){ out.push(cur); cur=''; }
        else cur+=ch;
      }
      out.push(cur); return out;
    };
    const headers = parse(rows[0]);
    const trh = document.createElement('tr');
    headers.forEach(h=>{ const th=document.createElement('th'); th.textContent=h; th.style.textAlign='left'; th.style.padding='4px 6px'; trh.appendChild(th); });
    thead.appendChild(trh);
    rows.slice(1).forEach(r=>{
      const tds = parse(r);
      const tr=document.createElement('tr');
      tds.forEach((c,i)=>{ const td=document.createElement('td'); td.textContent=c; td.style.padding='4px 6px'; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody); return table;
  }
  function updateSummary(){
    const p = wPreset.value;
    let text = '';
    if (p==='every') text = `Cada ${wEveryN.value} ${wEveryUnit.value==='min'?'min':'horas'}`;
    if (p==='daily') text = `Diario a las ${wTime.value}`;
    if (p==='workdays') text = `L–V a las ${wTime.value}`;
    if (p==='weekend') text = `Sáb–Dom a las ${wTime.value}`;
    if (p==='monthly') text = `Día ${wDom.value} a las ${wTime.value}`;
    wSummary.textContent = text;
  }
  ['change','input'].forEach(ev => {
    [wPreset,wEveryN,wEveryUnit,wTime,wDom].forEach(el => el.addEventListener(ev, updateSummary));
  });
  updateSummary();

  function buildCronFromPreset(){
    const p = wPreset.value;
    if (p==='every'){
      if (wEveryUnit.value==='min') return `*/${Math.max(1,parseInt(wEveryN.value||'1',10))} * * * *`;
      const n = Math.max(1,parseInt(wEveryN.value||'1',10));
      return `0 */${n} * * *`;
    }
    const [hh,mm] = (wTime.value||'09:00').split(':');
    if (p==='daily') return `${parseInt(mm,10)} ${parseInt(hh,10)} * * *`;
    if (p==='workdays') return `${parseInt(mm,10)} ${parseInt(hh,10)} * * 1-5`;
    if (p==='weekend') return `${parseInt(mm,10)} ${parseInt(hh,10)} * * 6,0`;
    if (p==='monthly') return `${parseInt(mm,10)} ${parseInt(hh,10)} ${Math.min(31,Math.max(1,parseInt(wDom.value||'1',10)))} * *`;
    return '*/5 * * * *';
  }

  async function refresh(){
    const r = await window.ctk.scheduler.list();
    if (r.ok) renderJobs(r.jobs);
    const w = await window.ctk.winsched.list();
    wsTable.innerHTML = '';
    if (w.ok) wsTable.appendChild(csvToTable(w.raw)); else wsTable.textContent = w.error || 'Error listando tareas';
  }

  btnNew.addEventListener('click', ()=>{ wizard.style.display = 'block'; });
  wCancel.addEventListener('click', ()=>{ wizard.style.display = 'none'; });
  wCreate.addEventListener('click', async ()=>{
    const target = wTarget();
    if (target==='app'){
      const id = (wName.value.trim() || `job-${Date.now()}`).replace(/\s+/g,'-');
      const def = {
        id,
        name: wName.value.trim() || id,
        cron: buildCronFromPreset(),
        cmd: wCmd.value.trim(),
        args: [], enabled: true,
        jitter: parseInt(wJitter.value||'0',10)||0,
        timeoutSec: parseInt(wTimeout.value||'0',10)||0,
      };
      const r = await window.ctk.scheduler.create(def);
      if (r.ok) { wizard.style.display='none'; refresh(); }
    } else {
      // Windows
      const schedule = (function(){
        if (wPreset.value==='every') return { type:'MINUTE', every: (wEveryUnit.value==='min'? Math.max(1,parseInt(wEveryN.value||'1',10)) : Math.max(1,parseInt(wEveryN.value||'1',10))*60) };
        if (wPreset.value==='daily') return { type:'DAILY' };
        if (wPreset.value==='workdays' || wPreset.value==='weekend' || wPreset.value==='monthly') return { type:'DAILY' };
        return { type:'DAILY' };
      })();
      const r = await window.ctk.winsched.create({ name: wName.value.trim() || `CTK-${Date.now()}`, cmd: wCmd.value.trim(), schedule, startTime: (wTime.value||'09:00') });
      if (r.ok) { wizard.style.display='none'; refresh(); }
    }
  });
  refresh();
}
