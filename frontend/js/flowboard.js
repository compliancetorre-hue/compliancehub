// ══════════════════════════════════════════
// FLOWBOARD
// ══════════════════════════════════════════
let fbCurrentView = 'denuncias';
let fbDragCard = null;
let fbDragSrcCol = null;
let fbDragCol = null;

function fbSetView(view, el) {
  fbCurrentView = view;
  document.querySelectorAll('.fb-filter-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderFlowboard();
}

function renderFlowboard() {
  const board = DB.fbBoards[fbCurrentView];
  document.getElementById('fb-board-title').textContent = board.name;

  // Boards list
  const list = document.getElementById('fb-boards-list');
  list.innerHTML = Object.entries(DB.fbBoards).map(([k,b]) =>
    `<div class="fb-board-item ${k===fbCurrentView?'active':''}" onclick="fbSetView('${k}',null)">
      <div class="fb-board-dot" style="background:${b.color}"></div>
      ${b.name}
    </div>`
  ).join('');

  // Kanban columns
  const kanban = document.getElementById('fb-kanban');
  kanban.innerHTML = '';
  board.cols.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'fb-col';
    colEl.dataset.colId = col.id;
    // dragover/drop serve tanto pra soltar um CARD dentro da coluna quanto
    // pra soltar a própria COLUNA (arrastada pelo cabeçalho) numa posição
    // nova — diferenciados por qual variável de drag está ativa no momento.
    colEl.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('drag-over'); });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('drag-over'));
    colEl.addEventListener('drop', e => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      if(fbDragCol) fbDropCol(col.id);
      else fbDrop(col.id);
    });

    colEl.innerHTML = `
      <div class="fb-col-header">
        <div class="fb-col-dot" style="background:${col.color}"></div>
        <div class="fb-col-name">${col.name}</div>
        <div class="fb-col-count">${col.cards.length}</div>
        <button class="fb-col-menu" title="Excluir coluna" onclick="fbDeleteCol('${col.id}')">🗑</button>
      </div>
      <div class="fb-cards" id="cards-${col.id}"></div>
      <button class="fb-add-card" onclick="fbAddCard('${col.id}')">+ Adicionar card</button>
    `;
    kanban.appendChild(colEl);

    // Arrasta a coluna inteira pelo cabeçalho (igual ao card, mas segurando
    // no título em vez de num card) — só o cabeçalho é arrastável, não a
    // coluna toda, senão um clique-e-arraste num card dentro dela poderia
    // ser interpretado como arrastar a coluna.
    const headerEl = colEl.querySelector('.fb-col-header');
    headerEl.draggable = true;
    headerEl.addEventListener('dragstart', () => {
      fbDragCol = col.id; fbDragCard = null; fbDragSrcCol = null;
      colEl.classList.add('col-dragging');
    });
    headerEl.addEventListener('dragend', () => { colEl.classList.remove('col-dragging'); fbDragCol = null; });

    const cardsEl = colEl.querySelector(`#cards-${col.id}`);
    col.cards.forEach(card => {
      cardsEl.appendChild(fbMakeCardEl(card, col.id));
    });
  });

  // Add col button
  const addCol = document.createElement('div');
  addCol.className = 'fb-add-col';
  addCol.innerHTML = `<button class="fb-add-col-btn" onclick="fbAddCol()">+ Nova Coluna</button>`;
  kanban.appendChild(addCol);
}

function fbMakeCardEl(card, colId) {
  const el = document.createElement('div');
  el.className = 'fb-card';
  el.draggable = true;
  el.dataset.cardId = card.id;

  const done = (card.checkDone||[]).filter(Boolean).length;
  const total = (card.check||[]).length;
  const checkPct = total > 0 ? Math.round(done/total*100) : 0;

  const prioColors = {Crítica:'#fde8ff',Alta:'#fee2e2',Média:'#fef3c7',Baixa:'#d1fae5'};
  const prioText = {Crítica:'#7e22ce',Alta:'#991b1b',Média:'#92400e',Baixa:'#065f46'};
  // Tarja no topo do card indicando o nível de risco/prioridade
  const prioStripe = {Crítica:'#7c3aed',Alta:'#ef4444',Média:'#f59e0b',Baixa:'#10b981'};
  el.style.borderTopColor = prioStripe[card.prio] || 'var(--border)';

  const today = new Date().toISOString().split('T')[0];
  let dateClass = '';
  if(card.prazo && card.prazo < today) dateClass = 'vencido';
  else if(card.prazo === today) dateClass = 'hoje';

  el.innerHTML = `
    <div class="fb-card-title">${card.title}</div>
    ${total > 0 ? `<div class="fb-card-checklist"><span>${done}/${total} tarefas</span><div class="fb-card-checklist-bar"><div class="fb-card-checklist-fill" style="width:${checkPct}%"></div></div></div>` : ''}
    <div class="fb-card-meta">
      ${card.prazo ? `<span class="fb-card-date ${dateClass}">📅 ${formatDate(card.prazo)}</span>` : ''}
      ${card.prio ? `<span class="fb-card-tag" style="background:${prioColors[card.prio]||'#f1f5f9'};color:${prioText[card.prio]||'#475569'}">${card.prio}</span>` : ''}
      ${card.tag ? `<span class="fb-card-tag" style="background:#f0f4f8;color:var(--text-muted)">${card.tag}</span>` : ''}
      ${card.resp ? `<div class="fb-card-avatar" style="background:var(--primary);margin-left:auto">${card.resp.slice(0,2).toUpperCase()}</div>` : ''}
    </div>
    ${card.criadoEm ? `<div class="fb-card-created">🕐 Criado em ${new Date(card.criadoEm).toLocaleDateString('pt-BR')}</div>` : ''}
  `;

  el.addEventListener('dragstart', () => { fbDragCard = card.id; fbDragSrcCol = colId; el.classList.add('dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('click', () => fbOpenCard(card.id, colId));
  return el;
}

function fbDrop(targetColId) {
  if(!fbDragCard || fbDragSrcCol === targetColId) return;
  const board = DB.fbBoards[fbCurrentView];
  const srcCol = board.cols.find(c => c.id === fbDragSrcCol);
  const tgtCol = board.cols.find(c => c.id === targetColId);
  if(!srcCol || !tgtCol) return;
  const cardIdx = srcCol.cards.findIndex(c => c.id === fbDragCard);
  if(cardIdx === -1) return;
  const [card] = srcCol.cards.splice(cardIdx, 1);
  tgtCol.cards.push(card);
  fbDragCard = null; fbDragSrcCol = null;
  renderFlowboard();
  saveLocalCache();
  setSaveIndicator('⏳ Salvando...','var(--warn)');
  sbSaveFbBoards().then(() => setSaveIndicator('☁️ FlowBoard salvo','var(--accent)'))
                  .catch(() => setSaveIndicator('⚠️ Erro ao salvar na nuvem','var(--danger)'));
}

// ── Checklist interativo do modal (checkbox + texto por item) ──
let _fbChecklistDraft = [];

function fbRenderChecklistDraft() {
  const wrap = document.getElementById('fb-checklist-items');
  if(!wrap) return;
  if(_fbChecklistDraft.length === 0) {
    wrap.innerHTML = '<div style="font-size:.8rem;color:var(--text-muted)">Nenhuma tarefa ainda.</div>';
    return;
  }
  wrap.innerHTML = _fbChecklistDraft.map((item, i) => `
    <div style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" ${item.done?'checked':''} onchange="fbToggleChecklistDraftItem(${i})" style="width:17px;height:17px;flex-shrink:0;cursor:pointer"/>
      <input type="text" value="${escapeHtml(item.text)}" oninput="fbUpdateChecklistDraftText(${i}, this.value)"
        style="flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85rem;${item.done?'text-decoration:line-through;color:var(--text-muted)':''}"/>
      <button type="button" class="btn btn-outline btn-sm" onclick="fbRemoveChecklistDraftItem(${i})" title="Remover">✕</button>
    </div>
  `).join('');
}

function fbAddChecklistItem() {
  const input = document.getElementById('fb-check-new');
  const text = input.value.trim();
  if(!text) return;
  _fbChecklistDraft.push({ text, done: false });
  input.value = '';
  fbRenderChecklistDraft();
  input.focus();
}

function fbToggleChecklistDraftItem(idx) {
  if(!_fbChecklistDraft[idx]) return;
  _fbChecklistDraft[idx].done = !_fbChecklistDraft[idx].done;
  fbRenderChecklistDraft();
}

function fbUpdateChecklistDraftText(idx, value) {
  if(!_fbChecklistDraft[idx]) return;
  _fbChecklistDraft[idx].text = value;
}

function fbRemoveChecklistDraftItem(idx) {
  _fbChecklistDraft.splice(idx, 1);
  fbRenderChecklistDraft();
}

function fbAddCard(colId) {
  const board = DB.fbBoards[fbCurrentView];
  document.getElementById('fb-modal-title').textContent = '📌 Novo Card';
  document.getElementById('fb-edit-id').value = '';
  document.getElementById('fb-edit-col').value = colId || board.cols[0]?.id || '';
  ['fb-titulo','fb-desc','fb-resp','fb-prazo','fb-tag'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fb-prio').value = 'Média';
  document.getElementById('fb-del-btn').style.display = 'none';
  _fbChecklistDraft = [];
  fbRenderChecklistDraft();

  // Populate col select
  const sel = document.getElementById('fb-col-sel');
  sel.innerHTML = board.cols.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if(colId) sel.value = colId;

  openModal('fb-card-modal');
}

function fbOpenCard(cardId, colId) {
  const board = DB.fbBoards[fbCurrentView];
  const col = board.cols.find(c => c.id === colId);
  const card = col?.cards.find(c => c.id === cardId);
  if(!card) return;
  document.getElementById('fb-modal-title').textContent = '✏️ Editar Card';
  document.getElementById('fb-edit-id').value = cardId;
  document.getElementById('fb-edit-col').value = colId;
  document.getElementById('fb-titulo').value = card.title;
  document.getElementById('fb-desc').value = card.desc||'';
  document.getElementById('fb-resp').value = card.resp||'';
  document.getElementById('fb-prazo').value = card.prazo||'';
  document.getElementById('fb-prio').value = card.prio||'Média';
  document.getElementById('fb-tag').value = card.tag||'';
  document.getElementById('fb-del-btn').style.display = 'inline-flex';
  _fbChecklistDraft = (card.check||[]).map((t,i) => ({ text: t, done: !!(card.checkDone||[])[i] }));
  fbRenderChecklistDraft();

  const sel = document.getElementById('fb-col-sel');
  sel.innerHTML = board.cols.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = colId;

  openModal('fb-card-modal');
}

function fbSaveCard() {
  const title = document.getElementById('fb-titulo').value.trim();
  if(!title) { alert('Informe o título do card.'); return; }
  const board = DB.fbBoards[fbCurrentView];
  const editId = document.getElementById('fb-edit-id').value;
  const oldColId = document.getElementById('fb-edit-col').value;
  const newColId = document.getElementById('fb-col-sel').value;
  const checklistFinal = _fbChecklistDraft.filter(i => i.text.trim());

  const cardData = {
    title, desc: document.getElementById('fb-desc').value,
    check: checklistFinal.map(i => i.text.trim()),
    checkDone: checklistFinal.map(i => i.done ? 1 : 0),
    resp: document.getElementById('fb-resp').value,
    prazo: document.getElementById('fb-prazo').value,
    prio: document.getElementById('fb-prio').value,
    tag: document.getElementById('fb-tag').value,
  };

  if(editId) {
    // Edit existing
    const oldCol = board.cols.find(c => c.id === oldColId);
    const idx = oldCol?.cards.findIndex(c => c.id === editId);
    if(idx !== undefined && idx > -1) {
      cardData.id = editId;
      cardData.criadoEm = oldCol.cards[idx].criadoEm || null; // preserva a data original de criação
      if(oldColId === newColId) {
        oldCol.cards[idx] = cardData;
      } else {
        oldCol.cards.splice(idx, 1);
        const newCol = board.cols.find(c => c.id === newColId);
        newCol?.cards.push(cardData);
      }
    }
  } else {
    cardData.id = 'fb' + (DB._ids.fbCard++);
    cardData.criadoEm = new Date().toISOString();
    const col = board.cols.find(c => c.id === newColId);
    col?.cards.push(cardData);
  }

  closeModal('fb-card-modal');
  renderFlowboard();
  saveLocalCache();
  sbSaveFbBoards().then(()=>setSaveIndicator('☁️ FlowBoard salvo','var(--accent)'));
}

function fbDeleteCard() {
  const editId = document.getElementById('fb-edit-id').value;
  const oldColId = document.getElementById('fb-edit-col').value;
  if(!editId) return;
  if(!confirm('Excluir este card?')) return;
  const board = DB.fbBoards[fbCurrentView];
  const col = board.cols.find(c => c.id === oldColId);
  if(col) col.cards = col.cards.filter(c => c.id !== editId);
  closeModal('fb-card-modal');
  renderFlowboard();
  saveLocalCache();
  sbSaveFbBoards().then(()=>setSaveIndicator('☁️ FlowBoard atualizado','var(--accent)'));
}

function fbAddCol() {
  const name = prompt('Nome da nova coluna:');
  if(!name) return;
  const board = DB.fbBoards[fbCurrentView];
  const id = 'col' + Date.now();
  const colors = ['#94a3b8','#3b82f6','#f59e0b','#00c49a','#8b5cf6','#ef4444'];
  board.cols.push({ id, name, color: colors[board.cols.length % colors.length], cards: [] });
  renderFlowboard();
  saveLocalCache();
  setSaveIndicator('⏳ Salvando...','var(--warn)');
  sbSaveFbBoards().then(() => setSaveIndicator('☁️ FlowBoard salvo','var(--accent)'))
                  .catch(() => setSaveIndicator('⚠️ Erro ao salvar na nuvem','var(--danger)'));
}

// Solta a coluna arrastada (fbDragCol) na posição da coluna-alvo.
function fbDropCol(targetColId) {
  const board = DB.fbBoards[fbCurrentView];
  const draggedId = fbDragCol;
  fbDragCol = null;
  if(!draggedId || draggedId === targetColId) return;
  const fromIdx = board.cols.findIndex(c => c.id === draggedId);
  const toIdx = board.cols.findIndex(c => c.id === targetColId);
  if(fromIdx === -1 || toIdx === -1) return;
  const [col] = board.cols.splice(fromIdx, 1);
  board.cols.splice(toIdx, 0, col);
  renderFlowboard();
  saveLocalCache();
  setSaveIndicator('⏳ Salvando...','var(--warn)');
  sbSaveFbBoards().then(() => setSaveIndicator('☁️ FlowBoard salvo','var(--accent)'))
                  .catch(() => setSaveIndicator('⚠️ Erro ao salvar na nuvem','var(--danger)'));
}

function fbDeleteCol(colId) {
  const board = DB.fbBoards[fbCurrentView];
  if(board.cols.length <= 1) { alert('O quadro precisa de pelo menos uma coluna.'); return; }
  const col = board.cols.find(c => c.id === colId);
  if(!col) return;
  const msg = col.cards.length
    ? `Excluir a coluna "${col.name}"? Ela tem ${col.cards.length} card(s), que também serão excluídos.`
    : `Excluir a coluna "${col.name}"?`;
  if(!confirm(msg)) return;
  board.cols = board.cols.filter(c => c.id !== colId);
  renderFlowboard();
  saveLocalCache();
  setSaveIndicator('⏳ Salvando...','var(--warn)');
  sbSaveFbBoards().then(() => setSaveIndicator('☁️ FlowBoard salvo','var(--accent)'))
                  .catch(() => setSaveIndicator('⚠️ Erro ao salvar na nuvem','var(--danger)'));
}

function fbNewBoard() {
  const name = prompt('Nome do novo quadro:');
  if(!name) return;
  const key = 'board-' + Date.now();
  DB.fbBoards[key] = {
    name, color: '#3b82f6',
    cols: [
      { id:'a1'+Date.now(), name:'A Fazer', color:'#94a3b8', cards:[] },
      { id:'a2'+Date.now(), name:'Em Andamento', color:'#3b82f6', cards:[] },
      { id:'a3'+Date.now(), name:'Concluído', color:'#00c49a', cards:[] },
    ]
  };
  fbSetView(key, null);
  saveLocalCache();
  setSaveIndicator('⏳ Salvando...','var(--warn)');
  sbSaveFbBoards().then(() => setSaveIndicator('☁️ FlowBoard salvo','var(--accent)'))
                  .catch(() => setSaveIndicator('⚠️ Erro ao salvar na nuvem','var(--danger)'));
}
