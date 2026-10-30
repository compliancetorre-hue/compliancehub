// ══════════════════════════════════════════
// DRILLDOWN DOS KPIs — CANAL DE DENÚNCIA
// ══════════════════════════════════════════
let _dnDdRows = [];
let _dnDdType = null;
let _dnDdSortCol = 'data';
let _dnDdSortDir = 'asc';

const _perigoOrderDn = { 'Gravíssima': 4, 'Grave': 3, 'Médio': 2, 'Leve': 1 };

function _dnDdVal(d, col) {
  switch(col) {
    case 'proto':  return d.proto || '';
    case 'cat':    return d.cat || '';
    case 'filial': return d.filial || '';
    case 'setor':  return d.setor || '';
    case 'data':   return d.data || '';
    case 'anon':   return d.anon || '';
    case 'perigo': return _perigoOrderDn[d.perigo] || 0;
    case 'status': return d.status || '';
    case 'conclusao': return d.conclusao || '';
    case 'resp':   return d.resp || '';
    default: return '';
  }
}

function dnDdSort(col, thEl) {
  if(_dnDdSortCol === col) {
    _dnDdSortDir = _dnDdSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _dnDdSortCol = col;
    _dnDdSortDir = 'asc';
  }
  document.querySelectorAll('#dn-drilldown thead th').forEach(th => th.classList.remove('asc','desc'));
  if(thEl) thEl.classList.add(_dnDdSortDir);
  dnDdRenderRows();
}

function dnDdRenderRows() {
  const col = _dnDdSortCol;
  const dir = _dnDdSortDir;
  const sorted = [..._dnDdRows].sort((a, b) => {
    const va = _dnDdVal(a, col);
    const vb = _dnDdVal(b, col);
    if(typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
    return dir === 'asc'
      ? String(va).localeCompare(String(vb), 'pt-BR')
      : String(vb).localeCompare(String(va), 'pt-BR');
  });

  const tbody = document.getElementById('dn-dd-tbody');
  if(!tbody) return;

  if(sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty"><div class="ico">✅</div>Nenhuma denúncia neste grupo.</td></tr>';
  } else {
    const days2 = d => { const dt=_parseDataSafe(d.data); return dt ? Math.max(0,Math.floor((new Date()-dt)/86400000)) : 0; };
    tbody.innerHTML = sorted.map(d => {
      const dias = days2(d);
      const vencido = !['Encerrada','Arquivada'].includes(d.status) && dias > 90;
      const slaDisplay = vencido
        ? `<div class="sla-wrap"><div class="sla-label"><span style="color:var(--danger);font-weight:700">⚠ ${dias}d/90d</span><span style="color:var(--danger);font-weight:700">100%</span></div><div class="sla-bar"><div class="sla-fill over" style="width:100%"></div></div></div>`
        : slaBar(d.data, d.status);
      const rowBg = vencido ? 'background:#fff8f8' : '';
      return `<tr style="cursor:pointer;${rowBg}" onclick="openDnDetail(${d.id})" title="Ver relato completo">
        <td><strong style="font-family:'DM Mono',monospace;font-size:.78rem;white-space:nowrap">${escapeHtml(d.proto)}</strong></td>
        <td style="font-size:.78rem;max-width:130px">${escapeHtml(d.cat)}</td>
        <td style="font-size:.78rem;white-space:nowrap">${escapeHtml(d.filial)}</td>
        <td style="font-size:.78rem">${d.setor?escapeHtml(d.setor):'—'}</td>
        <td style="font-size:.78rem;white-space:nowrap">${formatDate(d.data)}</td>
        <td style="font-size:.78rem">${d.anon==='Anônima'?'🔒 Anônima':'👤 Identificada'}</td>
        <td>${perigoBadge(d.perigo)}</td>
        <td>${statusBadge(d.status)}</td>
        <td style="min-width:120px">${slaDisplay}</td>
        <td style="font-size:.78rem">${d.resp?escapeHtml(d.resp):'<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDnDetail(${d.id})" title="Ver relato completo">👁</button>
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();editDenuncia(${d.id})" title="Editar">✏️</button>
        </td>
      </tr>`;
    }).join('');
  }

  const countEl = document.getElementById('dn-dd-count');
  if(countEl) countEl.textContent = `· ${sorted.length} denúncia${sorted.length!==1?'s':''}`;
}

function openDnDrilldown(type, icon, title) {
  _dnDdType = type;
  const all = DB.denuncias;
  let colorAccent = 'var(--accent)';

  // Select rows by type
  if(type === 'total') {
    _dnDdRows = [...all];
    colorAccent = 'var(--accent)';
    _dnDdSortCol = 'data'; _dnDdSortDir = 'desc';
  } else if(type === 'analise') {
    _dnDdRows = all.filter(d => d.status === 'Em Análise');
    colorAccent = 'var(--warn)';
    _dnDdSortCol = 'data'; _dnDdSortDir = 'asc';
  } else if(type === 'encerrada') {
    _dnDdRows = all.filter(d => ['Encerrada','Arquivada'].includes(d.status));
    colorAccent = 'var(--accent)';
    _dnDdSortCol = 'data'; _dnDdSortDir = 'desc';
  } else if(type === 'graves') {
    _dnDdRows = all.filter(d => ['Grave','Gravíssima'].includes(d.perigo));
    colorAccent = 'var(--danger)';
    _dnDdSortCol = 'perigo'; _dnDdSortDir = 'desc'; // gravíssimas primeiro
  } else if(type === 'sla') {
    _dnDdRows = all.filter(d => {
      if(['Encerrada','Arquivada'].includes(d.status)) return false;
      return !!_parseDataSafe(d.data) && Math.max(0,Math.floor((new Date()-_parseDataSafe(d.data))/86400000)) > 90;
    });
    colorAccent = 'var(--purple)';
    _dnDdSortCol = 'data'; _dnDdSortDir = 'asc'; // mais antigas primeiro
  }

  // Update header
  document.getElementById('dn-dd-icon').textContent = icon;
  document.getElementById('dn-dd-title').textContent = title;
  const header = document.getElementById('dn-dd-header');
  if(header) header.style.borderBottomColor = colorAccent;

  // Reset sort indicators
  document.querySelectorAll('#dn-drilldown thead th').forEach(th => th.classList.remove('asc','desc'));
  const activeTh = document.querySelector(`#dn-drilldown thead th[data-dncol="${_dnDdSortCol}"]`);
  if(activeTh) activeTh.classList.add(_dnDdSortDir);

  // Render
  dnDdRenderRows();

  // Show
  const panel = document.getElementById('dn-drilldown');
  panel.style.display = '';
  panel.style.animation = 'none';
  panel.offsetHeight; // reflow
  panel.style.animation = 'slideDown .2s ease';

  // Scroll into view
  setTimeout(() => panel.scrollIntoView({behavior:'smooth', block:'nearest'}), 60);
}

function closeDnDrilldown() {
  _dnDdType = null;
  _dnDdRows = [];
  const panel = document.getElementById('dn-drilldown');
  if(panel) panel.style.display = 'none';
  document.querySelectorAll('#dn-drilldown thead th').forEach(th => th.classList.remove('asc','desc'));
}

// ══════════════════════════════════════════
// DENÚNCIAS — TABS + SLA + PERIGO
// ══════════════════════════════════════════
let dnCurrentTab = 'recebidas';

function switchDnTab(tab, el) {
  dnCurrentTab = tab;
  document.querySelectorAll('.dn-pill-tab').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('dn-tab-recebidas').style.display = (tab !== 'sla') ? '' : 'none';
  document.getElementById('dn-tab-sla').style.display = (tab === 'sla') ? '' : 'none';
  renderDenuncias();
}

function _parseDataSafe(dataStr) {
  if(!dataStr) return null;
  // Already ISO: 2026-04-16
  if(/^\d{4}-\d{2}-\d{2}/.test(String(dataStr))) {
    const d = new Date(String(dataStr).substring(0,10) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY
  const m1 = String(dataStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m1) {
    const y = m1[3].length===2 ? '20'+m1[3] : m1[3];
    const d = new Date(`${y}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY
  const m2 = String(dataStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m2) {
    const d = new Date(`${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function slaBar(dataStr, status) {
  if(['Encerrada','Arquivada'].includes(status)) {
    return '<span style="font-size:.75rem;color:var(--accent);font-weight:700">✅ Concluída</span>';
  }
  const dt = _parseDataSafe(dataStr);
  if(!dt) return '<span style="font-size:.75rem;color:var(--text-muted)">— / 90d</span>';
  const days = Math.max(0, Math.floor((new Date() - dt) / 86400000));
  const pct = Math.min(Math.round(days / 90 * 100), 100);
  const cls = pct >= 100 ? 'over' : pct >= 70 ? 'warn' : 'ok';
  const color = pct >= 100 ? 'var(--danger)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)';
  return `<div class="sla-wrap">
    <div class="sla-label"><span style="color:${color}">${days}d / 90d</span><span style="color:${color}">${pct}%</span></div>
    <div class="sla-bar"><div class="sla-fill ${cls}" style="width:${pct}%"></div></div>
  </div>`;
}

function perigoBadge(p) {
  const map = { 'Leve':'badge-leve', 'Médio':'badge-medio', 'Grave':'badge-grave', 'Gravíssima':'badge-gravissima' };
  const ico = { 'Leve':'🟢', 'Médio':'🟡', 'Grave':'🔴', 'Gravíssima':'☣️' };
  return `<span class="badge ${map[p]||'badge-medio'}">${ico[p]||''}  ${p||'—'}</span>`;
}

function getFiltered() {
  const q = (document.getElementById('filtro-dn-txt')||{value:''}).value.toLowerCase();
  const cat = (document.getElementById('filtro-dn-categoria')||{value:''}).value;
  const perigo = (document.getElementById('filtro-dn-perigo')||{value:''}).value;
  const filial = (document.getElementById('filtro-dn-filial2')||{value:''}).value;
  return DB.denuncias.filter(d =>
    (!q || d.proto.toLowerCase().includes(q) || d.cat.toLowerCase().includes(q) ||
           d.filial.toLowerCase().includes(q) || (d.relato||'').toLowerCase().includes(q)) &&
    (!cat || d.cat === cat) &&
    (!perigo || d.perigo === perigo) &&
    (!filial || d.filial === filial)
  );
}

// ── Sort state for main dn table
let _dnMainSortCol = 'data';
let _dnMainSortDir = 'desc';
// Sort state for SLA table
let _dnSlaSortCol = 'dias';
let _dnSlaSortDir = 'desc';

const _perigoOrderMain = { 'Gravíssima': 4, 'Grave': 3, 'Médio': 2, 'Leve': 1 };

function _dnMainVal(d, col) {
  switch(col) {
    case 'proto':  return d.proto || '';
    case 'cat':    return d.cat || '';
    case 'filial': return d.filial || '';
    case 'setor':  return d.setor || '';
    case 'data':   return d.data || '';
    case 'anon':   return d.anon || '';
    case 'perigo': return _perigoOrderMain[d.perigo] || 0;
    case 'status': return d.status || '';
    case 'resp':   return d.resp || '';
    case 'dias':   return d.data ? Math.floor((new Date()-new Date(d.data))/86400000) : 0;
    default:       return '';
  }
}

function _applySortDn(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const va = _dnMainVal(a, col);
    const vb = _dnMainVal(b, col);
    if(typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
    return dir === 'asc'
      ? String(va).localeCompare(String(vb), 'pt-BR')
      : String(vb).localeCompare(String(va), 'pt-BR');
  });
}

function dnMainSort(col, thEl) {
  if(_dnMainSortCol === col) {
    _dnMainSortDir = _dnMainSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _dnMainSortCol = col;
    _dnMainSortDir = 'asc';
  }
  // Update header indicators
  document.querySelectorAll('#dn-main-thead-tr th').forEach(th => th.classList.remove('asc','desc'));
  if(thEl) thEl.classList.add(_dnMainSortDir);
  // Re-render table body only (no full re-render to preserve KPIs)
  _renderDnMainBody();
}

function dnSlaSort(col, thEl) {
  if(_dnSlaSortCol === col) {
    _dnSlaSortDir = _dnSlaSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _dnSlaSortCol = col;
    _dnSlaSortDir = 'asc';
  }
  document.querySelectorAll('#dn-sla-thead-tr th').forEach(th => th.classList.remove('asc','desc'));
  if(thEl) thEl.classList.add(_dnSlaSortDir);
  _renderDnSlaBody();
}

function _conclusaoBg(c){
  return {'Procedente':'#d1fae5','Improcedente':'#fee2e2','Inconclusiva':'#fef3c7','Arquivada':'#f1f5f9'}[c]||'#f8fafc';
}
function _conclusaoColor(c){
  return {'Procedente':'#065f46','Improcedente':'#991b1b','Inconclusiva':'#92400e','Arquivada':'#475569'}[c]||'#64748b';
}
function setConclusao(id, val) {
  const d = DB.denuncias.find(x=>x.id===id);
  if(!d) return;
  d.conclusao = val;
  saveLocalCache();
  auditLog('status', 'denuncias', `Conclusão da denúncia ${id} alterada para "${val}"`, {id, conclusao:val});
  setSaveIndicator('⏳ Salvando conclusão...','var(--warn)');
  sbSaveDenuncia(d).then(() => {
    setSaveIndicator('☁️ Conclusão salva na nuvem','var(--accent)');
  }).catch(() => {
    setSaveIndicator('⚠️ Erro ao salvar na nuvem','var(--danger)');
  });
}
function _conclusaoSelect(d) {
  const bg = _conclusaoBg(d.conclusao), cor = _conclusaoColor(d.conclusao);
  return `<select class="concl-sel"
    style="background:${bg};color:${cor}"
    onclick="event.stopPropagation()"
    onmousedown="event.stopPropagation()"
    onchange="event.stopPropagation();setConclusao(${d.id},this.value);this.style.background=_conclusaoBg(this.value);this.style.color=_conclusaoColor(this.value)">
    <option value=""                                        ${!d.conclusao              ?'selected':''}>— Pendente —</option>
    <option value="Procedente"   style="background:#d1fae5" ${d.conclusao==='Procedente'  ?'selected':''}>✅ Procedente</option>
    <option value="Improcedente" style="background:#fee2e2" ${d.conclusao==='Improcedente'?'selected':''}>❌ Improcedente</option>
    <option value="Inconclusiva" style="background:#fef3c7" ${d.conclusao==='Inconclusiva'?'selected':''}>⚠️ Inconclusiva</option>
    <option value="Arquivada"    style="background:#f1f5f9" ${d.conclusao==='Arquivada'   ?'selected':''}>📁 Arquivada</option>
  </select>`;
}

function _dnMainRow(d) {
  return `<tr style="cursor:pointer" onclick="openDnDetail(${d.id})" title="Ver relato completo">
    <td><strong style="font-family:'DM Mono',monospace;font-size:.82rem;white-space:nowrap">${escapeHtml(d.proto)}</strong></td>
    <td style="max-width:150px;font-size:.82rem">${escapeHtml(d.cat)}</td>
    <td style="font-size:.82rem">${escapeHtml(d.filial)}<br><small style="color:var(--text-muted)">${escapeHtml(d.setor||'')}</small></td>
    <td style="font-size:.82rem;white-space:nowrap">${formatDate(d.data)}</td>
    <td style="font-size:.82rem">${d.anon==='Anônima'?'<span style="color:var(--text-muted)">🔒 Anônima</span>':'<span style="color:var(--accent)">👤 Identificada</span>'}</td>
    <td>${perigoBadge(d.perigo)}</td>
    <td>${statusBadge(d.status)}</td>
    <td>${slaBar(d.data, d.status)}</td>
    <td onclick="event.stopPropagation()">${_conclusaoSelect(d)}</td>
    <td style="font-size:.82rem">${d.resp?escapeHtml(d.resp):'<span style="color:var(--text-muted)">—</span>'}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDnDetail(${d.id})" title="Ver relato completo">👁</button>
      <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();editDenuncia(${d.id})">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delDenuncia(${d.id})">🗑</button>
    </td>
  </tr>`;
}

// Store last filtered items for re-sort without re-filter
let _dnLastTabItems = [];
let _dnLastSlaItems = [];

function _renderDnMainBody() {
  const tb = document.getElementById('tb-denuncias');
  if(!tb) return;
  const sorted = _applySortDn(_dnLastTabItems, _dnMainSortCol, _dnMainSortDir);
  if(sorted.length === 0) {
    tb.innerHTML = '<tr><td colspan="10" class="empty"><div class="ico">📢</div>Nenhuma denúncia nesta aba.</td></tr>';
  } else {
    tb.innerHTML = sorted.map(_dnMainRow).join('');
  }
}

function _renderDnSlaBody() {
  const tbSla = document.getElementById('tb-denuncias-sla');
  if(!tbSla) return;
  const sorted = _applySortDn(_dnLastSlaItems, _dnSlaSortCol, _dnSlaSortDir);
  if(sorted.length === 0) {
    tbSla.innerHTML = '<tr><td colspan="10" class="empty"><div class="ico">⏱️</div>Nenhuma denúncia.</td></tr>';
  } else {
    tbSla.innerHTML = sorted.map(d => {
      const days = d.data ? Math.floor((new Date()-new Date(d.data))/86400000) : 0;
      const pct = Math.min(Math.round(days/90*100),100);
      const daysColor = pct>=100?'var(--danger)':pct>=70?'var(--warn)':'var(--text)';
      const rowBg = pct >= 100 ? 'background:#fff8f8' : '';
      return `<tr style="cursor:pointer;${rowBg}" onclick="openDnDetail(${d.id})" title="Ver relato completo">
        <td><strong style="font-family:'DM Mono',monospace;font-size:.82rem;white-space:nowrap">${escapeHtml(d.proto)}</strong></td>
        <td style="font-size:.82rem;max-width:130px">${escapeHtml(d.cat)}</td>
        <td style="font-size:.82rem;white-space:nowrap">${escapeHtml(d.filial)}</td>
        <td style="font-size:.82rem;white-space:nowrap">${formatDate(d.data)}</td>
        <td style="font-weight:700;color:${daysColor};white-space:nowrap">${days} dias</td>
        <td>${slaBar(d.data, d.status)}</td>
        <td>${perigoBadge(d.perigo)}</td>
        <td>${statusBadge(d.status)}</td>
        <td style="font-size:.82rem">${d.resp?escapeHtml(d.resp):'—'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openDnDetail(${d.id})" title="Ver relato completo">👁</button>
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();editDenuncia(${d.id})">✏️</button>
        </td>
      </tr>`;
    }).join('');
  }
}

function renderDenuncias() {
  const all = DB.denuncias;
  // KPIs
  document.getElementById('dn-total').textContent = all.length;
  document.getElementById('dn-analise').textContent = all.filter(d => d.status === 'Em Análise').length;
  document.getElementById('dn-encerrada').textContent = all.filter(d => ['Encerrada','Arquivada'].includes(d.status)).length;
  document.getElementById('dn-urgente').textContent = all.filter(d => ['Grave','Gravíssima'].includes(d.perigo)).length;
  const slaVenc = all.filter(d => {
    if(['Encerrada','Arquivada'].includes(d.status)) return false;
    return !!_parseDataSafe(d.data) && Math.max(0,Math.floor((new Date()-_parseDataSafe(d.data))/86400000)) > 90;
  }).length;
  document.getElementById('dn-sla-venc').textContent = slaVenc;

  // Tab counts
  document.getElementById('tab-count-recebidas').textContent = all.filter(d => d.status === 'Aberta').length;
  document.getElementById('tab-count-analise').textContent = all.filter(d => d.status === 'Em Análise').length;
  document.getElementById('tab-count-encerradas').textContent = all.filter(d => ['Encerrada','Arquivada'].includes(d.status)).length;
  document.getElementById('tab-count-sla').textContent = slaVenc;

  const filtered = getFiltered();

  // Main table: filter by tab
  let tabItems = filtered;
  if(dnCurrentTab === 'recebidas')  tabItems = filtered.filter(d => d.status === 'Aberta');
  if(dnCurrentTab === 'analise')    tabItems = filtered.filter(d => d.status === 'Em Análise');
  if(dnCurrentTab === 'encerradas') tabItems = filtered.filter(d => ['Encerrada','Arquivada'].includes(d.status));

  // Store for re-sort
  _dnLastTabItems = tabItems;
  _dnLastSlaItems = filtered.filter(d => !['Encerrada','Arquivada'].includes(d.status));

  // Apply current sort and render
  _renderDnMainBody();

  // Sync sort indicator on main thead
  document.querySelectorAll('#dn-main-thead-tr th').forEach(th => th.classList.remove('asc','desc'));
  const mainActiveTh = document.querySelector(`#dn-main-thead-tr th[data-dnmain="${_dnMainSortCol}"]`);
  if(mainActiveTh) mainActiveTh.classList.add(_dnMainSortDir);

  // SLA table
  _renderDnSlaBody();

  // Sync sort indicator on SLA thead
  document.querySelectorAll('#dn-sla-thead-tr th').forEach(th => th.classList.remove('asc','desc'));
  const slaActiveTh = document.querySelector(`#dn-sla-thead-tr th[data-dnsla="${_dnSlaSortCol}"]`);
  if(slaActiveTh) slaActiveTh.classList.add(_dnSlaSortDir);
}

function getSelectedPerigo() {
  const radios = document.querySelectorAll('input[name="f-dn-perigo"]');
  for(const r of radios) if(r.checked) return r.value;
  return 'Leve';
}

function setSelectedPerigo(val) {
  const radios = document.querySelectorAll('input[name="f-dn-perigo"]');
  const btns = document.querySelectorAll('.perigo-btn');
  const outlines = {'Leve':'#d1fae5','Médio':'#fef3c7','Grave':'#fee2e2','Gravíssima':'#e9d5ff'};
  const bgs = {'Leve':'#f0fdf9','Médio':'#fffbeb','Grave':'#fff1f1','Gravíssima':'#fdf4ff'};
  const selected = {'Leve':'#10b981','Médio':'#f59e0b','Grave':'#ef4444','Gravíssima':'#8b5cf6'};
  radios.forEach(r => r.checked = r.value === val);
  btns.forEach(btn => {
    const v = btn.dataset.val;
    if(v === val) {
      btn.style.border = `2px solid ${selected[v]}`;
      btn.style.background = bgs[v];
      btn.style.boxShadow = `0 0 0 3px ${outlines[v]}`;
    } else {
      btn.style.border = `2px solid ${outlines[v]}`;
      btn.style.background = bgs[v];
      btn.style.boxShadow = 'none';
    }
  });
}

// Wire up perigo radio buttons via click on div
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.perigo-btn').forEach(btn => {
    btn.addEventListener('click', () => setSelectedPerigo(btn.dataset.val));
  });
});

function openModalDenuncia() {
  window._editDnId = null;
  ['f-dn-relato','f-dn-obs','f-dn-resp','f-dn-setor','f-dn-proto','f-dn-nome','f-dn-tel','f-dn-email'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const dataEl = document.getElementById('f-dn-data');
  if(dataEl) dataEl.value = new Date().toISOString().split('T')[0];
  setSelectedPerigo('Leve');
  openModal('modal-denuncia');
}

function editDenuncia(id) {
  const d = DB.denuncias.find(x => x.id === id);
  if(!d) return;
  window._editDnId = id;
  document.getElementById('f-dn-cat').value = d.cat;
  document.getElementById('f-dn-filial').value = d.filial;
  if(document.getElementById('f-dn-setor')) document.getElementById('f-dn-setor').value = d.setor||'';
  if(document.getElementById('f-dn-nome')) document.getElementById('f-dn-nome').value = d.nome||'';
  if(document.getElementById('f-dn-tel')) document.getElementById('f-dn-tel').value = d.tel||'';
  if(document.getElementById('f-dn-email')) document.getElementById('f-dn-email').value = d.email||'';
  document.getElementById('f-dn-anon').value = d.anon;
  document.getElementById('f-dn-resp').value = d.resp||'';
  document.getElementById('f-dn-status').value = d.status;
  document.getElementById('f-dn-relato').value = d.relato;
  document.getElementById('f-dn-obs').value = d.obs||'';
  if(document.getElementById('f-dn-data')) document.getElementById('f-dn-data').value = d.data||'';
  if(document.getElementById('f-dn-proto')) document.getElementById('f-dn-proto').value = d.proto||'';
  setSelectedPerigo(d.perigo||'Leve');
  openModal('modal-denuncia');
}

function salvarDenuncia() {
  const relato = document.getElementById('f-dn-relato').value.trim();
  if(!relato) { alert('O relato é obrigatório.'); return; }
  const perigo = getSelectedPerigo();
  const dataReceb = document.getElementById('f-dn-data').value || new Date().toISOString().split('T')[0];
  const protoManual = (document.getElementById('f-dn-proto').value || '').trim();
  const data = {
    cat: document.getElementById('f-dn-cat').value,
    filial: document.getElementById('f-dn-filial').value,
    setor: (document.getElementById('f-dn-setor')||{value:''}).value,
    nome: (document.getElementById('f-dn-nome')||{value:''}).value.trim(),
    tel: (document.getElementById('f-dn-tel')||{value:''}).value.trim(),
    email: (document.getElementById('f-dn-email')||{value:''}).value.trim(),
    perigo,
    anon: document.getElementById('f-dn-anon').value,
    resp: document.getElementById('f-dn-resp').value,
    status: document.getElementById('f-dn-status').value,
    relato, obs: document.getElementById('f-dn-obs').value
  };
  if(window._editDnId) {
    Object.assign(DB.denuncias.find(d => d.id === window._editDnId), { ...data, data: dataReceb });
  } else {
    // Protocol: use manual if provided, otherwise auto-generate
    const maxId = DB.denuncias.reduce((m, d) => Math.max(m, d.id||0), 0);
    const newId = maxId + 1;
    const year = new Date().getFullYear();
    let proto = protoManual || `DN-${year}-${String(newId).padStart(3,'0')}`;
    // Check for duplicate protocol
    if(DB.denuncias.find(d => d.proto === proto)) {
      alert(`⚠️ O protocolo "${proto}" já existe. Por favor, use outro protocolo.`);
      return;
    }
    DB.denuncias.push({ id: newId, proto, data: dataReceb, ...data });
    DB._ids.dn = newId + 1;
    // Show protocol to user
    setTimeout(() => alert(`✅ Denúncia registrada!\n\nProtocolo: ${proto}\nData: ${dataReceb}\n\nGuarde este número para acompanhamento.`), 100);
  }
  // Salvar no Supabase
  const _dnId = window._editDnId;
  closeModal('modal-denuncia');
  renderDenuncias();
  saveLocalCache();
  const _dnSaved = _dnId
    ? DB.denuncias.find(d => d.id === _dnId)
    : DB.denuncias[DB.denuncias.length - 1];
  if(_dnSaved) {
    sbSaveDenuncia(_dnSaved).then(() => setSaveIndicator('☁️ Denúncia salva na nuvem','var(--accent)'));
  }
}

function delDenuncia(id) {
  if(!confirm('Excluir esta denúncia?')) return;
  DB.denuncias = DB.denuncias.filter(d => d.id !== id);
  renderDenuncias();
  saveLocalCache();
  sbDeleteDenuncia(id).then(() => setSaveIndicator('☁️ Excluída da nuvem','var(--accent)'));
}


// ══════════════════════════════════════════
// RELATÓRIOS — CANAL DE DENÚNCIA
// ══════════════════════════════════════════
function populateRelSelects(force) {
  const relFilial = document.getElementById('rel-filial');
  if(!relFilial) return;

  // Preserve current selections
  const prevFilial = relFilial.value;
  const relSetor = document.getElementById('rel-setor');
  const prevSetor = relSetor ? relSetor.value : '';

  // Build lists from data
  const filiais = [...new Set(DB.denuncias.map(d => d.filial).filter(Boolean))].sort();
  const setores = [...new Set(DB.denuncias.map(d => d.setor).filter(Boolean))].sort();

  // Only rebuild if forced (on init/import) OR if options count changed
  const needsRebuild = force || relFilial.options.length !== filiais.length + 1;

  if(needsRebuild) {
    relFilial.innerHTML = '<option value="">Todas as Filiais</option>' +
      filiais.map(f => `<option value="${f}">${f}</option>`).join('');
    // Restore previous selection
    if(prevFilial) relFilial.value = prevFilial;

    if(relSetor) {
      relSetor.innerHTML = '<option value="">Todos os Setores</option>' +
        setores.map(s => `<option value="${s}">${s}</option>`).join('');
      if(prevSetor) relSetor.value = prevSetor;
    }

    // Also update canal de denuncia filial filter
    const fi2 = document.getElementById('filtro-dn-filial2');
    if(fi2) {
      const prev2 = fi2.value;
      fi2.innerHTML = '<option value="">Todas as filiais</option>' +
        filiais.map(f => `<option value="${f}">${f}</option>`).join('');
      if(prev2) fi2.value = prev2;
    }
  }
}

// Call with force=true on init and after import
function populateRelSelectsForce() { populateRelSelects(true); }

function openDnDetail(id) {
  const d = DB.denuncias.find(x => x.id === id);
  if(!d) return;
  document.getElementById('dn-detail-proto').textContent = d.proto;
  document.getElementById('dn-detail-perigo').innerHTML = perigoBadge(d.perigo);
  document.getElementById('dn-detail-status').innerHTML = statusBadge(d.status);
  document.getElementById('dn-detail-meta').textContent =
    `${d.filial}${d.setor?' · '+d.setor:''} · ${formatDate(d.data)} · ${d.anon}`;
  document.getElementById('dn-detail-cat').textContent = d.cat;
  document.getElementById('dn-detail-sla').innerHTML = slaBar(d.data, d.status);

  const idWrap = document.getElementById('dn-detail-identificado-wrap');
  const hasId = d.anon === 'Identificada' && (d.nome || d.tel || d.email);
  idWrap.style.display = hasId ? '' : 'none';
  if(hasId) {
    const setField = (elId, val) => {
      const el = document.getElementById(elId);
      el.style.display = val ? '' : 'none';
      if(val) el.querySelector('strong').textContent = val;
    };
    setField('dn-detail-id-nome',  d.nome);
    setField('dn-detail-id-tel',   d.tel);
    setField('dn-detail-id-email', d.email);
  }

  document.getElementById('dn-detail-relato').textContent = d.relato || '—';

  const acaoW = document.getElementById('dn-detail-acao-wrap');
  const obsW = document.getElementById('dn-detail-obs-wrap');
  if(d.acaoInicial) { acaoW.style.display=''; document.getElementById('dn-detail-acao').textContent = d.acaoInicial; }
  else acaoW.style.display='none';
  if(d.obs) { obsW.style.display=''; document.getElementById('dn-detail-obs').textContent = d.obs; }
  else obsW.style.display='none';

  document.getElementById('dn-detail-edit-btn').onclick = () => { closeModal('modal-dn-detail'); editDenuncia(id); };
  openModal('modal-dn-detail');
}
