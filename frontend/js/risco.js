// ══════════════════════════════════════════
// MAPA DE RISCO
// ══════════════════════════════════════════
function renderRiscos() {
  const q = document.getElementById('filtro-risco-txt').value.toLowerCase();
  const nivel = document.getElementById('filtro-risco-nivel').value;
  const filial = document.getElementById('filtro-risco-filial').value;
  const tb = document.getElementById('tb-riscos');
  const items = DB.riscos.filter(r => {
    const niv = nivelRisco(r.prob, r.impacto);
    return (!q || r.desc.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q)) &&
           (!nivel || niv === nivel) &&
           (!filial || r.filial === filial);
  });
  if(items.length === 0) { tb.innerHTML = '<tr><td colspan="8" class="empty"><div class="ico">🗺️</div>Nenhum risco encontrado.</td></tr>'; return; }
  tb.innerHTML = items.map(r => {
    const niv = nivelRisco(r.prob, r.impacto);
    const score = r.prob * r.impacto;
    return `<tr>
      <td><strong>${r.desc}</strong></td>
      <td>${r.cat}</td>
      <td>${r.filial}<br><small style="color:var(--text-muted)">${r.setor}</small></td>
      <td style="text-align:center">${r.prob}/5</td>
      <td style="text-align:center">${r.impacto}/5</td>
      <td><span style="font-weight:700">${score}</span> ${statusBadge(niv)}</td>
      <td style="max-width:180px;font-size:.82rem">${r.controle||'—'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editRisco(${r.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="delRisco(${r.id})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function renderHeatMap() {
  const container = document.getElementById('heat-map');
  const probs = [5,4,3,2,1];
  const impacts = [1,2,3,4,5];
  const getColor = score => {
    if(score >= 16) return '#f3e8ff';
    if(score >= 9) return '#fee2e2';
    if(score >= 4) return '#fef3c7';
    return '#d1fae5';
  };
  const getTextColor = score => {
    if(score >= 16) return '#7e22ce';
    if(score >= 9) return '#991b1b';
    if(score >= 4) return '#92400e';
    return '#065f46';
  };
  let html = '<div style="display:flex;align-items:center;justify-content:center;font-size:.65rem;color:var(--text-muted);font-weight:700">P↕ / I→</div>';
  impacts.forEach(i => {
    html += `<div style="display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:var(--text-muted)">I=${i}</div>`;
  });
  probs.forEach(p => {
    html += `<div style="display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:.7rem;font-weight:700;color:var(--text-muted)">P=${p}</div>`;
    impacts.forEach(i => {
      const score = p * i;
      const count = DB.riscos.filter(r => r.prob === p && r.impacto === i).length;
      html += `<div style="background:${getColor(score)};color:${getTextColor(score)};border-radius:6px;padding:6px;text-align:center;font-size:.75rem;font-weight:700;border:1px solid rgba(0,0,0,.07)">
        ${score}${count > 0 ? `<div style="font-size:.65rem;margin-top:2px">${count} risco${count>1?'s':''}</div>` : ''}
      </div>`;
    });
  });
  container.innerHTML = html;
}

function openModalRisco() {
  window._editRiscoId = null;
  document.getElementById('f-risco-id').value = '';
  ['f-risco-desc','f-risco-setor','f-risco-controle','f-risco-obs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-risco-prob').value = '3';
  document.getElementById('f-risco-impacto').value = '3';
  openModal('modal-risco');
}

function editRisco(id) {
  const r = DB.riscos.find(x => x.id === id);
  if(!r) return;
  window._editRiscoId = id;
  document.getElementById('f-risco-desc').value = r.desc;
  document.getElementById('f-risco-cat').value = r.cat;
  document.getElementById('f-risco-filial').value = r.filial;
  document.getElementById('f-risco-setor').value = r.setor;
  document.getElementById('f-risco-prob').value = r.prob;
  document.getElementById('f-risco-impacto').value = r.impacto;
  document.getElementById('f-risco-controle').value = r.controle;
  document.getElementById('f-risco-obs').value = r.obs;
  openModal('modal-risco');
}

function salvarRisco() {
  const desc = document.getElementById('f-risco-desc').value.trim();
  if(!desc) { alert('Informe a descrição do risco.'); return; }
  const data = {
    desc, cat: document.getElementById('f-risco-cat').value,
    filial: document.getElementById('f-risco-filial').value,
    setor: document.getElementById('f-risco-setor').value,
    prob: +document.getElementById('f-risco-prob').value,
    impacto: +document.getElementById('f-risco-impacto').value,
    controle: document.getElementById('f-risco-controle').value,
    obs: document.getElementById('f-risco-obs').value
  };
  if(window._editRiscoId) {
    Object.assign(DB.riscos.find(r => r.id === window._editRiscoId), data);
  } else {
    DB.riscos.push({ id: DB._ids.risco++, ...data });
  }
  closeModal('modal-risco');
  renderRiscos();
  renderHeatMap();
  saveLocalCache();
  const _rId = window._editRiscoId;
  const _rSaved = _rId ? DB.riscos.find(r=>r.id===_rId) : DB.riscos[DB.riscos.length-1];
  window._editRiscoId = null;
  if(_rSaved) sbSaveRisco(_rSaved).then(()=>setSaveIndicator('☁️ Risco salvo na nuvem','var(--accent)'));
}

function delRisco(id) {
  if(!confirm('Excluir este risco?')) return;
  DB.riscos = DB.riscos.filter(r => r.id !== id);
  renderRiscos(); renderHeatMap();
  saveLocalCache();
  sbDeleteRisco(id).then(()=>setSaveIndicator('☁️ Risco excluído','var(--accent)'));
}

// ══════════════════════════════════════════
// CONTROLES INTERNOS
// ══════════════════════════════════════════
function renderControles() {
  const q = document.getElementById('filtro-ctrl-txt').value.toLowerCase();
  const st = document.getElementById('filtro-ctrl-status').value;
  const fi = document.getElementById('filtro-ctrl-filial').value;
  const tb = document.getElementById('tb-controles');
  const items = DB.controles.filter(c =>
    (!q || c.nome.toLowerCase().includes(q) || c.resp.toLowerCase().includes(q)) &&
    (!st || c.status === st) &&
    (!fi || c.filial === fi)
  );
  if(items.length === 0) { tb.innerHTML = '<tr><td colspan="9" class="empty"><div class="ico">🔒</div>Nenhum controle encontrado.</td></tr>'; return; }
  const progClass = v => v >= 100 ? 'teal' : v >= 50 ? 'teal' : 'amber';
  tb.innerHTML = items.map(c => `<tr>
    <td><strong>${c.nome}</strong><br><small style="color:var(--text-muted)">${c.desc||''}</small></td>
    <td>${c.tipo}</td>
    <td>${c.filial}<br><small style="color:var(--text-muted)">${c.setor}</small></td>
    <td>${c.resp}</td>
    <td>${c.period}</td>
    <td>${prazoChip(c.prazo)}</td>
    <td>${statusBadge(c.status)}</td>
    <td>${progBar(c.prog||0, c.status==='Vencido'?'red':progClass(c.prog||0))}</td>
    <td>
      <button class="btn btn-outline btn-sm" onclick="editControle(${c.id})">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="delControle(${c.id})">🗑</button>
    </td>
  </tr>`).join('');
}

function openModalControle() {
  window._editCtrlId = null;
  ['f-ctrl-nome','f-ctrl-setor','f-ctrl-resp','f-ctrl-prazo','f-ctrl-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-ctrl-prog').value = 0;
  openModal('modal-controle');
}

function editControle(id) {
  const c = DB.controles.find(x => x.id === id);
  if(!c) return;
  window._editCtrlId = id;
  document.getElementById('f-ctrl-nome').value = c.nome;
  document.getElementById('f-ctrl-tipo').value = c.tipo;
  document.getElementById('f-ctrl-filial').value = c.filial;
  document.getElementById('f-ctrl-setor').value = c.setor;
  document.getElementById('f-ctrl-resp').value = c.resp;
  document.getElementById('f-ctrl-period').value = c.period;
  document.getElementById('f-ctrl-prazo').value = c.prazo;
  document.getElementById('f-ctrl-status').value = c.status;
  document.getElementById('f-ctrl-prog').value = c.prog||0;
  document.getElementById('f-ctrl-desc').value = c.desc||'';
  openModal('modal-controle');
}

function salvarControle() {
  const nome = document.getElementById('f-ctrl-nome').value.trim();
  if(!nome) { alert('Informe o nome do controle.'); return; }
  const data = {
    nome, tipo: document.getElementById('f-ctrl-tipo').value,
    filial: document.getElementById('f-ctrl-filial').value,
    setor: document.getElementById('f-ctrl-setor').value,
    resp: document.getElementById('f-ctrl-resp').value,
    period: document.getElementById('f-ctrl-period').value,
    prazo: document.getElementById('f-ctrl-prazo').value,
    status: document.getElementById('f-ctrl-status').value,
    prog: +document.getElementById('f-ctrl-prog').value,
    desc: document.getElementById('f-ctrl-desc').value
  };
  if(window._editCtrlId) {
    Object.assign(DB.controles.find(c => c.id === window._editCtrlId), data);
  } else {
    DB.controles.push({ id: DB._ids.ctrl++, ...data });
  }
  closeModal('modal-controle');
  renderControles();
  saveLocalCache();
  const _cId = window._editCtrlId;
  const _cSaved = _cId ? DB.controles.find(c=>c.id===_cId) : DB.controles[DB.controles.length-1];
  window._editCtrlId = null;
  if(_cSaved) sbSaveControle(_cSaved).then(()=>setSaveIndicator('☁️ Controle salvo na nuvem','var(--accent)'));
}

function delControle(id) {
  if(!confirm('Excluir este controle?')) return;
  DB.controles = DB.controles.filter(c => c.id !== id);
  renderControles();
  saveLocalCache();
  sbDeleteControle(id).then(()=>setSaveIndicator('☁️ Controle excluído','var(--accent)'));
}

// ══════════════════════════════════════════
// PLANOS DE AÇÃO
// ══════════════════════════════════════════
let planoFilter = '';
function filterPlanos(st, el) {
  planoFilter = st;
  document.querySelectorAll('#planos-tabs .pill-tab').forEach(t => t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderPlanos();
}

function renderPlanos() {
  const q = document.getElementById('filtro-plano-txt').value.toLowerCase();
  const fi = document.getElementById('filtro-plano-filial').value;
  const pr = document.getElementById('filtro-plano-prioridade').value;
  const tb = document.getElementById('tb-planos');
  const items = DB.planos.filter(p =>
    (!planoFilter || p.status === planoFilter) &&
    (!q || p.titulo.toLowerCase().includes(q) || p.resp.toLowerCase().includes(q)) &&
    (!fi || p.filial === fi) &&
    (!pr || p.prio === pr)
  );
  if(items.length === 0) { tb.innerHTML = '<tr><td colspan="9" class="empty"><div class="ico">📋</div>Nenhum plano encontrado.</td></tr>'; return; }
  tb.innerHTML = items.map(p => {
    const pc = p.status==='Vencido'?'red':p.prio==='Crítica'?'red':p.prio==='Alta'?'amber':'teal';
    return `<tr>
      <td><strong>${p.titulo}</strong>${p.desc?`<br><small style="color:var(--text-muted)">${p.desc}</small>`:''}</td>
      <td>${p.origem}</td>
      <td>${p.filial}<br><small style="color:var(--text-muted)">${p.setor}</small></td>
      <td>${p.resp}</td>
      <td>${prazoChip(p.prazo)}</td>
      <td>${statusBadge(p.prio)}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${progBar(p.prog||0, pc)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editPlano(${p.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="delPlano(${p.id})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function openModalPlano() {
  window._editPlanoId = null;
  ['f-plano-titulo','f-plano-setor','f-plano-resp','f-plano-prazo','f-plano-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-plano-prog').value = 0;
  openModal('modal-plano');
}

function editPlano(id) {
  const p = DB.planos.find(x => x.id === id);
  if(!p) return;
  window._editPlanoId = id;
  document.getElementById('f-plano-titulo').value = p.titulo;
  document.getElementById('f-plano-origem').value = p.origem;
  document.getElementById('f-plano-filial').value = p.filial;
  document.getElementById('f-plano-setor').value = p.setor;
  document.getElementById('f-plano-resp').value = p.resp;
  document.getElementById('f-plano-prazo').value = p.prazo;
  document.getElementById('f-plano-prio').value = p.prio;
  document.getElementById('f-plano-status').value = p.status;
  document.getElementById('f-plano-prog').value = p.prog||0;
  document.getElementById('f-plano-desc').value = p.desc||'';
  openModal('modal-plano');
}

function salvarPlano() {
  const titulo = document.getElementById('f-plano-titulo').value.trim();
  if(!titulo) { alert('Informe o título do plano.'); return; }
  const data = {
    titulo, origem: document.getElementById('f-plano-origem').value,
    filial: document.getElementById('f-plano-filial').value,
    setor: document.getElementById('f-plano-setor').value,
    resp: document.getElementById('f-plano-resp').value,
    prazo: document.getElementById('f-plano-prazo').value,
    prio: document.getElementById('f-plano-prio').value,
    status: document.getElementById('f-plano-status').value,
    prog: +document.getElementById('f-plano-prog').value,
    desc: document.getElementById('f-plano-desc').value
  };
  if(window._editPlanoId) {
    Object.assign(DB.planos.find(p => p.id === window._editPlanoId), data);
  } else {
    DB.planos.push({ id: DB._ids.plano++, ...data });
  }
  closeModal('modal-plano');
  renderPlanos();
  saveLocalCache();
  const _pId = window._editPlanoId;
  const _pSaved = _pId ? DB.planos.find(p=>p.id===_pId) : DB.planos[DB.planos.length-1];
  window._editPlanoId = null;
  if(_pSaved) sbSavePlano(_pSaved).then(()=>setSaveIndicator('☁️ Plano salvo na nuvem','var(--accent)'));
}

function delPlano(id) {
  if(!confirm('Excluir este plano?')) return;
  DB.planos = DB.planos.filter(p => p.id !== id);
  renderPlanos();
  saveLocalCache();
  sbDeletePlano(id).then(()=>setSaveIndicator('☁️ Plano excluído','var(--accent)'));
}

// ════════════════════════════════════════════
// MAPEAMENTO DE RISCO — UNIDADES
// ════════════════════════════════════════════
let RM_UNITS = [
  {id:'PDV',icon:'🛒',cor:'#ef4444'},{id:'Inventário',icon:'📦',cor:'#f59e0b'},
  {id:'TI',icon:'💻',cor:'#3b82f6'},{id:'RH',icon:'👥',cor:'#8b5cf6'},
  {id:'Fiscal',icon:'📊',cor:'#10b981'},{id:'Auditoria',icon:'🔍',cor:'#6366f1'},
  {id:'Jurídico',icon:'⚖️',cor:'#64748b'},{id:'Operações',icon:'⚙️',cor:'#0ea5e9'},
  {id:'Geral',icon:'🗂️',cor:'#78716c'},
];
let _rmUnit = 'PDV', _rmTab = 'riscos';

function renderMapaRisco() {
  const tabs = document.getElementById('rm-unit-tabs');
  if(!tabs) return;
  tabs.innerHTML = RM_UNITS.map(u => {
    const cnt = (DB.riscos||[]).filter(r=>r.unidade===u.id).length;
    return `<button class="rm-tab${_rmUnit===u.id?' active':''}" onclick="_rmSetUnit('${u.id}')">
      ${u.icon} ${u.id} <span style="background:${_rmUnit===u.id?'rgba(255,255,255,.25)':'var(--border)'};border-radius:20px;padding:1px 7px;font-size:.7rem;margin-left:3px">${cnt}</span>
    </button>`;
  }).join('');
  _rmRenderBody();
}

function _rmSetUnit(uid) { _rmUnit=uid; renderMapaRisco(); }
function _rmSetTab(t) {
  _rmTab=t;
  document.querySelectorAll('.rm-subtab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  document.querySelectorAll('.rm-subpanel').forEach(p=>p.classList.toggle('active',p.dataset.panel===t));
}

function _rmNivelPorScore(s){return s>=150?'Crítico':s>=75?'Alto':s>=25?'Médio':'Baixo';}
function _rmNivel(p,i){return _rmNivelPorScore(p*i);}
function _rmNivelCor(nv){return{Crítico:'#ef4444',Alto:'#f59e0b',Médio:'#3b82f6',Baixo:'#10b981'}[nv]||'#94a3b8';}

// Risco residual = risco inerente reduzido pela eficácia do controle existente.
// Fatores de redução aproximados, uso comum em matrizes de risco de compliance.
const RM_REDUCAO_EFICACIA = { 'Nenhuma':0, 'Fraca':.2, 'Moderada':.5, 'Forte':.8 };
function _rmScoreResidual(r){
  const reducao = RM_REDUCAO_EFICACIA[r.eficaciaControle] ?? 0;
  return Math.round(r.prob*r.impacto*(1-reducao));
}

function _rmRenderBody() {
  const body = document.getElementById('rm-unit-body');
  if(!body) return;
  const u = RM_UNITS.find(x=>x.id===_rmUnit)||RM_UNITS[0];
  const riscos = (DB.riscos||[]).filter(r=>r.unidade===_rmUnit);
  const planos = (DB.rmPlanos||[]).filter(p=>riscos.some(r=>r.id===p.riscoId));

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:1.3rem">${u.icon}</span>
      <strong style="color:var(--primary)">${u.id}</strong>
      <span style="background:${u.cor};color:#fff;padding:2px 9px;border-radius:20px;font-size:.73rem;font-weight:700">${riscos.length} riscos</span>
      <div class="rm-subtabs" style="margin-left:auto;margin-bottom:0">
        <button class="rm-subtab${_rmTab==='riscos'?' active':''}" data-tab="riscos" onclick="_rmSetTab('riscos')">🎯 Riscos</button>
        <button class="rm-subtab${_rmTab==='planos'?' active':''}" data-tab="planos" onclick="_rmSetTab('planos')">📋 Planos de Ação</button>
        <button class="rm-subtab${_rmTab==='heatmap'?' active':''}" data-tab="heatmap" onclick="_rmSetTab('heatmap')">🔢 Heat Map</button>
      </div>
    </div>
    <div class="rm-subpanel${_rmTab==='riscos'?' active':''}" data-panel="riscos">${_rmHtmlRiscos(riscos)}</div>
    <div class="rm-subpanel${_rmTab==='planos'?' active':''}" data-panel="planos">${_rmHtmlPlanos(riscos, planos)}</div>
    <div class="rm-subpanel${_rmTab==='heatmap'?' active':''}" data-panel="heatmap">${_rmHtmlHeat(riscos)}</div>
  `;
}

function _rmHtmlRiscos(riscos) {
  if(!riscos.length) return `<div style="text-align:center;padding:30px;color:var(--text-muted)">
    <div style="font-size:2rem;margin-bottom:8px">🎯</div>
    <div style="font-weight:600">Nenhum risco nesta unidade</div>
    <div style="font-size:.82rem">Clique em "+ Novo Risco" ou importe um arquivo Word</div>
  </div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Risco</th><th>Categoria</th><th>Dono</th><th>P</th><th>I</th><th>Nível Inerente</th><th>Controle</th><th>Nível Residual</th><th>Planos</th><th>Ações</th></tr></thead>
    <tbody>${riscos.map(r=>{
      const nv=_rmNivel(r.prob,r.impacto), cor=_rmNivelCor(nv);
      const scoreResidual=_rmScoreResidual(r), nvResidual=_rmNivelPorScore(scoreResidual), corResidual=_rmNivelCor(nvResidual);
      const eficacia=r.eficaciaControle||'Nenhuma';
      const cnt=(DB.rmPlanos||[]).filter(p=>p.riscoId===r.id).length;
      return `<tr>
        <td style="font-family:'DM Mono',monospace;font-size:.76rem;color:var(--text-muted)">#${r.id}</td>
        <td style="max-width:240px;font-size:.84rem;font-weight:600">${r.desc}</td>
        <td style="font-size:.75rem">${r.cat}</td>
        <td style="font-size:.78rem">${r.setor||'—'}</td>
        <td style="text-align:center;font-weight:700">${r.prob}</td>
        <td style="text-align:center;font-weight:700">${r.impacto}</td>
        <td><span style="background:${cor};color:#fff;padding:2px 9px;border-radius:20px;font-size:.75rem;font-weight:700">${r.prob*r.impacto} ${nv}</span></td>
        <td style="font-size:.78rem;max-width:150px">${r.controle||'—'}<div style="font-size:.68rem;color:var(--text-muted);margin-top:2px">🛡️ Eficácia: ${eficacia}</div></td>
        <td><span style="background:${corResidual};color:#fff;padding:2px 9px;border-radius:20px;font-size:.75rem;font-weight:700">${scoreResidual} ${nvResidual}</span></td>
        <td><span style="font-size:.78rem;color:var(--text-muted)">${cnt}</span>
          <button class="btn btn-outline btn-sm" style="padding:2px 7px;font-size:.71rem;margin-left:3px" onclick="rmNovoPlano(${r.id})">+ Ação</button>
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="rmEditRisco(${r.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="rmDelRisco(${r.id})">🗑</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function _rmHtmlPlanos(riscos, planos) {
  if(!planos.length) return `<div style="text-align:center;padding:30px;color:var(--text-muted)">
    <div style="font-size:2rem;margin-bottom:8px">📋</div>
    <div style="font-weight:600">Nenhum plano cadastrado</div>
    <div style="font-size:.82rem">Abra a aba Riscos e clique em "+ Ação" em um risco</div>
  </div>`;
  return riscos.filter(r=>(DB.rmPlanos||[]).some(p=>p.riscoId===r.id)).map(r=>{
    const rPlanos=(DB.rmPlanos||[]).filter(p=>p.riscoId===r.id);
    const nv=_rmNivel(r.prob,r.impacto), cor=_rmNivelCor(nv);
    return `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:7px;padding-bottom:5px;border-bottom:2px solid ${cor}">
        <span style="background:${cor};color:#fff;padding:1px 7px;border-radius:4px;font-size:.71rem;font-weight:700">${nv}</span>
        <strong style="font-size:.88rem;color:var(--primary)">${r.desc}</strong>
      </div>
      ${rPlanos.map(pl=>{
        const dias=pl.prazo?Math.ceil((new Date(pl.prazo)-new Date())/86400000):null;
        const sc=pl.status==='Concluído'?'#10b981':pl.status==='Vencido'?'#ef4444':pl.status==='Em Andamento'?'#3b82f6':'#94a3b8';
        return `<div class="plan-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="flex:1">
              <div class="plan-card-title">${pl.titulo}</div>
              <div class="plan-card-meta">
                <span>👤 ${pl.resp}</span>
                <span>📅 ${pl.prazo||'—'}</span>
                ${dias!==null?`<span style="color:${dias<0?'#ef4444':dias<=7?'#f59e0b':'#10b981'}">${dias<0?'⚠️ '+Math.abs(dias)+'d vencido':'⏳ '+dias+'d'}</span>`:''}
                <span style="background:${sc};color:#fff;padding:1px 7px;border-radius:10px;font-size:.71rem">${pl.status}</span>
              </div>
            </div>
            <div style="display:flex;gap:3px">
              <button class="btn btn-outline btn-sm" onclick="rmEditPlano(${pl.id})">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="rmDelPlano(${pl.id})">🗑</button>
            </div>
          </div>
          <div class="plan-prog"><div class="plan-prog-fill" style="width:${pl.prog||0}%;background:${sc}"></div></div>
          <div style="font-size:.71rem;color:var(--text-muted);margin-top:2px">${pl.prog||0}% concluído</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function _rmHtmlHeat(riscos) {
  const vs=[5,10,15], lb={5:'Baixo',10:'Médio',15:'Alto'};
  return `<div style="display:inline-block">
    <div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px">Probabilidade × Impacto</div>
    <div style="display:grid;grid-template-columns:60px repeat(3,80px);gap:4px;font-size:.76rem">
      <div style="font-weight:700;color:var(--text-muted);display:flex;align-items:flex-end;padding-bottom:4px">P \ I</div>
      ${vs.map(i=>`<div style="text-align:center;font-weight:700;padding:4px 0">${lb[i]}</div>`).join('')}
      ${[...vs].reverse().map(p=>`
        <div style="font-weight:700;display:flex;align-items:center">${lb[p]}</div>
        ${vs.map(i=>{const pxi=p*i,cnt=riscos.filter(r=>r.prob===p&&r.impacto===i).length;
          const bg=pxi>=150?'#fecaca':pxi>=75?'#fef3c7':pxi>=25?'#dbeafe':'#d1fae5';
          const fc=pxi>=150?'#991b1b':pxi>=75?'#92400e':pxi>=25?'#1e3a8a':'#065f46';
          return `<div style="background:${bg};color:${fc};border-radius:6px;padding:10px 4px;text-align:center">
            <div style="font-weight:800">${pxi}</div>
            ${cnt?`<div style="font-size:.7rem">${cnt} risco${cnt>1?'s':''}</div>`:'<div style="opacity:.3;font-size:.7rem">—</div>'}
          </div>`;
        }).join('')}
      `).join('')}
    </div>
  </div>`;
}

// ── Novo Risco
function rmNovoRisco() {
  window._rmEditId = null;
  ['rm-f-desc','rm-f-cat','rm-f-setor','rm-f-controle','rm-f-obs'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  rmUpdateRiscoModalUnits();
  const un=document.getElementById('rm-f-unidade'); if(un) un.value=_rmUnit;
  const pr=document.getElementById('rm-f-prob'); if(pr) pr.value='10';
  const im=document.getElementById('rm-f-impacto'); if(im) im.value='10';
  const ef=document.getElementById('rm-f-eficacia'); if(ef) ef.value='Nenhuma';
  document.getElementById('rm-modal-title').textContent='🎯 Novo Risco';
  openModal('modal-rm-risco');
}
function rmEditRisco(id) {
  const r=(DB.riscos||[]).find(x=>x.id===id); if(!r) return;
  window._rmEditId=id;
  document.getElementById('rm-f-desc').value=r.desc||'';
  document.getElementById('rm-f-cat').value=r.cat||'';
  document.getElementById('rm-f-setor').value=r.setor||'';
  rmUpdateRiscoModalUnits();
  document.getElementById('rm-f-unidade').value=r.unidade||_rmUnit;
  document.getElementById('rm-f-prob').value=r.prob||10;
  document.getElementById('rm-f-impacto').value=r.impacto||10;
  const ef=document.getElementById('rm-f-eficacia'); if(ef) ef.value=r.eficaciaControle||'Nenhuma';
  document.getElementById('rm-f-controle').value=r.controle||'';
  document.getElementById('rm-f-obs').value=r.obs||'';
  document.getElementById('rm-modal-title').textContent='✏️ Editar Risco';
  openModal('modal-rm-risco');
}
function rmSalvarRisco() {
  const data={
    desc:document.getElementById('rm-f-desc').value.trim(),
    cat:document.getElementById('rm-f-cat').value.trim(),
    setor:document.getElementById('rm-f-setor').value.trim(),
    unidade:document.getElementById('rm-f-unidade').value,
    prob:parseInt(document.getElementById('rm-f-prob').value)||10,
    impacto:parseInt(document.getElementById('rm-f-impacto').value)||10,
    controle:document.getElementById('rm-f-controle').value.trim(),
    eficaciaControle:document.getElementById('rm-f-eficacia').value,
    obs:document.getElementById('rm-f-obs').value.trim(),
    filial:'Todas',
  };
  if(!data.desc){alert('Informe a descrição.');return;}
  if(!DB.riscos) DB.riscos=[];
  if(window._rmEditId) Object.assign(DB.riscos.find(r=>r.id===window._rmEditId),data);
  else { DB._ids.risco=(DB._ids.risco||20)+1; DB.riscos.push({id:DB._ids.risco,...data}); }
  const _saved = window._rmEditId ? DB.riscos.find(r=>r.id===window._rmEditId) : DB.riscos[DB.riscos.length-1];
  closeModal('modal-rm-risco');
  saveLocalCache(); renderMapaRisco();
  if(_saved) sbSaveRisco(_saved).then(()=>setSaveIndicator('☁️ Risco salvo na nuvem','var(--accent)'));
}
function rmDelRisco(id) {
  if(!confirm('Excluir risco e planos vinculados?')) return;
  const planosToDelete = (DB.rmPlanos||[]).filter(p=>p.riscoId===id).map(p=>p.id);
  DB.riscos=(DB.riscos||[]).filter(r=>r.id!==id);
  DB.rmPlanos=(DB.rmPlanos||[]).filter(p=>p.riscoId!==id);
  saveLocalCache(); renderMapaRisco();
  sbDeleteRisco(id);
  planosToDelete.forEach(pid => sbDeleteRmPlano(pid));
  setSaveIndicator('☁️ Risco removido da nuvem','var(--accent)');
}
// ── Planos
function rmNovoPlano(riscoId) {
  window._rmEditPlanoId=null; window._rmPlanoRiscoId=riscoId;
  ['rm-f-plano-titulo','rm-f-plano-resp'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('rm-f-plano-prazo').value='';
  document.getElementById('rm-f-plano-tipo').value='Preventiva';
  document.getElementById('rm-f-plano-status').value='Não Iniciado';
  document.getElementById('rm-f-plano-prog').value='0';
  const pv=document.getElementById('rm-plano-prog-val'); if(pv) pv.textContent='0%';
  _rmAndNovos=[]; _rmAndRender();
  const r=(DB.riscos||[]).find(x=>x.id===riscoId);
  document.getElementById('rm-modal-plano-risco').textContent=r?r.desc:'';
  openModal('modal-rm-plano');
}
function rmEditPlano(id) {
  const pl=(DB.rmPlanos||[]).find(x=>x.id===id); if(!pl) return;
  window._rmEditPlanoId=id; window._rmPlanoRiscoId=pl.riscoId;
  document.getElementById('rm-f-plano-titulo').value=pl.titulo||'';
  document.getElementById('rm-f-plano-resp').value=pl.resp||'';
  document.getElementById('rm-f-plano-prazo').value=pl.prazo||'';
  document.getElementById('rm-f-plano-tipo').value=pl.tipo||'Preventiva';
  document.getElementById('rm-f-plano-status').value=pl.status||'Não Iniciado';
  document.getElementById('rm-f-plano-prog').value=pl.prog||0;
  const pv=document.getElementById('rm-plano-prog-val'); if(pv) pv.textContent=(pl.prog||0)+'%';
  _rmAndNovos=[]; _rmAndRender();
  const r=(DB.riscos||[]).find(x=>x.id===pl.riscoId);
  document.getElementById('rm-modal-plano-risco').textContent=r?r.desc:'';
  openModal('modal-rm-plano');
}
function rmSalvarPlano() {
  const data={
    riscoId:window._rmPlanoRiscoId,
    titulo:document.getElementById('rm-f-plano-titulo').value.trim(),
    resp:document.getElementById('rm-f-plano-resp').value.trim(),
    prazo:document.getElementById('rm-f-plano-prazo').value,
    tipo:document.getElementById('rm-f-plano-tipo').value,
    status:document.getElementById('rm-f-plano-status').value,
    prog:parseInt(document.getElementById('rm-f-plano-prog').value)||0,
  };
  if(!data.titulo){alert('Informe o título.');return;}
  if((document.getElementById('rm-f-plano-andamento').value||'').trim()){
    alert('Há um andamento escrito que ainda não foi registrado. Clique em "Confirmar registro" ou apague o texto antes de salvar.');
    return;
  }
  // andamentos de plano já existente são gravados na hora, em rmAddAndamento
  if(!window._rmEditPlanoId) data.andamento = _rmAndNovos.length ? JSON.stringify(_rmAndNovos) : '';
  if(!DB.rmPlanos) DB.rmPlanos=[];
  if(window._rmEditPlanoId) Object.assign(DB.rmPlanos.find(p=>p.id===window._rmEditPlanoId),data);
  else { DB._ids.rmPlano=(DB._ids.rmPlano||17)+1; DB.rmPlanos.push({id:DB._ids.rmPlano,...data}); }
  const _savedPl = window._rmEditPlanoId ? DB.rmPlanos.find(p=>p.id===window._rmEditPlanoId) : DB.rmPlanos[DB.rmPlanos.length-1];
  closeModal('modal-rm-plano');
  _rmTab='planos'; saveLocalCache(); renderMapaRisco();
  if(_savedPl) sbSaveRmPlano(_savedPl).then(()=>setSaveIndicator('☁️ Plano salvo na nuvem','var(--accent)'));
}
// ── Andamentos do plano: ficha de registros, no mesmo formato da ficha dos funcionários.
// Gravados no campo "andamento" como lista JSON; texto antigo vira um registro "Observação" sem data.
const RM_AND_TIPOS = {
  avanco:     { lbl:'Avanço',     cor:'#10b981', ic:'📈' },
  obstaculo:  { lbl:'Obstáculo',  cor:'#f59e0b', ic:'⚠️' },
  observacao: { lbl:'Observação', cor:'#64748b', ic:'📝' },
};
let _rmAndTipo = null;  // tipo selecionado no novo registro
let _rmAndNovos = [];   // registros de um plano ainda não salvo

function _rmAndParse(v){
  const s = String(v||'').trim();
  if(!s) return [];
  if(s[0]==='['){ try { const a = JSON.parse(s); if(Array.isArray(a)) return a; } catch(e){} }
  return [{ id:'legado', tipo:'observacao', texto:s, data:'', autor:'' }];
}
function _rmAndPlano(){
  return window._rmEditPlanoId ? (DB.rmPlanos||[]).find(p=>p.id===window._rmEditPlanoId) : null;
}
function _rmAndRender(){
  const box = document.getElementById('rm-plano-andamentos');
  if(!box) return;
  const pl = _rmAndPlano();
  const lista = (pl ? _rmAndParse(pl.andamento) : _rmAndNovos).slice().sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));
  box.innerHTML = lista.length ? lista.map(o=>{
    const ti = RM_AND_TIPOS[o.tipo] || { lbl:o.tipo, cor:'#64748b', ic:'📌' };
    return `<div style="border:1px solid #e2e8f0;border-left:3px solid ${ti.cor};border-radius:8px;padding:8px 10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span style="font-weight:700;font-size:.82rem;color:${ti.cor}">${ti.ic} ${ti.lbl}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:.72rem;color:#94a3b8">${o.data?escapeHtml(String(o.data).split('T')[0]):'registro anterior'}${o.autor?' · '+escapeHtml(o.autor):''}</span>
          <button type="button" onclick="rmDelAndamento('${escapeHtml(o.id)}')" title="Excluir registro" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:.95rem;line-height:1">🗑️</button>
        </div>
      </div>
      <div style="font-size:.82rem;color:#334155;margin-top:4px;white-space:pre-wrap">${escapeHtml(o.texto)}</div>
    </div>`;
  }).join('') : '<div style="font-size:.8rem;color:#94a3b8;padding:4px 0 8px">Nenhum andamento registrado ainda.</div>';
  _rmAndTipo = null;
  const tipos = document.getElementById('rm-and-tipos');
  if(tipos) tipos.innerHTML = Object.keys(RM_AND_TIPOS).map(t=>{ const ti=RM_AND_TIPOS[t]; return `<button type="button" class="rm-and-btn" onclick="rmSelAndTipo(this,'${t}')" style="flex:1;min-width:100px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;padding:8px 6px;cursor:pointer;font-size:.8rem;font-weight:600">${ti.ic} ${ti.lbl}</button>`; }).join('');
  const ta = document.getElementById('rm-f-plano-andamento');
  if(ta) ta.value = '';
}
// Seleciona o tipo do novo registro (destaca o botão escolhido).
function rmSelAndTipo(el, tipo){
  _rmAndTipo = tipo;
  const ti = RM_AND_TIPOS[tipo];
  el.parentElement.querySelectorAll('.rm-and-btn').forEach(b=>{ b.style.background='#f1f5f9'; b.style.color='#334155'; b.style.borderColor='#cbd5e1'; });
  if(ti){ el.style.background=ti.cor; el.style.color='#fff'; el.style.borderColor=ti.cor; }
}
// Grava a lista no plano já existente e sincroniza.
function _rmAndGravar(pl, lista, msg){
  pl.andamento = lista.length ? JSON.stringify(lista) : '';
  saveLocalCache();
  sbSaveRmPlano(pl).then(()=>setSaveIndicator(msg,'var(--accent)'));
}
function rmAddAndamento(){
  if(!_rmAndTipo){ alert('Selecione o tipo do registro: Avanço, Obstáculo ou Observação.'); return; }
  const texto = (document.getElementById('rm-f-plano-andamento').value||'').trim();
  if(!texto){ alert('Escreva o andamento do plano.'); return; }
  const reg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    tipo: _rmAndTipo, texto,
    data: new Date().toISOString(),
    autor: (typeof currentUser!=='undefined' && currentUser) ? (currentUser.nome||currentUser.email||'') : ''
  };
  const pl = _rmAndPlano();
  if(pl){
    const lista = _rmAndParse(pl.andamento);
    lista.push(reg);
    _rmAndGravar(pl, lista, '☁️ Andamento salvo na nuvem');
    if(typeof auditLog==='function') auditLog('update','mapa-risco',`Andamento registrado — plano "${pl.titulo}"`,{tipo:reg.tipo});
  } else {
    _rmAndNovos.push(reg);
  }
  _rmAndRender();
}
function rmDelAndamento(regId){
  if(!confirm('Excluir este andamento do plano? Essa ação não pode ser desfeita.')) return;
  const pl = _rmAndPlano();
  if(pl){
    _rmAndGravar(pl, _rmAndParse(pl.andamento).filter(o=>String(o.id)!==String(regId)), '☁️ Andamento removido');
    if(typeof auditLog==='function') auditLog('delete','mapa-risco',`Andamento removido — plano "${pl.titulo}"`,{});
  } else {
    _rmAndNovos = _rmAndNovos.filter(o=>String(o.id)!==String(regId));
  }
  _rmAndRender();
}

function rmDelPlano(id) {
  if(!confirm('Excluir plano?')) return;
  DB.rmPlanos=(DB.rmPlanos||[]).filter(p=>p.id!==id);
  saveLocalCache(); renderMapaRisco();
  sbDeleteRmPlano(id);
  setSaveIndicator('☁️ Plano removido da nuvem','var(--accent)');
}
// ── Import Word
// ── Import Word helpers
let _rmPendingFile = null;

function rmToggleImport() {
  const w = document.getElementById('rm-import-wrap');
  if(!w) return;
  const open = w.style.display !== 'none';
  w.style.display = open ? 'none' : '';
  // Close units panel if open
  const u = document.getElementById('rm-units-wrap');
  if(u && !open) u.style.display = 'none';
  if(!open) rmPopulateImportUnitSel();
}

function rmToggleUnitsPanel() {
  const u = document.getElementById('rm-units-wrap');
  if(!u) return;
  const open = u.style.display !== 'none';
  u.style.display = open ? 'none' : '';
  // Close import panel if open
  const w = document.getElementById('rm-import-wrap');
  if(w && !open) w.style.display = 'none';
  if(!open) rmRenderUnitsList();
}

function rmPopulateImportUnitSel() {
  const sel = document.getElementById('rm-import-unit-sel');
  if(!sel) return;
  sel.innerHTML = RM_UNITS.map(u =>
    `<option value="${u.id}">${u.icon} ${u.id}</option>`
  ).join('');
  // Default to current active unit
  sel.value = _rmUnit || RM_UNITS[0].id;
}

function rmSetFileAndPreview(file) {
  if(!file) return;
  _rmPendingFile = file;
  const nameEl = document.getElementById('rm-file-name');
  if(nameEl) nameEl.textContent = '📄 ' + file.name;
  const btn = document.getElementById('rm-import-btn');
  if(btn) { btn.disabled = false; btn.style.opacity = '1'; }
  const log = document.getElementById('rm-import-log');
  if(log) log.innerHTML = `<span style="color:var(--text-muted)">Arquivo pronto. Escolha a unidade e clique em Importar.</span>`;
}

async function rmProcessWord() {
  const file = _rmPendingFile;
  if(!file) { alert('Selecione um arquivo primeiro.'); return; }
  const unidade = (document.getElementById('rm-import-unit-sel')||{}).value || _rmUnit;
  const skipDup = document.getElementById('rm-import-skip-dup')?.checked !== false;
  const clearUnit = document.getElementById('rm-import-clear-unit')?.checked === true;
  const log = document.getElementById('rm-import-log');
  const btn = document.getElementById('rm-import-btn');
  if(btn) { btn.disabled=true; btn.textContent='⏳ Importando...'; }
  if(log) log.innerHTML='<span style="color:var(--text-muted)">⏳ Lendo arquivo...</span>';
  try {
    if(typeof JSZip==='undefined') {
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    // Extract table rows correctly: find each <w:tr> and within it extract text from <w:t> tags per cell
    const rows = [];
    // Split XML into table rows
    const trParts = xml.split(/<w:tr\b/);
    for(let ti = 1; ti < trParts.length; ti++) {
      const trXml = trParts[ti].split('</w:tr>')[0];
      // Split into cells
      const tcParts = trXml.split(/<w:tc\b/);
      const cellTexts = [];
      for(let ci = 1; ci < tcParts.length; ci++) {
        const tcXml = tcParts[ci].split('</w:tc>')[0];
        // Extract all <w:t> text within this cell
        const tMatches = tcXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const cellText = tMatches
          .map(t => t.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
          .join('')
          .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"')
          .trim();
        if(cellText) cellTexts.push(cellText);
      }
      if(cellTexts.length > 1) rows.push(cellTexts.join('\t'));
    }
    // Also extract paragraph headings (outside tables) for section detection
    const paraMatches = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    const headings = paraMatches.map(p => {
      const ts = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      return ts.map(t => t.replace(/<w:t[^>]*>/,'').replace(/<\/w:t>/,'')).join('').trim();
    }).filter(h => h.length > 3);
    const txt = headings.join('\n') + '\n' + rows.join('\n');
    // Clear existing risks for this unit if requested
    if(clearUnit) {
      DB.riscos = (DB.riscos||[]).filter(r => r.unidade !== unidade);
    }
    const cnt = _rmParseWord(txt, unidade, skipDup);
    if(log) log.innerHTML=`<span style="color:var(--accent)">✅ ${cnt} risco(s) importado(s) para <strong>${unidade}</strong></span>`;
    // Reset file state
    _rmPendingFile = null;
    const nameEl = document.getElementById('rm-file-name');
    if(nameEl) nameEl.textContent = 'Arraste o arquivo .docx aqui';
    if(btn) { btn.disabled=true; btn.textContent='📥 Importar para a Unidade'; btn.style.opacity='.5'; }
    document.getElementById('rm-import-wrap').style.display='none';
    _rmUnit=unidade; _rmTab='riscos';
    renderMapaRisco(); saveLocalCache();
    // Sync imported risks to Supabase
    if(USE_SUPABASE) {
      const imported = (DB.riscos||[]).filter(r=>r.unidade===unidade&&r.obs==='Importado de Word');
      Promise.all(imported.map(r=>sbSaveRisco(r)))
        .then(()=>setSaveIndicator('☁️ '+imported.length+' riscos salvos na nuvem','var(--accent)'))
        .catch(e=>console.warn('sync riscos:', e));
    }
  } catch(e) {
    if(log) log.innerHTML=`<span style="color:var(--danger)">❌ Erro: ${e.message}</span>`;
    if(btn) { btn.disabled=false; btn.textContent='📥 Importar para a Unidade'; btn.style.opacity='1'; }
  }
}

function _rmParseWord(txt, unidade, skipDup=true) {
  if(!DB.riscos) DB.riscos = [];
  let count = 0;

  // txt has two parts:
  // 1. Paragraph headings (newline separated)
  // 2. Table rows where cells are tab-separated: "01\tRisco desc\tCategoria\tDono\t10\t15\t150\tMitigar"
  //    or "01\tRisco desc\tCategoria\tRelacionado\t10\t15\t150\tDono"

  const lines = txt.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const skipStarters = ['Manter','Realizar','Executar','Definir','Implementar','Revisar','Adotar',
    'Acionar','Padronizar','Treinar','Submeter','Aprovar','Classificar','Monitorar','Bloquear',
    'Suspender','Integrar','Controlar','Conciliar','Recuperar','Ativar','Atender','Negociar',
    'Escalar','Comunicar','Verificar','Garantir','Assegurar','Documentar','Auditar','Contratar',
    'Emitir','Elaborar','Implantar','Tornar','Reportar','Estabelecer','Migrar','Arquitetura',
    'Defesa','Campanhas','Backups','Patches','Quarentena','Investigações','Rollback',
    'Mapear','Priorização','Avaliação de risco','Due diligence','Plano de','Política de',
    'Segregação','Checagem','Canal de','Procedimento','Integração RH','Controle de acesso',
    'Conciliação','Auditoria de','Criptografia','Classificação da','Ritos','Modelo padrão',
    'Calendário de','Revisão por','Gestão de ciclo','Infraestrutura redundante','Gestão de identidades'];

  // Track seen IDs to avoid importing duplicate numbered rows (actions also use 1,2,3...)
  // Only accept rows where ID resets to small numbers in the summary section context
  let lastId = 0; let summaryDone = false; const seenDescs = new Set();

  for(const line of lines) {
    // Split by tab — table rows have cells separated by tabs
    const cells = line.split('\t').map(c => c.trim()).filter(c => c.length > 0);

    // Risk row: first cell is a 1-2 digit ID, second cell is the risk description
    if(cells.length < 2) continue;
    if(!cells[0].match(/^\d{1,2}$/)) continue;
    const idNum = parseInt(cells[0]);
    const desc = cells[1];
    if(!desc || desc.length < 8) continue;

    // Skip header rows
    if(['ID','Id','Risco','Ação preventiva','Ação de contingência','Ação','Responsável',
        'Evidência','Monitoramento','Acompanhamento'].includes(desc)) continue;

    // Skip action verb rows
    if(skipStarters.some(v => desc.startsWith(v))) continue;

    // Skip metadata rows
    if(/^(Data|Versão|Descrição|Classificação|Probabilidade|Impacto|Nível|Prob|P\\\\|P\\\\ I)/i.test(desc)) continue;

    // KEY FILTER: A real risk row MUST have P and I values (5, 10 or 15) OR text (Baixo/Médio/Alto)
    // AND must have at least 4 cells (ID, desc, category, something, P, I...)
    // Action rows typically have only 2-3 cells: ID, action text, responsible
    const pMap = {'Baixo':5,'Médio':10,'Alto':15};
    const numCells = cells.filter(c => ['5','10','15'].includes(c));
    const textVals = cells.filter(c => pMap[c] !== undefined);
    const hasPxI = numCells.length >= 2 || textVals.length >= 2;

    // If no P×I found AND row has < 4 cells, it's likely an action row — skip
    if(!hasPxI && cells.length < 4) continue;

    // Also skip if id resets to 1 after we already found risks (action sub-tables restart at 1)
    if(summaryDone) continue;

    let prob = 10, impacto = 10;
    if(numCells.length >= 2) {
      prob = parseInt(numCells[0]); impacto = parseInt(numCells[1]);
    } else if(textVals.length >= 2) {
      prob = pMap[textVals[0]]; impacto = pMap[textVals[1]];
    }

    // If ID goes back down to 1 after being higher, we left the summary table
    if(idNum === 1 && lastId > 1 && count > 0) { summaryDone = true; continue; }
    lastId = idNum;

    // Extract category (cell[2] usually)
    let cat = '', setor = '';
    for(let ci = 2; ci < Math.min(cells.length, 6); ci++) {
      const c = cells[ci];
      if(!c || c.length < 3) continue;
      if(['5','10','15','25','50','75','100','150','225','Mitigar','Aceitar','Transferir','Evitar'].includes(c)) continue;
      if(/^\d+$/.test(c)) continue;
      if(!cat) cat = c.slice(0, 80);
      else if(!setor) { setor = c.slice(0, 80); break; }
    }

    // Dup check by description prefix
    const descKey = desc.slice(0,25).toLowerCase();
    if(seenDescs.has(descKey)) continue;
    const isDup = (DB.riscos||[]).some(r =>
      r.unidade===unidade && r.desc.slice(0,25).toLowerCase()===descKey
    );
    if(skipDup && isDup) continue;
    seenDescs.add(descKey);

    DB._ids.risco = (DB._ids.risco || 20) + 1;
    DB.riscos.push({
      id: DB._ids.risco,
      desc: desc.slice(0, 220),
      cat: cat || 'Ver documento',
      setor: setor || 'Ver documento',
      unidade, filial: 'Todas',
      prob, impacto,
      controle: 'Ver documento',
      obs: 'Importado de Word'
    });
    count++;
  }

  return count;
}

// ── Gerenciar Unidades
function rmRenderUnitsList() {
  const el = document.getElementById('rm-units-list');
  if(!el) return;
  el.innerHTML = RM_UNITS.map((u,i) => {
    const cnt = (DB.riscos||[]).filter(r=>r.unidade===u.id).length;
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <span style="font-size:1.3rem">${u.icon}</span>
      <div style="flex:1">
        <div style="font-weight:700;font-size:.88rem;color:var(--primary)">${u.id}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${cnt} risco${cnt!==1?'s':''}</div>
      </div>
      <div style="width:14px;height:14px;border-radius:50%;background:${u.cor};flex-shrink:0"></div>
      ${cnt===0 ? `<button onclick="rmDeleteUnit(${i})" class="btn btn-danger btn-sm" title="Excluir unidade">🗑</button>` : `<span style="font-size:.72rem;color:var(--text-muted);padding:2px 7px;border:1px solid var(--border);border-radius:4px" title="Tem riscos — esvazie antes de excluir">🔒</span>`}
    </div>`;
  }).join('');
}


// ── Populate unit selects dynamically from RM_UNITS
function rmUpdateRiscoModalUnits() {
  const sel = document.getElementById('rm-f-unidade');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = RM_UNITS.map(u => `<option value="${u.id}">${u.icon} ${u.id}</option>`).join('');
  if(cur && RM_UNITS.some(u=>u.id===cur)) sel.value = cur;
  else sel.value = _rmUnit || RM_UNITS[0]?.id || 'PDV';
}

function rmUpdatePlanoModalUnits() {
  // Plano modal doesn't have a unit select but refresh risco modal
  rmUpdateRiscoModalUnits();
}

function rmAddUnit() {
  const name = (document.getElementById('rm-new-unit-name')||{}).value?.trim();
  const icon = (document.getElementById('rm-new-unit-icon')||{}).value?.trim() || '📋';
  const cor  = (document.getElementById('rm-new-unit-cor')||{}).value || '#3b82f6';
  if(!name) { alert('Informe o nome da unidade.'); return; }
  if(RM_UNITS.some(u=>u.id.toLowerCase()===name.toLowerCase())) { alert('Já existe uma unidade com esse nome.'); return; }
  RM_UNITS.push({id:name, icon, cor});
  document.getElementById('rm-new-unit-name').value='';
  document.getElementById('rm-new-unit-icon').value='';
  saveLocalCache();
  sbSaveRmUnit(RM_UNITS);
  rmRenderUnitsList();
  renderMapaRisco();
  rmPopulateImportUnitSel();
  rmUpdateRiscoModalUnits();
  rmUpdatePlanoModalUnits();
  setSaveIndicator && setSaveIndicator('✅ Unidade criada e salva','var(--accent)');
}

function rmDeleteUnit(idx) {
  const u = RM_UNITS[idx];
  if(!u) return;
  const cnt = (DB.riscos||[]).filter(r=>r.unidade===u.id).length;
  if(cnt>0) { alert('Esta unidade tem '+cnt+' risco(s) cadastrado(s). Exclua os riscos primeiro.'); return; }
  if(!confirm('Excluir a unidade "'+u.id+'"?')) return;
  RM_UNITS.splice(idx,1);
  if(_rmUnit===u.id) _rmUnit = RM_UNITS[0]?.id || 'PDV';
  saveLocalCache();
  sbSaveRmUnit(RM_UNITS);
  rmRenderUnitsList();
  renderMapaRisco();
  rmPopulateImportUnitSel();
  rmUpdateRiscoModalUnits();
  rmUpdatePlanoModalUnits();
}
