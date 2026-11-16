// ============================================================
// chat.js — Chat interno (conversas 1-a-1 e em grupo)
// ------------------------------------------------------------
// A página "Mensagens" lista as conversas (lançador). Ao clicar numa
// conversa, ela abre numa JANELA FLUTUANTE no canto inferior direito
// (estilo Messenger), que fica por cima de qualquer tela do sistema e
// tem um X para fechar. Fala com a Edge Function "chat" (service_role),
// que garante que só membros veem/escrevem. "Tempo real" por polling
// leve (3s), só com a aba visível e quando há conversa aberta ou a
// página de Mensagens está ativa.
// ============================================================

const CHAT_URL = SUPABASE_URL + '/functions/v1/chat';

let chatConversas = [];      // lista de conversas do usuário
let chatAtual = null;        // id da conversa aberta na janela flutuante
let chatMsgs = [];           // mensagens da conversa aberta
let chatUltimoId = 0;        // maior id de mensagem já visto
let chatPollTimer = null;    // interval do polling
let chatTick = 0;            // contador de ciclos (para espaçar o refresh da lista)
let chatLidas = {};          // { conversaId: ultimoIdLido } — para o "não lido"
let chatCarregando = false;  // trava anti-concorrência do polling
let chatSinceGlobal = 0;     // maior id de mensagem já visto em QUALQUER conversa minha
let chatPrimed = false;      // já definiu a linha de base (evita abrir no load com msg antiga)
let chatNaoLidas = 0;        // contador de não-lidas da janela aberta enquanto minimizada

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

// ---- helpers de exibição ----
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
    return `👥 ${n} participante${n === 1 ? '' : 's'}`;
  }
  return 'Conversa direta';
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
// Página "Mensagens" = lançador (lista de conversas)
// ------------------------------------------------------------
async function renderChat() {
  const page = document.getElementById('page-chat');
  if (!page) return;
  chatStartPoll();
  // Painel direito vira um aviso fixo (as conversas abrem flutuando).
  const cab = document.getElementById('chat-cab');
  if (cab) cab.innerHTML = '<div style="font-weight:700;font-size:.95rem">💬 Mensagens</div>';
  const form = document.getElementById('chat-form');
  if (form) form.style.display = 'none';
  const msgs = document.getElementById('chat-msgs');
  if (msgs) msgs.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);text-align:center;padding:30px">
    <div style="font-size:2.4rem;margin-bottom:10px">💬</div>
    <div style="font-weight:700">Clique numa conversa à esquerda</div>
    <div style="font-size:.85rem;margin-top:4px">Ela abre numa janelinha no canto da tela 👉<br>e continua aberta mesmo se você mudar de módulo.</div></div>`;
  await chatCarregarConversas();
  chatRenderLista();
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

// ------------------------------------------------------------
// Janela flutuante (canto inferior direito)
// ------------------------------------------------------------
function _chatGarantirFloat() {
  let f = document.getElementById('chat-float');
  if (f) return f;
  f = document.createElement('div');
  f.id = 'chat-float';
  f.className = 'chat-float';
  f.style.display = 'none';
  f.innerHTML = `
    <div class="chat-float-head" id="chat-float-head"></div>
    <div class="chat-float-body" id="chat-float-body"></div>
    <form class="chat-float-form" id="chat-float-form" onsubmit="chatEnviar(event)">
      <textarea id="chat-float-input" rows="1" placeholder="Mensagem…  (Enter envia)"></textarea>
      <button type="submit" title="Enviar" aria-label="Enviar">➤</button>
    </form>`;
  document.body.appendChild(f);
  return f;
}

async function chatAbrir(id) {
  chatAtual = id;
  chatUltimoId = 0;
  chatMsgs = [];
  chatNaoLidas = 0;
  const f = _chatGarantirFloat();
  f.style.display = 'flex';
  f.classList.remove('chat-float-min');
  chatFloatHead();
  const body = document.getElementById('chat-float-body');
  if (body) body.innerHTML = '<div style="padding:18px;color:var(--text-muted);font-size:.85rem">Carregando…</div>';
  chatStartPoll();
  try {
    const d = await chatApi('mensagens', { conversa_id: id });
    chatMsgs = d.mensagens || [];
    if (chatMsgs.length) chatUltimoId = chatMsgs[chatMsgs.length - 1].id;
    chatSinceGlobal = Math.max(chatSinceGlobal, chatUltimoId);
    chatLidas[id] = chatUltimoId;
    chatFloatMsgs(true);
  } catch (e) {
    if (body) body.innerHTML = `<div style="padding:18px;color:var(--danger);font-size:.85rem">⚠️ ${escapeHtml(e.message)}</div>`;
  }
  chatRenderLista();
  const inp = document.getElementById('chat-float-input');
  if (inp) inp.focus();
}

function chatFloatHead() {
  const c = chatConversas.find(x => x.id === chatAtual);
  const head = document.getElementById('chat-float-head');
  if (!head) return;
  const titulo = c ? chatTitulo(c) : 'Conversa';
  const sub = c ? chatSubtitulo(c) : '';
  const grupo = c && c.tipo === 'grupo';
  const cor = grupo ? '#7c3aed' : chatCorDe(c ? (c.membros || []).find(m => m !== _chatMe()) : '');
  const ini = grupo ? '👥' : chatIniciais(c ? (c.membros || []).find(m => m !== _chatMe()) : '');
  const badge = chatNaoLidas > 0
    ? `<span class="chat-float-badge" title="${chatNaoLidas} mensagem(ns) nova(s)">${chatNaoLidas > 99 ? '99+' : chatNaoLidas}</span>`
    : '';
  const f = document.getElementById('chat-float');
  if (f) f.classList.toggle('chat-float-alert', chatNaoLidas > 0);
  head.innerHTML = `
    <div style="position:relative;flex:none;width:32px;height:32px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${grupo ? '1rem' : '.72rem'}">${ini}${badge}</div>
    <div style="flex:1;min-width:0;cursor:pointer" onclick="chatToggleMin()" title="Minimizar / expandir">
      <div style="font-weight:700;font-size:.9rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(titulo)}</div>
      <div style="font-size:.72rem;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(sub)}</div>
    </div>
    <button class="chat-float-min" onclick="chatToggleMin()" title="Minimizar" aria-label="Minimizar">—</button>
    <button class="chat-float-x" onclick="chatFecharFloat()" title="Fechar conversa" aria-label="Fechar">✕</button>`;
}

function chatFloatMsgs(scroll) {
  const box = document.getElementById('chat-float-body');
  if (!box) return;
  if (!chatMsgs.length) {
    box.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:.85rem">Diga olá 👋</div>`;
    return;
  }
  const me = _chatMe();
  const c = chatConversas.find(x => x.id === chatAtual);
  const grupo = c && c.tipo === 'grupo';
  box.innerHTML = chatMsgs.map((m, i) => {
    const meu = String(m.autor_email).toLowerCase() === me;
    const prev = chatMsgs[i - 1];
    const mostrarAutor = grupo && !meu && (!prev || prev.autor_email !== m.autor_email);
    return `<div style="display:flex;flex-direction:column;align-items:${meu ? 'flex-end' : 'flex-start'};margin:1px 0">
      ${mostrarAutor ? `<div style="font-size:.7rem;color:${chatCorDe(m.autor_email)};font-weight:700;margin:3px 4px 1px">${escapeHtml(chatNomeDe(m.autor_email))}</div>` : ''}
      <div style="max-width:80%;padding:7px 11px;border-radius:13px;${meu ? 'background:var(--primary);color:#fff;border-bottom-right-radius:4px' : 'background:var(--card-alt,#e9eef5);color:var(--text);border-bottom-left-radius:4px'};font-size:.87rem;line-height:1.35;word-break:break-word;white-space:pre-wrap">${escapeHtml(m.texto)}</div>
      <div style="font-size:.63rem;color:var(--text-muted);margin:1px 5px 2px">${_chatHora(m.criado_em)}</div>
    </div>`;
  }).join('');
  if (scroll) box.scrollTop = box.scrollHeight;
}

function chatToggleMin() {
  const f = document.getElementById('chat-float');
  if (!f) return;
  f.classList.toggle('chat-float-min');
  if (!f.classList.contains('chat-float-min')) {
    // expandiu → zera o contador e rola pro fim
    chatNaoLidas = 0;
    if (chatAtual) chatLidas[chatAtual] = chatUltimoId;
    chatFloatHead();
    const box = document.getElementById('chat-float-body');
    if (box) box.scrollTop = box.scrollHeight;
  } else {
    chatFloatHead();
  }
}
function _chatMinimizada() {
  const f = document.getElementById('chat-float');
  return !!(f && f.style.display !== 'none' && f.classList.contains('chat-float-min'));
}

function chatFecharFloat() {
  const f = document.getElementById('chat-float');
  if (f) f.style.display = 'none';
  chatAtual = null;
  chatMsgs = [];
  chatUltimoId = 0;
  chatRenderLista();
}

async function chatEnviar(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const inp = document.getElementById('chat-float-input');
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
      chatSinceGlobal = Math.max(chatSinceGlobal, chatUltimoId);
      chatLidas[chatAtual] = chatUltimoId;
      chatFloatMsgs(true);
    }
  } catch (e) {
    inp.value = texto; // devolve o texto para não perder
    alert('Não foi possível enviar: ' + e.message);
  }
}

// ------------------------------------------------------------
// Polling GLOBAL: enquanto a aba estiver visível e o usuário logado,
// verifica mensagens novas em QUALQUER conversa minha. Isso permite:
//  - abrir a janela automaticamente quando chega mensagem (nada aberto);
//  - atualizar a janela aberta em tempo (quase) real;
//  - contar não-lidas quando a janela está minimizada.
// Roda a cada 4s. O gating por visibilidade evita gasto com a aba em 2º plano.
// ------------------------------------------------------------
function chatStartPoll() {
  if (chatPollTimer) return;
  chatPollTimer = setInterval(chatPoll, 4000);
}
function _chatFloatAberta() {
  const f = document.getElementById('chat-float');
  return !!(chatAtual && f && f.style.display !== 'none');
}
function _chatMergeMeta(list) {
  (list || []).forEach(c => {
    const ex = chatConversas.find(x => x.id === c.id);
    if (ex) { ex.tipo = c.tipo; ex.nome = c.nome; ex.membros = c.membros; }
    else chatConversas.push({ id: c.id, tipo: c.tipo, nome: c.nome, membros: c.membros, ultima: null });
  });
}
async function chatPoll() {
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  if (typeof getAppToken !== 'function' || !getAppToken()) return; // só logado
  if (!_chatMe()) return;
  if (chatCarregando) return;
  chatCarregando = true;
  try {
    const d = await chatApi('novidades', { since: chatSinceGlobal });
    if (d.conversas) _chatMergeMeta(d.conversas);
    const novas = d.novas || [];
    const maxId = d.maxId || 0;
    const me = _chatMe();

    // 1ª passada = só define a linha de base (não abre janela por msg antiga)
    if (!chatPrimed) {
      chatSinceGlobal = Math.max(chatSinceGlobal, maxId);
      chatPrimed = true;
      if (currentPage === 'chat') { await chatCarregarConversas(); chatRenderLista(); }
      return;
    }

    if (novas.length) {
      // (a) atualiza a conversa aberta
      if (chatAtual) {
        const minhas = novas.filter(m => m.conversa_id === chatAtual && m.id > chatUltimoId);
        if (minhas.length) {
          const box = document.getElementById('chat-float-body');
          const perto = box ? (box.scrollHeight - box.scrollTop - box.clientHeight < 80) : true;
          chatMsgs = chatMsgs.concat(minhas);
          chatUltimoId = chatMsgs[chatMsgs.length - 1].id;
          const recebidas = minhas.filter(m => String(m.autor_email).toLowerCase() !== me).length;
          if (_chatMinimizada() && recebidas > 0) {
            chatNaoLidas += recebidas;   // contador na janela minimizada
            chatFloatHead();
            chatFloatMsgs(false);
          } else {
            chatLidas[chatAtual] = chatUltimoId;
            chatFloatMsgs(perto);
          }
        }
      }

      // (b) mensagem recebida em conversa que NÃO está aberta → abre sozinha
      //     (só quando não há nenhuma janela aberta, pra não roubar o foco)
      const recebidasFora = novas.filter(m =>
        String(m.autor_email).toLowerCase() !== me && m.conversa_id !== chatAtual);
      if (recebidasFora.length && !_chatFloatAberta()) {
        const ultima = recebidasFora[recebidasFora.length - 1];
        await chatAbrir(ultima.conversa_id);
      }

      chatSinceGlobal = Math.max(chatSinceGlobal, maxId, ...novas.map(m => m.id));
    } else {
      chatSinceGlobal = Math.max(chatSinceGlobal, maxId);
    }

    // refresh da lista quando estou na página de Mensagens
    chatTick++;
    if (currentPage === 'chat' && chatTick % 3 === 0) {
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

// ------------------------------------------------------------
// Estilos da janela flutuante + atalhos de teclado
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('chat-float-style')) {
    const st = document.createElement('style');
    st.id = 'chat-float-style';
    st.textContent = `
      .chat-float { position:fixed; right:20px; bottom:0; width:340px; height:460px;
        max-width:calc(100vw - 24px); max-height:calc(100vh - 80px);
        background:var(--card,#fff); border:1px solid var(--border,#e2e8f0); border-bottom:none;
        border-radius:14px 14px 0 0; box-shadow:0 10px 40px rgba(2,6,23,.28);
        display:flex; flex-direction:column; z-index:5000; overflow:hidden;
        animation:chatFloatUp .18s ease-out; }
      @keyframes chatFloatUp { from{ transform:translateY(16px); opacity:0 } to{ transform:translateY(0); opacity:1 } }
      .chat-float-head { display:flex; align-items:center; gap:9px; padding:9px 10px;
        background:var(--primary,#0f2d4a); color:#fff; flex:none; }
      .chat-float-head .chat-float-x, .chat-float-head .chat-float-min {
        flex:none; width:26px; height:26px; border:none; background:rgba(255,255,255,.14);
        color:#fff; border-radius:7px; cursor:pointer; font-size:.9rem; line-height:1;
        display:flex; align-items:center; justify-content:center; }
      .chat-float-head .chat-float-x:hover { background:#ef4444; }
      .chat-float-head .chat-float-min:hover { background:rgba(255,255,255,.3); }
      .chat-float-body { flex:1; overflow-y:auto; padding:12px 12px 8px; display:flex;
        flex-direction:column; gap:1px; background:var(--bg,#f1f5f9); }
      .chat-float-form { flex:none; display:flex; gap:7px; align-items:flex-end;
        padding:8px 10px; border-top:1px solid var(--border,#e2e8f0); background:var(--card,#fff); }
      .chat-float-form textarea { flex:1; resize:none; max-height:96px; padding:8px 11px;
        border:1px solid var(--border,#e2e8f0); border-radius:18px; font-family:inherit;
        font-size:.87rem; line-height:1.35; background:var(--card,#fff); color:var(--text,#0f172a); }
      .chat-float-form button { flex:none; width:38px; height:38px; border:none; cursor:pointer;
        border-radius:50%; background:var(--primary,#0f2d4a); color:#fff; font-size:1rem; }
      .chat-float-form button:hover { filter:brightness(1.1); }
      .chat-float-badge { position:absolute; top:-5px; right:-6px; min-width:18px; height:18px;
        padding:0 4px; border-radius:9px; background:#ef4444; color:#fff; font-size:.68rem;
        font-weight:800; line-height:18px; text-align:center; box-shadow:0 0 0 2px var(--primary,#0f2d4a); }
      .chat-float.chat-float-min.chat-float-alert { animation:chatBadgePulse 1.6s ease-in-out infinite; }
      @keyframes chatBadgePulse { 0%,100%{ box-shadow:0 10px 40px rgba(2,6,23,.28) } 50%{ box-shadow:0 0 0 3px rgba(239,68,68,.45), 0 10px 40px rgba(2,6,23,.28) } }
      /* minimizada: só a barra do topo aparece */
      .chat-float.chat-float-min { height:auto !important; }
      .chat-float.chat-float-min .chat-float-body,
      .chat-float.chat-float-min .chat-float-form { display:none; }
      @media (max-width:520px){ .chat-float { right:8px; width:calc(100vw - 16px); height:70vh; } }`;
    document.head.appendChild(st);
  }

  // Enter envia (Shift+Enter = nova linha) + auto-resize
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'chat-float-input' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatEnviar(e);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'chat-float-input') {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
    }
  });

  // Polling global: começa já; enquanto não há login/token, o ciclo não faz nada.
  // É isto que permite a janela abrir sozinha quando chega mensagem em qualquer tela.
  chatStartPoll();
});
