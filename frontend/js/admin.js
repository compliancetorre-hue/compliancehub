// ════════════════════════════════════════════════════
// SISTEMA DE LOGS DE AUDITORIA
// ════════════════════════════════════════════════════
const LOGS_KEY = 'ch_audit_logs_v1';
const LOGS_MAX_LOCAL = 500; // máximo no localStorage

// Tipos de ação com ícone e cor
const LOG_TIPOS = {
  'login':       { icon:'🔐', label:'Login',           cls:'login'  },
  'logout':      { icon:'🚪', label:'Logout',          cls:'login'  },
  'create':      { icon:'➕', label:'Criação',         cls:'create' },
  'update':      { icon:'✏️', label:'Edição',          cls:'update' },
  'delete':      { icon:'🗑️', label:'Exclusão',       cls:'delete' },
  'import':      { icon:'📥', label:'Importação',      cls:'import' },
  'status':      { icon:'🔄', label:'Status alterado', cls:'update' },
  'permissao':   { icon:'🔑', label:'Permissão',       cls:'update' },
  'senha':       { icon:'🔒', label:'Senha',           cls:'update' },
  'usuario':     { icon:'👤', label:'Usuário',         cls:'create' },
  'pesquisa':    { icon:'🔍', label:'Pesquisa',         cls:'update' },
};

// Módulos legíveis
const LOG_MODULOS = {
  'denuncias':'Canal de Denúncia', 'riscos':'Mapeamento de Risco',
  'controles':'Controles Internos', 'planos':'Planos de Ação',
  'filiais':'Filiais e Setores', 'agenda':'Agenda',
  'rm_planos':'Planos RM', 'usuarios':'Usuários', 'sistema':'Sistema',
  'fbboards':'Flow Board', 'permissoes':'Permissões',
  'due-diligence':'Due Diligence', 'due-diligence2':'Due Diligence 2',
  'funcionarios':'Funcionários',
};

let _logsCache = null; // cache em memória para a sessão

// ── REGISTRAR LOG
async function auditLog(acao, modulo, descricao, detalhes = {}) {
  if(!currentUser) return;
  const entry = {
    id: Date.now() + Math.random().toString(36).slice(2,6),
    ts: new Date().toISOString(),
    email: currentUser.email,
    nome: currentUser.nome,
    perfil: currentUser.perfil,
    acao,
    modulo,
    descricao,
    detalhes,
  };

  // Salvar localmente
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift(entry); // mais recente primeiro
    if(logs.length > LOGS_MAX_LOCAL) logs.length = LOGS_MAX_LOCAL;
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    _logsCache = logs;
  } catch(e) {}

  // Salvar no Supabase
  if(USE_SUPABASE) {
    sbUpsert('audit_logs', {
      id: entry.id,
      ts: entry.ts,
      email: entry.email,
      nome: entry.nome,
      perfil: entry.perfil,
      acao: entry.acao,
      modulo: entry.modulo,
      descricao: entry.descricao,
      detalhes: JSON.stringify(entry.detalhes || {})
    }).catch(e => console.warn('auditLog save:', e.message));
  }
}

// ── CARREGAR LOGS
async function logsLoad() {
  // Tentar Supabase (mais completo)
  if(USE_SUPABASE) {
    try {
      // order=ts.desc — sem o ".desc" a ordenação é crescente (mais antigos
      // primeiro); combinado com o limit=1000, quando a tabela passa de
      // 1000 linhas os logs de HOJE ficam de fora, sobrando só os antigos
      // (era exatamente esse o bug: "0 ações hoje" com logs de meses atrás).
      const rows = await sbGet('audit_logs', 'order=ts.desc&limit=1000');
      if(rows && rows.length > 0) {
        // rows já vem decrescente (mais recente primeiro) do servidor —
        // sem reverse aqui, senão volta a ficar crescente (antigos primeiro).
        const logs = rows.map(r => ({
          id: r.id, ts: r.ts, email: r.email, nome: r.nome,
          perfil: r.perfil, acao: r.acao, modulo: r.modulo,
          descricao: r.descricao,
          detalhes: typeof r.detalhes === 'string' ? JSON.parse(r.detalhes||'{}') : r.detalhes||{}
        }));
        _logsCache = logs;
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, LOGS_MAX_LOCAL)));
        return logs;
      }
    } catch(e) { console.warn('logsLoad Supabase:', e.message); }
  }
  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    _logsCache = raw ? JSON.parse(raw) : [];
    return _logsCache;
  } catch(e) { return []; }
}

// ── BRANDING & APARÊNCIA ──
let BRANDING = {
  nome: 'Compliance',
  subtitulo: 'Sistema de Gestão',
  corPrimaria: '#0f2d4a',
  logoUrl: ''
};

const BRANDING_KEY = 'ch_branding_config';

async function carregarBranding() {
  try {
    // Tentar carregar do Supabase primeiro
    if(USE_SUPABASE && SUPABASE_URL) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/branding?limit=1`, {
          headers: _efH()
        });
        if(r.ok) {
          const data = await r.json();
          if(data && data.length > 0) {
            const config = data[0];
            BRANDING = {
              nome: config.nome || 'Compliance',
              subtitulo: config.subtitulo || 'Sistema de Gestão',
              corPrimaria: config.cor_primaria || '#0f2d4a',
              logoUrl: config.logo_url || ''
            };
            localStorage.setItem(BRANDING_KEY, JSON.stringify(BRANDING));
            aplicarBranding();
            return;
          }
        }
      } catch(e) { try { const r2=await fetch(`${SUPABASE_URL}/rest/v1/branding?limit=1`,{headers:{'apikey':getActiveKey(),'Authorization':'Bearer '+getActiveKey()}}); if(r2.ok){const d2=await r2.json();if(d2&&d2.length>0){const c2=d2[0];BRANDING={nome:c2.nome||'Compliance',subtitulo:c2.subtitulo||'Sistema de Gestão',corPrimaria:c2.cor_primaria||'#0f2d4a',logoUrl:c2.logo_url||''};localStorage.setItem(BRANDING_KEY,JSON.stringify(BRANDING));aplicarBranding();return;}} } catch(e2){} console.warn('Erro ao carregar branding do Supabase:', e.message); }
    }

    // Fallback: localStorage
    const saved = localStorage.getItem(BRANDING_KEY);
    if(saved) {
      const config = JSON.parse(saved);
      BRANDING = { ...BRANDING, ...config };
      aplicarBranding();
    } else {
      aplicarBranding(); // Aplicar padrão
    }
  } catch(e) { console.warn('Erro ao carregar branding:', e); }
}

function aplicarBranding() {
  // Mudar nome na sidebar
  const brandElements = document.querySelectorAll('.brand');
  brandElements.forEach(el => el.textContent = BRANDING.nome);

  // Mudar cor primária
  document.documentElement.style.setProperty('--primary', BRANDING.corPrimaria);

  // Mudar logo se configurada
  if(BRANDING.logoUrl) {
    const logoElements = document.querySelectorAll('[class*="logo"], [id*="logo"]');
    logoElements.forEach(el => {
      if(el.tagName === 'IMG') el.src = BRANDING.logoUrl;
    });
  }

  // Mudar title da página
  document.title = `${BRANDING.nome} · ${BRANDING.subtitulo}`;
}

function abrirPainelBranding() {
  if(!isAdmin()) { alert('Apenas o administrador pode alterar o branding.'); return; }
  openModal('modal-branding');

  // Preencher form com valores atuais
  document.getElementById('branding-nome').value = BRANDING.nome;
  document.getElementById('branding-subtitulo').value = BRANDING.subtitulo;
  document.getElementById('branding-cor-primaria').value = BRANDING.corPrimaria;
  document.getElementById('branding-cor-primaria-hex').value = BRANDING.corPrimaria;
  document.getElementById('branding-logo-url').value = BRANDING.logoUrl;

  // Preview da logo
  if(BRANDING.logoUrl) {
    const preview = document.getElementById('branding-logo-preview');
    const vazio = document.getElementById('branding-logo-vazio');
    preview.src = BRANDING.logoUrl;
    preview.style.display = 'block';
    vazio.style.display = 'none';
  }

  // Sincronizar cor ao mudar no input color
  document.getElementById('branding-cor-primaria').addEventListener('change', function() {
    document.getElementById('branding-cor-primaria-hex').value = this.value;
  });

  // Sincronizar cor ao mudar no input hex
  document.getElementById('branding-cor-primaria-hex').addEventListener('change', function() {
    const hexRegex = /^#[0-9A-F]{6}$/i;
    if(hexRegex.test(this.value)) {
      document.getElementById('branding-cor-primaria').value = this.value;
    }
  });

  // Preview da logo ao mudar URL
  document.getElementById('branding-logo-url').addEventListener('change', function() {
    const preview = document.getElementById('branding-logo-preview');
    const vazio = document.getElementById('branding-logo-vazio');
    if(this.value.trim()) {
      preview.src = this.value;
      preview.onerror = function() {
        preview.style.display = 'none';
        vazio.style.display = 'block';
        alert('❌ Erro ao carregar a imagem. Verifique a URL.');
      };
      preview.onload = function() {
        preview.style.display = 'block';
        vazio.style.display = 'none';
      };
    } else {
      preview.style.display = 'none';
      vazio.style.display = 'block';
    }
  });
}

async function salvarBranding() {
  const nome = document.getElementById('branding-nome').value.trim() || 'Compliance';
  const subtitulo = document.getElementById('branding-subtitulo').value.trim() || 'Sistema de Gestão';
  const corPrimaria = document.getElementById('branding-cor-primaria').value || '#0f2d4a';
  const logoUrl = document.getElementById('branding-logo-url').value.trim() || '';

  BRANDING = { nome, subtitulo, corPrimaria, logoUrl };

  try {
    // Salvar no localStorage primeiro (sempre funciona)
    localStorage.setItem(BRANDING_KEY, JSON.stringify(BRANDING));
    aplicarBranding();

    // Tentar salvar no Supabase também
    if(USE_SUPABASE && SUPABASE_URL) {
      const payload = {
        nome,
        subtitulo,
        cor_primaria: corPrimaria,
        logo_url: logoUrl,
        atualizado_por: currentUser?.email || 'admin@torre.com.br'
      };

      try {
        // Primeiro, tentar atualizar via REST (mais simples que Edge Function)
        const r = await fetch(`${SUPABASE_URL}/rest/v1/branding?id=eq.1`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON,
            'Authorization': 'Bearer ' + SUPABASE_ANON
          },
          body: JSON.stringify(payload)
        });

        if(r.ok) {
          console.log('✅ Branding salvo no Supabase');
          auditLog('update', 'branding', 'Branding alterado', { nome, subtitulo, corPrimaria });
          alert('✅ Branding salvo com sucesso para todos os usuários!');
        } else {
          console.warn('Falha Supabase:', r.status, await r.text());
          alert('⚠️ Branding salvo localmente. Servidor pode estar indisponível.');
        }
      } catch(e) {
        console.warn('Erro ao enviar para Supabase:', e.message);
        alert('⚠️ Branding salvo localmente. Servidor pode estar indisponível.');
      }
    } else {
      auditLog('update', 'branding', 'Branding alterado (local)', { nome, subtitulo, corPrimaria });
      alert('✅ Branding salvo com sucesso!');
    }

    closeModal('modal-branding');
  } catch(e) {
    console.error('Erro ao salvar branding:', e);
    alert('❌ Erro ao salvar: ' + e.message);
  }
}

async function resetarBranding() {
  if(confirm('Tem certeza que deseja restaurar as configurações padrão?\n\nIsso afetará todos os usuários!')) {
    try {
      BRANDING = {
        nome: 'Compliance',
        subtitulo: 'Sistema de Gestão',
        corPrimaria: '#0f2d4a',
        logoUrl: ''
      };

      // Salvar localmente
      localStorage.removeItem(BRANDING_KEY);

      // Resetar no Supabase
      if(USE_SUPABASE && SUPABASE_URL) {
        try {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/branding?id=eq.1`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON,
              'Authorization': 'Bearer ' + SUPABASE_ANON
            },
            body: JSON.stringify({
              nome: 'Compliance',
              subtitulo: 'Sistema de Gestão',
              cor_primaria: '#0f2d4a',
              logo_url: '',
              atualizado_por: currentUser?.email || 'admin@torre.com.br'
            })
          });

          if(!r.ok) {
            console.warn('Erro ao resetar no Supabase');
          }
        } catch(e) {
          console.warn('Erro ao resetar:', e);
        }
      }

      aplicarBranding();
      auditLog('update', 'branding', 'Branding restaurado para padrão', {});
      alert('✅ Padrão restaurado!');
      closeModal('modal-branding');
    } catch(e) {
      alert('❌ Erro: ' + e.message);
    }
  }
}

// ── ABRIR PAINEL DE LOGS
async function abrirLogs() {
  if(!isAdmin()) { alert('Apenas o administrador pode ver os logs.'); return; }
  openModal('modal-logs');
  renderLogs('todos');
  // Recarregar do Supabase
  logsLoad().then(() => renderLogs(_logFiltroAtivo||'todos'));
}

let _logFiltroAtivo = 'todos';
let _logUserFiltro = '';

function renderLogs(filtro) {
  _logFiltroAtivo = filtro;

  // Update filter buttons
  document.querySelectorAll('.log-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filtro === filtro);
  });

  const logs = _logsCache || [];
  const filtrados = logs.filter(l => {
    if(_logUserFiltro && !l.email.includes(_logUserFiltro) && !l.nome.toLowerCase().includes(_logUserFiltro.toLowerCase())) return false;
    if(filtro === 'todos') return true;
    if(filtro === 'delete') return l.acao === 'delete';
    if(filtro === 'login')  return ['login','logout'].includes(l.acao);
    if(filtro === 'denuncias') return l.modulo === 'denuncias';
    if(filtro === 'import') return l.acao === 'import';
    return l.acao === filtro || l.modulo === filtro;
  });

  // Stats
  const hoje = new Date().toDateString();
  const logHoje = logs.filter(l => new Date(l.ts).toDateString() === hoje).length;
  const logDelete = logs.filter(l => l.acao === 'delete').length;
  const usuarios = [...new Set(logs.map(l=>l.email))].length;

  document.getElementById('log-stat-total').textContent = logs.length;
  document.getElementById('log-stat-hoje').textContent = logHoje;
  document.getElementById('log-stat-delete').textContent = logDelete;
  document.getElementById('log-stat-users').textContent = usuarios;

  // Render list
  const container = document.getElementById('logs-list');
  if(!container) return;

  if(!filtrados.length) {
    container.innerHTML = `<div class="log-empty"><div style="font-size:2.5rem;margin-bottom:10px">📋</div><div style="font-weight:700">Nenhum log encontrado</div><div style="font-size:.83rem;margin-top:6px">As ações dos usuários aparecerão aqui</div></div>`;
    return;
  }

  container.innerHTML = filtrados.map(l => {
    const tipo = LOG_TIPOS[l.acao] || { icon:'📋', label:l.acao, cls:'update' };
    const modLabel = LOG_MODULOS[l.modulo] || l.modulo;
    const dt = new Date(l.ts);
    const agora = new Date();
    const diffMin = Math.round((agora - dt) / 60000);
    let timeStr;
    if(diffMin < 1) timeStr = 'Agora';
    else if(diffMin < 60) timeStr = diffMin + 'min atrás';
    else if(diffMin < 1440) timeStr = Math.round(diffMin/60) + 'h atrás';
    else timeStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});

    // User color
    const u = USUARIOS.find(x=>x.email===l.email);
    const cor = u ? u.cor : '#64748b';

    // Detalhes extras
    const det = l.detalhes || {};
    // l.descricao, l.detalhes, l.nome e l.perfil vêm de campos de texto livre
    // digitados por qualquer usuário logado (ex.: nome pesquisado no Due
    // Diligence) — sem escapeHtml aqui, um usuário mal-intencionado injeta
    // HTML/script que roda na sessão do ADMIN quando ele abre este painel
    // (XSS armazenado com escalada de privilégio, já que quem lê o log é
    // sempre admin).
    const detStr = Object.entries(det).filter(([k])=>k!=='id').map(([k,v])=>`${escapeHtml(k)}: ${escapeHtml(String(v))}`).join(' · ');

    return `<div class="log-item">
      <div class="log-icon ${tipo.cls}">${tipo.icon}</div>
      <div class="log-meta">
        <div class="log-title">${escapeHtml(tipo.label)} — <span style="color:var(--primary)">${escapeHtml(modLabel)}</span></div>
        <div class="log-detail">${escapeHtml(l.descricao)}${detStr?'<span style="color:#94a3b8"> · '+detStr+'</span>':''}</div>
        <span class="log-user" style="background:${cor}22;color:${cor}">
          <span style="width:16px;height:16px;border-radius:50%;background:${cor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:800">${escapeHtml((l.nome||'?')[0])}</span>
          ${escapeHtml(l.nome||'')} · ${escapeHtml(l.perfil||'')}
        </span>
      </div>
      <div class="log-time">${timeStr}</div>
    </div>`;
  }).join('');
}

function logFiltrarUser(val) {
  _logUserFiltro = val;
  renderLogs(_logFiltroAtivo);
}

async function exportarLogs() {
  const logs = _logsCache || [];
  const csv = ['Data,Hora,Usuário,E-mail,Perfil,Ação,Módulo,Descrição']
    .concat(logs.map(l => {
      const dt = new Date(l.ts);
      return [
        dt.toLocaleDateString('pt-BR'),
        dt.toLocaleTimeString('pt-BR'),
        `"${l.nome}"`, l.email, l.perfil,
        l.acao, l.modulo,
        `"${(l.descricao||'').replace(/"/g,'""')}"`
      ].join(',');
    })).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'audit_logs_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}

async function limparLogsAntigos() {
  if(!confirm('Limpar logs com mais de 90 dias?\n\nLogs recentes serão mantidos.')) return;
  const cutoff = new Date(Date.now() - 90*24*60*60*1000).toISOString();
  _logsCache = (_logsCache||[]).filter(l => l.ts > cutoff);
  localStorage.setItem(LOGS_KEY, JSON.stringify(_logsCache));
  setSaveIndicator('🗑 Logs antigos removidos','var(--warn)');
  renderLogs(_logFiltroAtivo);
}
// ════════════════════════════════════════════════════
// GESTÃO DE USUÁRIOS (Admin)
// ════════════════════════════════════════════════════
const USERS_KEY = 'ch_usuarios_v1';
const CORES_AVATAR = ['#0f2d4a','#00c49a','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#10b981','#f97316','#06b6d4','#ec4899'];

async function usersLoad() {
  // Limpar array — mantém só admin — evita re-adição de excluídos
  while(USUARIOS.length > 1) USUARIOS.pop();

  // Buscar via REST direto (anon key) — independente do Edge Function
  if(USE_SUPABASE) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/settings?key=eq.usuarios_extras&select=value`,
        { headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON } }
      );
      if(r.ok) {
        const rows = await r.json();
        if(rows && rows[0] && rows[0].value) {
          const extras = JSON.parse(rows[0].value);
          if(Array.isArray(extras)) {
            extras.forEach(u => {
              if(u.email !== ADMIN_EMAIL) USUARIOS.push(u);
            });
            localStorage.setItem(USERS_KEY, JSON.stringify(extras));
            console.log('[usersLoad] OK:', extras.length, 'usuario(s)');
            return;
          }
        }
      }
    } catch(e) { console.warn('[usersLoad] REST erro:', e.message); }
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if(raw) {
      const extras = JSON.parse(raw);
      if(Array.isArray(extras))
        extras.forEach(u => { if(u.email !== ADMIN_EMAIL) USUARIOS.push(u); });
    }
  } catch(e) {}
}

async function usersSave() {
  const extras = USUARIOS.filter(u => u.email !== ADMIN_EMAIL);
  // 1. Salvar local imediatamente
  localStorage.setItem(USERS_KEY, JSON.stringify(extras));
  // 2. Salvar no Supabase via REST direto (anon key — sem depender de token)
  if(USE_SUPABASE) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + SUPABASE_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ key: 'usuarios_extras', value: JSON.stringify(extras) })
      });
      if(r.ok) console.log('[usersSave] Supabase OK —', extras.length, 'usuario(s)');
      else console.warn('[usersSave] Supabase status:', r.status);
    } catch(e) { console.warn('[usersSave] REST erro:', e.message); }

    // 3. Sincronizar com a tabela real "usuarios" — é ela que a Edge
    // Function consulta na rota /login. Antes disso, um usuário criado
    // aqui só existia em settings.usuarios_extras: aparecia na lista e
    // passava na checagem local, mas o servidor nunca achava o registro
    // e negava a entrada com "Usuário não encontrado". Isso também
    // corrige retroativamente qualquer usuário criado antes desse fix.
    await usersSyncTabelaReal(extras);
  }
}

async function usersSyncTabelaReal(extras) {
  try {
    const reais = await sbGet('usuarios', '');
    const lista = Array.isArray(reais) ? reais : [];
    const porEmail = new Map(lista.map(r => [r.email, r]));
    // O id é GERADO PELO BANCO (GENERATED ALWAYS) — mandar um valor manual
    // dá erro "Cannot insert a non-DEFAULT value into column id" (verificado
    // em produção). Só inclui id quando for update de um registro que já
    // existe; na criação, deixa o banco gerar.
    // Colunas reais da tabela (conferidas direto no Table Editor do
    // Supabase): id, email, nome, perfil, hash, avatar, cor — nada de
    // ativo/tentativas_login/filial_id, que vieram de um schema
    // desatualizado (backend antigo, não usado em produção). A tabela TEM
    // uma coluna extra "senha_hash", redundante com "hash" — e é ela que a
    // rota /login da Edge Function realmente compara (confirmado testando
    // ao vivo: só preencher "hash" dá "Senha incorreta"). Preenche as duas
    // pra cobrir os dois casos.
    for(const u of extras) {
      const existente = porEmail.get(u.email);
      const row = { nome: u.nome, email: u.email, perfil: u.perfil, hash: u.hash, senha_hash: u.hash, avatar: u.avatar, cor: u.cor };
      if(existente?.id != null) row.id = existente.id;
      try { await sbUpsert('usuarios', row); }
      catch(e) { console.warn('[usersSyncTabelaReal] Falha ao sincronizar', u.email, '—', e.message); }
    }
    const emailsAtuais = new Set(extras.map(u => u.email));
    for(const r of lista) {
      if(r.email !== ADMIN_EMAIL && !emailsAtuais.has(r.email) && r.id != null) {
        try { await sbDelete('usuarios', r.id); }
        catch(e) { console.warn('[usersSyncTabelaReal] Falha ao excluir', r.email, '—', e.message); }
      }
    }
  } catch(e) { console.warn('[usersSyncTabelaReal] Falha geral:', e.message); }
}

function abrirGerenciarUsuarios() {
  if(!isAdmin()) return;
  renderUsersModal();
  openModal('modal-usuarios');
}

function renderUsersModal() {
  const el = document.getElementById('users-list');
  if(!el) return;
  const builtinEmails = [ADMIN_EMAIL];
  el.innerHTML = USUARIOS.map(u => {
    const isBuiltin = builtinEmails.includes(u.email);
    const isAdminUser = u.email === 'admin@torre.com.br';
    return `<div class="user-mgmt-card">
      <div class="perm-avatar" style="background:${u.cor||'#64748b'}">${u.avatar||'??'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.88rem">${u.nome}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${u.email}</div>
        <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
          <span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700">${u.perfil}</span>
          ${isBuiltin?'<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700">Padrão</span>':'<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700">Criado</span>'}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-direction:column;align-items:flex-end">
        ${!isAdminUser?`<button onclick="abrirAlterarSenha('${u.email}','${u.nome}')" class="btn btn-outline btn-sm" style="font-size:.73rem;white-space:nowrap">🔑 Alterar Senha</button>`:''}
        ${!isBuiltin?`<button onclick="confirmarExcluirUsuario('${u.email}','${u.nome}')" class="btn btn-danger btn-sm" style="font-size:.73rem">🗑 Excluir</button>`:''}
      </div>
    </div>`;
  }).join('');
}

let _novoUserPerfil = 'Compliance';
let _novoUserCor = '#00c49a';

function abrirNovoUsuario() {
  if(!isAdmin()) return;
  _novoUserPerfil = 'Compliance'; _novoUserCor = '#00c49a';
  ['nu-nome','nu-email','nu-senha','nu-senha2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const erroEl = document.getElementById('nu-erro'); if(erroEl) erroEl.textContent='';
  const stEl = document.getElementById('nu-strength'); if(stEl) stEl.className='senha-strength';
  document.querySelectorAll('.perfil-opt').forEach(el=>el.classList.toggle('selected',el.dataset.perfil==='Compliance'));
  document.querySelectorAll('.cor-opt').forEach(el=>el.classList.toggle('selected',el.dataset.cor==='#00c49a'));
  _renderNovoUserPerms('Compliance');
  openModal('modal-novo-usuario');
}

function nuSelecionarPerfil(perfil, cor) {
  _novoUserPerfil = perfil;
  if(cor) { _novoUserCor=cor; document.querySelectorAll('.cor-opt').forEach(e=>e.classList.toggle('selected',e.dataset.cor===cor)); }
  document.querySelectorAll('.perfil-opt').forEach(e=>e.classList.toggle('selected',e.dataset.perfil===perfil));
  _renderNovoUserPerms(perfil);
}

function nuSelecionarCor(cor) {
  _novoUserCor=cor;
  document.querySelectorAll('.cor-opt').forEach(e=>e.classList.toggle('selected',e.dataset.cor===cor));
}

function _renderNovoUserPerms(perfil) {
  const container = document.getElementById('nu-perms');
  if(!container) return;
  const defaultPerms = PERM_PADRAO[perfil]||[];
  container.innerHTML = `<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px">Permissões (baseadas no perfil — personalizável):</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
      ${MODULOS.map(m => {
        const checked=defaultPerms.includes(m.id);
        return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px solid ${checked?'var(--accent)':'var(--border)'};background:${checked?'rgba(0,196,154,.06)':'var(--card)'};cursor:pointer;font-size:.78rem;font-weight:600;transition:all .15s">
          <input type="checkbox" id="nu-perm-${m.id}" ${checked?'checked':''} style="width:15px;height:15px;accent-color:var(--primary)">
          ${m.icon} ${m.label}${m.restrito?'<span style="font-size:.65rem;color:#9333ea;margin-left:auto">🔒</span>':''}
        </label>`;
      }).join('')}
    </div>`;
}

function nuSenhaStrength(val) {
  const bar=document.getElementById('nu-strength'); if(!bar) return;
  if(!val.length){bar.className='senha-strength';return;}
  const score=(val.length>=8?1:0)+(/[A-Z]/.test(val)?1:0)+(/[0-9]/.test(val)?1:0)+(/[^A-Za-z0-9]/.test(val)?1:0);
  bar.className='senha-strength '+(score<=1?'strength-weak':score<=2?'strength-medium':'strength-strong');
}

async function salvarNovoUsuario() {
  const nome=document.getElementById('nu-nome').value.trim();
  const email=document.getElementById('nu-email').value.trim().toLowerCase();
  const senha=document.getElementById('nu-senha').value;
  const senha2=document.getElementById('nu-senha2').value;
  const erro=document.getElementById('nu-erro');
  if(!nome){erro.textContent='Informe o nome.';return;}
  if(!email||!email.includes('@')){erro.textContent='E-mail inválido.';return;}
  // Recarregar antes de verificar duplicata
  await usersLoad();
  if(USUARIOS.find(u=>u.email===email)){erro.textContent='Este e-mail já está cadastrado.';return;}
  if(!senha||senha.length<6){erro.textContent='Senha deve ter pelo menos 6 caracteres.';return;}
  if(senha!==senha2){erro.textContent='As senhas não conferem.';return;}
  erro.textContent='';
  const palavras=nome.split(' ').filter(p=>p.length>0);
  const avatar=palavras.length>=2?(palavras[0][0]+palavras[palavras.length-1][0]).toUpperCase():nome.substring(0,2).toUpperCase();
  const hash=await _hashSenha(email,senha);
  const perms=MODULOS.filter(m=>{const el=document.getElementById(`nu-perm-${m.id}`);return el&&el.checked;}).map(m=>m.id);
  const novoUser={email,hash,nome,perfil:_novoUserPerfil,avatar,cor:_novoUserCor};
  USUARIOS.push(novoUser);
  PERMISSOES[email]=perms;
  permSave();
  await usersSave();
  closeModal('modal-novo-usuario');
  renderUsersModal();
  auditLog('usuario', 'usuarios', `Usuário "${nome}" criado`, {email, perfil:_novoUserPerfil});
  setSaveIndicator(`✅ Usuário ${nome} criado — sincronizado automaticamente`,'var(--accent)');
}

async function confirmarExcluirUsuario(email, nome) {
  if(!confirm(`Excluir "${nome}" (${email})?\n\nO usuário perderá todo o acesso ao sistema.`)) return;
  // Remove do array em memória
  const idx = USUARIOS.findIndex(u => u.email === email);
  if(idx >= 0) USUARIOS.splice(idx, 1);
  delete PERMISSOES[email];
  // Salvar sequencialmente para garantir consistência no servidor
  await usersSave();
  await permSave();
  auditLog('delete', 'usuarios', `Usuário "${nome}" excluído`, {email});
  renderUsersModal();
  setSaveIndicator(`🗑 Usuário "${nome}" removido e sincronizado`, 'var(--warn)');
}

function abrirAlterarSenha(email,nome) {
  document.getElementById('ap-email-label').textContent=`${nome} (${email})`;
  document.getElementById('ap-email-hidden').value=email;
  ['ap-senha-atual','ap-senha-nova','ap-senha-nova2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const e=document.getElementById('ap-erro');if(e)e.textContent='';
  const s=document.getElementById('ap-strength');if(s)s.className='senha-strength';
  openModal('modal-alterar-senha');
}

function abrirAlterarMinhaSenha() {
  if(!currentUser) return;
  abrirAlterarSenha(currentUser.email, currentUser.nome);
}

async function salvarNovaSenha() {
  const email=document.getElementById('ap-email-hidden').value;
  const atual=document.getElementById('ap-senha-atual').value;
  const nova=document.getElementById('ap-senha-nova').value;
  const nova2=document.getElementById('ap-senha-nova2').value;
  const erro=document.getElementById('ap-erro');
  erro.textContent='';
  const user=USUARIOS.find(u=>u.email===email);
  if(!user){erro.textContent='Usuário não encontrado.';return;}
  const ehProprioUsuario=currentUser.email===email;
  if(ehProprioUsuario || !isAdmin()) {
    if(!atual){erro.textContent='Informe a senha atual.';return;}
    const hashAtual=await _hashSenha(email,atual);
    if(hashAtual!==user.hash){erro.textContent='Senha atual incorreta.';return;}
  }
  if(!nova||nova.length<6){erro.textContent='Nova senha deve ter pelo menos 6 caracteres.';return;}
  if(nova!==nova2){erro.textContent='As senhas não conferem.';return;}
  const novoHash=await _hashSenha(email,nova);
  user.hash=novoHash;
  await usersSave();
  closeModal('modal-alterar-senha');
  setSaveIndicator('✅ Senha alterada — sincronizada automaticamente','var(--accent)');
}

// ════════════════════════════════════════════════════
// SISTEMA DE PERMISSÕES POR MÓDULO
// ════════════════════════════════════════════════════

// Módulos do sistema com metadados
const MODULOS = [
  { id:'dashboard',      label:'Dashboard',           icon:'📊', grupo:'Visão Geral',  restrito:false },
  { id:'agenda',         label:'Agenda',              icon:'📅', grupo:'Visão Geral',  restrito:false },
  { id:'filiais',        label:'Filiais e Setores',   icon:'🏢', grupo:'Estrutura',    restrito:false },
  { id:'funcionarios',   label:'Funcionários',        icon:'👥', grupo:'Recursos Humanos', restrito:false },
  { id:'mapa-risco',     label:'Mapeamento de Risco', icon:'🗺️', grupo:'Compliance',   restrito:false },
  { id:'controles',      label:'Controles Internos',  icon:'🛡️', grupo:'Compliance',   restrito:false },
  { id:'planos-acao',    label:'Planos de Ação',      icon:'📋', grupo:'Compliance',   restrito:false },
  { id:'canal-denuncia', label:'Canal de Denúncia',   icon:'📢', grupo:'Denúncias',    restrito:true  },
  { id:'relatorios',     label:'Relatórios',          icon:'📈', grupo:'Análise',      restrito:true  },
  { id:'importar',       label:'Importar Planilha',   icon:'📥', grupo:'Análise',      restrito:false },
  { id:'flowboard',      label:'Flow Board',          icon:'🗂️', grupo:'Fluxo Visual', restrito:false },
  { id:'due-diligence',  label:'Due Diligence',       icon:'🔍', grupo:'Pesquisa',     restrito:false },
    { id:'due-diligence2', label:'Due Diligence 2', icon:'🔎', grupo:'Pesquisa',  restrito:false },
];

// Permissões padrão por perfil (sem personalização)
const PERM_PADRAO = {
  'Admin':        MODULOS.map(m=>m.id),
  'Compliance':   MODULOS.map(m=>m.id),
  'Auditoria':    MODULOS.filter(m=>!['importar'].includes(m.id)).map(m=>m.id),
  'RH':           ['dashboard','agenda','filiais'],
  'Diretoria':    MODULOS.filter(m=>!['importar','canal-denuncia'].includes(m.id)).map(m=>m.id),
  'Operações':    ['dashboard','agenda','filiais','mapa-risco','planos-acao'],
  'Visualizador': ['dashboard','filiais'],
  // Perfis personalizados (criados pelo admin) herdam Compliance por padrão
};

// Permissões salvas (admin pode personalizar por usuário)
let PERMISSOES = {}; // { 'email@...': ['dashboard','agenda',...] }
const PERM_KEY = 'ch_permissoes_v1';

function permLoad() {
  try {
    const raw = localStorage.getItem(PERM_KEY);
    if(raw) PERMISSOES = JSON.parse(raw);
  } catch(e) { PERMISSOES = {}; }
}

async function permSave() {
  localStorage.setItem(PERM_KEY, JSON.stringify(PERMISSOES));
  if(USE_SUPABASE) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + SUPABASE_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ key: 'permissoes', value: JSON.stringify(PERMISSOES) })
      });
      if(r.ok) console.log('[permSave] OK');
      else console.warn('[permSave] status:', r.status);
    } catch(e) { console.warn('[permSave] erro:', e.message); }
  }
}

async function permLoadFromSupabase() {
  if(!USE_SUPABASE) return;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?key=eq.permissoes&select=value`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON } }
    );
    if(r.ok) {
      const rows = await r.json();
      if(rows && rows[0] && rows[0].value) {
        const sbPerms = JSON.parse(rows[0].value);
        PERMISSOES = { ...PERMISSOES, ...sbPerms };
        localStorage.setItem(PERM_KEY, JSON.stringify(PERMISSOES));
        console.log('[permLoad] OK');
      }
    }
  } catch(e) { console.warn('[permLoad] erro:', e.message); }
}

function permGetUser(email) {
  if(!email) return [];
  if(email === ADMIN_EMAIL) return MODULOS.map(m=>m.id);
  // Permissão personalizada tem prioridade
  if(PERMISSOES[email]) return PERMISSOES[email];
  // Senão usa o padrão do perfil
  const user = USUARIOS.find(u=>u.email===email);
  return user ? (PERM_PADRAO[user.perfil] || MODULOS.filter(m=>!m.restrito).map(m=>m.id)) : [];
}

function canAccess(modulo) {
  if(!currentUser) return false;
  if(currentUser.email === 'admin@torre.com.br' || currentUser.perfil === 'Admin') return true;
  return permGetUser(currentUser.email).includes(modulo);
}

function isAdmin() {
  return currentUser && (currentUser.email === ADMIN_EMAIL || currentUser.perfil === 'Admin');
}

// ── Atualizar nav com base nas permissões
function permAtualizarNav() {
  MODULOS.forEach(m => {
    const el = document.querySelector(`[data-page="${m.id}"]`);
    if(!el) return;
    const tem = canAccess(m.id);
    el.classList.toggle('nav-item-locked', !tem);
    el.style.pointerEvents = tem ? '' : 'none';
    el.title = tem ? '' : 'Sem permissão — solicite acesso ao administrador';
  });
}

// ── Interceptar goto para verificar permissão
function goto(page, el) {
  if(!canAccess(page)) {
    const modulo = MODULOS.find(m=>m.id===page);
    const nome = modulo ? modulo.label : page;
    _showPermDenied(nome);
    return;
  }
  _gotoImpl(page, el);
}

function _showPermDenied(modulo) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:3rem;margin-bottom:12px">🔒</div>
      <div style="font-size:1.1rem;font-weight:800;color:#1e293b;margin-bottom:8px">Acesso Restrito</div>
      <div style="font-size:.88rem;color:#64748b;line-height:1.6;margin-bottom:20px">
        Você não tem permissão para acessar o módulo <strong>${modulo}</strong>.<br>
        Solicite acesso ao administrador do sistema.
      </div>
      <div style="font-size:.8rem;color:#94a3b8;margin-bottom:16px">👤 admin@torre.com.br</div>
      <button onclick="this.closest('div[style]').remove()"
        style="background:var(--primary);color:#fff;border:none;padding:10px 28px;border-radius:8px;font-weight:700;cursor:pointer">
        Entendi
      </button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

// ════════════════════════════════════════════════════
// MODAL DE GERENCIAMENTO DE PERMISSÕES (só Admin)
// ════════════════════════════════════════════════════
function abrirGerenciarPermissoes() {
  if(!isAdmin()) { alert('Apenas o administrador pode gerenciar permissões.'); return; }
  renderPermModal();
  openModal('modal-permissoes');
}

function renderPermModal() {
  const container = document.getElementById('perm-users-list');
  if(!container) return;

  const outrosUsuarios = USUARIOS.filter(u => u.email !== ADMIN_EMAIL);

  if(!outrosUsuarios.length) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:10px">👥</div>
      <div style="font-weight:700;margin-bottom:6px">Nenhum usuário criado ainda</div>
      <div style="font-size:.83rem">Vá em <strong>👥 Gerenciar Usuários</strong> para criar o primeiro usuário.</div>
    </div>`;
    return;
  }

  container.innerHTML = outrosUsuarios.map(user => {
    const perms = permGetUser(user.email);
    const modulosRestritos = MODULOS.filter(m => m.restrito);
    const temTodos = MODULOS.every(m => perms.includes(m.id));

    return `
    <div class="perm-user-card" id="perm-card-${user.email.replace('@','_').replace('.','_')}">
      <div class="perm-avatar" style="background:${user.cor}">${user.avatar}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.9rem">${user.nome}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${user.email} · <em>${user.perfil}</em></div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <button onclick="permExpandir('${user.email}')" class="btn btn-outline btn-sm" style="font-size:.75rem">
          ⚙️ Configurar módulos
        </button>
        <button onclick="permDarTudo('${user.email}')" class="btn btn-outline btn-sm" style="font-size:.75rem;color:var(--accent)">
          ✅ Liberar tudo
        </button>
        <button onclick="permRevogarTudo('${user.email}')" class="btn btn-danger btn-sm" style="font-size:.75rem">
          🚫 Revogar tudo
        </button>
      </div>
      <div id="perm-expand-${user.email.replace(/[@.]/g,'_')}" style="display:none;width:100%;margin-top:12px">
        ${renderPermModulos(user.email, perms)}
      </div>
    </div>`;
  }).join('');
}

function renderPermModulos(email, perms) {
  const grupos = [...new Set(MODULOS.map(m=>m.grupo))];
  return grupos.map(grupo => {
    const mods = MODULOS.filter(m=>m.grupo===grupo);
    return `
      <div class="perm-section-title">${grupo}</div>
      <div class="perm-modules">
        ${mods.map(m => {
          const tem = perms.includes(m.id);
          return `
            <div class="perm-mod-item ${tem?'granted':'denied'}" id="perm-mod-${email.replace(/[@.]/g,'_')}-${m.id}"
              onclick="permToggle('${email}','${m.id}')">
              <span style="font-size:1.1rem">${m.icon}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:.8rem;font-weight:700">${m.label}</div>
                ${m.restrito?'<div style="font-size:.68rem;color:#9333ea;font-weight:600">🔒 Acesso restrito</div>':''}
              </div>
              <button class="perm-toggle ${tem?'on':'off'}" onclick="event.stopPropagation();permToggle('${email}','${m.id}')"></button>
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function permExpandir(email) {
  const key = email.replace(/[@.]/g,'_');
  const el = document.getElementById(`perm-expand-${key}`);
  if(!el) return;
  const visible = el.style.display !== 'none';
  // Fechar todos
  document.querySelectorAll('[id^="perm-expand-"]').forEach(e => e.style.display='none');
  if(!visible) el.style.display='block';
}

async function permToggle(email, modulo) {
  if(!PERMISSOES[email]) {
    PERMISSOES[email] = [...permGetUser(email)];
  }
  const idx = PERMISSOES[email].indexOf(modulo);
  if(idx >= 0) PERMISSOES[email].splice(idx, 1);
  else PERMISSOES[email].push(modulo);
  await permSave();
  permAtualizarNav();

  // Atualizar UI do toggle
  const key = email.replace(/[@.]/g,'_');
  const item = document.getElementById(`perm-mod-${key}-${modulo}`);
  if(item) {
    const tem = PERMISSOES[email].includes(modulo);
    item.className = `perm-mod-item ${tem?'granted':'denied'}`;
    const btn = item.querySelector('.perm-toggle');
    if(btn) btn.className = `perm-toggle ${tem?'on':'off'}`;
  }
  setSaveIndicator('✅ Permissão atualizada','var(--accent)');
}

async function permDarTudo(email) {
  PERMISSOES[email] = MODULOS.map(m=>m.id);
  await permSave();
  permAtualizarNav();
  renderPermModal();
  setSaveIndicator(`✅ Acesso total liberado para ${email}`,'var(--accent)');
}

async function permRevogarTudo(email) {
  if(!confirm(`Revogar TODOS os acessos de ${email}?

O usuário não conseguirá acessar nenhum módulo.`)) return;
  PERMISSOES[email] = [];
  await permSave();
  permAtualizarNav();
  renderPermModal();
  setSaveIndicator(`⛔ Acesso revogado para ${email}`,'var(--danger)');
}

// ══════════════════════════════════════════
// PAINEL ADMIN — GERENCIAR DADOS
// ══════════════════════════════════════════
function openAdminPanel() {
  const size = getDBSizeKB();
  const savedAt = (() => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if(!raw) return 'Nunca salvo';
      const snap = JSON.parse(raw);
      return snap._savedAt
        ? new Date(snap._savedAt).toLocaleString('pt-BR')
        : 'Desconhecido';
    } catch(e) { return 'Erro'; }
  })();
  // Show Supabase connection status
  const sbStatusEl = document.getElementById('admin-sb-status');
  if(sbStatusEl) {
    sbStatusEl.textContent = USE_SUPABASE
      ? '🟢 Supabase configurado (' + SUPABASE_URL.replace('https://','').split('.')[0] + '.supabase.co)'
      : '🔴 Supabase não configurado — dados salvos só neste navegador';
    sbStatusEl.style.color = USE_SUPABASE ? 'var(--accent)' : 'var(--danger)';
  }

  document.getElementById('admin-size').textContent = size + ' KB';
  document.getElementById('admin-saved-at').textContent = savedAt;
  document.getElementById('admin-denuncias-count').textContent = DB.denuncias.length;
  document.getElementById('admin-filiais-count').textContent = DB.filiais.length;
  document.getElementById('admin-controles-count').textContent = DB.controles.length;
  document.getElementById('admin-planos-count').textContent = DB.planos.length;
  document.getElementById('admin-riscos-count').textContent = DB.riscos.length;
  openModal('modal-admin');
}

function adminSaveNow() {
  saveDB();
  const btn = document.getElementById('btn-admin-save');
  btn.textContent = '✅ Salvo!';
  setTimeout(() => { btn.textContent = '💾 Salvar Agora'; }, 1500);
  openAdminPanel(); // refresh stats
}

function adminExportJSON() {
  const snap = {
    filiais: DB.filiais, riscos: DB.riscos,
    controles: DB.controles, planos: DB.planos,
    denuncias: DB.denuncias, fbBoards: DB.fbBoards,
    _ids: DB._ids, _exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(snap, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'compliance_hub_backup_' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
}

function adminImportJSON(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const snap = JSON.parse(ev.target.result);
      if(!snap.denuncias) { alert('Arquivo inválido — não é um backup do Compliance Hub.'); return; }
      if(!confirm(`Importar backup de ${new Date(snap._exportedAt||Date.now()).toLocaleString('pt-BR')}?\n\nIsso substituirá TODOS os dados atuais.\n\nContinuar?`)) return;
      DB.filiais   = snap.filiais   || DB.filiais;
      DB.riscos    = snap.riscos    || DB.riscos;
      DB.controles = snap.controles || DB.controles;
      DB.planos    = snap.planos    || DB.planos;
      DB.denuncias = snap.denuncias || DB.denuncias;
      DB.fbBoards  = snap.fbBoards  || DB.fbBoards;
      DB._ids      = snap._ids      || DB._ids;
      saveDB();
      populateFilialSelects();
      populateRelSelectsForce();
      renderDashboard();
      closeModal('modal-admin');
      alert('✅ Backup importado com sucesso! ' + DB.denuncias.length + ' denúncias carregadas.');
    } catch(err) {
      alert('Erro ao importar: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

async function adminSyncSupabase() {
  if(!USE_SUPABASE) {
    alert('⚠️ Supabase não configurado.\n\nAbra o arquivo HTML e substitua os valores:\n- SUPABASE_URL\n- SUPABASE_ANON_KEY');
    return;
  }
  closeModal('modal-admin');
  const ok = await loadFromSupabase();
  if(ok) {
    populateFilialSelects();
    populateRelSelectsForce();
    renderDashboard();
    if(typeof renderMapaRisco === 'function') renderMapaRisco();
    alert('✅ Dados sincronizados com sucesso!\n\n' + DB.riscos.length + ' riscos, ' + DB.denuncias.length + ' denúncias carregadas da nuvem.');
  } else {
    alert('❌ Falha ao conectar ao Supabase.\n\nVerifique:\n1. URL e chave corretas\n2. Conexão com a internet\n3. Políticas RLS no Supabase');
  }
}

// Push ALL local data to Supabase (resolve inconsistências entre dispositivos)
async function adminPushToSupabase() {
  if(!USE_SUPABASE) { alert('Supabase não configurado.'); return; }
  if(!confirm('Isso vai enviar TODOS os dados locais para o Supabase, sobrescrevendo o que está na nuvem.\n\nContinuar?')) return;
  closeModal('modal-admin');
  setSaveIndicator('⏳ Enviando para nuvem...','var(--warn)');
  try {
    // Push riscos (apenas os que não são built-in puro — com unidade definida)
    const riscosToSync = (DB.riscos||[]);
    await Promise.all(riscosToSync.map(r => sbSaveRisco(r)));
    // Push rmPlanos
    const rmPlanosToSync = (DB.rmPlanos||[]);
    await Promise.all(rmPlanosToSync.map(p => sbSaveRmPlano(p)));
    // Push units
    await sbSaveRmUnit(RM_UNITS);
    // Push filiais
    await Promise.all((DB.filiais||[]).map(f => sbUpsert('filiais', {id:f.id,nome:f.nome,cnpj:f.cnpj||'',cidade:f.cidade||'',resp:f.resp||'',setor:f.setor||'',setores:f.setores||''})));
    // Push denuncias
    await Promise.all((DB.denuncias||[]).map(d => sbSaveDenuncia(d)));
    await Promise.all((DB.agenda||[]).map(e => sbSaveAgenda(e)));
    setSaveIndicator('☁️ Tudo enviado para nuvem','var(--accent)');
    alert('✅ Todos os dados foram enviados para o Supabase!\n\n' + riscosToSync.length + ' riscos\n' + rmPlanosToSync.length + ' planos\n' + (DB.denuncias||[]).length + ' denúncias\n' + (DB.agenda||[]).length + ' eventos');
  } catch(e) {
    setSaveIndicator('❌ Erro ao enviar','var(--danger)');
    alert('❌ Erro: ' + e.message);
  }
}

function adminReset() {
  if(!confirm('⚠️ ATENÇÃO\n\nIsso apagará TODAS as edições do cache local e recarregará da nuvem (se configurado).\n\nEsta ação não pode ser desfeita.\n\nTem certeza?')) return;
  if(!confirm('Confirme: deseja realmente resetar o cache local?')) return;
  clearLocalCache();
  location.reload();
}

// ════════════════════════════════════════════════════
// PAINEL DE FERRAMENTAS ADMIN — retrátil
// ════════════════════════════════════════════════════
const ADMIN_TOOLS_KEY = 'ch_admin_tools_collapsed';

function toggleAdminToolsPanel() {
  const content = document.getElementById('admin-tools-content');
  const arrow = document.getElementById('admin-tools-arrow');
  if(!content) return;
  const collapsed = content.classList.toggle('collapsed');
  if(arrow) arrow.classList.toggle('open', !collapsed);
  localStorage.setItem(ADMIN_TOOLS_KEY, collapsed ? '1' : '0');
}

(function initAdminToolsPanel() {
  const content = document.getElementById('admin-tools-content');
  const arrow = document.getElementById('admin-tools-arrow');
  if(!content) return;
  const collapsed = localStorage.getItem(ADMIN_TOOLS_KEY) !== '0'; // padrão: recolhido
  content.classList.toggle('collapsed', collapsed);
  if(arrow) arrow.classList.toggle('open', !collapsed);
})();

// ════════════════════════════════════════════════════
// MODO DE EDIÇÃO — editar textos da interface (menus, títulos, KPIs)
// Somente admin. Os textos ficam em settings.ui_text_overrides e
// valem para todo mundo que acessa o sistema (carregados em loadFromSupabase).
// ════════════════════════════════════════════════════
const UI_OVERRIDES_KEY = 'ui_text_overrides';
let uiOverrides = {};
let editModeAtivo = false;
let _editModeSnapshot = null;

function aplicarUiOverrides() {
  document.querySelectorAll('[data-editable]').forEach(el => {
    const key = el.getAttribute('data-editable');
    if(uiOverrides[key] !== undefined) el.textContent = uiOverrides[key];
  });
}

function toggleEditMode() {
  if(editModeAtivo) sairModoEdicao(true);
  else entrarModoEdicao();
}

function entrarModoEdicao() {
  editModeAtivo = true;
  _editModeSnapshot = new Map();
  document.querySelectorAll('[data-editable]').forEach(el => {
    _editModeSnapshot.set(el, el.textContent);
    el.contentEditable = 'true';
    el.classList.add('edit-mode-target');
  });
  document.body.classList.add('edit-mode-active');
  const label = document.getElementById('nav-edit-mode-label');
  if(label) label.textContent = 'Editando…';
  mostrarBarraEdicao();
}

function mostrarBarraEdicao() {
  let bar = document.getElementById('edit-mode-bar');
  if(bar) { bar.style.display = 'flex'; return; }
  bar = document.createElement('div');
  bar.id = 'edit-mode-bar';
  bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;background:var(--primary);color:#fff;padding:12px 20px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:14px;font-size:.85rem;font-weight:600';
  bar.innerHTML =
    '<span>✏️ Modo de edição — clique em qualquer texto destacado pra editar</span>' +
    '<button onclick="salvarModoEdicao()" style="background:var(--accent);color:#0f2d4a;border:none;padding:7px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit">💾 Salvar</button>' +
    '<button onclick="sairModoEdicao(true)" style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:7px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit">Cancelar</button>';
  document.body.appendChild(bar);
}

function sairModoEdicao(reverter) {
  editModeAtivo = false;
  document.querySelectorAll('[data-editable]').forEach(el => {
    el.contentEditable = 'false';
    el.classList.remove('edit-mode-target');
    if(reverter && _editModeSnapshot && _editModeSnapshot.has(el)) {
      el.textContent = _editModeSnapshot.get(el);
    }
  });
  _editModeSnapshot = null;
  document.body.classList.remove('edit-mode-active');
  const bar = document.getElementById('edit-mode-bar');
  if(bar) bar.style.display = 'none';
  const label = document.getElementById('nav-edit-mode-label');
  if(label) label.textContent = 'Modo Edição';
}

async function salvarModoEdicao() {
  document.querySelectorAll('[data-editable]').forEach(el => {
    const key = el.getAttribute('data-editable');
    uiOverrides[key] = el.textContent.trim();
  });
  setSaveIndicator('⏳ Salvando textos...', 'var(--warn)');
  try {
    await sbUpsert('settings', { key: UI_OVERRIDES_KEY, value: JSON.stringify(uiOverrides) });
    setSaveIndicator('☁️ Textos salvos para todos', 'var(--accent)');
    auditLog('update', 'sistema', 'Textos da interface editados (modo edição)');
  } catch(e) {
    setSaveIndicator('❌ Erro ao salvar textos', 'var(--danger)');
    alert('❌ Erro ao salvar: ' + e.message);
  }
  sairModoEdicao(false);
}
