let USUARIOS = [
  { email:'admin@torre.com.br', hash:'92f2fac95a24752c198680b06ebca0c7d2bb6fd9cdaf88e8be4576b264466b5a', nome:'Administrador', perfil:'Admin', avatar:'AD', cor:'#0f2d4a' },
];
// Email do admin — imutável
const ADMIN_EMAIL = 'admin@torre.com.br';
// Derivar hash da senha (SHA-256 via SubtleCrypto)
async function _hashSenha(email, senha) {
  const msg = email.toLowerCase().trim() + ':' + senha + ':ch2025';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

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
  try {
    const inputHash = await _hashSenha(email, senha);

    // Verificar localmente — se não achar, recarregar usuários extras e tentar de novo
    let user = USUARIOS.find(u => u.email === email && u.hash === inputHash);
    if(!user) {
      await usersLoad(); // recarrega extras do localStorage/Supabase
      user = USUARIOS.find(u => u.email === email && u.hash === inputHash);
    }

    if(!user) {
      btnEl.disabled = false;
      btnText.textContent = 'Entrar no Sistema';
      emailEl.classList.add('error');
      passEl.classList.add('error');
      errorEl.innerHTML = '❌ E-mail ou senha incorretos.';
      passEl.value = '';
      passEl.focus();
      const box = document.querySelector('.login-box');
      if(box) { box.style.animation='none'; box.offsetHeight; box.style.animation='shake .4s ease'; }
      return;
    }

    // Login OK — salvar sessão
    currentUser = user;
    _saveSession(user);

    // ── MODO TESTE LOCAL ──────────────────────────────────────────────
    // Rodando em localhost/127.0.0.1 (cópia local pra testar), o login NÃO
    // exige o servidor: basta o hash bater com o cadastro local (já validado
    // acima). Isso permite testar offline e sem depender da senha do servidor.
    // Em PRODUÇÃO (domínio real, ex.: github.io) esta condição é falsa, então
    // o login continua 100% validado pela Edge Function, sem nenhuma mudança.
    const _ehLocal = ['localhost','127.0.0.1','[::1]',''].includes(location.hostname) || location.protocol === 'file:';
    if(_ehLocal) {
      enterApp(user);
      return;
    }

    if(USE_SUPABASE) {
      // Login só é aceito se o servidor (Edge Function) confirmar as credenciais.
      // NUNCA entrar no app apenas com base na checagem local do hash.
      let tokenObtido = false;
      let motivoFalha = 'Não foi possível validar sua sessão no servidor. Tente novamente.';
      try {
        showLoadingBar(true, 'Conectando ao servidor...');
        const r = await fetch(SUPABASE_URL + '/functions/v1/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, hash: inputHash })
        });
        showLoadingBar(false);
        if(r.ok) {
          const resp = await r.json();
          if(resp && resp.token) { setAppToken(resp.token); tokenObtido = true; }
        } else {
          const errBody = await r.json().catch(() => null);
          if(errBody && errBody.error) motivoFalha = errBody.error;
          console.warn('[Login] Edge Function erro:', r.status, errBody);
        }
      } catch(e) {
        showLoadingBar(false);
        console.warn('[Login] Edge Function indisponível:', e.message);
        motivoFalha = 'Servidor indisponível no momento. Tente novamente em instantes.';
      }

      if(!tokenObtido) {
        currentUser = null;
        _clearSession();
        btnEl.disabled = false;
        btnText.textContent = 'Entrar no Sistema';
        emailEl.classList.add('error');
        passEl.classList.add('error');
        errorEl.innerHTML = '❌ ' + escapeHtml(motivoFalha);
        return;
      }
    }

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
        renderDashboard();
        if(typeof renderMapaRisco === 'function') renderMapaRisco();
        if(typeof rmUpdateRiscoModalUnits === 'function') rmUpdateRiscoModalUnits();
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
  // SEGURANÇA: ao sair, apaga denúncias da memória e limpa o cache local, para
  // que um próximo usuário na mesma máquina não alcance dados da sessão anterior.
  try { DB.denuncias = []; } catch(e) {}
  try { clearLocalCache(); } catch(e) {}

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
  alert('Para recuperar sua senha, entre em contato com o administrador do sistema.\n\nE-mail: admin@torre.com.br');
}

// Shake keyframe via style tag
const shakeStyle = document.createElement('style');
shakeStyle.textContent = '@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }';
document.head.appendChild(shakeStyle);

// Check session on load (auto-login if session exists)
// Obs.: a antiga "detecção de DevTools" que apagava o relato do DOM foi
// removida — era falsa proteção (não impedia leitura via localStorage, via
// DB no console ou via resposta de rede) e dava impressão de segurança que
// não existia. A proteção real do relato é não carregá-lo sem sessão válida
// (ver app-init.js) e não persisti-lo no navegador (ver supabase.js).
function checkSession() {
  try {
    // Se usamos Supabase, a sessão só é válida com um token de servidor presente.
    // Exceção: em teste local (localhost/127.0.0.1) não exigimos token — casa
    // com o MODO TESTE LOCAL do login. Em produção nada muda.
    const _ehLocal = ['localhost','127.0.0.1','[::1]',''].includes(location.hostname) || location.protocol === 'file:';
    if(USE_SUPABASE && !getAppToken() && !_ehLocal) {
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
