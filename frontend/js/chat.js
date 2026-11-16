// ============================================================
// chat.js — Chat interno (conversas 1-a-1 e em grupo)
// ------------------------------------------------------------
// Front do módulo de mensagens. Fala com a Edge Function "chat"
// (service_role), que garante que só membros de uma conversa veem
// as mensagens dela. "Tempo real" por polling leve: só busca
// enquanto a página de Mensagens está aberta E a aba está visível
// (economiza invocações da função — fica dentro do nível grátis).
// ============================================================

const CHAT_URL = SUPABASE_URL + '/functions/v1/chat';

let chatConversas = [];      // lista de conversas do usuário
let chatAtual = null;        // id da conversa aberta
let chatMsgs = [];           // mensagens da conversa aberta
let chatUltimoId = 0;        // maior id de mensagem já visto (na conversa aberta)
let chatPollTimer = null;    // interval do polling
let chatTick = 0;            // contador de ciclos (para espaçar o refresh da lista)
let chatLidas = {};          // { conversaId: ultimoIdLido } — para o "não lido"
let chatCarregando = false;  // trava anti-concorrência do polling

function _chatMe() { return ((currentUser && currentUser.email) || '').trim().toLowerCase(); }

async function chatApi(action, payload = {}) {
  const r = await fetch(CHAT_URL, {
    method: 'POST',
    headers: _efH(),
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
  return data;
}

// Nome amigável de um e-mail (via lista de usuários carregada).
function chatNomeDe(email) {
  if (!email) return '—';
  const e = String(email).toLowerCase();
  if (e === _chatMe()) return (currentUser && currentUser.nome) || 'Você';
  const u = (typeof USUARIOS !== 'undefined' ? USUARIOS : []).find(x => String(x.email).toLowerCase() === e);
  return (u && u.nome) || email;
}
function chatIniciais(email) {
  const n = chatNomeDe(email).trim();
  const p = n.split(/\s+/);
  return ((p[0] || '')[0] || '?').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
}
function chatCorDe(email) {
  const e = String(email || '').toLowerCase();
  const u = (typeof USUARIOS !== 'undefined' ? USUARIOS : []).find(x => String(x.email).toLowerCase() === e);
  if (u && u.cor) return u.cor;
  let h = 0; for (let i = 0; i < e.length; i++) h = (h * 31 + e.charCodeAt(i)) % 360;
  return `hsl(${h},45%,42%)`;
}

// Título exibido para uma conversa.
function chatTitulo(c) {
  if (c.tipo === 'grupo') {
    if (c.nome) return c.nome;
    const outros = (c.membros || []).filter(m => m !== _chatMe()).map(chatNomeDe);
    return outros.join(', ') || 'Grupo';
  }
  const outro = (c.membros || []).find(m => m !== _chatMe());
  return chatNomeDe(outro) || 'Conversa';
}
function chatSubtitulo(c) {
  if (c.tipo === 'grupo') {
    const n = (c.membros || []).length;
    return `👥 Grupo · ${n} participante${n === 1 ? '' : 's'}`;
  }
  return '💬 Conversa direta';
}

function _chatHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmaData = d.toDateString() === hoje.toDateString();
  const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (mesmaData) return hh;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + hh;
}

// ------------------------------------------------------------
// Render principal da página
// ------------------------------------------------------------
async function renderChat() {
  const page = document.getElementById('page-chat');
  if (!page) return;
  chatStartPoll();
  await chatCarregarConversas();
  chatRenderLista();
  // reabre a conversa que estava aberta, se ainda existir
  if (chatAtual && chatConversas.some(c => c.id === chatAtual)) {
    chatRenderCabecalho();
  } else {
    chatAtual = null;
    chatRenderVazio();
  }
}

async function chatCarregarConversas() {
  try {
    const d = await chatApi('listar');
    chatConversas = d.conversas || [];
  } catch (e) {
    console.warn('[chat] listar:', e.message);
    const box = document.getElementById('chat-conversas');
    if (box && !chatConversas.length) {
      box.innerHTML = `<div style="padding:16px;color:var(--danger);font-size:.85rem">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  }
}

function chatRenderLista() {
  const box = document.getElementById('chat-conversas');
  if (!box) return;
  if (!chatConversas.length) {
    box.innerHTML = `<div style="padding:24px 16px;color:var(--text-muted);font-size:.85rem;text-align:center">
      Nenhuma conversa ainda.<br>Clique em <strong>+ Nova conversa</strong> para começar.</div>`;
    return;
  }
  box.innerHTML = chatConversas.map(c => {
    const ativo = c.id === chatAtual;
    const ult = c.ultima;
    const prev = ult ? `${ult.autor_email === _chatMe() ? 'Você: ' : ''}${escapeHtml((ult.texto || '').slice(0, 42))}` : '<em>sem mensagens</em>';
    const hora = ult ? _chatHora(ult.criado_em) : '';
    const naoLido = ult && ult.autor_email !== _chatMe() && (chatLidas[c.id] || 0) < ult.id && !ativo;
    const cor = c.tipo === 'grupo' ? '#7c3aed' : chatCorDe((c.membros || []).find(m => m !== _chatMe()));
    const ini = c.tipo === 'grupo' ? '👥' : chatIniciais((c.membros || []).find(m => m !== _chatMe()));
    return `<div onclick="chatAbrir(${c.id})" style="display:flex;gap:10px;align-items:center;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);${ativo ? 'background:var(--primary-soft,#eef2ff)' : ''}">
      <div style="flex:none;width:38px;height:38px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${c.tipo === 'grupo' ? '1.1rem' : '.8rem'}">${ini}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:6px">
          <strong style="font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(chatTitulo(c))}</strong>
          <span style="font-size:.7rem;color:var(--text-muted);flex:none">${hora}</span>
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${naoLido ? 'font-weight:700;color:var(--text)' : ''}">${prev}</div>
      </div>
      ${naoLido ? '<div style="flex:none;width:9px;height:9px;border-radius:50%;background:#22c55e"></div>' : ''}
    </div>`;
  }).join('');
}

function chatRenderVazio() {
  const cab = document.getElementById('chat-cab');
  const msgs = document.getElementById('chat-msgs');
  const form = document.getElementById('chat-form');
  if (cab) cab.innerHTML = '';
  if (form) form.style.display = 'none';
  if (msgs) msgs.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);text-align:center;padding:30px">
    <div style="font-size:2.4rem;margin-bottom:10px">💬</div>
    <div style="font-weight:700">Selecione uma conversa</div>
    <div style="font-size:.85rem;margin-top:4px">ou crie uma nova para começar a conversar.</div></div>`;
}

async function chatAbrir(id) {
  chatAtual = id;
  chatUltimoId = 0;
  chatMsgs = [];
  chatRenderCabecalho();
  const msgs = document.getElementById('chat-msgs');
  if (msgs) msgs.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:.85rem">Carregando…</div>';
  try {
    const d = await chatApi('mensagens', { conversa_id: id });
    chatMsgs = d.mensagens || [];
    if (chatMsgs.length) chatUltimoId = chatMsgs[chatMsgs.length - 1].id;
    chatLidas[id] = chatUltimoId;
    chatRenderMsgs(true);
  } catch (e) {
    if (msgs) msgs.innerHTML = `<div style="padding:20px;color:var(--danger);font-size:.85rem">⚠️ ${escapeHtml(e.message)}</div>`;
  }
  chatRenderLista();
  const inp = document.getElementById('chat-input');
  if (inp) inp.focus();
}

function chatRenderCabecalho() {
  const c = chatConversas.find(x => x.id === chatAtual);
  const cab = document.getElementById('chat-cab');
  const form = document.getElementById('chat-form');
  if (!c || !cab) return;
  if (form) form.style.display = '';
  const cor = c.tipo === 'grupo' ? '#7c3aed' : chatCorDe((c.membros || []).find(m => m !== _chatMe()));
  const ini = c.tipo === 'grupo' ? '👥' : chatIniciais((c.membros || []).find(m => m !== _chatMe()));
  cab.innerHTML = `<div style="flex:none;width:40px;height:40px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${c.tipo === 'grupo' ? '1.1rem' : '.85rem'}">${ini}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(chatTitulo(c))}</div>
      <div style="font-size:.76rem;color:var(--text-muted)">${escapeHtml(chatSubtitulo(c))}</div>
    </div>`;
}

function chatRenderMsgs(scroll) {
  const box = document.getElementById('chat-msgs');
  if (!box) return;
  if (!chatMsgs.length) {
    box.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:.85rem">Nenhuma mensagem. Diga olá 👋</div>`;
    return;
  }
  const me = _chatMe();
  const c = chatConversas.find(x => x.id === chatAtual);
  const grupo = c && c.tipo === 'grupo';
  box.innerHTML = chatMsgs.map((m, i) => {
    const meu = String(m.autor_email).toLowerCase() === me;
    const prev = chatMsgs[i - 1];
    const mostrarAutor = grupo && !meu && (!prev || prev.autor_email !== m.autor_email);
    return `<div style="display:flex;flex-direction:column;align-items:${meu ? 'flex-end' : 'flex-start'};margin:2px 0">
      ${mostrarAutor ? `<div style="font-size:.72rem;color:${chatCorDe(m.autor_email)};font-weight:700;margin:4px 6px 1px">${escapeHtml(chatNomeDe(m.autor_email))}</div>` : ''}
      <div style="max-width:72%;padding:8px 12px;border-radius:14px;${meu ? 'background:var(--primary);color:#fff;border-bottom-right-radius:4px' : 'background:var(--card-alt,#f1f5f9);color:var(--text);border-bottom-left-radius:4px'};font-size:.9rem;line-height:1.35;word-break:break-word;white-space:pre-wrap">${escapeHtml(m.texto)}</div>
      <div style="font-size:.66rem;color:var(--text-muted);margin:1px 6px 3px">${_chatHora(m.criado_em)}</div>
    </div>`;
  }).join('');
  if (scroll) box.scrollTop = box.scrollHeight;
}

async function chatEnviar(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const inp = document.getElementById('chat-input');
  if (!inp || !chatAtual) return;
  const texto = inp.value.trim();
  if (!texto) return;
  inp.value = '';
  inp.style.height = 'auto';
  try {
    const d = await chatApi('enviar', { conversa_id: chatAtual, texto, autor_nome: (currentUser && currentUser.nome) || '' });
    if (d.mensagem) {
      chatMsgs.push(d.mensagem);
      chatUltimoId = d.mensagem.id;
      chatLidas[chatAtual] = chatUltimoId;
      chatRenderMsgs(true);
    }
  } catch (e) {
    inp.value = texto; // devolve o texto para não perder
    alert('Não foi possível enviar: ' + e.message);
  }
}

// ------------------------------------------------------------
// Polling (só roda na página de Mensagens e com a aba visível)
// ------------------------------------------------------------
function chatStartPoll() {
  if (chatPollTimer) return;
  chatPollTimer = setInterval(chatPoll, 3000);
}
async function chatPoll() {
  if (currentPage !== 'chat') return;
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  if (chatCarregando) return;
  chatCarregando = true;
  try {
    // 1) novas mensagens da conversa aberta
    if (chatAtual) {
      const d = await chatApi('mensagens', { conversa_id: chatAtual, since: chatUltimoId });
      if (d.mensagens && d.mensagens.length) {
        const box = document.getElementById('chat-msgs');
        const perto = box ? (box.scrollHeight - box.scrollTop - box.clientHeight < 80) : true;
        chatMsgs = chatMsgs.concat(d.mensagens);
        chatUltimoId = chatMsgs[chatMsgs.length - 1].id;
        chatLidas[chatAtual] = chatUltimoId;
        chatRenderMsgs(perto);
      }
    }
    // 2) a cada ~4 ciclos (~12s) atualiza a lista (novas conversas / prévia)
    chatTick++;
    if (chatTick % 4 === 0) {
      await chatCarregarConversas();
      chatRenderLista();
    }
  } catch (e) {
    // silencioso — próximo ciclo tenta de novo
  } finally {
    chatCarregando = false;
  }
}

// ------------------------------------------------------------
// Nova conversa (modal)
// ------------------------------------------------------------
function chatNovaConversa() {
  const me = _chatMe();
  const outros = (typeof USUARIOS !== 'undefined' ? USUARIOS : [])
    .filter(u => String(u.email).toLowerCase() !== me)
    .sort((a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email)));

  let ov = document.getElementById('chat-novo-modal');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.className = 'modal-overlay open';
  ov.id = 'chat-novo-modal';
  ov.innerHTML = `<div class="modal" style="max-width:460px">
    <div class="modal-header"><h3 style="margin:0">💬 Nova conversa</h3>
      <button class="btn btn-sm btn-outline" onclick="document.getElementById('chat-novo-modal').remove()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Nome do grupo <span style="color:var(--text-muted);font-weight:400">(opcional — deixe em branco para conversa direta)</span></label>
        <input type="text" id="chat-novo-nome" placeholder="Ex.: Comitê de Ética"/></div>
      <div class="field"><label>Participantes</label>
        <input type="text" id="chat-novo-busca" placeholder="🔍 Filtrar pessoas…" oninput="chatFiltrarPessoas()"/>
        <div id="chat-novo-lista" style="max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-top:6px">
          ${outros.length ? outros.map(u => {
            const e = String(u.email).toLowerCase();
            return `<label class="chat-pessoa" data-nome="${escapeHtml((u.nome || '').toLowerCase())} ${escapeHtml(e)}" style="display:flex;gap:10px;align-items:center;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)">
              <input type="checkbox" value="${escapeHtml(e)}" style="width:18px;height:18px"/>
              <div style="flex:none;width:30px;height:30px;border-radius:50%;background:${chatCorDe(e)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.72rem">${chatIniciais(e)}</div>
              <div><div style="font-size:.88rem;font-weight:600">${escapeHtml(u.nome || e)}</div>
                <div style="font-size:.74rem;color:var(--text-muted)">${escapeHtml(u.perfil || '')}</div></div>
            </label>`;
          }).join('') : '<div style="padding:16px;color:var(--text-muted);font-size:.85rem">Nenhum outro usuário cadastrado. Crie usuários em Admin › Usuários.</div>'}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="document.getElementById('chat-novo-modal').remove()">Cancelar</button>
      <button class="btn btn-accent" onclick="chatCriarConversa()">Criar conversa</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

function chatFiltrarPessoas() {
  const q = (document.getElementById('chat-novo-busca') || { value: '' }).value.trim().toLowerCase();
  document.querySelectorAll('#chat-novo-lista .chat-pessoa').forEach(el => {
    el.style.display = (!q || (el.getAttribute('data-nome') || '').includes(q)) ? '' : 'none';
  });
}

async function chatCriarConversa() {
  const nome = (document.getElementById('chat-novo-nome') || { value: '' }).value.trim();
  const membros = Array.from(document.querySelectorAll('#chat-novo-lista input[type=checkbox]:checked')).map(c => c.value);
  if (!membros.length) { alert('Escolha ao menos um participante.'); return; }
  const tipo = (membros.length === 1 && !nome) ? 'dm' : 'grupo';
  try {
    const d = await chatApi('criar', { tipo, nome: nome || null, membros });
    const modal = document.getElementById('chat-novo-modal');
    if (modal) modal.remove();
    await chatCarregarConversas();
    chatRenderLista();
    if (d.conversa) chatAbrir(d.conversa.id);
    if (typeof auditLog === 'function') auditLog('criar', 'chat', `Conversa criada (${tipo})`, { membros: membros.length });
  } catch (e) {
    alert('Não foi possível criar a conversa: ' + e.message);
  }
}

// auto-resize do textarea e Enter para enviar (Shift+Enter = nova linha)
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatEnviar(e);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'chat-input') {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
  });
});
