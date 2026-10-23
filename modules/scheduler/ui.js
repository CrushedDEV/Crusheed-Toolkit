const $ = (sel, root=document) => root.querySelector(sel);

export function mountSchedulerModule(root){
  root.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="actions" style="margin-top:0;">
      <button id="btn-new" class="primary">+ Nueva tarea</button>
      <div class="small">Las tareas «en la app» solo corren con la app abierta. Para que funcionen siempre, usa destino Windows.</div>
    </div>

    <div id="wizard" class="card" style="display:none;">
      <h3 class="section-title">Nueva tarea</h3>
      <div class="grid" style="grid-template-columns:220px minmax(0,1fr);">
        <div class="field">
          <div class="label">Destino</div>
          <div class="row" style="gap:16px; min-height:42px;">
            <label class="small"><input type="radio" name="w-target" value="app" checked /> En la app</label>
            <label class="small"><input type="radio" name="w-target" value="win" /> Windows</label>
          </div>
        </div>
        <div class="field">
          <div class="label">Nombre</div>
          <input id="w-name" type="text" placeholder="Mi tarea" />
        </div>
      </div>

      <div class="grid" style="grid-template-columns:260px repeat(2, minmax(0,180px)); justify-content:start;">
        <div class="field">
          <div class="label">Cuándo</div>
          <select id="w-preset">
            <option value="every">Cada X minutos u horas</option>
            <option value="daily">Todos los días</option>
            <option value="workdays">Laborables (L–V)</option>
            <option value="weekend">Fines de semana</option>
            <option value="monthly">Una vez al mes</option>
          </select>
        </div>
        <div class="field" id="f-every">
          <div class="label">Cada</div>
          <div class="input-group">
            <input id="w-every-n" type="number" min="1" value="15" style="max-width:80px;" />
            <select id="w-every-unit">
              <option value="min">minutos</option>
              <option value="hour">horas</option>
            </select>
          </div>
        </div>
        <div class="field" id="f-dom">
          <div class="label">Día del mes</div>
          <input id="w-dom" type="number" min="1" max="31" value="1" />
        </div>
        <div class="field" id="f-time">
          <div class="label">Hora</div>
          <input id="w-time" type="time" value="09:00" />
        </div>
      </div>

      <div class="grid" style="grid-template-columns:minmax(0,1fr) 140px 140px;">
        <div class="field">
          <div class="label">Comando o aplicación</div>
          <input id="w-cmd" type="text" placeholder="echo Hola" spellcheck="false" />
        </div>
        <div class="field f-app-only">
          <div class="label">Timeout (s)</div>
          <input id="w-timeout" type="number" min="0" value="0" />
        </div>
        <div class="field f-app-only">
          <div class="label">Jitter (s)</div>
          <input id="w-jitter" type="number" min="0" value="0" />
        </div>
      </div>

      <div class="actions">
        <button id="w-create" class="primary">Crear tarea</button>
        <button id="w-cancel" class="ghost">Cancelar</button>
        <div id="w-summary" class="value-badge push" style="font-weight:500;"></div>
      </div>
      <div id="w-error" class="small warn" style="margin-top:8px;"></div>
    </div>

    <div class="field">
      <div class="label">Tareas en la app</div>
      <div id="sj-list" class="well" style="max-height:340px;"></div>
    </div>

    <div class="field">
      <div class="label">Tareas de Windows <span style="color:var(--text-faint);">· carpeta raíz del Programador de tareas</span></div>
      <div id="ws-table" class="well" style="max-height:340px;"><div class="empty">Cargando…</div></div>
    </div>
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
  const wError = $('#w-error', card);
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
    if (!items || !items.length){ sjList.innerHTML = '<div class="empty">Sin tareas todavía.</div>'; return; }
    for (const j of items){
      const cardRow = document.createElement('div');
      cardRow.className = 'list-row';
      const header = document.createElement('div');
      header.className = 'row'; header.style.flex = '1';
      const title = document.createElement('div');
      const strong = document.createElement('strong'); strong.textContent = j.name;
      const cronInfo = document.createElement('span'); cronInfo.className = 'small muted'; cronInfo.textContent = ` (${humanCron(j.cron)})`;
      title.append(strong, cronInfo);
      const badges = document.createElement('div'); badges.className='row'; badges.style.gap='6px';
      const badgeNext = document.createElement('span'); badgeNext.className='value-badge'; badgeNext.textContent = j.nextRun ? new Date(j.nextRun).toLocaleString() : '—';
      const badgeLast = document.createElement('span'); badgeLast.className='value-badge'; badgeLast.textContent = j.lastRun ? new Date(j.lastRun).toLocaleString() : '—';
      const badgeExit = document.createElement('span'); badgeExit.className='value-badge'; badgeExit.textContent = `exit ${j.lastExit ?? '—'}`;
      badges.append(badgeNext, badgeLast, badgeExit);
      title.style.flex = '1';
      const actions = document.createElement('div'); actions.className = 'actions'; actions.style.gap = '6px';
      const btnRun = document.createElement('button'); btnRun.className='ghost sm'; btnRun.textContent='Ejecutar'; btnRun.onclick = async ()=>{ await window.ctk.scheduler.runNow(j.id); refresh(); };
      const btnToggle = document.createElement('button'); btnToggle.className='ghost sm'; btnToggle.textContent = j.enabled ? 'Pausar' : 'Reanudar'; btnToggle.onclick = async ()=>{ await window.ctk.scheduler.toggle(j.id, !j.enabled); refresh(); };
      const btnDel = document.createElement('button'); btnDel.className='danger sm'; btnDel.textContent='Eliminar'; btnDel.onclick = async ()=>{ await window.ctk.scheduler.remove(j.id); refresh(); };
      actions.append(btnRun, btnToggle, btnDel);
      header.append(title, badges, actions);
      cardRow.appendChild(header);
      sjList.appendChild(cardRow);
    }
  }

  function renderWinTasks(tasks){
    wsTable.innerHTML = '';
    if (!tasks.length){ wsTable.innerHTML = '<div class="empty">Sin tareas propias.</div>'; return; }
    const table = document.createElement('table'); table.className='data';
    const trh = document.createElement('tr');
    ['Nombre', 'Próxima ejecución', 'Estado', ''].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; trh.appendChild(th); });
    const thead = document.createElement('thead'); thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    for (const t of tasks){
      const tr = document.createElement('tr');
      [t.name, t.nextRun, t.status].forEach(c=>{ const td=document.createElement('td'); td.textContent=c; tr.appendChild(td); });
      const tdAct = document.createElement('td'); tdAct.className = 'actions-cell';
      const btnDel = document.createElement('button'); btnDel.className='danger sm'; btnDel.textContent='Eliminar';
      btnDel.onclick = async ()=>{
        if (!confirm(`¿Eliminar la tarea de Windows "${t.name}"?`)) return;
        const r = await window.ctk.winsched.delete(t.name);
        if (!r.ok) alert(r.error || 'No se pudo eliminar');
        refresh();
      };
      tdAct.appendChild(btnDel); tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    wsTable.appendChild(table);
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
    // Only show the fields that apply to the chosen preset / target
    card.querySelector('#f-every').hidden = p !== 'every';
    card.querySelector('#f-time').hidden = p === 'every';
    card.querySelector('#f-dom').hidden = p !== 'monthly';
    card.querySelectorAll('.f-app-only').forEach(el => { el.hidden = wTarget() !== 'app'; });
  }
  ['change','input'].forEach(ev => {
    [wPreset,wEveryN,wEveryUnit,wTime,wDom,...card.querySelectorAll('input[name="w-target"]')].forEach(el => el.addEventListener(ev, updateSummary));
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
    if (r.ok) renderJobs(r.jobs); else sjList.textContent = r.error || 'Error listando tareas';
    const w = await window.ctk.winsched.list();
    if (w.ok) renderWinTasks(w.tasks || []); else wsTable.textContent = w.error || 'Error listando tareas';
  }

  btnNew.addEventListener('click', ()=>{ wizard.style.display = 'block'; wError.textContent = ''; });
  wCancel.addEventListener('click', ()=>{ wizard.style.display = 'none'; });
  wCreate.addEventListener('click', async ()=>{
    const target = wTarget();
    wError.textContent = '';
    if (!wCmd.value.trim()) { wError.textContent = 'Indica el comando a ejecutar.'; return; }
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
      if (r.ok) { wizard.style.display='none'; refresh(); } else wError.textContent = r.error || 'No se pudo crear la tarea';
    } else {
      // Windows
      const n = Math.max(1, parseInt(wEveryN.value||'1',10));
      const schedule = (function(){
        if (wPreset.value==='every') return wEveryUnit.value==='min' ? { type:'MINUTE', every:n } : { type:'HOURLY', every:n };
        if (wPreset.value==='workdays') return { type:'WEEKLY', days:'workdays' };
        if (wPreset.value==='weekend') return { type:'WEEKLY', days:'weekend' };
        if (wPreset.value==='monthly') return { type:'MONTHLY', every: Math.min(31, Math.max(1, parseInt(wDom.value||'1',10))) };
        return { type:'DAILY' };
      })();
      const r = await window.ctk.winsched.create({ name: wName.value.trim() || `CTK-${Date.now()}`, cmd: wCmd.value.trim(), schedule, startTime: (wTime.value||'09:00') });
      if (r.ok) { wizard.style.display='none'; refresh(); } else wError.textContent = r.error || 'No se pudo crear la tarea en Windows';
    }
  });
  refresh();
}
