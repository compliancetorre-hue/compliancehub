// ===== CONSTANTES GLOBAIS =====
const SUPABASE_URL  = 'https://qhtkuarlsjlnfkzfmxwa.supabase.co';
const EDGE_URL = SUPABASE_URL + '/functions/v1/api';

// HTML das telas de Due Diligence (1 e 2) vive em arquivos próprios
// (frontend/due-diligence-view.html e frontend/due-diligence2-view.html) —
// buscado uma vez via fetch() e cacheado. Por isso o carregamento inicial
// da página é assíncrono.
let ddHTMLCache = null;
async function ddHTML(){
  if(ddHTMLCache) return ddHTMLCache;
  const r = await fetch('due-diligence-view.html');
  if(!r.ok) throw new Error('Falha ao carregar due-diligence-view.html: HTTP '+r.status);
  ddHTMLCache = await r.text();
  return ddHTMLCache;
}

document.addEventListener('DOMContentLoaded',async function(){
  const c=document.getElementById('content');if(!c)return;
  const p=document.createElement('div');
  p.className='page';p.id='page-due-diligence'
  try{
    p.innerHTML=await ddHTML();
  }catch(e){
    console.error('Due Diligence: falha ao carregar a tela', e);
    p.innerHTML='<p style="padding:20px;color:#ef4444">Não foi possível carregar esta página. Recarregue (F5) e tente novamente.</p>';
  }
  c.appendChild(p);
  const p2=document.createElement('div');
  p2.className='page';p2.id='page-due-diligence2';
  try{
    p2.innerHTML=await dd2HTML();
  }catch(e){
    console.error('Due Diligence 2: falha ao carregar a tela', e);
    p2.innerHTML='<p style="padding:20px;color:#ef4444">Não foi possível carregar esta página. Recarregue (F5) e tente novamente.</p>';
  }
  c.appendChild(p2);
});



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
