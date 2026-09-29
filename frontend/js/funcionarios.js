// ══════════════════════════════════════════
// MÓDULO FUNCIONÁRIOS — Ativos / Desligados / Importar planilha
// ══════════════════════════════════════════
// Identidade do funcionário = MATRÍCULA (coluna "Chapa" da planilha), NUNCA
// o nome: a lista real tem homônimos (nomes iguais para pessoas diferentes),
// então usar o nome como chave descartaria gente de verdade. A matrícula é
// única. Isso também é o que faz "nomes/linhas repetidas serem ignoradas":
// se a mesma matrícula aparecer duas vezes na planilha, a segunda é ignorada.
//
// Regra de importação: quem está na planilha nova = ATIVO. Quem estava ativo
// e sumiu da planilha nova = DESLIGADO. Matrícula nova = entra em ATIVOS.
// Matrícula que estava desligada e reapareceu = volta pra ATIVOS (recontratação).

let DB_FUNC = [];              // lista de funcionários (ver funcNovo p/ formato)
let _funcTab = 'ativos';       // aba atual: 'ativos' | 'desligados' | 'importar'
let _funcCarregado = false;    // já buscou os dados nesta sessão?
let _funcImportPreview = null; // resultado calculado do arquivo antes de confirmar
const FUNC_KEY = 'ch_funcionarios_v1';

// ── Normalização de texto (para casar cabeçalhos com/sem acento e caixa) ──
function _fNorm(s){ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(); }

// ── Resolve o nome legível da filial a partir do código (usa o cadastro de
// Filiais do app quando houver correspondência; senão "Filial ‹código›") ──
function funcFilialLabel(cod){
  cod = String(cod||'').trim();
  if(!cod) return '—';
  try {
    const n = parseInt(cod,10);
    const match = (DB.filiais||[]).find(f => {
      const fn = String(f.nome||'').trim();
      return (!isNaN(n) && parseInt(fn,10)===n) || fn.startsWith(cod+'.') || fn.startsWith(cod+' ') || fn===cod;
    });
    if(match) return match.nome;
  } catch(e){}
  return 'Filial ' + cod;
}

// ══════════════════════════════════════════
// CARGA / PERSISTÊNCIA
// ══════════════════════════════════════════
function funcSaveLocal(){
  try { localStorage.setItem(FUNC_KEY, JSON.stringify(DB_FUNC)); } catch(e){ console.warn('funcSaveLocal:', e.message); }
}
function funcLoadLocal(){
  try { const raw = localStorage.getItem(FUNC_KEY); if(raw){ const a = JSON.parse(raw); if(Array.isArray(a)) DB_FUNC = a; } } catch(e){}
}

// Busca do Supabase (lazy — só quando o módulo abre, nunca no login).
// A lista INTEIRA fica num único registro (id='main') da tabela
// funcionarios_lista, no campo jsonb "lista" — mesmo padrão do Flow Board
// (fbboards). Isso evita o teto de ~1.000 linhas que a leitura/gravação
// linha-a-linha tinha (por isso, ao dar F5, só voltavam ~1.000). Cai pro
// cache local se a tabela não existir/offline.
async function funcCarregar(force){
  if(_funcCarregado && !force) return;
  funcLoadLocal();
  if(typeof USE_SUPABASE !== 'undefined' && USE_SUPABASE && typeof _edgeGet === 'function'){
    try {
      const rows = await _edgeGet('funcionarios_lista?id=main');
      const lista = (Array.isArray(rows) && rows[0] && Array.isArray(rows[0].lista)) ? rows[0].lista : null;
      if(lista && lista.length){
        DB_FUNC = lista;
        funcSaveLocal();
        _funcNuvem = true;
      } else if(Array.isArray(rows)){
        // Tabela existe mas sem registro ainda — mantém o cache local.
        _funcNuvem = true;
      }
    } catch(e){
      // Tabela ainda não criada ou sem conexão — usa só o cache local.
      _funcNuvem = false;
      console.warn('[funcionarios] Supabase indisponível, usando cache local:', e.message);
    }
  }
  _funcCarregado = true;
}
let _funcNuvem = false;

// Salva a lista INTEIRA como um único registro (id='main'). Uma escrita só,
// sem lotes — some tanto o teto de leitura quanto o de gravação por linha.
async function funcSalvarSupabase(){
  if(!(typeof USE_SUPABASE !== 'undefined' && USE_SUPABASE) || typeof sbUpsert !== 'function') return {ok:0, erro:'sem supabase'};
  try {
    await sbUpsert('funcionarios_lista', { id:'main', lista: DB_FUNC, updated_at: new Date().toISOString() });
    return {ok: DB_FUNC.length};
  } catch(e){
    console.warn('[funcionarios] salvar na nuvem falhou:', e.message);
    return {ok:0, erro:e.message};
  }
}

// ══════════════════════════════════════════
// PARSE DA PLANILHA
// ══════════════════════════════════════════
// Recebe o array de objetos do XLSX.utils.sheet_to_json e devolve a lista
// normalizada { matricula, nome, filial, cargo, secao, admissao, situacao },
// já sem duplicatas de matrícula (a 1ª ocorrência vence, as demais são ignoradas).
function funcParsePlanilha(rowsObj){
  if(!Array.isArray(rowsObj) || !rowsObj.length) return {lista:[], ignoradasDup:0, erro:'Planilha vazia.'};
  // Mapeia cada cabeçalho da planilha (com acento/caixa variada) p/ a chave certa.
  const amostra = rowsObj[0];
  const chaves = Object.keys(amostra);
  const acha = (alvos)=>{ for(const alvo of alvos){ const k = chaves.find(c=>_fNorm(c)===_fNorm(alvo)); if(k) return k; } return null; };
  const kMat  = acha(['Chapa','Matrícula','Matricula']);
  const kNome = acha(['Nome']);
  const kFil  = acha(['Código da Filial','Codigo da Filial','Cod da Filial','Filial']);
  const kCargo= acha(['Nome Função','Nome Funcao','Função','Funcao','Nome do Cargo','Cargo']);
  const kSecao= acha(['Descrição Seção','Descricao Secao','Descrição da Seção','Seção','Secao']);
  const kAdm  = acha(['Data de Admissão','Data de Admissao','Admissão','Admissao']);
  const kSit  = acha(['Descrição da Situação','Descricao da Situacao','Situação','Situacao']);
  if(!kMat || !kNome) return {lista:[], ignoradasDup:0, erro:'Não encontrei as colunas obrigatórias "Chapa" (matrícula) e/ou "Nome" na planilha.'};

  const vistos = new Set();
  const lista = [];
  let ignoradasDup = 0;
  const fmt = (v)=>{
    if(v==null) return '';
    if(v instanceof Date){ const p=n=>String(n).padStart(2,'0'); return `${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())}`; }
    return String(v).trim();
  };
  for(const r of rowsObj){
    const matricula = fmt(r[kMat]);
    const nome = fmt(r[kNome]);
    if(!matricula || !nome) continue;             // linha sem os campos-chave
    if(vistos.has(matricula)){ ignoradasDup++; continue; } // duplicata → ignora
    vistos.add(matricula);
    lista.push({
      matricula, nome,
      filial: kFil?fmt(r[kFil]):'',
      cargo: kCargo?fmt(r[kCargo]):'', secao: kSecao?fmt(r[kSecao]):'',
      admissao: kAdm?fmt(r[kAdm]):'', situacao: kSit?fmt(r[kSit]):'',
    });
  }
  return {lista, ignoradasDup, erro: lista.length?'':'Nenhuma linha válida encontrada na planilha.'};
}

// Calcula o diff entre a planilha nova e o estado atual (SEM aplicar ainda).
function funcCalcularDiff(listaPlanilha){
  const porMat = new Map(DB_FUNC.map(f=>[f.matricula, f]));
  const naPlanilha = new Set(listaPlanilha.map(f=>f.matricula));
  const novos=[], reativados=[], mantidos=[], desligados=[];
  for(const nova of listaPlanilha){
    const atual = porMat.get(nova.matricula);
    if(!atual) novos.push(nova);
    else if(atual.status==='desligado') reativados.push(nova);
    else mantidos.push(nova);
  }
  for(const f of DB_FUNC){
    if(f.status==='ativo' && !naPlanilha.has(f.matricula)) desligados.push(f);
  }
  return {novos, reativados, mantidos, desligados};
}

// ══════════════════════════════════════════
// APLICAR IMPORTAÇÃO
// ══════════════════════════════════════════
async function funcAplicarImportacao(){
  if(!_funcImportPreview){ alert('Selecione e processe uma planilha primeiro.'); return; }
  const { listaPlanilha, diff } = _funcImportPreview;
  const agora = new Date().toISOString();
  const porMat = new Map(DB_FUNC.map(f=>[f.matricula, f]));
  const mudados = [];

  // Novos e reativados/mantidos: atualiza os dados e garante status ativo.
  for(const nova of listaPlanilha){
    const atual = porMat.get(nova.matricula);
    if(!atual){
      const novo = { ...nova, status:'ativo', importadoEm:agora, desligadoEm:'' };
      porMat.set(nova.matricula, novo); mudados.push(novo);
    } else {
      const virouAtivo = atual.status!=='ativo';
      Object.assign(atual, nova, { status:'ativo', desligadoEm:'' });
      if(!atual.importadoEm) atual.importadoEm = agora;
      // Só marca como "mudado" (p/ salvar) quem virou ativo ou é dado novo do arquivo.
      mudados.push(atual);
    }
  }
  // Ausentes da planilha que estavam ativos → desligados.
  for(const f of DB_FUNC){
    if(f.status==='ativo' && !listaPlanilha.some(n=>n.matricula===f.matricula)){
      f.status='desligado'; f.desligadoEm=agora; mudados.push(f);
    }
  }
  DB_FUNC = Array.from(porMat.values());
  funcSaveLocal();

  if(typeof auditLog==='function'){
    auditLog('import','funcionarios',
      `Planilha importada — ${diff.novos.length} novos, ${diff.reativados.length} reativados, ${diff.desligados.length} desligados`,
      {novos:diff.novos.length, desligados:diff.desligados.length, ignorados:_funcImportPreview.ignoradasDup});
  }

  // Persiste na nuvem (best-effort) — grava a lista inteira num registro só.
  const dupCount = _funcImportPreview ? _funcImportPreview.ignoradasDup : _ultimaDupCount;
  const res = await funcSalvarSupabase();

  _funcImportPreview = null;
  _funcTab = 'ativos';
  renderFuncionarios();
  const msgNuvem = res.erro
    ? '\n\n⚠️ Salvo localmente, mas a sincronização na nuvem falhou (a tabela "funcionarios_lista" pode não existir ainda). Veja o passo do CREATE TABLE.'
    : (res.ok ? `\n\n☁️ ${res.ok} registros sincronizados na nuvem.` : '');
  alert(`✅ Importação concluída!\n\n• ${diff.novos.length} novos funcionários (ativos)\n• ${diff.reativados.length} reativados\n• ${diff.desligados.length} desligados\n• ${diff.mantidos.length} mantidos\n• ${dupCount} linhas duplicadas ignoradas`+msgNuvem);
}
let _ultimaDupCount = 0;

// ══════════════════════════════════════════
// UPLOAD / LEITURA DO ARQUIVO
// ══════════════════════════════════════════
function funcHandleFile(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  const ext = (file.name.split('.').pop()||'').toLowerCase();
  const box = document.getElementById('func-import-preview');
  if(box) box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">⏳ Lendo planilha...</div>';
  if(ext!=='xlsx' && ext!=='xls' && ext!=='csv'){ if(box) box.innerHTML='<p style="color:var(--danger)">Formato não suportado. Use .xlsx ou .csv.</p>'; return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      if(typeof XLSX === 'undefined'){ if(box) box.innerHTML='<p style="color:var(--danger)">Biblioteca de leitura de planilha ainda carregando — tente de novo em instantes.</p>'; return; }
      const wb = XLSX.read(e.target.result, {type:'array', cellDates:true, codepage:65001});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rowsObj = XLSX.utils.sheet_to_json(ws, {defval:'', raw:true, cellDates:true});
      const parsed = funcParsePlanilha(rowsObj);
      if(parsed.erro){ if(box) box.innerHTML='<p style="color:var(--danger)">⚠️ '+escapeHtml(parsed.erro)+'</p>'; return; }
      const diff = funcCalcularDiff(parsed.lista);
      _funcImportPreview = { listaPlanilha: parsed.lista, diff, ignoradasDup: parsed.ignoradasDup };
      _ultimaDupCount = parsed.ignoradasDup;
      funcRenderPreview(file.name, parsed, diff);
    } catch(err){ if(box) box.innerHTML='<p style="color:var(--danger)">Erro ao ler a planilha: '+escapeHtml(err.message)+'</p>'; }
  };
  reader.readAsArrayBuffer(file);
}

function funcRenderPreview(nomeArquivo, parsed, diff){
  const box = document.getElementById('func-import-preview');
  if(!box) return;
  const primeiraVez = DB_FUNC.length===0;
  const card = (cor,icone,num,lbl)=>`<div style="flex:1;min-width:120px;background:${cor}12;border:1px solid ${cor}44;border-radius:10px;padding:12px 14px">
    <div style="font-size:1.5rem;font-weight:800;color:${cor}">${icone} ${num}</div><div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">${lbl}</div></div>`;
  box.innerHTML = `
    <div style="background:#f0fdf9;border:1px solid #6ee7b7;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:.85rem;color:#065f46">
      📄 <strong>${escapeHtml(nomeArquivo)}</strong> — ${parsed.lista.length} funcionários lidos${parsed.ignoradasDup?` · ${parsed.ignoradasDup} duplicata(s) por matrícula ignorada(s)`:''}.
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${card('#22c55e','🟢',diff.novos.length,'Novos (entram em Ativos)')}
      ${card('#3b82f6','🔵',diff.reativados.length,'Reativados (voltam a Ativos)')}
      ${card('#64748b','⚪',diff.mantidos.length,'Mantidos (já ativos)')}
      ${card('#ef4444','🔴',diff.desligados.length,'Desligados (sumiram da planilha)')}
    </div>
    ${!primeiraVez && diff.desligados.length ? `<div style="margin-bottom:14px"><div style="font-size:.82rem;font-weight:700;color:var(--danger);margin-bottom:6px">Serão movidos para DESLIGADOS (${diff.desligados.length}):</div><div style="max-height:160px;overflow-y:auto;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:.8rem">${diff.desligados.slice(0,200).map(f=>`<div style="padding:2px 0"><span style="font-family:'DM Mono',monospace;color:#64748b">${escapeHtml(f.matricula)}</span> — ${escapeHtml(f.nome)} <span style="color:#94a3b8">(${escapeHtml(funcFilialLabel(f.filial))})</span></div>`).join('')}${diff.desligados.length>200?`<div style="color:#94a3b8;padding-top:4px">…e mais ${diff.desligados.length-200}</div>`:''}</div></div>`:''}
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-accent" onclick="funcAplicarImportacao()">✅ Confirmar importação</button>
      <button class="btn btn-outline" onclick="funcCancelarImport()">Cancelar</button>
      ${primeiraVez?'<span style="font-size:.78rem;color:var(--text-muted)">Primeira importação — todos entram como ativos.</span>':''}
    </div>`;
}
function funcCancelarImport(){
  _funcImportPreview = null;
  const inp = document.getElementById('func-file-input'); if(inp) inp.value='';
  const box = document.getElementById('func-import-preview'); if(box) box.innerHTML='';
}

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════
function renderFuncionarios(){
  if(!_funcCarregado){
    funcCarregar().then(()=>renderFuncionarios());
    const c = document.getElementById('func-content');
    if(c) c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">⏳ Carregando funcionários...</div>';
    return;
  }
  const ativos = DB_FUNC.filter(f=>f.status==='ativo');
  const deslig = DB_FUNC.filter(f=>f.status==='desligado');
  const filiaisDistintas = new Set(ativos.map(f=>f.filial).filter(Boolean)).size;
  // KPIs
  const setTxt=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  setTxt('func-kpi-ativos', ativos.length);
  setTxt('func-kpi-deslig', deslig.length);
  setTxt('func-kpi-filiais', filiaisDistintas);
  setTxt('func-kpi-total', DB_FUNC.length);
  // Abas: destaca a ativa
  document.querySelectorAll('#page-funcionarios .dn-pill-tab').forEach(b=>b.classList.toggle('active', b.dataset.funcTab===_funcTab));
  const content = document.getElementById('func-content');
  if(!content) return;
  const nuvemAviso = !_funcNuvem
    ? '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:.8rem;color:#92400e">☁️ Sincronização na nuvem pendente — os dados estão salvos só neste navegador. Rode o CREATE TABLE da tabela <code>funcionarios_lista</code> pra sincronizar entre dispositivos.</div>'
    : '';

  if(_funcTab==='importar'){ content.innerHTML = nuvemAviso + funcHtmlImportar(); return; }

  funcPopularFiltroFilial();
  const lista = _funcTab==='ativos' ? ativos : deslig;
  const q = _fNorm((document.getElementById('func-filtro')||{value:''}).value);
  const filialSel = (document.getElementById('func-filtro-filial')||{value:''}).value;
  const filtrada = lista.filter(f =>
    (!filialSel || String(f.filial)===String(filialSel)) &&
    (!q || _fNorm(f.nome).includes(q) || _fNorm(f.matricula).includes(q) || _fNorm(funcFilialLabel(f.filial)).includes(q) || _fNorm(f.cargo).includes(q))
  );
  content.innerHTML = nuvemAviso + funcHtmlTabela(filtrada, _funcTab);
}

// Popula o dropdown de filtro por filial com as filiais presentes nos dados.
// Só reconstrói quando o conjunto de filiais muda, pra não atrapalhar quem
// está com o menu aberto ou digitando na busca ao mesmo tempo.
function funcPopularFiltroFilial(){
  const sel = document.getElementById('func-filtro-filial');
  if(!sel) return;
  const cods = [...new Set(DB_FUNC.map(f=>f.filial).filter(Boolean).map(String))].sort((a,b)=>{
    const na=parseInt(a,10), nb=parseInt(b,10);
    if(!isNaN(na)&&!isNaN(nb)) return na-nb;
    return a.localeCompare(b);
  });
  if(sel.options.length === cods.length+1) return; // já está populado com o mesmo conjunto
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todas as filiais</option>' +
    cods.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(funcFilialLabel(c))}</option>`).join('');
  if([...sel.options].some(o=>o.value===atual)) sel.value = atual;
}

function funcHtmlImportar(){
  return `
  <div style="max-width:760px">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:.85rem;color:#1e3a8a;line-height:1.7">
      Envie a planilha de ativos (ex.: <strong>Lista de ativos DD.MM.AAAA.xlsx</strong>). Ao confirmar:
      <ul style="margin:6px 0 0 18px;padding:0">
        <li>Quem está na planilha e ainda não existe → entra em <strong>Ativos</strong>.</li>
        <li>Quem estava ativo e <strong>não está mais</strong> na planilha → vai pra <strong>Desligados</strong>.</li>
        <li>Matrículas repetidas na planilha → <strong>ignoradas</strong> (a 1ª vale).</li>
      </ul>
    </div>
    <label for="func-file-input" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed #cbd5e1;border-radius:12px;padding:32px;cursor:pointer;background:#f8fafc;text-align:center">
      <div style="font-size:2rem">📥</div>
      <div style="font-weight:700">Clique para escolher a planilha</div>
      <div style="font-size:.8rem;color:var(--text-muted)">Arquivos .xlsx ou .csv</div>
    </label>
    <input type="file" id="func-file-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="funcHandleFile(event)"/>
    <div id="func-import-preview" style="margin-top:18px"></div>
  </div>`;
}

function funcHtmlTabela(lista, aba){
  if(!lista.length){
    return `<div style="padding:40px;text-align:center;color:var(--text-muted)"><div style="font-size:2.2rem;margin-bottom:8px">${aba==='ativos'?'👥':'📤'}</div><div style="font-weight:700">Nenhum funcionário ${aba==='ativos'?'ativo':'desligado'}${document.getElementById('func-filtro')&&document.getElementById('func-filtro').value?' com esse filtro':''}.</div>${DB_FUNC.length===0?'<div style="font-size:.85rem;margin-top:6px">Comece importando uma planilha na aba <strong>Importar Planilha</strong>.</div>':''}</div>`;
  }
  // Só os campos DESTACADOS aparecem na tabela: matrícula, nome, filial, função
  // e admissão. O restante (seção, situação) abre ao clicar no nome.
  const linhas = lista.map(f=>`<tr style="cursor:pointer" onclick="funcAbrirDetalhe('${escapeHtml(f.matricula)}')" title="Ver todos os dados">
    <td><strong style="font-family:'DM Mono',monospace;font-size:.85rem;color:var(--primary)">${escapeHtml(f.matricula)}</strong></td>
    <td><strong style="font-size:.9rem;color:var(--primary);text-decoration:underline;text-decoration-color:#cbd5e1">${escapeHtml(f.nome)}</strong></td>
    <td><span style="display:inline-block;background:var(--primary);color:#fff;padding:2px 9px;border-radius:20px;font-size:.76rem;font-weight:600">${escapeHtml(funcFilialLabel(f.filial))}</span></td>
    <td><strong style="font-size:.82rem">${escapeHtml(f.cargo)||'—'}</strong></td>
    <td><strong style="font-size:.82rem">${escapeHtml(f.admissao)||'—'}</strong></td>
  </tr>`).join('');
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Matrícula</th><th>Nome</th><th>Filial</th><th>Função</th><th>Admissão</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>
  <div style="margin-top:8px;font-size:.78rem;color:var(--text-muted)">Exibindo ${lista.length} funcionário(s) — clique em um nome para ver todos os dados.</div>`;
}

// ── Detalhe do funcionário (abre ao clicar no nome) — mostra TODOS os campos ──
function funcAbrirDetalhe(matricula){
  const f = DB_FUNC.find(x=>String(x.matricula)===String(matricula));
  if(!f) return;
  const linha = (lbl,val,destaque)=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #f1f5f9">
    <span style="font-size:.8rem;color:var(--text-muted)">${lbl}</span>
    <span style="font-size:.86rem;font-weight:${destaque?'700':'500'};text-align:right;${destaque?'color:var(--primary)':''}">${val||'—'}</span></div>`;
  const isAtivo = f.status==='ativo';
  const overlay = document.createElement('div');
  overlay.className = 'func-detalhe-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .15s ease';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 70px rgba(0,0,0,.35)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;background:linear-gradient(135deg,var(--primary),var(--primary-light,#1e3a5f));border-radius:16px 16px 0 0">
        <div style="min-width:0">
          <div style="color:#fff;font-weight:800;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.nome)}</div>
          <div style="color:rgba(255,255,255,.8);font-size:.78rem;margin-top:2px">Matrícula ${escapeHtml(f.matricula)} · <span style="background:${isAtivo?'rgba(34,197,94,.9)':'rgba(239,68,68,.9)'};padding:1px 8px;border-radius:20px;font-weight:700">${isAtivo?'ATIVO':'DESLIGADO'}</span></div>
        </div>
        <button onclick="this.closest('.func-detalhe-overlay').remove()" style="background:rgba(255,255,255,.18);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;flex-shrink:0;font-size:1rem">✕</button>
      </div>
      <div style="padding:14px 22px 22px">
        ${linha('Matrícula', `<span style="font-family:'DM Mono',monospace">${escapeHtml(f.matricula)}</span>`, true)}
        ${linha('Nome', escapeHtml(f.nome), true)}
        ${linha('Filial', escapeHtml(funcFilialLabel(f.filial)), true)}
        ${linha('Função', escapeHtml(f.cargo), true)}
        ${linha('Data de admissão', escapeHtml(f.admissao), true)}
        ${linha('Seção', escapeHtml(f.secao))}
        ${linha('Situação', escapeHtml(f.situacao))}
        ${f.importadoEm ? linha('Importado em', escapeHtml((f.importadoEm||'').split('T')[0])) : ''}
      </div>
    </div>`;
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function switchFuncTab(tab, el){
  _funcTab = tab;
  if(el){ document.querySelectorAll('#page-funcionarios .dn-pill-tab').forEach(b=>b.classList.remove('active')); el.classList.add('active'); }
  const fb = document.getElementById('func-filtro-bar');
  if(fb) fb.style.display = (tab==='importar') ? 'none' : '';
  renderFuncionarios();
}
