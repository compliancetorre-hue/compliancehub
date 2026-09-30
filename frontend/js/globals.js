// ===== CONSTANTES GLOBAIS =====
const SUPABASE_URL  = 'https://qhtkuarlsjlnfkzfmxwa.supabase.co';
const EDGE_URL = SUPABASE_URL + '/functions/v1/api';

document.addEventListener('DOMContentLoaded',function(){
  const c=document.getElementById('content');if(!c)return;
  const p=document.createElement('div');
  p.className='page';p.id='page-due-diligence'
  p.innerHTML=ddHTML();
  c.appendChild(p);
  const p2=document.createElement('div');
  p2.className='page';p2.id='page-due-diligence2';
  p2.innerHTML=dd2HTML();
  c.appendChild(p2);
});

function ddHTML(){return `
<div class="dd-hero">
  <div class="dd-hero-left">
    <div class="dd-hero-ico">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div>
      <div class="dd-hero-t">Due Diligence — KYC &amp; Mídias Negativas</div>
      <div class="dd-hero-s">Pessoa Física (CPF) · Pessoa Jurídica (CNPJ) · Bhusca booleana · Verificação automática · Juntas Comerciais</div>
    </div>
  </div>
  <div class="dd-apills">
    <span class="dd-ap">CPF · PF</span><span class="dd-ap">CNPJ · PJ</span><span class="dd-ap">Boolean Search</span><span class="dd-ap">Mídias Negativas</span><span class="dd-ap-dim">Verificação auto</span>
  </div>
</div>

<div class="dd-tabs">
  <button class="dd-tab active" id="dd-tab-pj" onclick="ddSwitchTab('pj')">🏢 Pessoa Jurídica — CNPJ</button>
  <button class="dd-tab" id="dd-tab-pf" onclick="ddSwitchTab('pf')">👤 Pessoa Física — CPF</button>
</div>

<!-- ═══ PAINEL PJ ═══ -->
<div id="dd-panel-pj">
  <div class="section" style="margin-bottom:13px">
    <div class="section-header"><h2>🏢 Dados da empresa e do contrato</h2><button class="btn btn-outline btn-sm" onclick="ddLimpar('pj')">🗑️ Limpar</button></div>
    <div class="section-body">
      <div class="form-grid">
        <div class="field"><label>CNPJ *</label><input type="text" id="pj-cnpj" placeholder="00.000.000/0001-00" maxlength="18" oninput="this.value=ddMC(this.value)" onblur="pjAutoFill()"/></div>
        <div class="field"><label>Nome fantasia</label><input type="text" id="pj-fantasia" placeholder="Preenchido via API"/></div>
        <div class="field full"><label>Razão social</label><input type="text" id="pj-razao" placeholder="Preenchido automaticamente via API"/></div>
        <div class="field full"><label>Endereço</label><input type="text" id="pj-end" placeholder="Preenchido via API · ou informe manualmente"/></div>
        <div class="field full"><label>Sócios / representantes</label><input type="text" id="pj-socios" placeholder="Preenchido via API · ou informe manualmente"/></div>
        <div class="field"><label>Objeto do contrato</label><input type="text" id="pj-objeto" placeholder="Ex: Serviços de TI"/></div>
        <div class="field"><label>Valor estimado</label><input type="text" id="pj-valor" placeholder="Ex: R$ 50.000"/></div>
        <div class="field"><label>Modalidade de pagamento</label>
          <select id="pj-pagto"><option value="">Selecione</option><option value="100% antecipado">100% antecipado — maior risco</option><option value="Parcial antecipado">Parcial antecipado</option><option value="Parcelado conforme entrega">Parcelado conforme entrega</option><option value="Pós-entrega">Pós-entrega — menor risco</option></select>
        </div>
        <div class="field"><label>Estado sede (para Junta Comercial)</label>
          <select id="pj-estado"><option value="">Detectado via API</option>
            <option value="AC">AC — JUCEA</option><option value="AL">AL — JUCEAL</option><option value="AM">AM — JUCEA-AM</option><option value="AP">AP — JUCAP</option><option value="BA">BA — JUCEB</option><option value="CE">CE — JUCEC</option><option value="DF">DF — JUCDF</option><option value="ES">ES — JUCEES</option><option value="GO">GO — JUCEG</option><option value="MA">MA — JUCEMA</option><option value="MG">MG — JUCEMG</option><option value="MS">MS — JUCEMS</option><option value="MT">MT — JUCEMAT</option><option value="PA">PA — JUCEPA</option><option value="PB">PB — JUCEP</option><option value="PE">PE — JUCEPE</option><option value="PI">PI — JUCEPI</option><option value="PR">PR — JUCEPAR</option><option value="RJ">RJ — JUCERJA</option><option value="RN">RN — JUCERN</option><option value="RO">RO — JUCER</option><option value="RR">RR — JUCERR</option><option value="RS">RS — JUCERGS</option><option value="SC">SC — JUCESC</option><option value="SE">SE — JUCESE</option><option value="SP">SP — JUCESP</option><option value="TO">TO — JUCETINS</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:13px;flex-wrap:wrap">
        <button class="btn btn-accent" id="pj-btnapi" onclick="pjConsultar()" style="flex:1;min-width:185px;padding:11px;font-size:.88rem;justify-content:center"><span id="pj-bico">🔍</span> <span id="pj-btxt">Consultar APIs + gerar links</span></button>
        <button class="btn btn-primary" onclick="pjSomenteLinks()" style="padding:11px 14px;font-size:.86rem">📋 Gerar links sem API</button>
        <button class="btn" onclick="ddToggleManual('pj')" style="padding:11px 13px;font-size:.86rem;background:#fffbeb;color:#92400e;border:1px solid #fcd34d">✏️ Manual</button>
      </div>
    </div>
  </div>
  <div id="pj-logwrap" style="display:none;margin-bottom:12px"><div style="background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px"><div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:7px">Log de consulta</div><div id="pj-log"></div></div></div>
  <div class="dd-vbar" id="pj-vbar"><div class="dd-vb-t"><span>🔎 Verificando resultados...</span><span id="pj-vb-pct" style="font-family:'DM Mono',monospace;font-weight:700">0%</span></div><div class="dd-vb-bar"><div class="dd-vb-fill" id="pj-vb-fill"></div></div><div class="dd-vb-stats">✅ Encontrados: <span class="dd-vb-f" id="pj-vb-f">0</span> &nbsp;|&nbsp; ➖ Sem resultado: <span class="dd-vb-n" id="pj-vb-n">0</span> &nbsp;|&nbsp; 🟣 Mídia negativa: <span class="dd-vb-neg" id="pj-vb-neg">0</span> &nbsp;|&nbsp; ⚠️ Manual: <span class="dd-vb-e" id="pj-vb-e">0</span></div></div>
  <div id="pj-manbox" style="display:none;margin-bottom:12px"><div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:var(--radius);padding:17px"><div style="font-size:.85rem;font-weight:700;color:#92400e;margin-bottom:9px">✏️ Modo manual — abra um link, copie o JSON (Ctrl+A → Ctrl+C) e cole aqui</div><div id="pj-manlinks" style="margin-bottom:11px"></div><div class="field"><label style="color:#92400e">JSON copiado da API</label><textarea id="pj-jsonpaste" style="min-height:85px;font-family:'DM Mono',monospace;font-size:.77rem;background:rgba(255,255,255,.8);border-color:#fcd34d" placeholder="Cole aqui o JSON retornado pela API..."></textarea></div><button class="btn btn-primary" onclick="ddParseManual('pj')" style="margin-top:8px">Processar JSON →</button></div></div>
  <div id="pj-result"></div>
</div>

<!-- ═══ PAINEL PF ═══ -->
<div id="dd-panel-pf" style="display:none">
  <div class="section" style="margin-bottom:13px">
    <div class="section-header"><h2>👤 Dados da pessoa física</h2><button class="btn btn-outline btn-sm" onclick="ddLimpar('pf')">🗑️ Limpar</button></div>
    <div class="section-body">
      <div class="form-grid">
        <div class="field"><label>CPF *</label><input type="text" id="pf-cpf" placeholder="000.000.000-00" maxlength="14" oninput="this.value=ddMCpf(this.value)"/></div>
        <div class="field"><label>Nome completo *</label><input type="text" id="pf-nome" placeholder="Ex: João da Silva Souza"/></div>
        <div class="field"><label>Data de nascimento</label><input type="text" id="pf-nasc" placeholder="DD/MM/AAAA" maxlength="10"/></div>
        <div class="field"><label>Profissão / cargo</label><input type="text" id="pf-prof" placeholder="Ex: Empresário, Servidor Público, Médico"/></div>
        <div class="field full"><label>Endereço (opcional — para Street View)</label><input type="text" id="pf-end" placeholder="Rua, número, bairro, cidade, CEP"/></div>
        <div class="field"><label>Empresa(s) vinculada(s)</label><input type="text" id="pf-empresa" placeholder="Ex: XYZ Ltda, ABC ME (opcional)"/></div>
        <div class="field"><label>PEP — Pessoa Exposta Politicamente?</label>
          <select id="pf-pep"><option value="nao">Não</option><option value="sim">Sim — cargo público</option><option value="relacionado">Relacionado a PEP</option></select>
        </div>
        <div class="field"><label>Natureza do relacionamento</label>
          <select id="pf-nat"><option value="">Selecione</option><option value="Contratante">Contratante</option><option value="Fornecedor">Fornecedor</option><option value="Sócio">Sócio</option><option value="Representante legal">Representante legal</option><option value="Avalista">Avalista / fiador</option></select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:13px;flex-wrap:wrap">
        <button class="btn btn-accent" onclick="pfGerar()" style="flex:1;min-width:185px;padding:11px;font-size:.88rem;justify-content:center">🔍 Gerar links + verificar</button>
      </div>
    </div>
  </div>
  <div class="dd-vbar" id="pf-vbar"><div class="dd-vb-t"><span>🔎 Verificando resultados...</span><span id="pf-vb-pct" style="font-family:'DM Mono',monospace;font-weight:700">0%</span></div><div class="dd-vb-bar"><div class="dd-vb-fill" id="pf-vb-fill"></div></div><div class="dd-vb-stats">✅ Encontrados: <span class="dd-vb-f" id="pf-vb-f">0</span> &nbsp;|&nbsp; ➖ Sem resultado: <span class="dd-vb-n" id="pf-vb-n">0</span> &nbsp;|&nbsp; 🟣 Mídia negativa: <span class="dd-vb-neg" id="pf-vb-neg">0</span> &nbsp;|&nbsp; ⚠️ Manual: <span class="dd-vb-e" id="pf-vb-e">0</span></div></div>
  <div id="pf-result"></div>
</div>
`;}



// ══════════════════════════════════════════
// DATA STORE
// ══════════════════════════════════════════
let DB = {
  filiais: [],
  riscos: [],
  controles: [],
  planos: [],
  rmPlanos: [],  // carregado do Supabase após login
  denuncias: [],  // carregado do Supabase após login
  denunciasAls: [], // Canal de Denúncia ALS — tabela separada, carregado do Supabase após login
  fbBoards: {
    'planos-acao': {
      name:'Planos de Ação', color:'#3b82f6',
      cols:[
        { id:'c1', name:'Não Iniciado', color:'#94a3b8', cards:[
          { id:'k1', title:'Treinamento LGPD', resp:'Fernanda', prazo: futureDate(20), prio:'Média', tag:'RH', check:['Preparar material','Agendar turmas','Registrar presença'], checkDone:[0,0,0] },
        ]},
        { id:'c2', name:'Em Andamento', color:'#3b82f6', cards:[
          { id:'k2', title:'Implementar MFA', resp:'João TI', prazo: futureDate(7), prio:'Alta', tag:'TI', check:['Mapear sistemas','Configurar','Testar','Deploy'], checkDone:[1,1,0,0] },
          { id:'k3', title:'Canal de Denúncias – Divulgação', resp:'Ana Paula', prazo: futureDate(10), prio:'Crítica', tag:'RH', check:['Criar cartilha','Enviar comunicado'], checkDone:[1,0] },
        ]},
        { id:'c3', name:'Em Revisão', color:'#f59e0b', cards:[] },
        { id:'c4', name:'Concluído', color:'#00c49a', cards:[
          { id:'k4', title:'Revisão Contratos Fornecedores', resp:'Carlos Mendes', prazo: futureDate(-10), prio:'Baixa', tag:'Jurídico', check:['Levantar contratos','Analisar','Assinar'], checkDone:[1,1,1] },
        ]},
      ]
    },
    'denuncias': {
      name:'Denúncias', color:'#ef4444',
      cols:[
        { id:'d1', name:'Aberta', color:'#3b82f6', cards:[
          { id:'j1', title:'DN-2025-002 · Assédio / BH', resp:'Fernanda Lima', prazo: futureDate(3), prio:'Crítica', tag:'Assédio', check:['Registrar','Notificar comitê','Iniciar investigação'], checkDone:[1,0,0] },
        ]},
        { id:'d2', name:'Em Análise', color:'#f59e0b', cards:[
          { id:'j2', title:'DN-2025-001 · Fraude / SP', resp:'Carlos Mendes', prazo: futureDate(5), prio:'Alta', tag:'Fraude', check:['Coletar evidências','Entrevistar','Relatório'], checkDone:[1,1,0] },
        ]},
        { id:'d3', name:'Encerrada', color:'#00c49a', cards:[
          { id:'j3', title:'DN-2025-003 · Conduta / RJ', resp:'Ana Paula', prazo: futureDate(-20), prio:'Média', tag:'Conduta', check:['Apurar','Decisão','Comunicar'], checkDone:[1,1,1] },
        ]},
        { id:'d4', name:'Arquivada', color:'#94a3b8', cards:[] },
      ]
    },
    'mapa-risco': {
      name:'Mapeamento de Risco', color:'#8b5cf6',
      cols:[
        { id:'r1', name:'Identificado', color:'#94a3b8', cards:[
          { id:'m1', title:'Vazamento de dados – TI', resp:'João TI', prazo: futureDate(14), prio:'Crítica', tag:'TI', check:['Mapear','Avaliar probabilidade','Definir controle'], checkDone:[1,1,0] },
        ]},
        { id:'r2', name:'Em Avaliação', color:'#f59e0b', cards:[
          { id:'m2', title:'Fraude Conciliação – Fin', resp:'Maria Fin', prazo: futureDate(7), prio:'Alta', tag:'Financeiro', check:['Analisar impacto','Propor mitigação'], checkDone:[1,0] },
        ]},
        { id:'r3', name:'Mitigação em Andamento', color:'#3b82f6', cards:[] },
        { id:'r4', name:'Residual Aceito', color:'#00c49a', cards:[] },
      ]
    }
  },
  _ids: { filial:17, risco:20, ctrl:6, plano:6, dn:200, dnAls:1, fbCard:100, rmPlano:17, agenda:1 },
  agenda: []
};

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
const PAGE_TITLES = {
  relatorios:'Relatórios — Canal de Denúncia',
  importar:'Importar Planilha de Denúncias',
  dashboard:'Dashboard', filiais:'Filiais e Setores', 'mapa-risco':'Mapeamento de Risco',
  controles:'Controles Internos', 'planos-acao':'Planos de Ação',
  funcionarios:'Funcionários — Ativos e Desligados',
  'canal-denuncia':'Canal de Denúncia', 'canal-denuncia-als':'Canal de Denúncia ALS', flowboard:'Flow Board',
  'due-diligence':'Due Diligence — KYC & Mídias Negativas',
    'due-diligence2':'Due Diligence 2 – KYC & Mídias Negativas'
};
let currentPage = 'dashboard';

function _gotoImpl(page, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
  const link = document.querySelector(`[data-page="${page}"]`);
  if(link) link.classList.add('active');
  if(el && el.classList) el.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  currentPage = page;
  if(page === 'dashboard') renderDashboard();
  if(page === 'agenda') renderAgenda();
  if(page === 'filiais') renderFiliais();
  if(page === 'mapa-risco') { renderMapaRisco(); }
  if(page === 'controles') renderControles();
  if(page === 'planos-acao') renderPlanos();
  if(page === 'canal-denuncia') renderDenuncias();
  if(page === 'canal-denuncia-als') renderDenunciasAls();
  if(page === 'funcionarios') renderFuncionarios();
  if(page === 'flowboard') renderFlowboard();
  closeMobile();
}

// ══════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if(e.target === m) m.classList.remove('open'); });
});
