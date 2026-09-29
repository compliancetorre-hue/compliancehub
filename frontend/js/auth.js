// Lista de usuarios preenchida dinamicamente pelo servidor (usersLoad()).
// IMPORTANTE: nao guarda mais credenciais no cliente. A conta admin e a
// verificacao de senha vivem 100% no servidor (Edge Function + bcrypt).
let USUARIOS = [];
// Email do admin — apenas para exibicao/UX. NAO e credencial: a autoridade
// real e o campo "perfil" retornado pelo servidor no login.
const ADMIN_EMAIL = 'admin@torre.com.br';
// Toda verificacao/derivacao de senha vive no servidor (Edge Function + bcrypt).
// Nao existe mais hashing de senha no cliente.

let currentUser = null;
const SESSION_KEY = 'ch_session_v2';
const SESSION_EXPIRY_HOURS = 8;

function _saveSession(user) {
  const exp = Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: user.email, perfil: user.perfil, nome: user.nome, avatar: user.avatar, cor: user.cor, exp }));
}
function _loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(Date.now() > s.exp) { sessionStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch(e) { return null; }
}
function _clearSession() { sessionStorage.removeItem(SESSION_KEY); }

window.doLogin = async function() {
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-pass');
  const errorEl = document.getElementById('login-error');
  const btnEl   = document.getElementById('login-btn');
  const btnText = document.getElementById('login-btn-text');

  const email = (emailEl.value || '').trim().toLowerCase();
  const senha = passEl.value || '';

  errorEl.innerHTML = '';
  emailEl.classList.remove('error');
  passEl.classList.remove('error');

  if(!email) {
    emailEl.classList.add('error');
    errorEl.innerHTML = '⚠️ Informe seu e-mail.';
    emailEl.focus();
    return;
  }

  if(!senha) {
    passEl.classList.add('error');
    errorEl.innerHTML = '⚠️ Informe sua senha.';
    passEl.focus();
    return;
  }

  btnEl.disabled = true;
  btnText.innerHTML = '<div class="login-spinner"></div> Verificando...';

  doLoginAsync(email, senha, emailEl, passEl, errorEl, btnEl, btnText);
};

async function doLoginAsync(email, senha, emailEl, passEl, errorEl, btnEl, btnText) {
  const falhaLogin = (msg) => {
    currentUser = null;
    _clearSession();
    setAppToken('');
    btnEl.disabled = false;
    btnText.textContent = 'Entrar no Sistema';
    emailEl.classList.add('error');
    passEl.classList.add('error');
    errorEl.innerHTML = '❌ ' + escapeHtml(msg);
    passEl.value = '';
    passEl.focus();
    const box = document.querySelector('.login-box');
    if(box) { box.style.animation='none'; box.offsetHeight; box.style.animation='shake .4s ease'; }
  };

  try {
    // ============================================================
    // Autenticacao 100% no servidor.
    // Envia a SENHA (protegida pelo HTTPS), NUNCA um hash pronto — assim
    // o hash deixa de ser uma credencial reutilizavel (pass-the-hash).
    // O servidor (Edge Function) valida com bcrypt e emite o token.
    // ============================================================
    let resp = null;
    try {
      showLoadingBar(true, 'Conectando ao servidor...');
      const r = await fetch(SUPABASE_URL + '/functions/v1/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getActiveKey(),
          'Authorization': 'Bearer ' + getActiveKey()
        },
        body: JSON.stringify({ email, senha })
      });
      showLoadingBar(false);
      if(r.ok) {
        resp = await r.json();
      } else {
        const errBody = await r.json().catch(() => null);
        return falhaLogin((errBody && errBody.error) || 'E-mail ou senha incorretos.');
      }
    } catch(e) {
      showLoadingBar(false);
      console.warn('[Login] Servidor indisponível:', e.message);
      return falhaLogin('Servidor indisponível no momento. Tente novamente em instantes.');
    }

    if(!resp || !resp.token) {
      return falhaLogin('Não foi possível validar sua sessão no servidor.');
    }

    // Token de sessao emitido pelo servidor (enviado depois no header x-app-token)
    setAppToken(resp.token);

    // Dados do usuario vem SOMENTE do servidor (nunca do cliente)
    const info = resp.usuario || {};
    const nome = info.nome || email;
    const user = {
      email:  info.email  || email,
      perfil: info.perfil || 'viewer',
      nome:   nome,
      avatar: info.avatar || nome.trim().slice(0,2).toUpperCase() || '??',
      cor:    info.cor    || '#0f2d4a'
    };

    currentUser = user;
    _saveSession(user);
    enterApp(user);
  } catch(e) {
    btnEl.disabled = false;
    btnText.textContent = 'Entrar no Sistema';
    errorEl.innerHTML = '❌ Erro ao autenticar. Tente novamente.';
    console.error('Login error:', e);
  }
}

function enterApp(user) {
  // Carregar usuários extras e permissões sequencialmente
  (async () => {
    await usersLoad();         // carrega usuários do servidor
    permLoad();                // carrega permissões do localStorage
    await permLoadFromSupabase(); // atualiza com versão do Supabase
    permAtualizarNav();        // atualiza nav com permissões corretas
    // Agora que as permissões estão prontas, cai na primeira página
    // permitida (evita abrir o dashboard sem acesso).
    irParaPrimeiraPaginaPermitida();
  })();

  // Log de login
  auditLog('login', 'sistema', `Login realizado`, {perfil: user.perfil});

  // Mostrar/ocultar botões admin
  const adminBtns = ['nav-permissoes','nav-usuarios','nav-audit','nav-branding','nav-edit-mode'];
  adminBtns.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = (user.email === ADMIN_EMAIL || user.perfil === 'Admin') ? 'flex' : 'none';
  });
  // Mostrar grade admin só se for admin
  const adminGrid = document.getElementById('nav-admin-grid');
  if(adminGrid) adminGrid.style.display = (user.email === ADMIN_EMAIL || user.perfil === 'Admin') ? 'grid' : 'none';

  // Carregar dados do Supabase após login (token já disponível)
  if(USE_SUPABASE) {
    showLoadingBar(true, 'Carregando dados...');
    loadFromSupabase().then(ok => {
      showLoadingBar(false);
      if(ok) {
        populateFilialSelects();
        populateRelSelectsForce();
        if(typeof canAccess !== 'function' || canAccess('dashboard')) renderDashboard();
        if(typeof renderMapaRisco === 'function') renderMapaRisco();
        if(typeof rmUpdateRiscoModalUnits === 'function') rmUpdateRiscoModalUnits();
        // Com os dados já carregados, reposiciona na primeira página
        // permitida para que ela renderize com o conteúdo (e não fique
        // vazia se o login caiu nela antes dos dados chegarem).
        if(typeof irParaPrimeiraPaginaPermitida === 'function') irParaPrimeiraPaginaPermitida();
      }
    }).catch(e => {
      showLoadingBar(false);
      console.warn('Erro ao carregar dados:', e.message);
    });
  }
  // Update topbar user info
  const avEl = document.getElementById('user-av');
  const nameEl = document.getElementById('user-name');
  if(avEl) { avEl.textContent = user.avatar; avEl.style.background = user.cor; }
  if(nameEl) nameEl.textContent = user.nome + ' · ' + user.perfil;

  // Hide login, show app
  const loginScreen = document.getElementById('login-screen');
  loginScreen.style.opacity = '1';
  loginScreen.style.transition = 'opacity .3s ease';
  setTimeout(() => {
    loginScreen.style.opacity = '0';
    setTimeout(() => {
      loginScreen.classList.add('hidden');
    }, 300);
  }, 50);
}

function doLogout() {
  if(!confirm('Deseja realmente sair do sistema?')) return;
  auditLog('logout', 'sistema', 'Logout realizado');
  currentUser = null;
  _clearSession();
  sessionStorage.removeItem('compliance_user');
  sessionStorage.removeItem('ch_app_token');

  // Reset form
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').innerHTML = '';
  document.getElementById('login-email').classList.remove('error');
  document.getElementById('login-pass').classList.remove('error');
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn-text').textContent = 'Entrar no Sistema';

  // Show login
  const loginScreen = document.getElementById('login-screen');
  loginScreen.classList.remove('hidden');
  loginScreen.style.opacity = '0';
  loginScreen.style.transition = 'opacity .3s ease';
  setTimeout(() => { loginScreen.style.opacity = '1'; }, 10);

  // Restore default avatar
  const avEl = document.getElementById('user-av');
  const nameEl = document.getElementById('user-name');
  if(avEl) { avEl.textContent = 'GC'; avEl.style.background = ''; }
  if(nameEl) nameEl.textContent = 'Gestão Compliance';

  setTimeout(() => { document.getElementById('login-email').focus(); }, 350);
}

function showForgotPass() {
  alert('Para recuperar sua senha, entre em contato com o administrador do sistema.');
}

// Shake keyframe via style tag
const shakeStyle = document.createElement('style');
shakeStyle.textContent = '@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }';
document.head.appendChild(shakeStyle);

// Check session on load (auto-login if session exists)
// ── DevTools detection — warn user in sensitive sessions
(function() {
  let _dtOpen = false;
  const _dtThreshold = 160;
  setInterval(() => {
    const widthDiff = window.outerWidth - window.innerWidth > _dtThreshold;
    const heightDiff = window.outerHeight - window.innerHeight > _dtThreshold;
    if((widthDiff || heightDiff) && !_dtOpen) {
      _dtOpen = true;
      // Clear sensitive data from DOM when DevTools detected
      document.querySelectorAll('.relato-text, #dn-detail-relato, #dn-detail-acao').forEach(el => {
        if(el._originalContent === undefined) el._originalContent = el.textContent;
        el.textContent = '[Conteúdo protegido]';
      });
    } else if(!widthDiff && !heightDiff && _dtOpen) {
      _dtOpen = false;
      document.querySelectorAll('.relato-text, #dn-detail-relato, #dn-detail-acao').forEach(el => {
        if(el._originalContent !== undefined) el.textContent = el._originalContent;
      });
    }
  }, 1000);
})();

function checkSession() {
  try {
    // Se usamos Supabase, a sessão só é válida com um token de servidor presente
    if(USE_SUPABASE && !getAppToken()) {
      _clearSession();
      return false;
    }
    // Try new session format first (ch_session_v2)
    const s = _loadSession();
    if(s) {
      // Find user data from USUARIOS list
      const u = USUARIOS.find(x => x.email === s.email);
      if(u) {
        currentUser = { ...u, perfil: s.perfil, nome: s.nome, avatar: s.avatar, cor: s.cor };
        enterApp(currentUser);
        return true;
      }
      // User from Edge Function response
      currentUser = { email: s.email, perfil: s.perfil, nome: s.nome, avatar: s.avatar, cor: s.cor };
      enterApp(currentUser);
      return true;
    }
    // Fallback: old session key
    const saved = sessionStorage.getItem('compliance_user');
    if(saved) {
      const user = JSON.parse(saved);
      currentUser = user;
      // Migrate to new format
      _saveSession(user);
      sessionStorage.removeItem('compliance_user');
      enterApp(user);
      return true;
    }
  } catch(e) { console.warn('checkSession:', e); }
  return false;
}

function showAnonKeySetup() {
  const key = prompt(
    '🔑 Cole aqui sua ANON KEY do Supabase\n\n' +
    'Como pegar:\n' +
    '1. Acesse: https://supabase.com\n' +
    '2. Abra seu projeto\n' +
    '3. Clique em Settings → API\n' +
    '4. Copie o campo "anon public"\n\n' +
    'A chave começa com: eyJhbGci...'
  );
  if(!key || !key.startsWith('eyJ')) {
    if(key) alert('❌ Chave inválida! A anon key deve começar com "eyJ"\n\nCertifique-se de copiar o campo "anon public" (não o service_role)');
    return;
  }
  // Salvar a chave no localStorage e recarregar com ela
  localStorage.setItem('sb_anon_key_override', key);
  alert('✅ Chave salva! O sistema vai recarregar agora.');
  location.reload();
}
