// ============================================================
// ia-assistente.js — Assistente de IA do Compliance Hub
// ============================================================
// Chama a Edge Function "ia-assistente" (que fala com o Gemini no
// servidor). A chave do Gemini NUNCA fica aqui — só no servidor.
// Usa o mesmo x-app-token do login (via _efH).
// ============================================================

const IA_URL = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') + '/functions/v1/ia-assistente';

async function iaChamar(action, payload) {
  const headers = (typeof _efH === 'function')
    ? _efH()
    : { 'Content-Type': 'application/json', 'x-app-token': (typeof getAppToken === 'function' ? getAppToken() : '') };
  const r = await fetch(IA_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(Object.assign({ action }, payload || {})),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + r.status));
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ---- util de escape (usa o global se existir) ----
function _iaEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- mini-renderizador de markdown (seguro: escapa antes) ----
function iaRenderMarkdown(txt) {
  const linhas = String(txt || '').split('\n');
  let html = '';
  let emLista = false;
  const fechaLista = () => { if (emLista) { html += '</ul>'; emLista = false; } };
  for (let ln of linhas) {
    let l = _iaEsc(ln.trimEnd());
    // negrito **texto**
    l = l.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const t = l.trim();
    if (t === '') { fechaLista(); continue; }
    if (/^#{1,6}\s/.test(ln.trim())) {
      fechaLista();
      html += '<h4 style="margin:14px 0 6px;color:var(--text,#111)">' + t.replace(/^#{1,6}\s/, '') + '</h4>';
    } else if (/^(\-|\*|•)\s+/.test(ln.trim())) {
      if (!emLista) { html += '<ul style="margin:4px 0 4px 18px;padding:0">'; emLista = true; }
      html += '<li style="margin:3px 0">' + t.replace(/^(\-|\*|•)\s+/, '') + '</li>';
    } else if (/^\d+[\.\)]\s+/.test(ln.trim())) {
      fechaLista();
      html += '<div style="margin:3px 0 3px 4px">' + t + '</div>';
    } else {
      fechaLista();
      html += '<p style="margin:6px 0">' + t + '</p>';
    }
  }
  fechaLista();
  return html;
}

// ---- modal reaproveitável ----
function _iaGarantirModal() {
  let el = document.getElementById('ia-modal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'ia-modal';
  el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:16px';
  el.innerHTML =
    '<div style="background:var(--card,#fff);color:var(--text,#111);max-width:720px;width:100%;max-height:85vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(100,116,139,.2)">' +
        '<strong id="ia-modal-titulo" style="font-size:1rem"></strong>' +
        '<button onclick="iaFecharModal()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-muted,#64748b);line-height:1">&times;</button>' +
      '</div>' +
      '<div id="ia-modal-corpo" style="padding:16px 18px;overflow:auto;font-size:.9rem;line-height:1.5"></div>' +
      '<div style="padding:10px 18px;border-top:1px solid rgba(100,116,139,.2);text-align:right">' +
        '<button onclick="iaFecharModal()" class="btn btn-sm" style="background:#e2e8f0;color:#334155">Fechar</button>' +
      '</div>' +
    '</div>';
  el.addEventListener('click', (ev) => { if (ev.target === el) iaFecharModal(); });
  document.body.appendChild(el);
  return el;
}
function iaFecharModal() { const el = document.getElementById('ia-modal'); if (el) el.style.display = 'none'; }
function iaModal(titulo, corpoHtml) {
  const el = _iaGarantirModal();
  document.getElementById('ia-modal-titulo').textContent = titulo;
  document.getElementById('ia-modal-corpo').innerHTML = corpoHtml;
  el.style.display = 'flex';
}
function iaLoadingModal(titulo, msg) {
  iaModal(titulo,
    '<div style="display:flex;align-items:center;gap:12px;padding:10px 0">' +
      '<div style="width:22px;height:22px;border:3px solid #ddd;border-top-color:#7c3aed;border-radius:50%;animation:iaSpin .8s linear infinite"></div>' +
      '<span>' + _iaEsc(msg) + '</span>' +
    '</div>' +
    '<style>@keyframes iaSpin{to{transform:rotate(360deg)}}</style>');
}

// ============================================================
// Ação: Analisar denúncias (Canal de Denúncia)
// ============================================================
async function iaAnalisarDenuncias() {
  const lista = (typeof getFiltered === 'function')
    ? getFiltered()
    : ((typeof DB !== 'undefined' && DB.denuncias) ? DB.denuncias : []);
  if (!lista || lista.length === 0) {
    iaModal('🧠 Analisar denúncias', '<p>Não há denúncias no filtro atual para analisar. Ajuste os filtros (ex.: escolha uma filial) e tente de novo.</p>');
    return;
  }
  const filtroFilial = (document.getElementById('filtro-dn-filial2') || { value: '' }).value;
  const filial = filtroFilial || 'Todas as filiais';
  const denuncias = lista.map((d) => ({
    data: d.data || '',
    setor: d.setor || '',
    status: d.status || '',
    relato: d.relato || d.descricao || '',
  }));
  iaLoadingModal('🧠 Analisando denúncias', 'Agrupando por padrão e situação — pode levar alguns segundos...');
  try {
    const { resultado } = await iaChamar('denuncias', { filial, denuncias });
    iaModal('🧠 Análise — ' + filial + ' (' + denuncias.length + ' denúncias)', iaRenderMarkdown(resultado));
  } catch (e) {
    iaModal('⚠️ Erro na análise', '<p style="color:#b91c1c">' + _iaEsc(e.message) + '</p>');
  }
}

// ============================================================
// Ação: Investigar com IA (Due Diligence 2)
// ============================================================
async function dd2InvestigarIA() {
  // Roda a investigação oficial normal primeiro (popula os globais do DD2).
  try {
    if (typeof dd2Iniciar === 'function') await dd2Iniciar();
  } catch (e) { /* segue com o que tiver */ }

  // Globais do DD2 são declarados com `let` (não viram window.*); acessa
  // por nome com guarda typeof pra não quebrar se o módulo não existir.
  const dados = {
    pesquisa:  (typeof dd2UltimaPesquisa    !== 'undefined' && dd2UltimaPesquisa)    || null,
    cadastral: (typeof dd2CadastralData      !== 'undefined' && dd2CadastralData)      || null,
    socios:    (typeof dd2SociosData         !== 'undefined' && dd2SociosData)         || [],
    sancoes:   (typeof dd2SancoesData        !== 'undefined' && dd2SancoesData)        || null,
    peps:      (typeof dd2PepData            !== 'undefined' && dd2PepData)            || [],
    contratos: (typeof dd2ContratosData      !== 'undefined' && dd2ContratosData)      || [],
    processos: (typeof dd2TodosProcessosData !== 'undefined' && dd2TodosProcessosData) ||
               (typeof dd2JudicialData        !== 'undefined' && dd2JudicialData)        || [],
    midia:     (typeof dd2MidiaData          !== 'undefined' && dd2MidiaData)          || [],
    bolsa:     (typeof dd2BolsaData          !== 'undefined' && dd2BolsaData)          || [],
  };
  if (!dados.pesquisa && !dados.cadastral) {
    iaModal('🧠 Investigar com IA', '<p>Preencha o CNPJ/CPF e tente novamente — não há dados de investigação para resumir.</p>');
    return;
  }
  iaLoadingModal('🧠 Analisando com IA', 'Cruzando os dados oficiais e montando o resumo de risco...');
  try {
    const { resultado } = await iaChamar('dd2', { dados });
    iaModal('🧠 Resumo de risco (IA)', iaRenderMarkdown(resultado));
  } catch (e) {
    iaModal('⚠️ Erro na análise', '<p style="color:#b91c1c">' + _iaEsc(e.message) + '</p>');
  }
}
