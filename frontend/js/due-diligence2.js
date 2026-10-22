// ═══════════════════════════════════════════════════════
// DUE DILIGENCE 2 — KYC & MÍDIAS NEGATIVAS
// ═══════════════════════════════════════════════════════
// HTML e CSS desta página vivem em arquivos próprios
// (frontend/due-diligence2-view.html e frontend/css/due-diligence2.css) —
// buscados uma única vez e cacheados em memória. O CSS é carregado direto
// pelo <link> do index.html; o HTML precisa de fetch() porque é injetado
// dinamicamente dentro de #content (ver globals.js). Por isso dd2HTML()
// virou assíncrona — quem a chama precisa dar await.
let dd2HTMLCache = null;
async function dd2HTML(){
  if(dd2HTMLCache) return dd2HTMLCache;
  const r = await fetch('due-diligence2-view.html');
  if(!r.ok) throw new Error('Falha ao carregar due-diligence2-view.html: HTTP '+r.status);
  dd2HTMLCache = await r.text();
  return dd2HTMLCache;
}


// ═══════════════════════════════════════════════════════
// DUE DILIGENCE 2 — JAVASCRIPT
// ═══════════════════════════════════════════════════════

// A chave do Portal da Transparência é PESSOAL e NUNCA deve existir no
// cliente (ficaria visível a qualquer visitante via "Ver código-fonte"). As
// consultas passam pela Edge Function, que guarda as chaves como secrets do
// lado do servidor — ver rota /portal/:endpoint no backend.
//
// Processos Judiciais NÃO usa a API pública do DataJud CNJ: o índice público
// do DataJud não expõe nome nem CPF/CNPJ das partes de um processo (só
// metadados — número, classe, órgão julgador, movimentações), então nunca é
// possível localizar processos de uma pessoa/empresa a partir do documento
// por ali. Em vez disso, usamos o DJEN (Diário de Justiça Eletrônico
// Nacional, comunicaapi.pje.jus.br) — API pública do CNJ que agrega
// citações, intimações e editais de tribunais de todo o país e permite
// buscar por nome da parte (nomeParte) ou por texto livre (útil pra achar o
// CPF/CNPJ escrito no teor da comunicação). É pública, sem chave, com CORS
// liberado — por isso é chamada direto do navegador, sem Edge Function.
// Tem rate limit de 20 requisições por janela por IP (ver dd2FetchDJEN).
function dd2PortalHeaders(){
  return { 'x-app-token': (typeof getAppToken==='function'?getAppToken():'') };
}
function dd2PortalUrl(rota, params){
  return `${EDGE_URL}/portal/${rota}?${params}`;
}

// Chamada genérica ao proxy /portal/:rota da Edge Function (Portal da
// Transparência) — GET com timeout, erro se HTTP não-OK, resultado sempre
// normalizado pra array. Vários pontos do arquivo (sanções, sócios, Radar)
// repetiam essa mesma closure — juntados aqui numa função só.
function dd2Chamar(rota,params,timeoutMs=12000){
  return fetch(dd2PortalUrl(rota,params+'&pagina=1'),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(timeoutMs)})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(d=>Array.isArray(d)?d:[]);
}

let dd2JudicialData = [];
let dd2CadastralData = null;
let dd2SancoesData = {ceis:[],cnep:[],leniencia:[],cepim:[],ceaf:[],internacional:[]};
let dd2PepData = [];
let dd2PepFalhou = false;
let dd2ContratosData = [];
let dd2ContratosFalhou = false;
let dd2MidiaData = [];
let dd2MidiaFalhou = false;
let dd2DiariosData = [];
let dd2BolsaData = [];
// Nomes usados na última busca do DJEN (alvo + sócios) — guardado à parte
// pra dd2RenderScore poder classificar cada comunicação por polo (réu vs
// autor) sem precisar re-buscar quem foi pesquisado.
let dd2JudicialNomesAlvo = [];
// Contexto (nome/documento/tipo/sócios) da última busca judicial — guardado
// pra permitir carregar as abas "Processos da Empresa"/"dos Sócios" (busca
// com janela de datas ampla, sob demanda) sem repetir os parâmetros.
let dd2JudicialCtx = null;
// Cache da busca "todos os processos" (janela de datas ampla) — feita uma
// única vez sob demanda (lazy, ao clicar na aba) pra não dobrar o consumo
// do rate limit do DJEN (20 req/janela) toda vez que a Aba de Comunicações
// Recentes já roda a busca padrão de 3 dias.
let dd2TodosProcessosData = null;
let dd2TodosProcessosCarregando = false;
// Investigação individual dos sócios (QSA): um item por sócio com os
// achados de cada base — alimenta o card próprio, o score e o checklist.
let dd2SociosData = [];
let dd2SociosFalhou = false;

// Máscara/formatação de CNPJ e CPF vivem em utils.js (soAlfanum, maskCnpj,
// maskCpf, fmtCnpj) — compartilhadas com due-diligence.js.
function dd2FormatDoc(input){
  const tipo = document.getElementById('dd2-tipo').value;
  input.value = tipo==='cnpj' ? maskCnpj(input.value) : maskCpf(input.value);
}

// Mostra o campo "Nome completo" só para CPF — não existe API pública que
// faça CPF→nome (LGPD), então sem esse campo a busca de processos (DJEN) e
// de mídia negativa fica restrita a casar o CPF cru no texto livre, o que
// tem cobertura bem menor que buscar pelo nome da parte.
function dd2OnTipoChange(){
  dd2FormatDoc(document.getElementById('dd2-doc'));
  const ehCpf=document.getElementById('dd2-tipo').value==='cpf';
  const grp=document.getElementById('dd2-nome-group');
  if(grp) grp.style.display=ehCpf?'flex':'none';
  const docEl=document.getElementById('dd2-doc');
  if(docEl) docEl.placeholder=ehCpf?'000.000.000-00 (opcional com nome)':'00.000.000/0001-00';
}

function dd2SetStep(id,state){
  const el=document.getElementById('dd2-step-'+id);
  if(!el)return;
  el.className='dd2-step '+state;
}

function dd2SetProgress(pct){
  const el=document.getElementById('dd2-prog-fill');
  if(el)el.style.width=pct+'%';
}

async function dd2Iniciar(){
  const tipo=document.getElementById('dd2-tipo').value;
  // CNPJ pode ter letra (ver soAlfanum em utils.js) — CPF continua só dígito.
  const doc=tipo==='cnpj'
    ? soAlfanum(document.getElementById('dd2-doc').value)
    : document.getElementById('dd2-doc').value.replace(/\D/g,'');
  // Só relevante pra CPF — pra CNPJ a razão social já vem da Receita Federal.
  const nomeManual=tipo==='cpf'?(document.getElementById('dd2-nome')?.value||'').trim():'';
  // Pra CPF, libera investigar só com o nome (sem documento) — útil quando
  // só se sabe o nome da pessoa. As bases que só existem por documento
  // (CEIS/CNEP/Leniência/CEPIM/CEAF, Bolsa Família) ficam indisponíveis
  // nesse modo (ver guardas abaixo); DJEN, PEP, Mídia Negativa e Diários
  // Oficiais funcionam normalmente só com o nome.
  if(doc.length<11 && !(tipo==='cpf'&&nomeManual)){alert('Informe um documento válido ou, pra CPF, ao menos o nome completo.');return;}
  const semDoc=doc.length<11;
  if(typeof auditLog==='function'){
    const alvoLog=tipo==='cnpj'?`CNPJ ${dd2FmtDoc(doc,tipo)}`:(semDoc?`CPF de "${nomeManual}" (sem documento)`:`CPF ${dd2FmtDoc(doc,tipo)}`+(nomeManual?` de "${nomeManual}"`:''));
    auditLog('pesquisa','due-diligence2',`Consulta ${alvoLog}`,{tipo});
  }
  const scCad=document.getElementById('dd2-sc-cadastral').checked;
  const scFis=document.getElementById('dd2-sc-fiscal').checked;
  const scJud=document.getElementById('dd2-sc-judicial').checked;
  const scSan=document.getElementById('dd2-sc-sancoes').checked;
  const scSocios=document.getElementById('dd2-sc-socios')?.checked??false;
  const scPep=document.getElementById('dd2-sc-pep').checked;
  const scContratos=document.getElementById('dd2-sc-contratos').checked;
  const scMid=document.getElementById('dd2-sc-midia').checked;
  const scDiarios=document.getElementById('dd2-sc-diarios').checked;
  const scBolsa=document.getElementById('dd2-sc-bolsa').checked;
  document.getElementById('dd2-progress').style.display='block';
  document.getElementById('dd2-report').style.display='none';
  document.getElementById('dd2-sec-midia').style.display=scMid?'block':'none';
  document.getElementById('dd2-sec-bolsa').style.display=scBolsa?'block':'none';
  dd2SetProgress(5);
  dd2JudicialData=[];dd2CadastralData=null;dd2SancoesData={ceis:[],cnep:[],leniencia:[],cepim:[],ceaf:[],tcu:[],internacional:[]};dd2PepData=[];dd2PepFalhou=false;dd2MidiaData=[];dd2MidiaFalhou=false;dd2DiariosData=[];dd2BolsaData=[];dd2SociosData=[];dd2SociosFalhou=false;dd2JudicialNomesAlvo=[];dd2ContratosData=[];dd2ContratosFalhou=false;
  dd2JudicialCtx=null;dd2TodosProcessosData=null;dd2TodosProcessosCarregando=false;
  if(document.getElementById('dd2-jud-tab-recentes')) dd2AbaJudicial('recentes');
  const elEmp=document.getElementById('dd2-judicial-empresa-content'), elSoc=document.getElementById('dd2-judicial-socios-content');
  if(elEmp) elEmp.innerHTML=''; if(elSoc) elSoc.innerHTML='';
  const tasks=[];

  // Failsafe: se alguma chamada travar inesperadamente, libera a tela mesmo assim
  let failsafeAcionado=false;
  const failsafe=setTimeout(()=>{
    failsafeAcionado=true;
    console.warn('DD2: failsafe acionado');
    document.getElementById('dd2-progress').style.display='none';
    document.getElementById('dd2-report').style.display='block';
  },35000);

  try {
  // cadastralPromise nunca rejeita (erros já tratados dentro) — permite que
  // Judicial e PEP aguardem os dados cadastrais (nome + sócios) sem correr
  // na frente da resposta da Receita Federal, como acontecia antes.
  let cadastralPromise=Promise.resolve(null);
  if(scCad&&tipo==='cnpj'){
    dd2SetStep('cadastral','active');
    cadastralPromise=dd2BuscarCNPJ(doc)
        .then(d=>{
          dd2CadastralData=d;
          dd2SetStep('cadastral','done');
          dd2SetProgress(20);
          dd2RenderCadastral(d);
          dd2RenderFiscal(d);
          return d;
        }).catch(()=>{
          dd2SetStep('cadastral','error');
          dd2RenderCadastral(null);
          dd2RenderFiscal(null);
          return null;
        });
    tasks.push(cadastralPromise);
  } else {
    dd2SetStep('cadastral','done');dd2SetProgress(20);
    document.getElementById('dd2-cadastral-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta cadastral disponível apenas para CNPJ.</p>';
    document.getElementById('dd2-fiscal-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta fiscal disponível apenas para CNPJ.</p>';
  }
  // djenItemsPromise e diariosPromise ficam disponíveis fora do if pra
  // alimentar a resolução automática de nome por CPF logo abaixo, mesmo
  // que os cards já tenham sido renderizados nesse meio-tempo.
  let djenItemsPromise=Promise.resolve([]);
  if(scJud){
    dd2SetStep('judicial','active');
    djenItemsPromise=cadastralPromise.then(cad=>{
        const nome=cad?.razao||nomeManual||'';
        const socios=cad?.socios||[];
        return dd2BuscarProcessosDJEN(nome,doc,tipo,socios).then(res=>{
          dd2JudicialData=res.items;
          dd2RenderJudicial(res,nome,doc,tipo,socios);
          dd2SetStep('judicial','done');dd2SetProgress(50);
          return res.items;
        });
      }).catch(()=>{
        dd2SetStep('judicial','error');
        dd2JudicialData=[];
        document.getElementById('dd2-judicial-content').innerHTML=`<p style="color:#ef4444;margin-bottom:10px">⚠️ Não foi possível consultar o DJEN automaticamente no momento.</p>${dd2LinksManuaisHTML(dd2CadastralData?.razao||nomeManual||'',doc,tipo,dd2CadastralData?.socios||[])}`;
        return [];
      });
    tasks.push(djenItemsPromise);
  } else {
    dd2SetStep('judicial','done');
    document.getElementById('dd2-judicial-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta judicial não selecionada.</p>';
  }
  let diariosPromise=Promise.resolve([]);
  if(scDiarios){
    dd2SetStep('diarios','active');
    diariosPromise=cadastralPromise.then(cad=>{
        const nome=cad?.razao||nomeManual||'';
        return dd2BuscarDiarios(nome,doc,tipo,cad?.uf).then(res=>({res,nome}));
      }).then(({res,nome})=>{
        dd2DiariosData=res.items;
        dd2RenderDiarios(res,tipo==='cpf'&&!nome);
        dd2SetStep('diarios','done');
        return res.items;
      }).catch(()=>{
        dd2SetStep('diarios','error');
        dd2DiariosData=[];
        dd2RenderDiarios(null);
        return [];
      });
    tasks.push(diariosPromise);
  } else {
    dd2SetStep('diarios','done');
    document.getElementById('dd2-diarios-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta de diários oficiais não selecionada.</p>';
  }
  // Só faz sentido tentar achar o nome quando é CPF e o usuário não
  // informou um — pra CNPJ a razão social já vem da Receita Federal, e se
  // o usuário já digitou o nome não há o que descobrir.
  let nomeResolvidoPromise=Promise.resolve('');
  if(tipo==='cpf'&&!nomeManual){
    nomeResolvidoPromise=Promise.all([djenItemsPromise,diariosPromise]).then(([djenItems,diarioItems])=>{
      const docFmt=dd2FmtDoc(doc,tipo);
      const candidato=dd2CandidatoNomePorCPF({djen:djenItems,diarios:diarioItems},docFmt);
      dd2RenderNomeIdentificado(candidato);
      if(candidato){
        const campo=document.getElementById('dd2-nome');
        if(campo&&!campo.value)campo.value=candidato.nome;
        return candidato.nome;
      }
      return '';
    }).catch(()=>{dd2RenderNomeIdentificado(null);return '';});
    // A busca em diários pra CPF é só pelo nome (ver dd2BuscarDiarios) — se
    // não tinha nome nenhum na primeira passada, ela roda vazia. Assim que
    // um nome é identificado automaticamente (via DJEN, acima), refaz a
    // busca nos diários com esse nome, em vez de deixar a seção presa no
    // aviso "nenhum nome disponível" pro resto do relatório.
    if(scDiarios){
      tasks.push(
        nomeResolvidoPromise.then(nomeResolvido=>{
          if(!nomeResolvido) return;
          dd2SetStep('diarios','active');
          return dd2BuscarDiarios(nomeResolvido,doc,tipo,dd2CadastralData?.uf).then(res=>{
            dd2DiariosData=res.items;
            dd2RenderDiarios(res,false);
            dd2SetStep('diarios','done');
          });
        }).catch(()=>{})
      );
    }
  }
  if(scSan){
    dd2SetStep('sancoes','active');
    tasks.push(
      // allSettled (em vez de all) pra que a falha de UMA base não mascare
      // o resultado real da outra — mesmo cuidado do Bolsa Família, ver
      // dd2FetchBolsaFamilia. Um HTTP não-OK agora vira rejeição explícita,
      // não um "[]" silencioso que se confunde com "nenhuma sanção".
      // Leniência e CEPIM só existem pra pessoa jurídica; CEAF só pra
      // pessoa física — pedidos pro tipo errado nem saem do ar.
      Promise.all([cadastralPromise,nomeResolvidoPromise]).then(([cad,nomeResolvido])=>{
        const nomeParaSancao=cad?.razao||nomeManual||nomeResolvido||'';
        const chamar=(rota,params)=>dd2Chamar(rota,params,10000);
        // CEIS/CNEP/Leniência/CEPIM/CEAF só existem por número de documento —
        // sem doc (modo só-nome), pedir com codigoSancionado vazio não acha
        // nada e não é "sem sanção", é "não verificado". Só a base
        // internacional (por nome) roda nesse caso.
        return Promise.allSettled([
          semDoc?Promise.resolve([]):chamar('ceis','codigoSancionado='+doc),
          semDoc?Promise.resolve([]):chamar('cnep','codigoSancionado='+doc),
          (!semDoc&&tipo==='cnpj')?chamar('acordos-leniencia','cnpjSancionado='+doc):Promise.resolve([]),
          (!semDoc&&tipo==='cnpj')?chamar('cepim','cnpjSancionado='+doc):Promise.resolve([]),
          (!semDoc&&tipo==='cpf')?chamar('ceaf','cpfSancionado='+doc):Promise.resolve([]),
          nomeParaSancao?dd2FetchSanctionsNetwork(nomeParaSancao):Promise.resolve([]),
          semDoc?Promise.resolve([]):dd2FetchTCUInidoneos().then(items=>dd2TcuPorDocumento(items,doc)),
        ]).then(resultados=>[resultados,nomeParaSancao]);
      }).then(([[ceisRes,cnepRes,lenRes,cepimRes,ceafRes,intRes,tcuRes],nomeParaSancao])=>{
        const pega=r=>r.status==='fulfilled'&&Array.isArray(r.value)?r.value:[];
        dd2SancoesData={
          ceis:pega(ceisRes),cnep:pega(cnepRes),leniencia:pega(lenRes),cepim:pega(cepimRes),ceaf:pega(ceafRes),
          tcu:pega(tcuRes),
          internacional:dd2FiltrarRuidoSancoesIntl(pega(intRes),nomeParaSancao),
          ceisFalhou:!semDoc&&ceisRes.status==='rejected',cnepFalhou:!semDoc&&cnepRes.status==='rejected',
          tcuFalhou:!semDoc&&tcuRes.status==='rejected',
          semDocumento:semDoc,
        };
        dd2SetStep('sancoes',(!semDoc&&ceisRes.status==='rejected'&&cnepRes.status==='rejected')?'error':'done');dd2SetProgress(65);
        dd2RenderSancoes(dd2SancoesData);
      })
    );
  } else {
    dd2SetStep('sancoes','done');
    document.getElementById('dd2-sancoes-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta de sanções não selecionada.</p>';
  }
  // ── Investigação individual dos sócios (CNPJ, via QSA) ou empresas
  // vinculadas ao nome pesquisado (CPF, sem QSA) ──
  if(scSocios&&tipo==='cnpj'){
    dd2SetStep('socios','active');
    document.getElementById('dd2-sec-socios').style.display='block';
    document.getElementById('dd2-socios-titulo').innerHTML='&#128373; Investigação dos Sócios';
    document.getElementById('dd2-socios-content').innerHTML='<div class="dd2-loading">&#9203; Investigando cada sócio (PEP, sanções, TCU, mídia negativa)...</div>';
    tasks.push(
      // Espera também o DJEN (quando a consulta judicial está ligada) pra
      // cruzar as comunicações processuais por sócio sem repetir chamadas —
      // o catch garante que uma falha do DJEN vira "não verificado" (null)
      // em vez de derrubar a investigação dos sócios inteira.
      Promise.all([cadastralPromise,scJud?djenItemsPromise.catch(()=>null):Promise.resolve(null)]).then(([cad,djenItems])=>{
        const socios=(cad?.socios||[]).filter(s=>s.nome);
        if(!socios.length){
          document.getElementById('dd2-socios-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Nenhum sócio listado no QSA — nada a investigar.</p>';
          dd2SetStep('socios','done');
          return;
        }
        return dd2InvestigarSocios(socios,djenItems,doc).then(res=>{
          dd2SociosData=res;dd2SociosFalhou=false;
          dd2RenderSocios(res);
          dd2SetStep('socios','done');dd2SetProgress(72);
        });
      }).catch(()=>{
        dd2SociosFalhou=true;dd2SetStep('socios','error');
        document.getElementById('dd2-socios-content').innerHTML='<p style="color:#ef4444">⚠️ Não foi possível concluir a investigação automática dos sócios — use os links manuais da seção Judicial.</p>';
      })
    );
  } else if(scSocios&&tipo==='cpf'){
    // Busca por CPF/nome direto (não via QSA de um CNPJ) — não tem sócios
    // pra investigar, mas ainda dá pra checar se esse nome aparece como
    // sócio/administrador em OUTRAS empresas (reaproveita o mesmo card).
    dd2SetStep('socios','active');
    document.getElementById('dd2-sec-socios').style.display='block';
    document.getElementById('dd2-socios-titulo').innerHTML='&#127970; Empresas Vinculadas';
    document.getElementById('dd2-socios-content').innerHTML='<div class="dd2-loading">&#9203; Buscando empresas vinculadas a este nome...</div>';
    tasks.push(
      Promise.all([cadastralPromise,nomeResolvidoPromise]).then(([cad,nomeResolvido])=>{
        const nomePessoa=nomeManual||nomeResolvido||cad?.razao||'';
        if(!nomePessoa||nomePessoa.trim().length<3){
          document.getElementById('dd2-socios-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Nome não identificado — não é possível buscar empresas vinculadas.</p>';
          dd2SetStep('socios','done');
          return;
        }
        return dd2FetchEmpresasVinculadas(nomePessoa).then(empresas=>{
          dd2RenderEmpresasPessoa(nomePessoa,empresas);
          dd2SetStep('socios','done');dd2SetProgress(72);
        });
      }).catch(()=>{
        dd2SetStep('socios','error');
        dd2RenderEmpresasPessoa(nomeManual||'',null);
      })
    );
  } else {
    dd2SetStep('socios','done');
    document.getElementById('dd2-sec-socios').style.display='none';
    document.getElementById('dd2-socios-titulo').innerHTML='&#128373; Investigação dos Sócios';
  }
  if(scPep){
    dd2SetStep('pep','active');
    tasks.push(
      cadastralPromise.then(cad=>dd2FetchPep(cad?.razao||'',tipo==='cpf'?doc:'')).then(d=>{
        dd2PepData=d;dd2PepFalhou=false;dd2SetStep('pep','done');dd2SetProgress(78);
        dd2RenderPep(d,false);
      }).catch(()=>{dd2SetStep('pep','error');dd2PepData=[];dd2PepFalhou=true;dd2RenderPep([],true);})
    );
  } else {
    dd2SetStep('pep','done');
    document.getElementById('dd2-pep-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta PEP não selecionada.</p>';
  }
  if(scContratos && !semDoc){
    dd2SetStep('contratos','active');
    tasks.push(
      Promise.all([cadastralPromise,nomeResolvidoPromise]).then(([cad,nomeResolvido])=>{
        const nomeParaPncp=cad?.razao||nomeManual||nomeResolvido||'';
        return dd2FetchContratosFederais(doc).then(d=>{
          dd2ContratosData=d;dd2ContratosFalhou=false;dd2SetStep('contratos','done');
          dd2RenderContratosFederais(d,false,nomeParaPncp);
        }).catch(()=>{dd2SetStep('contratos','error');dd2ContratosData=[];dd2ContratosFalhou=true;dd2RenderContratosFederais([],true,nomeParaPncp);});
      })
    );
  } else if(scContratos){
    // Modo só-nome (sem documento) — a API do governo exige CPF/CNPJ, não
    // existe busca por nome pra contratos federais. Ainda dá pra oferecer
    // o link manual do PNCP, que busca por nome/palavra-chave.
    dd2SetStep('contratos','done');
    document.getElementById('dd2-contratos-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta automática de contratos federais exige CPF/CNPJ.</p>'+dd2PncpLinkHtml(nomeManual);
  } else {
    dd2SetStep('contratos','done');
    document.getElementById('dd2-contratos-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta de contratos não selecionada.</p>';
  }
  if(scMid){
    dd2SetStep('midia','active');
    tasks.push(
      Promise.all([cadastralPromise,nomeResolvidoPromise]).then(([cad,nomeResolvido])=>{
        const nome=cad?.razao||nomeManual||nomeResolvido||doc;
        const fantasia=cad?.fantasia||'';
        const docFmt=dd2FmtDoc(doc,tipo);
        return dd2BuscarMidiaNegativa(nome,docFmt,fantasia).then(items=>{
          dd2MidiaData=items;dd2MidiaFalhou=false;dd2SetStep('midia','done');dd2SetProgress(88);
          dd2RenderMidia(items,nome,docFmt,false,fantasia);
        }).catch(()=>{
          dd2SetStep('midia','error');
          dd2MidiaData=[];dd2MidiaFalhou=true;
          dd2RenderMidia([],nome,docFmt,true,fantasia);
        });
      })
    );
  } else { dd2SetStep('midia','done'); }
  if(scBolsa&&tipo==='cpf'&&!semDoc){
    dd2SetStep('bolsa','active');
    tasks.push(
      dd2FetchBolsaFamilia(doc).then(res=>{
        dd2BolsaData=res.items;dd2SetStep('bolsa','done');dd2SetProgress(92);
        dd2RenderBolsaFamilia(res);
      }).catch(()=>{dd2SetStep('bolsa','error');dd2RenderBolsaFamilia(null);})
    );
  } else if(scBolsa&&tipo==='cpf'){
    // Modo só-nome (sem CPF) — não existe busca de Bolsa Família por nome.
    dd2SetStep('bolsa','done');
    document.getElementById('dd2-bolsa-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta de Bolsa Família exige o CPF — informe o documento pra habilitar essa verificação.</p>';
  } else if(scBolsa){
    dd2SetStep('bolsa','done');
    document.getElementById('dd2-bolsa-content').innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta de Bolsa Família disponível apenas para CPF.</p>';
  } else {
    dd2SetStep('bolsa','done');
  }
  await Promise.allSettled(tasks);
  dd2SetStep('analise','active');
  dd2SetProgress(95);
  dd2RenderScore();
  dd2RenderTimeline();
  dd2RenderChecklist();
  dd2SetStep('analise','done');
  dd2SetProgress(100);
  const now=new Date();
  document.getElementById('dd2-export-meta').textContent='Relatório gerado em '+now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR')+' — '+doc;
  dd2UltimaPesquisa={tipo,doc,nome:dd2CadastralData?.razao||nomeManual||(dd2JudicialCtx?.nome)||''};
  } catch(e) {
    console.error('dd2Iniciar erro:', e);
  } finally {
    clearTimeout(failsafe);
    if(!failsafeAcionado){
      document.getElementById('dd2-progress').style.display='none';
      document.getElementById('dd2-report').style.display='block';
    }
  }
}

// Busca CNPJ direto nas APIs públicas (mesmo padrão do Due Diligence 1),
// com fallback entre provedores e normalização unificada dos campos.
async function dd2BuscarCNPJ(doc){
  const apis=cnpjApisList(doc);
  let found=null;
  for(const a of apis){ found=await ddTryApi(a.url,a.name,null); if(found) break; }
  if(!found) throw new Error('CNPJ APIs indisponíveis');
  const norm=ddNorm(found.data,found.api);
  if(!norm) throw new Error('Falha ao normalizar dados do CNPJ');
  return norm;
}

async function dd2FetchPep(nome,cpf){
  if(!nome&&!cpf)return[];
  // Busca exata por CPF quando disponível (muito mais precisa que por nome)
  const qs=cpf?('cpf='+cpf):('nome='+encodeURIComponent(nome.split(' ').slice(0,3).join(' ')));
  const r=await fetch(dd2PortalUrl('peps',qs+'&pagina=1'),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(10000)});
  // Lança em vez de devolver [] silenciosamente — um HTTP de erro (ex.: 401
  // de token expirado) não pode virar "não é PEP" na tela, senão o score de
  // risco nunca reflete uma falha real de verificação.
  if(!r.ok)throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d)?d:[];
}

// Consulta contratos com o Poder Executivo Federal por CPF/CNPJ do
// fornecedor. É especificamente FEDERAL — a API do Portal da
// Transparência não cobre licitação/contrato de estado ou município (cada
// um teria seu próprio portal, bem fragmentado). Útil pra conflito de
// interesse/PLD: fornecedor que já contrata com o governo.
async function dd2FetchContratosFederais(doc){
  if(!doc)return[];
  const r=await fetch(dd2PortalUrl('contratos-federais','cpfCnpj='+doc+'&pagina=1'),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d)?d:[];
}

// Consulta se o CPF/NIS recebeu parcelas do Bolsa Família (Portal da Transparência).
// A API exige um mês de referência (AAAAMM) por chamada — o período é definido
// pelos campos "Período de" / "Período até" do formulário (padrão: 06/2025 a 07/2026).
function dd2BolsaMeses(){
  const de=document.getElementById('dd2-bolsa-de')?.value||'2025-06';
  const ate=document.getElementById('dd2-bolsa-ate')?.value||'2026-07';
  let [ano,mes]=de.split('-').map(Number);
  const [anoFim,mesFim]=ate.split('-').map(Number);
  const meses=[];
  let guardaChuva=0; // proteção contra período invertido/gigante
  while((ano<anoFim || (ano===anoFim && mes<=mesFim)) && guardaChuva<60){
    meses.push(ano+String(mes).padStart(2,'0'));
    mes++;
    if(mes>12){mes=1;ano++;}
    guardaChuva++;
  }
  return meses;
}
// Consulta as DUAS bases: o Bolsa Família antigo (descontinuado em 2021) e o
// Novo Bolsa Família (programa atual, desde 2023) — um pagamento recente só
// aparece na segunda base, então checamos as duas pra não perder nenhuma.
// Uma chamada isolada falhar não derruba a consulta toda (rede instável, um
// mês sem dados etc.) — só se TODAS falharem é que reportamos erro de verdade,
// pra não mascarar uma falha real (chave errada, rota fora do ar) como "não recebe".
// Retorna { items, baseAntigaFalhou, baseNovaFalhou } — falha de UMA base
// inteira é reportada separadamente, pra não virar um falso "não recebe".
// Resolve o NIS real da pessoa a partir do CPF (a base "novo" exige o NIS,
// que normalmente é um número diferente do CPF — buscar pelo CPF direto
// nessa base praticamente nunca encontra nada). Antes, qualquer falha na
// chamada (401 de chave/rate-limit, timeout, etc.) virava silenciosamente
// "NIS não encontrado" — indistinguível de "consultei e essa pessoa
// realmente não tem NIS cadastrado". Agora devolve {nis, falhou} pra a UI
// mostrar a mensagem certa em cada caso.
// Tenta em cascata, porque nenhuma fonte sozinha cobre todo mundo:
// 1) /pessoa-fisica — só devolve NIS de quem TAMBÉM aparece em outros
//    cadastros federais (servidor, sancionado, contratado...) — um
//    beneficiário "puro" de Bolsa Família volta null aqui;
// 2) /auxilio-emergencial-por-cpf-ou-nis — aceita CPF e a resposta traz
//    beneficiario.nis. Cobre ~68 milhões de pessoas (2020/21), e quem
//    recebia Bolsa Família foi inscrito automaticamente — na prática é o
//    melhor resolvedor CPF→NIS público que existe;
// 3) /bpc-por-cpf-ou-nis — mesmo padrão, cobre beneficiários do BPC.
async function dd2ResolverNis(cpf){
  let algumaFalhou=false;
  // fonte 1: pessoa-fisica (registro?.nis direto)
  try{
    const r=await fetch(dd2PortalUrl('pessoa-fisica','cpf='+cpf),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(10000)});
    if(!r.ok){algumaFalhou=true;}
    else{
      const d=await r.json();
      const registro=Array.isArray(d)?d[0]:d;
      if(registro?.nis)return {nis:registro.nis,falhou:false};
    }
  }catch(e){ algumaFalhou=true; }
  // fontes 2 e 3: benefícios consultáveis por CPF cuja resposta expõe o NIS
  // do beneficiário (confirmado no OpenAPI oficial do Portal: BeneficiarioDTO
  // e BeneficiarioBPCDTO têm campo "nis"). O CPF volta mascarado
  // (***.234.567-**), então conferimos os dígitos do meio antes de aceitar.
  const meioCpf=cpf.slice(3,9);
  const extrairNis=(lista)=>{
    for(const item of (Array.isArray(lista)?lista:[])){
      for(const p of [item?.beneficiario,item?.responsavelAuxilioEmergencial,item?.titularBolsaFamilia]){
        const cpfMasc=(p?.cpfFormatado||'').replace(/\D/g,'');
        if(p?.nis&&p.nis!=='0'&&(!cpfMasc||cpfMasc.includes(meioCpf)))return p.nis;
      }
    }
    return null;
  };
  for(const [rota,params] of [['auxilio-emergencial','codigoBeneficiario='+cpf],['bpc','codigo='+cpf]]){
    try{
      const r=await fetch(dd2PortalUrl(rota,params+'&pagina=1'),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(10000)});
      if(!r.ok){
        // 400 aqui inclui "rota não cadastrada na Edge Function" — trata como
        // fonte indisponível e segue pras demais, sem derrubar a cadeia.
        algumaFalhou=true;continue;
      }
      const nis=extrairNis(await r.json());
      if(nis)return {nis,falhou:false};
    }catch(e){ algumaFalhou=true; }
  }
  return {nis:null,falhou:algumaFalhou};
}

// Dispara as chamadas em lotes pequenos, com um intervalo entre lotes, e
// tenta de novo uma vez só os índices que falharam — 14 meses × 2 bases é
// até 28 chamadas de uma vez só pro Bolsa Família (mais tudo que o resto do
// Due Diligence 2 dispara em paralelo), o que na prática estoura o rate
// limit do Portal da Transparência com frequência. Isso é o que fazia a
// base do Novo Bolsa Família falhar parcialmente mesmo quando a pessoa
// realmente não tinha nada a esconder — reduzir a concorrência e tentar de
// novo os que falharam recupera a maioria dos casos de rate-limit
// transitório sem precisar aumentar timeout nem mudar o resultado.
async function dd2ChamarEmLotes(fns,tamanhoLote=4,intervaloMs=350){
  const resultados=[];
  for(let i=0;i<fns.length;i+=tamanhoLote){
    const lote=fns.slice(i,i+tamanhoLote).map(fn=>fn());
    resultados.push(...await Promise.allSettled(lote));
    if(i+tamanhoLote<fns.length) await new Promise(r=>setTimeout(r,intervaloMs));
  }
  return resultados;
}

// O rate limit do Portal é por JANELA DE MINUTO — um retry 700ms depois cai
// na mesma janela já estourada e falha de novo (era o que acontecia: o aviso
// "resultado pode estar incompleto" aparecia mesmo com retry). Agora são
// duas rodadas de retry com esperas que dão tempo da janela virar.
async function dd2ExecutarComRetry(fns){
  const resultados=await dd2ChamarEmLotes(fns,3,450);
  for(const esperaMs of [3000,9000]){
    const pendentes=resultados.map((r,i)=>r.status==='rejected'?i:-1).filter(i=>i>=0);
    if(!pendentes.length)break;
    await new Promise(r=>setTimeout(r,esperaMs));
    const retry=await dd2ChamarEmLotes(pendentes.map(i=>fns[i]),3,450);
    pendentes.forEach((idxOriginal,j)=>{ resultados[idxOriginal]=retry[j]; });
  }
  return resultados;
}

async function dd2FetchBolsaFamilia(cpf){
  const meses=dd2BolsaMeses();
  const chamar=(rota,params)=>dd2Chamar(rota,params,10000);

  const {nis,falhou:nisFalhou}=await dd2ResolverNis(cpf);
  const antigasFns=meses.map(anoMes=>()=>chamar('bolsa-familia','codigo='+cpf+'&anoMesReferencia='+anoMes));

  // Sequencial de propósito: rodar as duas bases em paralelo dobrava a
  // pressão na mesma janela de rate-limit do Portal e derrubava as duas.
  const resAntigas=await dd2ExecutarComRetry(antigasFns);
  const okAntigas=resAntigas.filter(r=>r.status==='fulfilled');
  const antigasParcialFalhou=okAntigas.length<meses.length;

  // ── Base nova (novo-bolsa-familia-sacado-por-nis) — particularidades
  // descobertas ao vivo (nenhuma está no contrato OpenAPI):
  // 1. Mês é OBRIGATÓRIO: sem ele volta 400 "Informe ano e mês de
  //    competência ou de referência.";
  // 2. Mês SEM parcela do NIS não devolve [] — devolve 400 genérico
  //    {"Erro na API":"Erro ao executar a consulta"} (confirmado ao vivo:
  //    NIS que o site mostra com parcela em 06/2026 recebe esse erro em
  //    05/2026 e 07/2026). Ou seja: pra esse endpoint, esse erro específico
  //    É a resposta de "nada nesse mês" — tratamos como lista vazia, não
  //    como falha. Falha real (401/429/timeout) continua sendo falha.
  let novasItems=[];let novasParcialFalhou=false;let novasTotalFalhou=false;
  if(nis){
    const marcaNovo=d=>d.map(item=>({...item,_novo:true}));
    let respostas200=0; // meses que responderam 200 de verdade
    const chamarNovo=(params)=>fetch(dd2PortalUrl('bolsa-familia-novo',params),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(10000)}).then(async r=>{
      if(!r.ok){
        const corpo=await r.text().catch(()=>'');
        if(r.status===400&&corpo.includes('Erro ao executar a consulta'))return [];
        throw new Error('HTTP '+r.status);
      }
      respostas200++;
      return r.json();
    }).then(d=>Array.isArray(d)?d:[]);
    const varrer=async(paramMes)=>{
      const fns=meses.map(anoMes=>()=>chamarNovo('nis='+nis+'&'+paramMes+'='+anoMes+'&pagina=1'));
      const res=await dd2ExecutarComRetry(fns);
      return{
        itens:res.filter(r=>r.status==='fulfilled').flatMap(r=>r.value),
        falhas:res.filter(r=>r.status==='rejected').length,
      };
    };
    // O site rotula a parcela por "Referência Mês" — tenta referência
    // primeiro; se não achar nada, repete com competência (só custa a
    // segunda varredura quando a primeira veio vazia).
    let v=await varrer('anoMesReferencia');
    if(!v.itens.length&&v.falhas<meses.length){
      const v2=await varrer('anoMesCompetencia');
      if(v2.itens.length||v2.falhas<v.falhas)v=v2;
    }
    novasItems=marcaNovo(v.itens);
    novasTotalFalhou=v.falhas>=meses.length;
    // Sem nenhum 200 de verdade e sem item, não dá pra jurar que "erro ==
    // sem parcela" valeu pra todos os meses — mantém o aviso de possível
    // incompletude em vez de um verde categórico.
    novasParcialFalhou=!novasTotalFalhou&&(v.falhas>0||(!novasItems.length&&respostas200===0));
  }

  // ── Auxílio Brasil (11/2021 a 03/2023) — é o mesmo programa, renomeado
  // nesse intervalo (entre o Bolsa Família antigo e o Novo). O endpoint
  // individual dele FUNCIONA (testado ao vivo com anoMesCompetencia, mesmo
  // NIS). Só consulta os meses do período selecionado que caem na vigência
  // do programa — pro período padrão (recente) são zero chamadas extras.
  let abItems=[];let abParcialFalhou=false;
  const mesesAB=meses.filter(m=>String(m)>='202111'&&String(m)<='202303');
  if(nis&&mesesAB.length){
    const chamarAB=(params)=>fetch(dd2PortalUrl('auxilio-brasil',params),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(10000)}).then(async r=>{
      if(!r.ok){
        const corpo=await r.text().catch(()=>'');
        if(r.status===400&&corpo.includes('Erro ao executar a consulta'))return [];
        throw new Error('HTTP '+r.status);
      }
      return r.json();
    }).then(d=>Array.isArray(d)?d:[]);
    const resAB=await dd2ExecutarComRetry(mesesAB.map(anoMes=>()=>chamarAB('nis='+nis+'&anoMesCompetencia='+anoMes+'&pagina=1')));
    abItems=resAB.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).map(item=>({...item,_ab:true}));
    abParcialFalhou=resAB.some(r=>r.status==='rejected');
  }

  // Zero sucesso nas DUAS bases é falha de verdade — antes só disparava
  // quando o NIS tinha sido resolvido, deixando escapar em silêncio o caso
  // (mais comum) de resolução de NIS falhar E a base antiga falhar junto.
  if(okAntigas.length===0 && meses.length>0 && (!nis||novasTotalFalhou)) throw new Error('Todas as consultas de Bolsa Família falharam');

  return {
    items:[...okAntigas.flatMap(r=>r.value), ...abItems, ...novasItems],
    baseAntigaFalhou:antigasParcialFalhou,
    baseNovaFalhou:novasParcialFalhou||novasTotalFalhou,
    auxilioBrasilFalhou:abParcialFalhou,
    nisNaoEncontrado:!nis&&!nisFalhou,
    nisFalhouAoConsultar:nisFalhou,
    nis,
  };
}

function dd2RenderCadastral(d){
  const el=document.getElementById('dd2-cadastral-content');
  if(!d){el.innerHTML='<p style="color:#ef4444">Não foi possível obter dados cadastrais (APIs indisponíveis no momento).</p>';return;}
  const sit=d.situacao||'—';
  const sitOk=(sit.toUpperCase().includes('ATIVA')||sit.toUpperCase().includes('REGULAR'));
  el.innerHTML=`<div class="dd2-grid-3">
    <div class="dd2-field-item"><label>Razão Social</label><span>${escapeHtml(d.razao)||'—'}</span></div>
    <div class="dd2-field-item"><label>Situação Cadastral</label><span><span class="dd2-badge ${sitOk?'ok':'danger'}">${escapeHtml(sit)}</span></span></div>
    <div class="dd2-field-item"><label>Data de Abertura</label><span>${escapeHtml(d.abertura)||'—'}</span></div>
    <div class="dd2-field-item"><label>Natureza Jurídica</label><span>${escapeHtml(d.natureza)||'—'}</span></div>
    <div class="dd2-field-item"><label>Porte</label><span>${escapeHtml(d.porte)||'—'}</span></div>
    <div class="dd2-field-item"><label>Capital Social</label><span>${escapeHtml(d.capital)||'—'}</span></div>
    <div class="dd2-field-item"><label>CNAE Principal</label><span>${escapeHtml(d.cnae_pri?.desc)||'—'}</span></div>
    <div class="dd2-field-item" style="grid-column:1/-1"><label>Endereço</label><span>${escapeHtml(d.endereco)||'—'}</span></div>
  </div>`;
  if(d.socios?.length){
    document.getElementById('dd2-sec-qsa').style.display='block';
    document.getElementById('dd2-qsa-content').innerHTML=`<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th>Nome</th><th>Qualificação</th><th>CNPJ (quando sócio é PJ)</th></tr></thead><tbody>${d.socios.map(s=>{
      const docLimpo=soAlfanum(s.doc);
      const cnpjCel=(s.tipoSocio==='PJ'&&docLimpo.length===14)?`<a href="https://cnpjtransparencia.com.br/cnpj/${docLimpo}" target="_blank" style="color:#0f2d4a;font-family:'DM Mono',monospace">${dd2FmtDoc(docLimpo,'cnpj')}</a>`:'—';
      return `<tr><td>${escapeHtml(s.nome)||'—'}</td><td>${escapeHtml(s.qual)||'—'}</td><td>${cnpjCel}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
}

function dd2RenderFiscal(d){
  const el=document.getElementById('dd2-fiscal-content');
  if(!d){el.innerHTML='<p style="color:#ef4444">Dados fiscais não disponíveis (APIs indisponíveis no momento).</p>';return;}
  const sit=d.situacao||'—';
  const sitOk=(sit.toUpperCase().includes('ATIVA')||sit.toUpperCase().includes('REGULAR'));
  el.innerHTML=`<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th>Verificação</th><th>Resultado</th><th>Status</th></tr></thead><tbody>
    <tr><td>Situação na Receita Federal</td><td>${escapeHtml(sit)}</td><td><span class="dd2-badge ${sitOk?'ok':'danger'}">${sitOk?'Regular':'Irregular'}</span></td></tr>
    <tr><td>Data de Abertura</td><td>${escapeHtml(d.abertura)||'—'}</td><td><span class="dd2-badge info">Info</span></td></tr>
  </tbody></table></div>`;
}

function dd2FmtDoc(docNum,tipo){
  return tipo==='cnpj' ? fmtCnpj(docNum) : fmtCpf(docNum);
}

const DD2_DJEN_URL='https://comunicaapi.pje.jus.br/api/v1/comunicacao';

// Chama o DJEN direto do navegador — API pública, sem chave, com CORS
// liberado (ver nota no topo do arquivo). Rate limit: 20 requisições por
// janela por IP; em caso de estouro a API responde 429.
async function dd2FetchDJEN(params){
  const qs=new URLSearchParams({itensPorPagina:'100',...params}).toString();
  const r=await fetch(`${DD2_DJEN_URL}?${qs}`,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(15000)});
  if(r.status===429) throw new Error('RATE_LIMIT');
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d?.items)?d.items:[];
}

// Busca comunicações processuais (citação/intimação/edital) no DJEN: por
// texto livre com o documento formatado (o teor costuma trazer o CPF/CNPJ
// da parte por extenso) e, quando disponível, por nome da parte — inclusive
// de cada sócio, no caso de CNPJ, pra cobrir os processos das pessoas
// ligadas à empresa. Resultados de todas as buscas são mesclados e
// deduplicados por id.
async function dd2BuscarProcessosDJEN(nome,docNum,tipo,socios){
  const docFmt=dd2FmtDoc(docNum,tipo);
  // Sem documento (modo só-nome), não faz sentido buscar por um "texto"
  // vazio — o DJEN trataria isso como filtro em branco e traria resultado
  // sem relação nenhuma com a pessoa.
  const buscas=docNum?[{origem:'documento',p:dd2FetchDJEN({texto:docFmt})}]:[];
  if(nome) buscas.push({origem:'nome',p:dd2FetchDJEN({nomeParte:nome})});
  (socios||[]).filter(s=>s.nome).slice(0,4).forEach(s=>{
    buscas.push({origem:'sócio "'+s.nome+'"',p:dd2FetchDJEN({nomeParte:s.nome})});
  });
  const resultados=await Promise.allSettled(buscas.map(b=>b.p));
  let rateLimited=false,algumaFalhou=false;
  const porId=new Map();
  resultados.forEach((res,i)=>{
    if(res.status==='fulfilled'){
      res.value.forEach(item=>{
        if(!porId.has(item.id)) porId.set(item.id,{...item,_origem:[buscas[i].origem]});
        else porId.get(item.id)._origem.push(buscas[i].origem);
      });
    } else {
      algumaFalhou=true;
      if(String(res.reason?.message).includes('RATE_LIMIT')) rateLimited=true;
    }
  });
  const items=[...porId.values()].sort((a,b)=>(b.data_disponibilizacao||'').localeCompare(a.data_disponibilizacao||''));
  return {items,rateLimited,algumaFalhou};
}

// Data a partir da qual a busca "Todos os Processos" procura — o DJEN só
// existe desde a Resolução CNJ 455/2022 e a adesão dos tribunais foi
// gradual (muitos só passaram a publicar ali a partir de 2023-2024), então
// processos mais antigos podem não aparecer mesmo com a janela ampla.
const DD2_TODOS_PROCESSOS_DESDE='2023-01-01';

// Mesma lógica de dd2BuscarProcessosDJEN, mas sem se limitar à janela
// padrão de poucos dias do DJEN (que é o que a aba "Comunicações Recentes"
// usa) — aqui informamos explicitamente dataDisponibilizacaoInicio/Fim pra
// trazer o histórico completo (usado nas abas "Processos da Empresa" e
// "Processos dos Sócios", carregadas sob demanda).
async function dd2BuscarTodosProcessosDJEN(nome,docNum,tipo,socios){
  const docFmt=dd2FmtDoc(docNum,tipo);
  const hoje=new Date().toISOString().split('T')[0];
  const range={dataDisponibilizacaoInicio:DD2_TODOS_PROCESSOS_DESDE,dataDisponibilizacaoFim:hoje};
  const buscas=docNum?[{origem:'documento',p:dd2FetchDJEN({texto:docFmt,...range})}]:[];
  if(nome) buscas.push({origem:'nome',p:dd2FetchDJEN({nomeParte:nome,...range})});
  (socios||[]).filter(s=>s.nome).slice(0,4).forEach(s=>{
    buscas.push({origem:'sócio "'+s.nome+'"',p:dd2FetchDJEN({nomeParte:s.nome,...range})});
  });
  const resultados=await Promise.allSettled(buscas.map(b=>b.p));
  let rateLimited=false,algumaFalhou=false;
  const porId=new Map();
  resultados.forEach((res,i)=>{
    if(res.status==='fulfilled'){
      res.value.forEach(item=>{
        if(!porId.has(item.id)) porId.set(item.id,{...item,_origem:[buscas[i].origem]});
        else porId.get(item.id)._origem.push(buscas[i].origem);
      });
    } else {
      algumaFalhou=true;
      if(String(res.reason?.message).includes('RATE_LIMIT')) rateLimited=true;
    }
  });
  const items=[...porId.values()];
  return {items,rateLimited,algumaFalhou};
}

// Agrupa comunicações individuais do DJEN por processo (número do
// processo) — a busca "Todos os Processos" quer mostrar UM processo por
// linha (com quantas comunicações ele teve), não uma linha por citação/
// intimação isolada como a aba de Comunicações Recentes.
function dd2AgruparPorProcesso(items){
  const porProc=new Map();
  items.forEach(item=>{
    const chave=item.numeroprocessocommascara||item.numero_processo||item.id;
    if(!porProc.has(chave)){
      porProc.set(chave,{numero:chave,tribunal:item.siglaTribunal,classe:item.nomeClasse,comunicacoes:[],origens:new Set()});
    }
    const g=porProc.get(chave);
    g.comunicacoes.push(item);
    (item._origem||[]).forEach(o=>g.origens.add(o));
  });
  const grupos=[...porProc.values()].map(g=>{
    g.comunicacoes.sort((a,b)=>(b.data_disponibilizacao||'').localeCompare(a.data_disponibilizacao||''));
    g.ultimaData=g.comunicacoes[0]?.data_disponibilizacao||'';
    g.qtd=g.comunicacoes.length;
    // Uma origem "documento" ou "nome" (não-sócio) marca o processo como da
    // própria empresa/pessoa pesquisada — mesmo que um sócio também apareça
    // nele (ex: sócio citado como testemunha no processo da empresa).
    g.daEmpresa=[...g.origens].some(o=>o==='documento'||o==='nome');
    return g;
  }).sort((a,b)=>b.ultimaData.localeCompare(a.ultimaData));
  return grupos;
}

// Tabela de um grupo de processos (empresa OU sócios) — reaproveitada
// pelas duas abas novas. Cada linha expande mostrando as comunicações
// individuais daquele processo (data, tipo, teor).
function dd2TabelaProcessosAgrupados(grupos,prefixoId){
  if(!grupos.length) return '<p style="color:#22c55e;font-weight:600">✅ Nenhum processo encontrado nesta busca.</p>';
  return `<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th></th><th>Tribunal</th><th>Classe</th><th>Processo</th><th>Comunicações</th><th>Última atualização</th><th>Encontrado por</th></tr></thead>
  <tbody>${grupos.map((g,i)=>{
    const idRow=prefixoId+'-'+i;
    const origensTxt=[...g.origens].map(o=>escapeHtml(o)).join(', ');
    const detalhes=g.comunicacoes.map(p=>{
      const resumo=(p.texto||'').trim();
      return `<div style="padding:8px 0;border-bottom:1px solid #e2e8f0">
        <div style="font-size:.78rem;color:#64748b"><b>${escapeHtml(p.tipoComunicacao)||'Comunicação'}</b> — ${escapeHtml(p.data_disponibilizacao)||'—'}</div>
        ${resumo?`<div style="font-size:.78rem;margin-top:3px;white-space:pre-wrap">${escapeHtml(resumo.substring(0,500))}${resumo.length>500?'…':''}</div>`:''}
        ${p.link?`<a href="${escapeHtml(p.link)}" target="_blank" onclick="event.stopPropagation()" class="dd2-link-ext" style="margin-top:4px;padding:3px 8px;font-size:.72rem">🔗 Abrir</a>`:''}
      </div>`;
    }).join('');
    return `<tr style="cursor:pointer" onclick="dd2ToggleDetalhe('${idRow}')"><td style="width:18px;color:#94a3b8;font-size:.75rem" id="${idRow}-seta">▸</td><td><span class="dd2-badge info">${escapeHtml(g.tribunal)||'—'}</span></td><td>${escapeHtml(g.classe)||'—'}</td><td style="font-size:.75rem">${escapeHtml(g.numero)||'—'}</td><td>${g.qtd}</td><td style="font-size:.75rem">${escapeHtml(g.ultimaData)||'—'}</td><td style="font-size:.75rem">${origensTxt}</td></tr>
    <tr id="${idRow}" style="display:none;background:#f8fafc"><td></td><td colspan="6" style="padding:10px 12px">${detalhes}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

// Troca de aba dentro do card "Processos Judiciais". A aba "Comunicações
// Recentes" já vem carregada (é a busca padrão que roda em toda
// investigação); as abas "Processos da Empresa"/"dos Sócios" fazem uma
// busca própria (janela de datas ampla) só na primeira vez que o usuário
// clica nelas — evita gastar o rate limit do DJEN à toa quando ninguém
// olha essas abas.
function dd2AbaJudicial(aba){
  ['recentes','empresa','socios'].forEach(a=>{
    document.getElementById('dd2-jud-tab-'+a)?.classList.toggle('active',a===aba);
  });
  document.getElementById('dd2-judicial-content').style.display=aba==='recentes'?'':'none';
  document.getElementById('dd2-judicial-empresa-content').style.display=aba==='empresa'?'':'none';
  document.getElementById('dd2-judicial-socios-content').style.display=aba==='socios'?'':'none';
  if((aba==='empresa'||aba==='socios')&&!dd2TodosProcessosData&&!dd2TodosProcessosCarregando){
    dd2CarregarTodosProcessos();
  }
}

async function dd2CarregarTodosProcessos(){
  if(!dd2JudicialCtx) return;
  dd2TodosProcessosCarregando=true;
  const loading='<div class="dd2-loading">⏳ Buscando histórico completo de processos (pode levar alguns segundos)...</div>';
  document.getElementById('dd2-judicial-empresa-content').innerHTML=loading;
  document.getElementById('dd2-judicial-socios-content').innerHTML=loading;
  try{
    const {nome,docNum,tipo,socios}=dd2JudicialCtx;
    dd2TodosProcessosData=await dd2BuscarTodosProcessosDJEN(nome,docNum,tipo,socios);
  }catch(e){
    dd2TodosProcessosData={items:[],rateLimited:false,algumaFalhou:true};
  }
  dd2TodosProcessosCarregando=false;
  dd2RenderTodosProcessos();
}

function dd2RenderTodosProcessos(){
  const {items,rateLimited,algumaFalhou}=dd2TodosProcessosData||{items:[],rateLimited:false,algumaFalhou:false};
  const grupos=dd2AgruparPorProcesso(items);
  const gruposEmpresa=grupos.filter(g=>g.daEmpresa);
  const gruposSocios=grupos.filter(g=>!g.daEmpresa);
  let avisos='';
  if(rateLimited) avisos='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Limite de requisições do DJEN atingido — resultado pode estar incompleto. Tente novamente em cerca de 1 minuto.</p>';
  else if(algumaFalhou) avisos='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Uma ou mais buscas no DJEN falharam — resultado pode estar incompleto.</p>';
  const nota=`<p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Busca no DJEN desde ${DD2_TODOS_PROCESSOS_DESDE.split('-').reverse().join('/')} (o DJEN é recente — tribunais aderiram gradualmente, processos mais antigos podem não aparecer). Agrupado por processo: cada linha pode ter várias comunicações (citação, intimação, edital...), clique pra ver o histórico.</p>`;

  document.getElementById('dd2-judicial-empresa-content').innerHTML=
    avisos+nota+dd2TabelaProcessosAgrupados(gruposEmpresa,'dd2-proc-emp');

  document.getElementById('dd2-judicial-socios-content').innerHTML=
    avisos+nota+dd2TabelaProcessosAgrupados(gruposSocios,'dd2-proc-soc');
}

// Links de verificação manual, como reforço à busca automática do DJEN
// (que não garante cobertura de 100% dos tribunais/processos). Quando é
// uma consulta de CNPJ, inclui também um link por sócio listado no QSA.
function dd2LinksManuaisHTML(nome,docNum,tipo,socios){
  const docFmt=dd2FmtDoc(docNum,tipo);
  const alvo=nome||docFmt;
  const alvoSafe=escapeHtml(alvo);
  const linksAlvo=[
    {label:`JusBrasil — processos de "${alvoSafe}"`,url:`https://www.jusbrasil.com.br/consulta-processual/?q=${encodeURIComponent(alvo)}`},
    ...(docNum?[{label:`JusBrasil — processos pelo documento ${docFmt}`,url:`https://www.jusbrasil.com.br/consulta-processual/?q=${docNum}`}]:[]),
    {label:'CNJ — Consulta Processual Nacional (PJe)',url:'https://www.cnj.jus.br/pjecnj/'},
    {label:`Escavador — busca por "${alvoSafe}"`,url:`https://www.escavador.com/busca?q=${encodeURIComponent(alvo)}`},
  ];
  const linksSocios=(socios||[]).filter(s=>s.nome).slice(0,6).map(s=>({
    label:`JusBrasil — sócio "${escapeHtml(s.nome)}"`,
    url:`https://www.jusbrasil.com.br/consulta-processual/?q=${encodeURIComponent(s.nome)}`
  }));
  return `
    <div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Reforçar verificação manualmente</div>
    <div class="dd2-links-ext">${linksAlvo.map(l=>`<a href="${l.url}" target="_blank" class="dd2-link-ext">🔗 ${l.label}</a>`).join('')}</div>
    ${linksSocios.length?`<div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px">Sócios / pessoas vinculadas ao CNPJ</div><div class="dd2-links-ext">${linksSocios.map(l=>`<a href="${l.url}" target="_blank" class="dd2-link-ext">🔗 ${l.label}</a>`).join('')}</div>`:''}
  `;
}

// Tenta identificar o nome da pessoa a partir do CPF cruzando trechos onde
// o documento aparece por extenso (DJEN, Querido Diário). É inferência
// textual, não confirmação oficial de identidade — nunca tratada como dado
// cadastral, só como indício pra melhorar as outras buscas.
function dd2ExtrairNomeProximoAoDoc(texto,docFmt){
  if(!texto||!docFmt) return null;
  const docEsc=docFmt.replace(/[.\-\/]/g,'[.\\-\\/]?');
  const padroes=[
    new RegExp('([A-ZÀ-Ü][A-ZÀ-Ü\\.\\s]{5,70}?)[,\\s]{1,3}CPF[:\\.\\s]{0,4}(?:n[ºo°]?\\.?)?\\s*'+docEsc,'i'),
    new RegExp('CPF[:\\.\\s]{0,4}(?:n[ºo°]?\\.?)?\\s*'+docEsc+'[,\\s\\-]{1,4}([A-ZÀ-Ü][A-ZÀ-Ü\\.\\s]{5,70})','i'),
  ];
  for(const re of padroes){
    const m=texto.match(re);
    if(m&&m[1]){
      const nome=m[1].trim().replace(/\s+/g,' ');
      if(nome.length>=6&&nome.length<=70&&/[A-ZÀ-Ü]{2}/.test(nome)) return nome;
    }
  }
  return null;
}

// Agrega candidatos de nome vindos do DJEN (campo destinatarios, quando a
// comunicação tem uma única parte — forte indício de que é ela) e de
// trechos de diários municipais, e fica com o mais recorrente. Sem
// candidato repetido, o achado é mostrado do mesmo jeito, mas com um único
// voto — a UI sempre deixa claro que é indício, não confirmação.
function dd2CandidatoNomePorCPF(fontes,docFmt){
  const contagem=new Map();
  const somar=nome=>{
    if(!nome) return;
    nome=nome.trim().replace(/\s+/g,' ');
    if(nome.length<6||nome.length>70) return;
    contagem.set(nome,(contagem.get(nome)||0)+1);
  };
  (fontes.djen||[]).forEach(p=>{
    const dests=p.destinatarios||[];
    if(dests.length===1&&dests[0]?.nome) somar(dests[0].nome);
    somar(dd2ExtrairNomeProximoAoDoc(p.texto||'',docFmt));
  });
  (fontes.diarios||[]).forEach(g=>{
    (g.trechos||[]).forEach(tx=>somar(dd2ExtrairNomeProximoAoDoc(tx,docFmt)));
  });
  if(!contagem.size) return null;
  const [nome,vezes]=[...contagem.entries()].sort((a,b)=>b[1]-a[1])[0];
  const total=[...contagem.values()].reduce((a,b)=>a+b,0);
  return {nome,vezes,total};
}

function dd2RenderNomeIdentificado(candidato){
  const el=document.getElementById('dd2-cadastral-content');
  if(!el) return;
  if(!candidato){
    el.innerHTML='<p style="color:#64748b;font-size:.85rem">Consulta cadastral disponível apenas para CNPJ. Nenhum nome foi identificado automaticamente a partir do CPF nas fontes consultadas (DJEN, Querido Diário) — informe o nome manualmente no campo acima para melhorar as demais buscas.</p>';
    return;
  }
  el.innerHTML=`<p style="color:#b45309;font-size:.85rem;margin-bottom:4px"><strong>&#128100; Nome identificado automaticamente:</strong> ${escapeHtml(candidato.nome)}</p>
  <p style="font-size:.78rem;color:#64748b">Encontrado em ${candidato.vezes} de ${candidato.total} menção(ões) ao CPF nas fontes consultadas — é um indício textual, <b>não é confirmação oficial de identidade</b>. Confira manualmente antes de usar.</p>`;
}

const DD2_QUERIDODIARIO_URL='https://api.queridodiario.ok.org.br/gazettes';

// Busca texto integral em diários oficiais de mais de 350 municípios
// (Querido Diário, Open Knowledge Brasil). API pública, sem chave, CORS
// liberado — diferente do DJEN (judicial), essa cobre atos municipais:
// licitação, nomeação, sanção administrativa local etc.
// O querystring SEM aspas é tratado como termos soltos (full-text OR) —
// testado na unha com um CPF formatado real: sem aspas, "total_gazettes"
// vinha 10000 (o teto da API), batendo em qualquer trecho de OCR com
// números parecidos; com aspas (frase exata) foi pra 0, que é o esperado
// pra um CPF completo (raramente publicado por extenso). Envolver em aspas
// faz a mesma diferença de precisão que o DOU (dd2FetchDOU) já usa.
async function dd2FetchQueridoDiario(querystring){
  if(!querystring) return [];
  // sort_by=descending_date: sem isso, a API ordena por relevância (TF-IDF),
  // que mistura resultados de anos diferentes fora de ordem — testado na
  // unha e confirmado que publicações recentes ficavam fora dos top 15,
  // atrás de resultados antigos "mais relevantes". Com data decrescente,
  // as publicações mais novas sempre aparecem primeiro.
  const qs=new URLSearchParams({querystring:'"'+querystring+'"',size:'15',sort_by:'descending_date'}).toString();
  const r=await fetch(`${DD2_QUERIDODIARIO_URL}?${qs}`,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d?.gazettes)?d.gazettes:[];
}

const DD2_DOU_URL='https://www.in.gov.br/consulta/-/buscar/dou';

// Busca no Diário Oficial da União (atos federais). Não tem API JSON
// documentada, mas a página de busca embute um bloco
// <script type="application/json" id="..._params"> com os resultados
// estruturados (título, órgão, data, trecho) — foi assim que confirmamos
// que a busca funciona de verdade (testamos com CNPJ real e achou
// publicações federais correspondentes). CORS liberado, sem chave. Como
// depende da estrutura interna da página do in.gov.br (não é um contrato
// de API formal), pode quebrar se eles reformularem o site.
async function dd2FetchDOU(querystring){
  if(!querystring) return [];
  const url=`${DD2_DOU_URL}?q=${encodeURIComponent('"'+querystring+'"')}`;
  const r=await fetch(url,{headers:{'Accept':'text/html'},signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const html=await r.text();
  const m=html.match(/id="[^"]*BuscaDouPortlet_params"[^>]*>([\s\S]*?)<\/script>/);
  if(!m) return [];
  let data;
  try{ data=JSON.parse(m[1].trim()); }catch(e){ return []; }
  return Array.isArray(data?.jsonArray)?data.jsonArray:[];
}

// O PDF escaneado de origem (principalmente diários municipais antigos)
// às vezes tem OCR corrompido, que vaza como caractere de controle ou de
// substituição (U+FFFD) no trecho — mostrar isso é só ruído ilegível pro
// analista. Remove esses caracteres e descarta o trecho inteiro se, depois
// de limpo, sobrar muito pouca letra de verdade (sinal de que é lixo binário).
function dd2LimparTrecho(txt){
  if(!txt) return '';
  // Bug corrigido: a versão anterior tinha um espaço literal dentro da
  // classe de caracteres de controle (`[\x00-\x08...\x1F ]`), removendo
  // TODOS os espaços do trecho — o texto virava uma palavra só ilegível.
  // Aqui só some com caracteres de controle de fato, e depois colapsa
  // quebras de linha/tabs/espaços repetidos (comuns em texto de OCR) num
  // espaço só, sem grudar as palavras.
  const limpo=txt.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"").replace(/\s+/g," ").trim();
  const letras=(limpo.match(/[a-zA-ZÀ-ÿ]/g)||[]).length;
  if(limpo.length>20 && letras/limpo.length<0.4) return '';
  return limpo;
}

// Diário Oficial do Estado do Rio de Janeiro (DOERJ) — chegamos a
// implementar a busca automática (sistema legado XOOPS, via POST na rota
// /proxy da Edge Function), mas o servidor do ioerj.com.br derruba a
// conexão ("Connection reset by peer") pra qualquer requisição vinda da
// infraestrutura do Deno Deploy — testamos com e sem headers de navegador,
// mesmo erro nos dois casos. É bloqueio de rede/IP do lado deles, não
// corrigível daqui (mesma categoria da CNIA/BNMP/e-SAJ: dado existe, sem
// jeito de automatizar). Fica só como link manual — ver dd2LinkManualDoerj.
const DD2_DOERJ_URL='https://www.ioerj.com.br/portal/';
function dd2LinkManualDoerj(alvo){
  return `<a href="${DD2_DOERJ_URL}" target="_blank" class="dd2-link-ext">🔗 Buscar manualmente no DOERJ${alvo?` — "${escapeHtml(alvo)}"`:''}</a>`;
}

// Diário Oficial do Município do Rio de Janeiro (DOWEB) — diferente do
// DOERJ (estadual, bloqueado), o portal municipal (doweb.rio.rj.gov.br)
// tem uma API de busca com CORS liberado por trás do buscador oficial
// (buscanova). Não é uma API documentada/contratual — é o mesmo backend
// (ElasticSearch) que o site deles usa, descoberto observando as chamadas
// de rede do buscador. Cobertura em tempo real (publicação de um dia
// aparece buscável no dia seguinte), bem mais rápida que o Querido Diário
// pra essa cidade especificamente. Só roda quando a empresa/pessoa é do
// Rio de Janeiro (uf==='RJ'), pra não gastar requisição à toa em quem não
// tem nada a ver com esse diário.
const DD2_DOWEB_URL='https://doweb.rio.rj.gov.br/busca/busca/buscar/query/0/';
const DD2_DOWEB_DESDE='2023-01-01';

async function dd2FetchDOWEB(querystring){
  if(!querystring) return [];
  const hoje=new Date().toISOString().split('T')[0];
  const url=`${DD2_DOWEB_URL}di:${DD2_DOWEB_DESDE}/df:${hoje}/?1=1&q=${encodeURIComponent('"'+querystring+'"')}`;
  const r=await fetch(url,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d?.hits?.hits)?d.hits.hits:[];
}

// A API do DOWEB só devolve o texto integral da página (_source.conteudo),
// sem excerpt destacado nem campos separados de data/edição — recorta na
// mão um trecho ao redor do termo buscado (mesma ideia do dd2LimparTrecho
// já usado pro DOU) e tenta achar a data da edição por regex no início do
// texto (formato "Data: <dia da semana>, <dia> de <mês> de <ano>", que é
// como o cabeçalho de cada página do D.O. Rio se identifica).
const DD2_MESES={janeiro:'01',fevereiro:'02',março:'03',abril:'04',maio:'05',junho:'06',julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12'};
// A página costuma ter várias datas soltas no meio do conteúdo (datas de
// vistoria, de auto de infração etc. de cada item listado) — pegar a
// primeira ocorrência de "Data:" pegava essas, não a data de publicação da
// edição. A data confiável é a que vem logo depois de "Assinado
// Digitalmente" (rodapé de autenticação de cada página, sempre no mesmo
// formato), então ancora a busca nela em vez de num "Data:" solto.
function dd2ExtrairDataDOWEB(conteudo){
  const m=(conteudo||'').match(/Assinado Digitalmente[\s\S]{0,120}?Data:\s*[^,]+,\s*(\d{1,2})\s*de\s*([a-zA-ZçÇ]+)\s*de\s*(\d{4})/i);
  if(!m) return '';
  const mes=DD2_MESES[m[2].toLowerCase()];
  if(!mes) return '';
  return `${m[1].padStart(2,'0')}/${mes}/${m[3]}`;
}
function dd2ExtrairTrechoDOWEB(conteudo,termo){
  if(!conteudo) return '';
  const idx=conteudo.toLowerCase().indexOf(termo.toLowerCase());
  if(idx<0) return dd2LimparTrecho(conteudo.substring(0,400));
  const inicio=Math.max(0,idx-150);
  return dd2LimparTrecho(conteudo.substring(inicio,idx+350));
}

// DOU e Querido Diário devolvem formatos totalmente diferentes (datas em
// formatos opostos, HTML de destaque embutido no texto etc.) — normaliza
// os dois pro mesmo formato de exibição.
function dd2NormalizarDiario(item,fonte,termoBusca){
  if(fonte==='DOU'){
    const trecho=dd2LimparTrecho((item.content||'').replace(/<[^>]+>/g,''));
    return {
      titulo:item.title||'—',
      local:(item.hierarchyStr||'').replace(/\//g,' › ')||'Diário Oficial da União',
      data:item.pubDate||'—',
      trechos:[trecho].filter(Boolean),
      url:item.urlTitle?`https://www.in.gov.br/web/dou/-/${item.urlTitle}`:'',
    };
  }
  if(fonte==='DOWEB'){
    const conteudo=item._source?.conteudo||'';
    return {
      titulo:'Rio de Janeiro (Capital) — RJ',
      local:'Diário Oficial do Município do Rio de Janeiro',
      data:dd2ExtrairDataDOWEB(conteudo),
      trechos:[dd2ExtrairTrechoDOWEB(conteudo,termoBusca)].filter(Boolean),
      // Não temos um link direto pra página exata (a API não devolve isso) —
      // linka pra busca já pronta no site oficial, com o mesmo termo e
      // período, pra conferência manual do resultado certo.
      url:`https://doweb.rio.rj.gov.br/buscanova/#/p=1&q=${encodeURIComponent(termoBusca)}&di=${DD2_DOWEB_DESDE.replace(/-/g,'')}&df=${new Date().toISOString().split('T')[0].replace(/-/g,'')}`,
    };
  }
  return {
    titulo:`${item.territory_name||'—'} — ${item.state_code||'—'}`,
    local:'Diário Oficial Municipal',
    data:item.date||'—',
    trechos:(item.excerpts||[]).map(dd2LimparTrecho).filter(Boolean),
    url:item.url||'',
  };
}

// DOU usa DD/MM/AAAA, Querido Diário usa AAAA-MM-DD — converte os dois pro
// mesmo formato só pra poder ordenar cronologicamente.
function dd2DataDiarioOrdenavel(data){
  if(!data) return '';
  if(/^\d{4}-\d{2}-\d{2}/.test(data)) return data;
  const m=data.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m?`${m[3]}-${m[2]}-${m[1]}`:data;
}

async function dd2BuscarDiarios(nome,docNum,tipo,uf){
  const docFmt=dd2FmtDoc(docNum,tipo);
  // CPF completo quase nunca é publicado por extenso em diário oficial (LGPD
  // costuma mascarar: "***.456.789-**") — buscar por ele pra pessoa física
  // não tem valor (com a busca em frase exata, dá 0 resultado sempre) e sem
  // frase exata dava falso positivo por fragmento de número. Pra CPF, a
  // busca é só pelo nome. CNPJ continua buscando pelo documento também,
  // já que licitação/contrato publica o CNPJ completo com frequência.
  const buscasQD=tipo==='cnpj'?[dd2FetchQueridoDiario(docFmt)]:[];
  const buscasDOU=tipo==='cnpj'?[dd2FetchDOU(docFmt)]:[];
  if(nome){ buscasQD.push(dd2FetchQueridoDiario(nome)); buscasDOU.push(dd2FetchDOU(nome)); }

  // DOWEB (Diário Oficial do Município do Rio) só entra quando a empresa/
  // pessoa é do Rio de Janeiro — buscar por documento não funciona bem
  // (a razão social por extenso é o que costuma aparecer, não o CNPJ), então
  // essa fonte busca só pelo nome/razão social.
  const termoDoweb=nome||'';
  const buscasDOWEB=(uf==='RJ'&&termoDoweb)?[dd2FetchDOWEB(termoDoweb)]:[];

  const [resQD,resDOU,resDOWEB]=await Promise.all([Promise.allSettled(buscasQD),Promise.allSettled(buscasDOU),Promise.allSettled(buscasDOWEB)]);
  let algumaFalhou=false;
  const porChave=new Map();
  resQD.forEach(res=>{
    if(res.status==='fulfilled'){
      res.value.forEach(g=>{
        const chave='qd|'+(g.territory_id||'')+'|'+(g.date||'')+'|'+(g.url||'');
        if(!porChave.has(chave)) porChave.set(chave,{...dd2NormalizarDiario(g,'Querido Diário'),_fonte:'Querido Diário'});
      });
    } else algumaFalhou=true;
  });
  resDOU.forEach(res=>{
    if(res.status==='fulfilled'){
      res.value.forEach(g=>{
        const chave='dou|'+(g.classPK||g.urlTitle||'');
        if(!porChave.has(chave)) porChave.set(chave,{...dd2NormalizarDiario(g,'DOU'),_fonte:'DOU'});
      });
    } else algumaFalhou=true;
  });
  resDOWEB.forEach(res=>{
    if(res.status==='fulfilled'){
      res.value.forEach(g=>{
        const chave='doweb|'+(g._id||'');
        if(!porChave.has(chave)) porChave.set(chave,{...dd2NormalizarDiario(g,'DOWEB',termoDoweb),_fonte:'DOWEB'});
      });
    } else algumaFalhou=true;
  });

  const resultadosTodos=[...resQD,...resDOU,...resDOWEB];
  if(algumaFalhou&&resultadosTodos.every(r=>r.status==='rejected')) throw new Error('Todas as buscas em diários oficiais falharam');
  const items=[...porChave.values()].sort((a,b)=>dd2DataDiarioOrdenavel(b.data).localeCompare(dd2DataDiarioOrdenavel(a.data)));
  return {items,algumaFalhou};
}

function dd2RenderDiarios(res,semNome){
  const el=document.getElementById('dd2-diarios-content');
  if(!res){el.innerHTML='<p style="color:#ef4444">⚠️ Não foi possível consultar os diários oficiais automaticamente no momento.</p>'+dd2LinkManualDoerj();return;}
  const {items,algumaFalhou}=res;
  const aviso=algumaFalhou?'<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Uma ou mais buscas em diários oficiais falharam — resultado pode estar incompleto.</p>':'';
  // Pra CPF a busca é só pelo nome (CPF completo não é publicado por
  // extenso) — se não tem nome nenhum (nem digitado, nem identificado
  // automaticamente via DJEN), a busca nem roda. Isso é bem diferente de
  // "procurei e não achei nada", então mostra aviso amarelo em vez do ✅
  // verde de "sem menção encontrada".
  if(semNome){el.innerHTML=aviso+'<p style="color:#b45309;font-weight:600">⚠️ Nenhum nome disponível pra buscar — informe o nome completo da pessoa no campo acima pra pesquisar nos diários oficiais.</p>'+dd2LinkManualDoerj();return;}
  if(!items.length){el.innerHTML=aviso+'<p style="color:#22c55e;font-weight:600">✅ Nenhuma menção encontrada em diários oficiais.</p>'+dd2LinkManualDoerj();return;}
  el.innerHTML=aviso+`<p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Busca automática no <strong>DOU — Diário Oficial da União</strong> (atos federais), no <strong>Querido Diário</strong> (Open Knowledge Brasil — mais de 350 municípios) e, quando a empresa/pessoa é do Rio de Janeiro, direto no <strong>Diário Oficial do Município do Rio (DOWEB)</strong> — cobertura mais rápida e completa que o Querido Diário pra essa cidade. O <strong>DOERJ</strong> (Diário Oficial do <u>Estado</u> do RJ) não permite automação — veja o link manual abaixo. Clique num resultado pra ver todos os trechos onde o termo foi encontrado.</p>
  ${items.slice(0,30).map((g,i)=>{
    const trechos=(g.trechos||[]).filter(Boolean);
    const trecho=trechos[0]||'';
    const idRow='dd2-diario-det-'+i;
    const resumoCompleto=trechos.length?trechos.map((tx,j)=>`<div style="${j<trechos.length-1?'margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed #e2e8f0':''}">${trechos.length>1?`<b>Trecho ${j+1} de ${trechos.length}:</b><br>`:''}${escapeHtml(tx)}</div>`).join(''):'<span style="color:#94a3b8">Nenhum trecho disponível pra exibição.</span>';
    const badgeCls=g._fonte==='DOU'?'info':g._fonte==='DOWEB'?'ok':'warn';
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;background:#fff">
      <div style="cursor:pointer" onclick="dd2ToggleDetalhe('${idRow}','block')">
        <div style="font-weight:600;font-size:.85rem;margin-bottom:2px"><span id="${idRow}-seta" style="color:#94a3b8;font-size:.72rem">▸</span> <span class="dd2-badge ${badgeCls}">${g._fonte}</span> ${escapeHtml(g.titulo)||'—'}</div>
        <div style="font-size:.73rem;color:#94a3b8;margin:2px 0">${escapeHtml(g.local)||'—'} · ${escapeHtml(g.data)||'—'}${trechos.length>1?` · ${trechos.length} trechos`:''}</div>
        <div style="font-size:.8rem;color:#64748b;margin:4px 0">${escapeHtml(trecho.substring(0,200))}${trecho.length>200?'…':''}</div>
      </div>
      <div id="${idRow}" style="display:none;background:#f8fafc;border-radius:6px;padding:10px;margin:8px 0 4px;font-size:.8rem;color:#334155;line-height:1.6">${resumoCompleto}</div>
      ${g.url?`<a href="${g.url}" target="_blank" onclick="event.stopPropagation()" style="font-size:.76rem;color:#0f2d4a">🔗 Ver publicação original</a>`:''}
    </div>`;
  }).join('')}
  <div style="margin-top:10px">${dd2LinkManualDoerj()}</div>`;
}

const DD2_SANCTIONS_URL='https://api.sanctions.network/rpc/search_sanctions';

// Agrega OFAC (Tesouro dos EUA) + ONU + UE numa busca só, por nome. API de
// terceiro (open source, não-oficial) — usada como sinal complementar de
// PLD/FT, sempre com ressalva na tela pra conferir na fonte oficial.
async function dd2FetchSanctionsNetwork(nome){
  if(!nome) return [];
  const r=await fetch(`${DD2_SANCTIONS_URL}?name=${encodeURIComponent(nome)}`,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d)?d:[];
}

// A API sanctions.network faz correspondência por token solto, sem peso de
// relevância — pesquisar só "SUPERMERCADOS" ou só "CASH" já traz de volta
// entidades OFAC sem qualquer relação real com o nome pesquisado, batendo
// apenas numa palavra genérica do ramo de atuação (confirmado testando a
// API diretamente). Por isso filtramos aqui no cliente: só mantemos um
// resultado se pelo menos um token DISTINTIVO (fora da lista de termos
// corporativos/setoriais genéricos) do nome pesquisado aparecer em algum
// dos nomes/aliases devolvidos pela API.
const DD2_SANCOES_STOPWORDS=new Set(['S/A','SA','LTDA','LDA','EIRELI','ME','EPP','CIA','COMERCIO','COMÉRCIO','INDUSTRIA','INDÚSTRIA','INDUSTRY','SUPERMERCADO','SUPERMERCADOS','SUPERMARKET','SUPERMARKETS','MERCADO','MERCADOS','MARKET','MARKETS','CASH','CARRY','RETAIL','STORE','STORES','GROUP','GRUPO','HOLDING','HOLDINGS','SERVICOS','SERVIÇOS','SERVICE','SERVICES','COMPANY','CO','CORP','CORPORATION','INC','LLC','LTD','TRADING','IMPORT','EXPORT','IMPORTACAO','EXPORTACAO','IMPORTAÇÃO','EXPORTAÇÃO','DISTRIBUIDORA','DISTRIBUTION','AGRICULTURE','AGRICULTURA','CONSTRUCTION','CONSTRUCAO','CONSTRUÇÃO','ENTERPRISE','ENTERPRISES','THE','AND','E','DE','DA','DO','DOS','DAS']);

function dd2TokensRelevantes(nome){
  return (nome||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9\s]/g,' ').split(/\s+/).filter(t=>t.length>=3&&!DD2_SANCOES_STOPWORDS.has(t));
}

// Uma lista de stopwords nunca dá conta de todo termo corporativo genérico
// em todo idioma (testando a API na unha: "DISTRIBUIDORA" sozinho traz de
// volta 12 empresas latino-americanas sem nenhuma relação entre si;
// "INCORPORATED" sozinho traz dezenas de shell companies; "CASH" traz uma
// entidade ligada ao Hamas). Em vez de tentar enumerar toda palavra
// genérica possível, exigimos 2+ tokens distintivos em comum sempre que o
// nome pesquisado tiver 2+ tokens disponíveis — uma única palavra batendo
// por coincidência é comum, duas baterem ao mesmo tempo por acaso é raro o
// suficiente pra ser um indício real. Só aceitamos 1 token em comum quando
// o nome pesquisado não tem mais que isso pra oferecer.
function dd2FiltrarRuidoSancoesIntl(hits,nomeConsultado){
  const tokensAlvo=dd2TokensRelevantes(nomeConsultado);
  if(!tokensAlvo.length)return hits;
  const minComuns=tokensAlvo.length>=2?2:1;
  return hits.filter(h=>{
    const tokensHit=new Set((h.names||[]).flatMap(n=>dd2TokensRelevantes(n)));
    const comuns=tokensAlvo.filter(t=>tokensHit.has(t));
    return comuns.length>=minComuns;
  });
}

// ── TCU — Licitantes declarados inidôneos ──
// Lista oficial de empresas/pessoas declaradas inidôneas pelo Tribunal de
// Contas da União (art. 46 da Lei 8.443/92) — proibidas de participar de
// licitação federal. A API (ORDS) é pública e a lista completa é pequena
// (~100 registros, hasMore:false com limit=10000 — verificado ao vivo),
// então baixamos tudo UMA vez por investigação e filtramos no cliente.
// A API não manda header CORS, por isso passa pela rota /proxy da Edge
// Function (exige "contas.tcu.gov.br" na whitelist de domínios do proxy).
const DD2_TCU_URL='https://contas.tcu.gov.br/ords/condenacao/consulta/inidoneos?limit=10000';
let dd2TcuListaPromise=null;
function dd2FetchTCUInidoneos(){
  if(!dd2TcuListaPromise){
    dd2TcuListaPromise=fetch(dd2ProxyUrl(DD2_TCU_URL),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(15000)})
      .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(d=>Array.isArray(d?.items)?d.items:[])
      .catch(e=>{dd2TcuListaPromise=null;throw e;}); // não cacheia falha
  }
  return dd2TcuListaPromise;
}

function dd2TcuPorDocumento(items,docNum){
  if(!docNum)return[];
  const alvo=soAlfanum(docNum);
  return items.filter(i=>soAlfanum(i.cpf_cnpj)===alvo);
}

// Match por nome (pros sócios, que no QSA vêm sem CPF completo) — usa o
// mesmo critério de tokens distintivos das sanções internacionais. É
// indício, não confirmação (homônimos existem) — o render deixa isso claro.
function dd2TcuPorNome(items,nome){
  const tokensAlvo=dd2TokensRelevantes(nome);
  if(tokensAlvo.length<2)return[]; // 1 token só = homônimo quase certo, não aponta
  return items.filter(i=>{
    const tokensItem=new Set(dd2TokensRelevantes(i.nome||''));
    return tokensAlvo.filter(t=>tokensItem.has(t)).length>=Math.min(tokensAlvo.length,3);
  });
}

const DD2_POLO_LABEL={A:'Ativo',P:'Passivo',T:'Terceiro',D:'Outro'};

// Identifica o polo (A/P/T/D) do alvo pesquisado numa comunicação do DJEN,
// cruzando os nomes em destinatarios[] com o nome/sócios pesquisados (mesmo
// critério de "2+ tokens relevantes em comum" já usado pra filtrar ruído em
// dd2FiltrarRuidoSancoesIntl). Sem isso, o risco judicial só contava volume
// de comunicações — um processo em que a empresa é AUTORA (ex.: cobrando
// uma dívida) pesava igual a um em que ela é RÉ — o que não reflete risco
// real nenhum.
function dd2JudicialPoloAlvo(item,nomesAlvo){
  const dests=item.destinatarios||[];
  if(!dests.length||!nomesAlvo?.length)return null;
  for(const d of dests){
    const tokensDest=new Set(dd2TokensRelevantes(d.nome||''));
    if(!tokensDest.size)continue;
    for(const nomeAlvo of nomesAlvo){
      const tokensAlvo=dd2TokensRelevantes(nomeAlvo);
      if(!tokensAlvo.length)continue;
      const min=tokensAlvo.length>=2?2:1;
      const comuns=tokensAlvo.filter(t=>tokensDest.has(t));
      if(comuns.length>=min)return d.polo;
    }
  }
  return null;
}

// Usada tanto na tabela de Processos Judiciais quanto na de Sanções — cada
// linha clicável revela uma linha de detalhe logo abaixo (teor da
// comunicação, ou motivo/fundamentação da sanção).
function dd2ToggleDetalhe(id,displayAberto){
  const el=document.getElementById(id);
  if(!el) return;
  const abrir=el.style.display==='none';
  el.style.display=abrir?(displayAberto||'table-row'):'none';
  const seta=document.getElementById(id+'-seta');
  if(seta) seta.textContent=abrir?'▾':'▸';
}

function dd2RenderJudicial(res,nome,docNum,tipo,socios){
  const el=document.getElementById('dd2-judicial-content');
  const {items,rateLimited,algumaFalhou}=res;
  dd2JudicialNomesAlvo=[nome,...(socios||[]).map(s=>s.nome)].filter(Boolean);
  dd2JudicialCtx={nome,docNum,tipo,socios};
  dd2TodosProcessosData=null; // nova busca: invalida cache das abas de processos
  let avisos='';
  if(rateLimited) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Limite de requisições do DJEN atingido — resultado pode estar incompleto. Tente novamente em cerca de 1 minuto.</p>';
  else if(algumaFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Uma ou mais buscas no DJEN falharam — resultado pode estar incompleto.</p>';
  const tabela=items.length?`<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th></th><th>Data</th><th>Tribunal</th><th>Tipo</th><th>Classe / Processo</th><th>Encontrado por</th><th>Fonte</th></tr></thead>
  <tbody>${items.slice(0,60).map((p,i)=>{
    const dest=(p.destinatarios||[]).map(d=>`${escapeHtml(d.nome)} (${DD2_POLO_LABEL[d.polo]||'—'})`).join(', ')||'—';
    const link=p.link||'';
    const fonte=link?`<a href="${escapeHtml(link)}" target="_blank" onclick="event.stopPropagation()" class="dd2-link-ext" style="padding:4px 9px;font-size:.73rem">🔗 Abrir</a>`:'<span style="color:#94a3b8;font-size:.73rem">—</span>';
    const idRow='dd2-jud-det-'+i;
    const resumo=(p.texto||'').trim();
    const poloAlvo=dd2JudicialPoloAlvo(p,dd2JudicialNomesAlvo);
    const poloBadge=poloAlvo==='P'?'<span class="dd2-badge danger" title="O alvo pesquisado aparece como parte passiva (réu/executado) nesta comunicação" style="margin-left:6px">RÉU/EXECUTADO</span>':'';
    return `<tr style="cursor:pointer" onclick="dd2ToggleDetalhe('${idRow}')"><td style="width:18px;color:#94a3b8;font-size:.75rem" id="${idRow}-seta">▸</td><td style="font-size:.75rem">${escapeHtml(p.data_disponibilizacao)||'—'}</td><td><span class="dd2-badge info">${escapeHtml(p.siglaTribunal)}</span></td><td>${escapeHtml(p.tipoComunicacao)||'—'}${poloBadge}</td><td>${escapeHtml(p.nomeClasse)||'—'}<br><span style="font-size:.73rem;color:#64748b">${escapeHtml(p.numeroprocessocommascara||p.numero_processo)||'—'} — ${dest}</span></td><td style="font-size:.75rem">${p._origem.map(o=>escapeHtml(o)).join(', ')}</td><td>${fonte}</td></tr>
    <tr id="${idRow}" style="display:none;background:#f8fafc"><td></td><td colspan="6" style="padding:10px 12px;font-size:.8rem;color:#334155;line-height:1.6;white-space:pre-wrap">${resumo?`<b>Resumo do teor da comunicação:</b><br>${escapeHtml(resumo.substring(0,800))}${resumo.length>800?'…':''}`:'<span style="color:#94a3b8">Teor da comunicação não disponível para exibição.</span>'}</td></tr>`;
  }).join('')}</tbody></table></div>`:`<p style="color:#22c55e;font-weight:600">✅ Nenhuma comunicação processual encontrada no DJEN.</p>`;
  el.innerHTML=`
    ${avisos}
    <p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Busca automática no <strong>DJEN — Diário de Justiça Eletrônico Nacional</strong> (CNJ): citações, intimações e editais de tribunais de todo o país. A cobertura não é de 100% dos tribunais/processos — use os links abaixo para reforçar a verificação.</p>
    ${tabela}
    <div style="margin-top:14px">${dd2LinksManuaisHTML(nome,docNum,tipo,socios)}</div>
  `;
}

// Motivo/fundamentação de cada sanção, pra linha de detalhe expansível —
// campos que a API já devolve mas a tabela resumida não mostra.
function dd2MotivoSancaoHTML(item,base){
  if(base==='CEIS'||base==='CNEP'){
    const fund=(item.fundamentacao||[]).map(f=>f.descricao||f.nome).filter(Boolean).join('; ');
    return `
      ${item.fonteSancao?.nomeExibicao?`<div><b>Fonte:</b> ${escapeHtml(item.fonteSancao.nomeExibicao)}</div>`:''}
      ${fund?`<div><b>Fundamentação legal:</b> ${escapeHtml(fund)}</div>`:''}
      ${item.dataTransitoJulgado?`<div><b>Trânsito em julgado:</b> ${escapeHtml(item.dataTransitoJulgado)}</div>`:''}
      ${item.dataPublicacaoSancao?`<div><b>Publicação:</b> ${escapeHtml(item.dataPublicacaoSancao)}</div>`:''}
      ${!fund&&!item.dataTransitoJulgado&&!item.dataPublicacaoSancao?'<span style="color:#94a3b8">Sem detalhes adicionais disponíveis nesta base.</span>':''}
    `;
  }
  if(base==='Leniência'){
    const empresas=(item.sancoes||[]).map(s=>`${s.razaoSocial||s.nomeInformadoOrgaoResponsavel||'—'}${s.cnpjFormatado?' ('+s.cnpjFormatado+')':''}`).join('<br>');
    return `<div><b>Situação do acordo:</b> ${escapeHtml(item.situacaoAcordo)||'—'}</div>${empresas?`<div style="margin-top:4px"><b>Empresas envolvidas:</b><br>${empresas}</div>`:''}`;
  }
  if(base==='CEPIM'){
    return `<div><b>Motivo:</b> ${escapeHtml(item.motivo)||'—'}</div>${item.convenio?.numero?`<div><b>Convênio:</b> ${escapeHtml(item.convenio.numero)}</div>`:''}`;
  }
  if(base==='CEAF'){
    const p=item.punicao||{};
    return `
      <div><b>Punido:</b> ${escapeHtml(p.nomePunido)||'—'}</div>
      ${p.portaria?`<div><b>Portaria:</b> ${escapeHtml(p.portaria)}</div>`:''}
      ${p.processo?`<div><b>Processo:</b> ${escapeHtml(p.processo)}</div>`:''}
      ${p.paginaDOU?`<div><b>Diário Oficial:</b> página ${escapeHtml(p.paginaDOU)}${p.secaoDOU?', seção '+escapeHtml(p.secaoDOU):''}</div>`:''}
    `;
  }
  if(base==='TCU'){
    return `
      <div><b>Nome na lista:</b> ${escapeHtml(item.nome)||'—'} ${item.cpf_cnpj?'('+escapeHtml(item.cpf_cnpj)+')':''}</div>
      ${item.processo?`<div><b>Processo TCU:</b> ${escapeHtml(item.processo)}</div>`:''}
      ${item.deliberacao?`<div><b>Deliberação:</b> ${escapeHtml(item.deliberacao)}</div>`:''}
      ${item.data_final?`<div><b>Inidoneidade vigente até:</b> ${escapeHtml(String(item.data_final).slice(0,10))}</div>`:''}
      <div style="margin-top:4px;color:#64748b">Empresa/pessoa declarada inidônea pra participar de licitação na Administração Pública Federal (art. 46 da Lei 8.443/92).</div>
      <div style="margin-top:8px"><a href="https://portal.tcu.gov.br/responsabilizacao-publica/licitantes-inidoneas/" target="_blank" onclick="event.stopPropagation()" class="dd2-link-ext" style="padding:4px 9px;font-size:.72rem">🔗 Conferir na lista oficial do TCU</a></div>
    `;
  }
  // Internacional (sanctions.network — OFAC/ONU/UE)
  return `
    ${item.remarks?`<div><b>Motivo / observação:</b> ${escapeHtml(item.remarks)}</div>`:'<div style="color:#94a3b8">Nenhum motivo detalhado disponível nesta base.</div>'}
    ${(item.positions||[]).length?`<div style="margin-top:4px"><b>Cargo / posição:</b> ${escapeHtml(item.positions.join(', '))}</div>`:''}
    ${(item.names||[]).length>1?`<div style="margin-top:4px"><b>Também conhecido como:</b> ${escapeHtml(item.names.slice(1).join(', '))}</div>`:''}
    <div style="margin-top:8px"><a href="https://sanctionssearch.ofac.treas.gov/" target="_blank" onclick="event.stopPropagation()" class="dd2-link-ext" style="padding:4px 9px;font-size:.72rem">🔗 Conferir na busca oficial do OFAC</a></div>
  `;
}

// CEIS/CNEP, Leniência, CEPIM, CEAF e o agregador internacional têm formatos
// de resposta bem diferentes entre si — essa função normaliza cada um pras
// mesmas colunas da tabela.
function dd2NormalizarSancao(item,base){
  if(base==='CEIS'||base==='CNEP'){
    return{descricao:item.tipoSancao?.descricaoPortal||item.tipoSancao?.descricaoResumida||'—',orgao:item.orgaoSancionador?.nome||'—',inicio:item.dataInicioSancao,fim:item.dataFimSancao};
  }
  if(base==='Leniência'){
    const empresas=(item.sancoes||[]).map(s=>s.razaoSocial||s.nomeInformadoOrgaoResponsavel).filter(Boolean).join(', ');
    return{descricao:'Acordo de Leniência'+(item.situacaoAcordo?' — '+item.situacaoAcordo:'')+(empresas?' ('+empresas+')':''),orgao:item.orgaoResponsavel||'—',inicio:item.dataInicioAcordo,fim:item.dataFimAcordo};
  }
  if(base==='CEPIM'){
    return{descricao:'Entidade impedida de celebrar convênio'+(item.motivo?' — '+item.motivo:''),orgao:item.orgaoSuperior?.nome||'—',inicio:item.dataReferencia,fim:null};
  }
  if(base==='CEAF'){
    return{descricao:(item.tipoPunicao?.descricao||'Punição disciplinar')+(item.cargoEfetivo?' — '+item.cargoEfetivo:''),orgao:item.orgaoLotacao?.nome||'—',inicio:item.dataPublicacao,fim:null};
  }
  if(base==='TCU'){
    return{descricao:'Declarado inidôneo pelo TCU'+(item.processo?' — processo '+item.processo:''),orgao:'Tribunal de Contas da União',inicio:item.data_transito_julgado?String(item.data_transito_julgado).slice(0,10):null,fim:item.data_final?String(item.data_final).slice(0,10):null};
  }
  // Internacional (sanctions.network — OFAC/ONU/UE)
  return{descricao:'Sanção internacional'+(item.source?' — '+String(item.source).toUpperCase():'')+((item.positions||[]).length?' — '+item.positions.join(', '):''),orgao:(item.names||[]).join(', ')||'—',inicio:item.listed_on,fim:null};
}

function dd2SanTotal(d){
  return (d?.ceis||[]).length+(d?.cnep||[]).length+(d?.leniencia||[]).length+(d?.cepim||[]).length+(d?.ceaf||[]).length+(d?.tcu||[]).length+(d?.internacional||[]).length;
}

function dd2RenderSancoes(d){
  const el=document.getElementById('dd2-sancoes-content');
  const falhouTudo=!!(d?.ceisFalhou&&d?.cnepFalhou);
  if(falhouTudo){el.innerHTML='<p style="color:#ef4444;font-weight:600">⚠️ Não foi possível consultar as bases CEIS e CNEP automaticamente no momento.</p>';return;}
  let avisos='';
  if(d?.semDocumento) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ CEIS, CNEP, Leniência, CEPIM, CEAF e TCU não foram verificados — essas bases exigem CPF/CNPJ. Só a base internacional (por nome) foi consultada.</p>';
  else if(d?.ceisFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Não foi possível consultar a base CEIS — resultado pode estar incompleto.</p>';
  else if(d?.cnepFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Não foi possível consultar a base CNEP — resultado pode estar incompleto.</p>';
  if(d?.tcuFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Não foi possível consultar a lista de inidôneos do TCU — resultado pode estar incompleto. <a href="https://portal.tcu.gov.br/responsabilizacao-publica/licitantes-inidoneas/" target="_blank" class="dd2-link-ext" style="padding:2px 8px;font-size:.72rem">🔗 Conferir manualmente</a></p>';
  const all=[
    ...(d?.ceis||[]).map(s=>({...dd2NormalizarSancao(s,'CEIS'),_base:'CEIS',_raw:s})),
    ...(d?.cnep||[]).map(s=>({...dd2NormalizarSancao(s,'CNEP'),_base:'CNEP',_raw:s})),
    ...(d?.leniencia||[]).map(s=>({...dd2NormalizarSancao(s,'Leniência'),_base:'Leniência',_raw:s})),
    ...(d?.cepim||[]).map(s=>({...dd2NormalizarSancao(s,'CEPIM'),_base:'CEPIM',_raw:s})),
    ...(d?.ceaf||[]).map(s=>({...dd2NormalizarSancao(s,'CEAF'),_base:'CEAF',_raw:s})),
    ...(d?.tcu||[]).map(s=>({...dd2NormalizarSancao(s,'TCU'),_base:'TCU',_raw:s})),
    ...(d?.internacional||[]).map(s=>({...dd2NormalizarSancao(s,'Internacional'),_base:'Internacional',_raw:s})),
  ];
  if(!all.length){el.innerHTML=avisos+'<p style="color:#22c55e;font-weight:600">✅ Nenhuma sanção ou restrição encontrada nas bases consultadas.</p>';return;}
  const temIntl=all.some(s=>s._base==='Internacional');
  el.innerHTML=avisos+`<p style="font-size:.72rem;color:#94a3b8;margin-bottom:8px">Clique numa linha para ver o motivo/fundamentação completa.</p><div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th></th><th>Base</th><th>Descrição</th><th>Órgão</th><th>Período</th><th>Status</th></tr></thead>
  <tbody>${all.map((s,i)=>{
    const semVigencia=s._base==='CEPIM'||s._base==='CEAF'||s._base==='Internacional';
    // "Encerrada" só quando a data-fim já passou — uma sanção com fim em
    // data FUTURA está vigente (comum no TCU/CEIS, que publicam o prazo).
    const hoje=new Date().toISOString().slice(0,10);
    const fimOrd=s.fim?dd2DataDiarioOrdenavel(String(s.fim)):null;
    const vigente=!semVigencia&&(!fimOrd||fimOrd>=hoje);
    const statusTxt=semVigencia?'Registrado':(vigente?'Vigente':'Encerrada');
    const idRow='dd2-san-det-'+i;
    return `<tr style="cursor:pointer" onclick="dd2ToggleDetalhe('${idRow}')"><td style="width:18px;color:#94a3b8;font-size:.75rem" id="${idRow}-seta">▸</td><td><span class="dd2-badge danger">${s._base}</span></td><td>${escapeHtml(s.descricao)}</td><td>${escapeHtml(s.orgao)}</td><td>${escapeHtml(s.inicio)||'—'}${s.fim!=null?' – '+escapeHtml(s.fim):''}</td><td><span class="dd2-badge ${vigente?'danger':'warn'}">${statusTxt}</span></td></tr>
    <tr id="${idRow}" style="display:none;background:#f8fafc"><td></td><td colspan="5" style="padding:10px 12px;font-size:.8rem;color:#334155;line-height:1.6">${dd2MotivoSancaoHTML(s._raw,s._base)}</td></tr>`;
  }).join('')}</tbody></table></div>
  ${temIntl?`<p style="font-size:.72rem;color:#94a3b8;margin-top:10px">⚠️ Resultados "Internacional" vêm de um agregador de terceiros (sanctions.network) não-oficial — use como indício, confirme na fonte primária (OFAC/ONU/UE) antes de qualquer decisão.</p>`:''}`;
}

function dd2RenderPep(data,falhou){
  const el=document.getElementById('dd2-pep-content');
  if(falhou){el.innerHTML='<p style="color:#ef4444;font-weight:600">⚠️ Não foi possível consultar a base de PEPs automaticamente no momento.</p>';return;}
  if(!Array.isArray(data)||!data.length){el.innerHTML='<p style="color:#22c55e;font-weight:600">✅ Nenhum registro PEP encontrado.</p>';return;}
  el.innerHTML=`<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th>Nome</th><th>Cargo / Função</th><th>Órgão</th><th>Período</th><th>Status</th></tr></thead>
  <tbody>${data.slice(0,50).map(p=>`<tr><td>${escapeHtml(p.nome)||'—'}</td><td>${escapeHtml(p.descricao_funcao)||'—'}</td><td>${escapeHtml(p.nome_orgao)||'—'}</td><td>${escapeHtml(p.dt_inicio_exercicio)||'—'} – ${escapeHtml(p.dt_fim_exercicio)||'atual'}</td><td><span class="dd2-badge pep">&#9888; PEP</span></td></tr>`).join('')}</tbody></table></div>`;
}

// Contratos com o Poder Executivo Federal — não é necessariamente negativo
// (é normal fornecedor legítimo ter contrato com o governo), por isso não
// entra no score de risco; é só informativo/complementar pra conflito de
// interesse. A ressalva de cobertura (só federal) fica sempre visível,
// inclusive quando não acha nada, pra não passar a impressão de que
// "sem contrato federal" = "sem contrato com qualquer governo".
// Link manual pro PNCP (Portal Nacional de Contratações Públicas) —
// cobre federal+estadual+municipal por lei (14.133/2021), mas confirmamos
// no Swagger oficial (v3/api-docs) que a API pública não tem NENHUM
// parâmetro de busca por CNPJ/nome do fornecedor (só por CNPJ do órgão
// contratante, período, UF, etc.) — a mesma limitação existe na tela de
// busca do site. O único campo que aceita texto livre é "palavra-chave"
// (parâmetro `q`), que pesquisa no OBJETO do contrato, não no nome do
// fornecedor — testamos com "TORRE E CIA SUPERMERCADOS" e o único
// resultado foi um contrato de café "torrado" (match de texto, não de
// empresa). Por isso isso aqui é só um atalho de verificação manual,
// nunca uma checagem automática confiável.
function dd2PncpLinkHtml(nome){
  if(!nome) return '';
  const url='https://pncp.gov.br/app/contratos?pagina=1&status=todos&q='+encodeURIComponent(nome);
  return `<div style="margin-top:8px;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
    <p style="font-size:.72rem;color:#64748b;margin-bottom:4px">🔎 Não existe API pública para checar automaticamente contratos com <strong>estados e municípios</strong> — o PNCP (portal nacional que reúne os três níveis de governo) não permite filtrar por CNPJ/nome do fornecedor, só por texto livre no objeto do contrato. Como ponto de partida pra uma verificação manual:</p>
    <a href="${url}" target="_blank" rel="noopener" style="font-size:.78rem">Pesquisar "${escapeHtml(nome)}" no PNCP (todos os entes federativos) →</a>
  </div>`;
}
function dd2RenderContratosFederais(data,falhou,nome){
  const el=document.getElementById('dd2-contratos-content');
  const aviso='<p style="font-size:.72rem;color:#94a3b8;margin-bottom:8px">⚠️ Cobre só o Poder Executivo Federal — não inclui contratos com estados ou municípios, que ficam em portais de transparência próprios de cada um.</p>';
  const pncpLink=dd2PncpLinkHtml(nome);
  if(falhou){el.innerHTML='<p style="color:#ef4444;font-weight:600">⚠️ Não foi possível consultar contratos com o Governo Federal no momento.</p>'+aviso+pncpLink;return;}
  if(!Array.isArray(data)||!data.length){el.innerHTML='<p style="color:#22c55e;font-weight:600;margin-bottom:8px">✅ Nenhum contrato encontrado com o Governo Federal.</p>'+aviso+pncpLink;return;}
  el.innerHTML=aviso+`<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th>Número</th><th>Objeto</th><th>Órgão</th><th>Vigência</th><th>Valor</th><th>Status</th></tr></thead>
  <tbody>${data.slice(0,50).map(c=>{
    const orgao=c.unidadeGestora?.nome||c.unidadeGestora?.orgaoVinculado?.nome||'—';
    const valor=c.valorFinalCompra??c.valorInicialCompra;
    const objeto=c.objeto||'';
    return `<tr><td>${escapeHtml(c.numero)||'—'}</td><td style="max-width:280px">${escapeHtml(objeto.substring(0,150))}${objeto.length>150?'…':''}</td><td>${escapeHtml(orgao)}</td><td>${escapeHtml(c.dataInicioVigencia)||'—'} – ${escapeHtml(c.dataFimVigencia)||'—'}</td><td>${valor!=null?'R$ '+Number(valor).toLocaleString('pt-BR',{minimumFractionDigits:2}):'—'}</td><td><span class="dd2-badge info">${escapeHtml(c.situacaoContrato)||'—'}</span></td></tr>`;
  }).join('')}</tbody></table></div>`+pncpLink;
}

// ═══ INVESTIGAÇÃO INDIVIDUAL DOS SÓCIOS (QSA) ═══
// O QSA da Receita entrega só nome + qualificação (o CPF vem mascarado),
// então toda a investigação de sócio é por NOME: PEP, CEIS/CNEP/CEAF (a
// API do Portal aceita nomeSancionado — confirmado no OpenAPI oficial),
// lista de inidôneos do TCU, sanções internacionais e mídia negativa.
// Busca por nome tem risco de homônimo — cada achado é filtrado exigindo
// que o nome retornado bata token a token com o do sócio (dd2NomesBatem),
// e o render deixa claro que é indício a confirmar, não condenação.
const DD2_SOCIOS_MAX=5;

// Empresas vinculadas ao nome do sócio (outras empresas em que ele também
// é sócio/administrador) — via Edge Function própria "dd2-socio-empresas",
// que busca no cnpjtransparencia.com.br no servidor (contorna o CORS, que
// esse site não libera) e devolve JSON limpo. Ver esse arquivo pra
// detalhes/limitações: supabase/functions/dd2-socio-empresas/index.ts.
async function dd2FetchEmpresasVinculadas(nome){
  const url=`${SUPABASE_URL}/functions/v1/dd2-socio-empresas?nome=${encodeURIComponent(nome)}`;
  const r=await fetch(url,{headers:{'apikey':SUPABASE_ANON,'Authorization':'Bearer '+SUPABASE_ANON},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  return Array.isArray(d?.empresas)?d.empresas:[];
}

function dd2NomesBatem(nomeAlvo,nomeCandidato){
  const tokensAlvo=dd2TokensRelevantes(nomeAlvo);
  if(tokensAlvo.length<2)return false; // nome de 1 token = homônimo quase certo
  const tokensCand=new Set(dd2TokensRelevantes(nomeCandidato));
  const need=Math.max(2,Math.min(tokensAlvo.length,3));
  return tokensAlvo.filter(t=>tokensCand.has(t)).length>=need;
}

// djenItems: itens já buscados pela seção Judicial (que consulta o DJEN por
// nomeParte de cada sócio) — cruzamos aqui por nome em vez de repetir as
// chamadas, senão estouraria o rate limit do DJEN (20 req/janela). Vem null
// quando a consulta judicial está desligada/falhou = "não verificado".
async function dd2InvestigarSocios(socios,djenItems,docAtual){
  const alvo=(socios||[]).filter(s=>s.nome).slice(0,DD2_SOCIOS_MAX);
  const docAtualLimpo=soAlfanum(docAtual);
  const chamar=(rota,params)=>dd2Chamar(rota,params,12000);
  const judicialDoSocio=(nome)=>{
    if(!Array.isArray(djenItems))return null; // não verificado
    const nomeUp=nome.toUpperCase();
    return djenItems.filter(item=>
      (item.destinatarios||[]).some(d=>dd2NomesBatem(nome,d.nome||''))||
      String(item.texto||'').toUpperCase().includes(nomeUp)
    );
  };
  return Promise.all(alvo.map(async s=>{
    const enc=encodeURIComponent(s.nome);
    const [pepR,ceisR,cnepR,ceafR,intlR,tcuR,midiaR,qdR,douR,empresasR]=await Promise.allSettled([
      dd2FetchPep(s.nome,''),
      chamar('ceis','nomeSancionado='+enc),
      chamar('cnep','nomeSancionado='+enc),
      chamar('ceaf','nomeSancionado='+enc),
      dd2FetchSanctionsNetwork(s.nome).then(h=>dd2FiltrarRuidoSancoesIntl(h,s.nome)),
      dd2FetchTCUInidoneos().then(items=>dd2TcuPorNome(items,s.nome)),
      dd2FetchGoogleNewsRSS(`"${s.nome}" AND (fraude OR corrupção OR condenado OR investigação OR "lavagem de dinheiro" OR crime OR golpe OR escândalo)`),
      dd2FetchQueridoDiario(s.nome),
      dd2FetchDOU(s.nome),
      dd2FetchEmpresasVinculadas(s.nome),
    ]);
    const pega=r=>r.status==='fulfilled'&&Array.isArray(r.value)?r.value:[];
    const diarios=[
      ...pega(douR).map(d=>dd2NormalizarDiario(d,'DOU')),
      ...pega(qdR).map(d=>dd2NormalizarDiario(d,'QD')),
    ];
    // Não faz sentido listar a própria empresa que está sendo investigada
    // como "outra empresa vinculada" — ela obviamente aparece no resultado,
    // não é achado novo nenhum.
    const empresasVinculadas=pega(empresasR).filter(emp=>soAlfanum(emp.cnpj)!==docAtualLimpo);
    return{
      nome:s.nome,qual:s.qual||'',doc:s.doc||'',tipoSocio:s.tipoSocio||'',
      pep:pega(pepR).filter(p=>dd2NomesBatem(s.nome,p.nome||'')),
      ceis:pega(ceisR).filter(x=>dd2NomesBatem(s.nome,x.sancionado?.nome||x.pessoa?.nome||'')),
      cnep:pega(cnepR).filter(x=>dd2NomesBatem(s.nome,x.sancionado?.nome||x.pessoa?.nome||'')),
      ceaf:pega(ceafR).filter(x=>dd2NomesBatem(s.nome,x.punicao?.nomePunido||x.nomePunido||'')),
      intl:pega(intlR),
      tcu:pega(tcuR),
      midia:pega(midiaR).slice(0,5),
      judicial:judicialDoSocio(s.nome),
      diarios:diarios.slice(0,8),
      empresasVinculadas,
      falhas:{
        pep:pepR.status==='rejected',ceis:ceisR.status==='rejected',cnep:cnepR.status==='rejected',
        ceaf:ceafR.status==='rejected',intl:intlR.status==='rejected',tcu:tcuR.status==='rejected',midia:midiaR.status==='rejected',
        diarios:qdR.status==='rejected'&&douR.status==='rejected',
        empresas:empresasR.status==='rejected',
      },
    };
  }));
}

function dd2SocioTemAchado(s){
  return !!(s.pep.length||s.ceis.length||s.cnep.length||s.ceaf.length||s.intl.length||s.tcu.length||s.midia.length||(s.judicial?.length)||(s.diarios?.length));
}

function dd2RenderSocios(lista){
  const el=document.getElementById('dd2-socios-content');
  if(!lista.length){el.innerHTML='<p style="color:#64748b;font-size:.85rem">Nenhum sócio listado no QSA pra investigar.</p>';return;}
  const blocos=lista.map((s,i)=>{
    const badges=[];
    if(s.ceis.length)badges.push('<span class="dd2-badge danger">CEIS</span>');
    if(s.cnep.length)badges.push('<span class="dd2-badge danger">CNEP</span>');
    if(s.tcu.length)badges.push('<span class="dd2-badge danger">TCU Inidôneo</span>');
    if(s.intl.length)badges.push('<span class="dd2-badge danger">Sanção Internacional</span>');
    if(s.ceaf.length)badges.push('<span class="dd2-badge danger">CEAF</span>');
    if(s.pep.length)badges.push('<span class="dd2-badge pep">&#9888; PEP</span>');
    if(s.judicial?.length)badges.push(`<span class="dd2-badge warn">&#9878; ${s.judicial.length} comunicação(ões) DJEN</span>`);
    if(s.diarios?.length)badges.push(`<span class="dd2-badge warn">&#128220; ${s.diarios.length} diário(s)</span>`);
    if(s.midia.length)badges.push(`<span class="dd2-badge warn">&#128240; ${s.midia.length} notícia(s)</span>`);
    // Empresa vinculada não é achado negativo por si só (é normal uma pessoa
    // ter mais de uma empresa) — badge informativo (info), não soma no
    // "limpo/hit" que pinta o bloco de vermelho.
    const empresasBadge=s.empresasVinculadas?.length?`<span class="dd2-badge info">&#127970; ${s.empresasVinculadas.length} outra(s) empresa(s)</span>`:'';
    const falhouAlgo=Object.values(s.falhas).some(Boolean);
    const limpo=!badges.length;
    if(empresasBadge)badges.push(empresasBadge);
    if(limpo)badges.push(falhouAlgo?'<span class="dd2-badge warn">Parcialmente verificado</span>':'<span class="dd2-badge ok">&#9989; Nada encontrado</span>');
    const idDet='dd2-socio-det-'+i;
    const linhaBase=(rotulo,itens,fmt)=>itens.length?`<div style="margin-top:6px"><b>${rotulo}:</b><ul style="margin:4px 0 0 18px;padding:0">${itens.map(fmt).join('')}</ul></div>`:'';
    const detalhe=`
      ${linhaBase('PEP',s.pep,p=>`<li>${escapeHtml(p.nome)||'—'} — ${escapeHtml(p.descricao_funcao)||'—'} (${escapeHtml(p.nome_orgao)||'—'}, ${escapeHtml(p.dt_inicio_exercicio)||'—'} – ${escapeHtml(p.dt_fim_exercicio)||'atual'})</li>`)}
      ${linhaBase('CEIS',s.ceis,x=>`<li>${escapeHtml(x.sancionado?.nome||x.pessoa?.nome)||'—'} — ${escapeHtml(x.tipoSancao?.descricaoResumida)||'sanção'} (${escapeHtml(x.orgaoSancionador?.nome)||'—'})</li>`)}
      ${linhaBase('CNEP',s.cnep,x=>`<li>${escapeHtml(x.sancionado?.nome||x.pessoa?.nome)||'—'} — ${escapeHtml(x.tipoSancao?.descricaoResumida)||'sanção'} (${escapeHtml(x.orgaoSancionador?.nome)||'—'})</li>`)}
      ${linhaBase('CEAF (punição disciplinar)',s.ceaf,x=>`<li>${escapeHtml(x.punicao?.nomePunido||x.nomePunido)||'—'} — ${escapeHtml(x.tipoPunicao?.descricao)||'punição'} (${escapeHtml(x.orgaoLotacao?.nome)||'—'})</li>`)}
      ${linhaBase('TCU — inidôneos',s.tcu,x=>`<li>${escapeHtml(x.nome)||'—'} ${x.cpf_cnpj?'('+escapeHtml(x.cpf_cnpj)+')':''} — processo ${escapeHtml(x.processo)||'—'}${x.data_final?', vigente até '+escapeHtml(String(x.data_final).slice(0,10)):''}</li>`)}
      ${linhaBase('Sanções internacionais (indício — confirmar na fonte)',s.intl,x=>`<li>${escapeHtml((x.names||[]).join(', '))||'—'}${x.source?' — '+escapeHtml(String(x.source).toUpperCase()):''}</li>`)}
      ${linhaBase('Comunicações processuais (DJEN) em que o sócio aparece',s.judicial||[],p=>`<li>${escapeHtml(p.tipoComunicacao)||'Comunicação'} — ${escapeHtml(p.nomeClasse||p.numeroprocessocommascara)||'processo'} <span style="color:#94a3b8;font-size:.75rem">(${escapeHtml(p.siglaTribunal)||'—'}, ${escapeHtml(p.data_disponibilizacao)||'—'})</span></li>`)}
      ${linhaBase('Menções em diários oficiais (DOU + municipais)',s.diarios||[],d=>`<li>${d.url?`<a href="${escapeHtml(d.url)}" target="_blank" style="color:#0f2d4a">${escapeHtml(d.titulo)||'—'}</a>`:escapeHtml(d.titulo)||'—'} <span style="color:#94a3b8;font-size:.75rem">(${escapeHtml(d.local)||''}, ${escapeHtml(d.data)||''})</span>${(d.trechos&&d.trechos[0])?`<div style="color:#64748b;font-size:.76rem;margin-top:2px">"…${escapeHtml(d.trechos[0].slice(0,220))}…"</div>`:''}</li>`)}
      ${linhaBase('Outras empresas vinculadas a esse nome',s.empresasVinculadas||[],e=>`<li><a href="https://cnpjtransparencia.com.br/cnpj/${escapeHtml(e.cnpj)}" target="_blank" style="color:#0f2d4a">${escapeHtml(e.nome)||'—'}</a> <span style="color:#94a3b8;font-size:.75rem">(${escapeHtml(e.papel)||'—'}${e.municipioUf?' · '+escapeHtml(e.municipioUf):''}${e.situacao?' · '+escapeHtml(e.situacao):''})</span></li>`)}
      ${s.falhas.empresas?'<div style="color:#94a3b8;margin-top:6px;font-size:.78rem">🏢 Empresas vinculadas: não verificado — a consulta falhou nesta investigação.</div>':''}
      ${s.judicial===null?'<div style="color:#94a3b8;margin-top:6px;font-size:.78rem">⚖ Processos (DJEN): não verificados — a consulta judicial está desligada ou falhou nesta investigação.</div>':''}
      ${linhaBase('Mídia negativa',s.midia,n=>`<li><a href="${escapeHtml(n.link)||'#'}" target="_blank" style="color:#0f2d4a">${escapeHtml(n.title)||'—'}</a> <span style="color:#94a3b8;font-size:.75rem">(${n.pubDate?new Date(n.pubDate).toLocaleDateString('pt-BR'):''} — ${escapeHtml(n.source?.name)||''})</span></li>`)}
      ${limpo&&!falhouAlgo?'<div style="color:#22c55e;margin-top:6px">✅ Nenhum apontamento nas bases consultadas (PEP, CEIS, CNEP, CEAF, TCU, sanções internacionais, DJEN, diários oficiais e mídia negativa).</div>':''}
      ${falhouAlgo?`<div style="color:#b45309;margin-top:6px">⚠️ Bases que falharam nesta consulta: ${Object.entries(s.falhas).filter(([,v])=>v).map(([k])=>k.toUpperCase()).join(', ')} — não é "nada encontrado", é "não verificado".</div>`:''}
      <div style="margin-top:10px" class="dd2-links-ext">
        <a href="https://www.jusbrasil.com.br/consulta-processual/?q=${encodeURIComponent(s.nome)}" target="_blank" class="dd2-link-ext">🔗 JusBrasil</a>
        <a href="https://www.escavador.com/busca?q=${encodeURIComponent(s.nome)}" target="_blank" class="dd2-link-ext">🔗 Escavador</a>
        <a href="https://news.google.com/search?q=${encodeURIComponent('"'+s.nome+'"')}&hl=pt-BR&gl=BR&ceid=BR:pt-419" target="_blank" class="dd2-link-ext">🔗 Google Notícias</a>
        <a href="https://www.google.com/search?q=${encodeURIComponent('"'+s.nome+'" '+(s.qual?'sócio':''))}" target="_blank" class="dd2-link-ext">🔗 Google</a>
      </div>`;
    // CNPJ do sócio só vem "limpo" (sem máscara) quando ele é pessoa jurídica
    // — CPF de pessoa física vem sempre mascarado pela Receita (ex.:
    // "***866757**") e não deve ser exibido/linkado.
    const docLimpo=soAlfanum(s.doc);
    const cnpjSocioHtml=(s.tipoSocio==='PJ'&&docLimpo.length===14)
      ?`<a href="https://cnpjtransparencia.com.br/cnpj/${docLimpo}" target="_blank" onclick="event.stopPropagation()" style="color:#0f2d4a;font-size:.75rem;font-family:'DM Mono',monospace">${dd2FmtDoc(docLimpo,'cnpj')}</a>`
      :'';
    return `<div class="dd2-socio-bloco ${limpo?'':'hit'}">
      <div class="dd2-socio-head" style="cursor:pointer" onclick="dd2ToggleDetalhe('${idDet}','block')">
        <span style="color:#94a3b8;font-size:.75rem" id="${idDet}-seta">▸</span>
        <span style="font-weight:700">&#128100; ${escapeHtml(s.nome)}</span>
        <span style="color:#64748b;font-size:.78rem">${escapeHtml(s.qual)||''}</span>
        ${cnpjSocioHtml}
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${badges.join('')}</span>
      </div>
      <div id="${idDet}" style="display:none;padding:10px 14px;border-top:1px solid #e2e8f0;font-size:.82rem;color:#334155;line-height:1.55">${detalhe}</div>
    </div>`;
  }).join('');
  const extras=(lista.length<(dd2CadastralData?.socios||[]).length)?`<p style="font-size:.75rem;color:#94a3b8;margin-top:8px">Investigação automática limitada aos ${DD2_SOCIOS_MAX} primeiros sócios do QSA — os demais aparecem nos links manuais da seção Judicial.</p>`:'';
  el.innerHTML=`
    <p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Cada sócio do QSA é verificado individualmente em: <strong>PEP</strong>, <strong>CEIS</strong>, <strong>CNEP</strong>, <strong>CEAF</strong>, <strong>inidôneos do TCU</strong>, <strong>sanções internacionais</strong>, <strong>processos (DJEN)</strong>, <strong>diários oficiais (DOU + municipais)</strong>, <strong>mídia negativa</strong> e <strong>outras empresas em que também é sócio/administrador</strong> (útil pra achar conflito de interesse ou empresa relacionada não declarada). Clique num sócio pra ver o detalhe. Buscas por nome podem trazer homônimos — trate como indício e confirme pelo CPF na fonte antes de decidir.</p>
    ${blocos}${extras}`;
}

// Render simples pra quando a busca é por CPF/nome direto (sem CNPJ) — não
// tem QSA/sócios pra investigar, só mostra em quais outras empresas esse
// nome também aparece como sócio/administrador. PEP, sanções, mídia negativa
// etc. do próprio indivíduo já aparecem nas outras seções do relatório.
function dd2LinkManualEmpresasVinculadas(nome){
  const url='https://cnpjtransparencia.com.br/socio/?nome='+encodeURIComponent(nome||'');
  return `<div class="dd2-links-ext"><a href="${url}" target="_blank" class="dd2-link-ext">🔗 Consultar manualmente no CNPJ Transparência</a></div>`;
}

function dd2RenderEmpresasPessoa(nome,empresas){
  const el=document.getElementById('dd2-socios-content');
  if(empresas===null){
    el.innerHTML=`<p style="color:#ef4444;font-size:.85rem">⚠️ Não foi possível consultar empresas vinculadas a este nome no momento.</p>${dd2LinkManualEmpresasVinculadas(nome)}`;
    return;
  }
  if(!empresas.length){
    el.innerHTML=`<p style="color:#22c55e;font-size:.85rem">✅ Nenhuma outra empresa encontrada vinculada a este nome.</p>${dd2LinkManualEmpresasVinculadas(nome)}`;
    return;
  }
  const linhas=empresas.map(e=>`<li style="margin-bottom:4px"><a href="https://cnpjtransparencia.com.br/cnpj/${escapeHtml(e.cnpj)}" target="_blank" style="color:#0f2d4a">${escapeHtml(e.nome)||'—'}</a> <span style="color:#94a3b8;font-size:.75rem">(${escapeHtml(e.papel)||'—'}${e.municipioUf?' · '+escapeHtml(e.municipioUf):''}${e.situacao?' · '+escapeHtml(e.situacao):''})</span></li>`).join('');
  el.innerHTML=`<p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Empresas em que <strong>${escapeHtml(nome)}</strong> também aparece como sócio/administrador no quadro societário (útil pra achar conflito de interesse ou vínculo não declarado). Busca por nome pode trazer homônimos — trate como indício e confirme pelo CPF na fonte antes de decidir.</p>
  <ul style="margin:0;padding-left:18px">${linhas}</ul>
  ${dd2LinkManualEmpresasVinculadas(nome)}`;
}

const DD2_BOLSA_MANUAL_URL='https://portaldatransparencia.gov.br/beneficios/novo-bolsa-familia';
function dd2LinkManualBolsa(){
  return `<div class="dd2-links-ext"><a href="${DD2_BOLSA_MANUAL_URL}" target="_blank" class="dd2-link-ext">🔗 Consultar manualmente no Portal da Transparência</a></div>`;
}

function dd2RenderBolsaFamilia(res){
  const el=document.getElementById('dd2-bolsa-content');
  if(!res || !Array.isArray(res.items)){
    el.innerHTML=`<p style="color:#ef4444;margin-bottom:10px">⚠️ Não foi possível consultar o Bolsa Família automaticamente no momento.</p>${dd2LinkManualBolsa()}`;
    return;
  }
  const {items:data, baseAntigaFalhou, baseNovaFalhou, auxilioBrasilFalhou, nisNaoEncontrado, nisFalhouAoConsultar, nis}=res;
  let avisos='';
  // O NIS resolvido é ouro pra conferência manual — o site do Portal filtra
  // por NIS, então com ele em mãos a checagem é um copiar-e-colar.
  if(nis) avisos+=`<p style="font-size:.82rem;color:#334155;margin-bottom:6px">🔎 NIS localizado pra este CPF: <b>${escapeHtml(nis)}</b> — na consulta manual, use o filtro "NIS" com esse número.</p>`;
  if(baseAntigaFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Uma ou mais consultas à base do Bolsa Família antigo falharam — resultado pode estar incompleto (possível limite de requisições).</p>';
  if(nisFalhouAoConsultar) avisos+='<p style="color:#ef4444;font-size:.82rem;margin-bottom:6px">⚠️ A consulta pra resolver o NIS desta pessoa falhou (não é "sem NIS cadastrado" — a chamada em si deu erro, possivelmente chave/token ou limite de requisições) — a base do Novo Bolsa Família não foi verificada. Tente novamente.</p>';
  else if(nisNaoEncontrado) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Não foi encontrado NIS cadastrado pra este CPF — a base do Novo Bolsa Família (atual) não foi consultada. Confira manualmente.</p>';
  else if(baseNovaFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Uma ou mais consultas à base do Novo Bolsa Família (atual) falharam — resultado pode estar incompleto (possível limite de requisições).</p>';
  if(auxilioBrasilFalhou) avisos+='<p style="color:#b45309;font-size:.82rem;margin-bottom:6px">⚠️ Uma ou mais consultas à base do Auxílio Brasil (2021-2023) falharam — resultado pode estar incompleto.</p>';
  if(!data.length){el.innerHTML=`${avisos}<p style="color:#22c55e;font-weight:600;margin-bottom:10px">✅ Nenhuma parcela de Bolsa Família encontrada para este CPF.</p>${dd2LinkManualBolsa()}`;return;}
  el.innerHTML=`${avisos}<div style="overflow-x:auto"><table class="dd2-table"><thead><tr><th>Programa</th><th>Mês Referência</th><th>UF</th><th>Município</th><th>NIS</th><th>Beneficiário</th><th>Valor</th></tr></thead>
  <tbody>${data.slice(0,50).map(p=>{
    const titular=p.titularBolsaFamilia||p.beneficiarioNovoBolsaFamilia||p.beneficiarioAuxilioBrasil;
    const valor=p.valor!=null?p.valor:p.valorSaque;
    return `<tr>
    <td><span class="dd2-badge ${p._novo?'info':'warn'}">${p._ab?'Auxílio Brasil (2021-23)':p._novo?'Novo Bolsa Família':'Bolsa Família (antigo)'}</span></td>
    <td>${escapeHtml(p.dataMesReferencia||p.dataMesCompetencia)||'—'}</td>
    <td>${escapeHtml(p.municipio?.uf?.sigla)||'—'}</td>
    <td>${escapeHtml(p.municipio?.nomeIBGE)||'—'}</td>
    <td>${escapeHtml(titular?.nis)||'—'}</td>
    <td>${escapeHtml(titular?.nome)||'—'}</td>
    <td>${valor!=null?'R$ '+Number(valor).toLocaleString('pt-BR',{minimumFractionDigits:2}):'—'}</td>
  </tr>`;}).join('')}</tbody></table></div>
  ${dd2LinkManualBolsa()}`;
}

// Busca notícias negativas via Google News RSS — feed público, estável, que
// devolve título/link/data/veículo reais (diferente da antiga API de
// "respostas instantâneas" do DuckDuckGo, que não é motor de busca e quase
// sempre voltava vazia — ver nota equivalente em due-diligence.js).
// O feed não tem CORS liberado pro navegador. Chegamos a usar proxies CORS
// públicos (corsproxy.io, allorigins.win) — mas corsproxy.io passou a
// bloquear qualquer origem que não seja localhost no plano grátis, e os
// outros testados são lentos/instáveis. A rota /proxy da própria Edge
// Function (chamada servidor-a-servidor, sem CORS) é o caminho confiável.
function dd2ProxyUrl(alvo){
  return `${EDGE_URL}/proxy?url=${encodeURIComponent(alvo)}`;
}

function dd2ParseGoogleNewsRSS(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,'text/xml');
  if(doc.querySelector('parsererror'))return null;
  return[...doc.querySelectorAll('item')].map(it=>{
    let title=it.querySelector('title')?.textContent||'';
    const source=it.querySelector('source')?.textContent||'';
    if(source&&title.endsWith(' - '+source))title=title.slice(0,-(' - '+source).length);
    return{title,link:it.querySelector('link')?.textContent||'',pubDate:it.querySelector('pubDate')?.textContent||'',source:{name:source}};
  });
}

async function dd2FetchGoogleNewsRSS(query){
  const feedUrl='https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=pt-BR&gl=BR&ceid=BR:pt-419';
  const r=await fetch(dd2ProxyUrl(feedUrl),{headers:dd2PortalHeaders(),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const text=await r.text();
  // Cuidado: um feed sem <item> é uma resposta VÁLIDA do Google (busca sem
  // resultado nenhum) — só é falha de verdade quando nem chega a ser um RSS
  // (ex.: página de bloqueio/consentimento no lugar do feed).
  if(!text.includes('<rss'))throw new Error('Resposta não é um feed RSS válido — possível bloqueio do provedor');
  const items=dd2ParseGoogleNewsRSS(text);
  if(!items)throw new Error('XML inválido');
  return items;
}

// Dispara buscas em paralelo por cada categoria de risco (mesmas queries
// booleanas usadas no Due Diligence 1 — ver buildBooleanQuery em
// due-diligence.js) e mescla os resultados deduplicados por link, pra
// cobrir criminal/financeiro/regulatório/reputacional numa só varredura.
async function dd2BuscarMidiaNegativa(nome,docFmt,fantasia){
  // Sem o documento na query: nenhuma notícia escreve o CPF/CNPJ formatado
  // junto do nome, então exigi-lo com AND zera a busca quase sempre (testado
  // ao vivo: com CNPJ 1 resultado, sem CNPJ 10, pra mesma empresa e mesmos
  // termos). O documento continua nos links manuais, onde o Google Search
  // completo (não só Notícias) lida melhor com o termo exato. O nome
  // fantasia entra via OR (ver buildBooleanQuery) porque a imprensa quase
  // nunca cita a razão social completa — só ela sozinha também zerava a
  // busca (confirmado ao vivo com caso real: 0 resultados com a razão
  // social, dezenas com o nome fantasia).
  const bool=(typeof buildBooleanQuery==='function')?buildBooleanQuery(nome,null,fantasia):null;
  const queries=bool?[bool.criminal,bool.financeiro,bool.regulatorio,bool.reputacional]:[`"${nome}" corrupção OR fraude OR escândalo OR investigação`.trim()];
  const resultados=await Promise.allSettled(queries.map(q=>dd2FetchGoogleNewsRSS(q)));
  const porLink=new Map();
  let algumaOk=false;
  resultados.forEach(res=>{
    if(res.status==='fulfilled'){
      algumaOk=true;
      res.value.forEach(item=>{if(item.link&&!porLink.has(item.link))porLink.set(item.link,item);});
    }
  });
  if(!algumaOk)throw new Error('Todas as buscas de mídia negativa falharam');
  return[...porLink.values()].sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
}

// Links de verificação manual, como reforço à busca automática (mesmo
// padrão do dd2LinksManuaisHTML usado na seção Judicial).
function dd2LinksManuaisMidiaHTML(nome,docFmt,fantasia){
  const bool=(typeof buildBooleanQuery==='function')?buildBooleanQuery(nome,docFmt,fantasia):null;
  const alvo=nome||docFmt||'';
  const alvoSafe=escapeHtml(alvo);
  const alvoBusca=fantasia&&fantasia.trim().toLowerCase()!==alvo.trim().toLowerCase()?fantasia:alvo;
  const qCriminal=bool?bool.criminal:`"${alvo}" corrupção OR fraude OR escândalo`;
  const links=[
    {label:`Google — mídias negativas de "${alvoSafe}" (busca booleana)`,url:`https://www.google.com/search?q=${encodeURIComponent(qCriminal)}`},
    {label:`Google Notícias — "${escapeHtml(alvoBusca)}"`,url:`https://news.google.com/search?q=${encodeURIComponent('"'+alvoBusca+'"')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`},
    {label:`JusBrasil Notícias — "${escapeHtml(alvoBusca)}"`,url:`https://www.jusbrasil.com.br/busca?q=${encodeURIComponent(alvoBusca)}`},
    {label:`Reclame Aqui — "${escapeHtml(alvoBusca)}"`,url:`https://www.reclameaqui.com.br/busca/?q=${encodeURIComponent(alvoBusca)}`},
  ];
  return`
    <div style="font-size:.72rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Reforçar verificação manualmente</div>
    <div class="dd2-links-ext">${links.map(l=>`<a href="${l.url}" target="_blank" class="dd2-link-ext">🔗 ${l.label}</a>`).join('')}</div>
  `;
}

function dd2RenderMidia(data,nome,docFmt,falhou,fantasia){
  const el=document.getElementById('dd2-midia-content');
  if(falhou){
    el.innerHTML=`<p style="color:#ef4444;margin-bottom:10px">⚠️ Não foi possível consultar mídia negativa automaticamente no momento (provedores de busca indisponíveis ou bloqueados) — confira manualmente.</p>${dd2LinksManuaisMidiaHTML(nome,docFmt,fantasia)}`;
    return;
  }
  if(!data.length){
    el.innerHTML=`<p style="color:#22c55e;font-weight:600;margin-bottom:10px">✅ Nenhuma notícia negativa encontrada nas buscas automáticas.</p>${dd2LinksManuaisMidiaHTML(nome,docFmt,fantasia)}`;
    return;
  }
  el.innerHTML=data.slice(0,20).map(n=>`<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;background:#fff">
    <div style="font-weight:600;font-size:.88rem;margin-bottom:4px"><a href="${n.link||'#'}" target="_blank" style="color:#0f2d4a;text-decoration:none">${escapeHtml(n.title)||'Sem título'}</a></div>
    <div style="font-size:.78rem;color:#64748b">${n.pubDate?new Date(n.pubDate).toLocaleDateString('pt-BR'):''} — ${escapeHtml(n.source?.name)||''}</div>
  </div>`).join('')+`<div style="margin-top:10px">${dd2LinksManuaisMidiaHTML(nome,docFmt,fantasia)}</div>`;
}

// Modelo de risco por severidade — cada fonte pesa proporcional à gravidade
// real do que ela representa, não "achou algo = +X fixo" pra tudo. Duas
// mudanças de fundo em relação ao modelo anterior:
// 1) Sanção formal de autoridade (CEIS/CNEP/CEAF/lista internacional OFAC-
//    ONU-UE) é tratada como "crítica": força RISCO ALTO mesmo que a soma de
//    pontos não chegue no corte, porque uma empresa/pessoa formalmente
//    impedida de contratar com o poder público (ou sancionada
//    internacionalmente) é inaceitável pra uma decisão de negócio
//    independente de quantos outros pilares vieram limpos.
// 2) Processo judicial (DJEN) agora pesa pelo POLO do alvo na comunicação
//    (réu/executado vs autor — ver dd2JudicialPoloAlvo), não só pela
//    contagem bruta. Um processo em que o alvo é autor (cobrando alguém)
//    não é sinal de risco; um em que ele é réu/executado é.
function dd2RenderScore(){
  const gauge=document.getElementById('dd2-gauge');
  const label=document.getElementById('dd2-gauge-label');
  const pillarsEl=document.getElementById('dd2-pillars');
  const breakdownEl=document.getElementById('dd2-score-breakdown');
  const tipo=document.getElementById('dd2-tipo')?.value||'cnpj';
  let score=0;
  let critico=false;
  const motivosCriticos=[];
  const pts=[]; // {label, valor} — pra composição transparente do score
  const soma=(v,label)=>{ if(v<=0)return; score=Math.min(100,score+v); pts.push({label,valor:v}); };

  // ── Cadastral (só CNPJ — CPF não tem situação/abertura/capital) ──
  const d=dd2CadastralData;
  const sit=d?.situacao||'';
  const situacaoRegular=!sit||sit.toUpperCase().includes('ATIVA')||sit.toUpperCase().includes('REGULAR');
  if(tipo==='cnpj'&&d){
    if(!situacaoRegular)soma(30,`Situação cadastral irregular (${sit})`);
    if(d.abertura){
      const iso=dd2DataDiarioOrdenavel(d.abertura);
      const dt=iso?new Date(iso):null;
      if(dt&&!isNaN(dt)){
        const meses=(Date.now()-dt.getTime())/(1000*60*60*24*30.44);
        if(meses<12)soma(10,'Empresa aberta há menos de 12 meses');
      }
    }
    if(d.capitalNum!=null&&d.capitalNum<=1000)soma(8,'Capital social muito baixo (≤ R$ 1.000)');
  }

  // ── Sanções — cada base pesa pela gravidade formal que representa ──
  const sancoesFalhouTudo=!!(dd2SancoesData?.semDocumento||(dd2SancoesData?.ceisFalhou&&dd2SancoesData?.cnepFalhou));
  const sanTotal=dd2SanTotal(dd2SancoesData);
  const hoje=new Date().toISOString().slice(0,10);
  const ativa=s=>!s.dataFimSancao||dd2DataDiarioOrdenavel(s.dataFimSancao)>=hoje;
  (dd2SancoesData?.ceis||[]).forEach(s=>{
    const v=ativa(s)?35:20;
    soma(v,`CEIS${ativa(s)?' (vigente)':' (encerrada)'}`);
    critico=true;motivosCriticos.push('CEIS — impedida de licitar/contratar com a administração pública');
  });
  (dd2SancoesData?.cnep||[]).forEach(s=>{
    const v=ativa(s)?35:20;
    soma(v,`CNEP${ativa(s)?' (vigente)':' (encerrada)'}`);
    critico=true;motivosCriticos.push('CNEP — empresa punida por corrupção (Lei Anticorrupção)');
  });
  (dd2SancoesData?.ceaf||[]).forEach(()=>{
    soma(30,'CEAF — punição disciplinar de servidor');
    critico=true;motivosCriticos.push('CEAF — punição disciplinar de servidor público federal');
  });
  (dd2SancoesData?.tcu||[]).forEach(t=>{
    const vigente=!t.data_final||String(t.data_final).slice(0,10)>=hoje;
    soma(vigente?40:22,`TCU — declarada inidônea${vigente?' (vigente)':' (encerrada)'}`);
    critico=true;motivosCriticos.push('Declarada inidônea pelo TCU — proibida de licitar com a Administração Federal');
  });
  (dd2SancoesData?.internacional||[]).forEach(()=>{
    soma(45,'Lista internacional (OFAC/ONU/UE)');
    critico=true;motivosCriticos.push('Sanção internacional (OFAC/ONU/UE) — risco crítico de compliance');
  });
  (dd2SancoesData?.leniencia||[]).forEach(()=>soma(18,'Acordo de leniência'));
  (dd2SancoesData?.cepim||[]).forEach(()=>soma(15,'CEPIM — impedida de celebrar convênio'));

  // ── Sócios — apontamentos individuais sobem o risco da empresa ──
  let sociosSancao=0,sociosIntl=0,sociosCeaf=0,sociosPep=0,sociosMidia=0;
  dd2SociosData.forEach(s=>{
    if(s.ceis.length||s.cnep.length||s.tcu.length)sociosSancao++;
    if(s.intl.length)sociosIntl++;
    if(s.ceaf.length)sociosCeaf++;
    if(s.pep.length)sociosPep++;
    if(s.midia.length)sociosMidia++;
  });
  if(sociosSancao>0){
    soma(Math.min(40,sociosSancao*25),`${sociosSancao} sócio(s) com sanção formal (CEIS/CNEP/TCU)`);
    critico=true;motivosCriticos.push('Sócio com sanção formal (CEIS/CNEP/TCU) — confirmar pelo CPF na fonte');
  }
  if(sociosIntl>0){
    soma(Math.min(40,sociosIntl*30),`${sociosIntl} sócio(s) em lista internacional de sanções`);
    critico=true;motivosCriticos.push('Sócio em lista internacional de sanções (indício — confirmar na fonte)');
  }
  if(sociosCeaf>0)soma(Math.min(24,sociosCeaf*12),`${sociosCeaf} sócio(s) com punição disciplinar (CEAF)`);
  if(sociosPep>0)soma(Math.min(24,sociosPep*12),`${sociosPep} sócio(s) PEP`);
  if(sociosMidia>0)soma(Math.min(20,sociosMidia*8),`${sociosMidia} sócio(s) com mídia negativa`);

  // ── PEP — cargo atual pesa mais que cargo encerrado ──
  if(!dd2PepFalhou&&dd2PepData.length>0){
    const atual=dd2PepData.some(p=>!p.dt_fim_exercicio);
    soma(atual?25:12,atual?'PEP em cargo atual':'PEP em cargo já encerrado');
  }

  // ── Judicial (DJEN) — por polo do alvo, não só contagem ──
  let judPassivo=0,judAmbiguo=0,judAtivo=0;
  dd2JudicialData.forEach(item=>{
    const polo=dd2JudicialPoloAlvo(item,dd2JudicialNomesAlvo);
    if(polo==='P')judPassivo++;
    else if(polo==='A')judAtivo++;
    else judAmbiguo++;
  });
  if(judPassivo>0)soma(Math.min(35,judPassivo*12),`${judPassivo} comunicação(ões) como réu/executado no DJEN`);
  if(judAmbiguo>0)soma(Math.min(15,judAmbiguo*4),`${judAmbiguo} comunicação(ões) no DJEN sem polo identificado`);
  if(judPassivo>=3){critico=true;motivosCriticos.push('Múltiplas comunicações processuais como parte passiva (réu/executado)');}

  // ── Mídia negativa e Diários Oficiais (este último não entrava no score) ──
  if(!dd2MidiaFalhou&&dd2MidiaData.length>0)soma(dd2MidiaData.length>=3?25:15,`${dd2MidiaData.length} notícia(s) negativa(s)`);
  if(dd2DiariosData.length>0)soma(dd2DiariosData.length>=3?15:8,`${dd2DiariosData.length} menção(ões) em diários oficiais`);

  score=Math.min(100,score);
  gauge.textContent=score;
  const forcarAlto=critico;
  if(forcarAlto||score>=60){gauge.className='dd2-gauge-circle high';label.textContent='RISCO ALTO';label.style.color='#ef4444';}
  else if(score>=25){gauge.className='dd2-gauge-circle medium';label.textContent='RISCO MÉDIO';label.style.color='#f59e0b';}
  else{gauge.className='dd2-gauge-circle low';label.textContent='RISCO BAIXO';label.style.color='#22c55e';}

  const sociosComAchado=dd2SociosData.filter(dd2SocioTemAchado).length;
  const pillars=[
    ...(tipo==='cnpj'?[{icon:'&#127963;',label:'Cadastral',cls:!d?'warn':(situacaoRegular?'ok':'bad'),txt:!d?'Não verificado':null}]:[]),
    {icon:'&#9878;',label:'Judicial',cls:(judPassivo+judAmbiguo)===0?'ok':'bad',txt:null},
    {icon:'&#128171;',label:'Sanções',cls:sancoesFalhouTudo?'warn':(sanTotal===0?'ok':'bad'),txt:sancoesFalhouTudo?'Não verificado':null},
    ...(tipo==='cnpj'?[{icon:'&#128101;',label:'Sócios',cls:dd2SociosFalhou?'warn':(sociosComAchado===0?'ok':'bad'),txt:dd2SociosFalhou?'Não verificado':(sociosComAchado?`${sociosComAchado} com achados`:null)}]:[]),
    {icon:'&#127963;',label:'PEP',cls:dd2PepFalhou?'warn':(dd2PepData.length===0?'ok':'bad'),txt:dd2PepFalhou?'Não verificado':null},
    {icon:'&#128240;',label:'Mídia',cls:dd2MidiaFalhou?'warn':(dd2MidiaData.length===0?'ok':'bad'),txt:dd2MidiaFalhou?'Não verificado':null},
    {icon:'&#128220;',label:'Diários',cls:dd2DiariosData.length===0?'ok':'bad',txt:null},
  ];
  pillarsEl.innerHTML=pillars.map(p=>`<div class="dd2-pillar">
    <div class="dd2-pillar-icon">${p.icon}</div>
    <div class="dd2-pillar-label">${p.label}</div>
    <div class="dd2-pillar-status ${p.cls}">${p.txt||(p.cls==='ok'?'OK':'Atenção')}</div>
  </div>`).join('');

  if(breakdownEl){
    const avisoCritico=forcarAlto&&motivosCriticos.length?`<div class="dd2-score-critico">🚨 Risco alto forçado independente da pontuação: ${motivosCriticos.map(escapeHtml).join(' · ')}</div>`:'';
    const linhas=pts.length?pts.map(p=>`<div class="dd2-score-breakdown-item"><span>${escapeHtml(p.label)}</span><span class="dd2-score-breakdown-pts">+${p.valor}</span></div>`).join(''):'<div class="dd2-score-breakdown-item" style="color:#94a3b8">Nenhum fator de risco identificado nas bases verificadas.</div>';
    breakdownEl.innerHTML=avisoCritico+linhas;
  }
}

function dd2RenderTimeline(){
  const el=document.getElementById('dd2-timeline-content');
  const events=[];
  const d=dd2CadastralData;
  if(d?.abertura){
    events.push({date:d.abertura,text:'Empresa aberta',sub:'Receita Federal',cls:'ok'});
  }
  dd2JudicialData.slice(0,5).forEach(p=>{
    if(p.data_disponibilizacao)events.push({date:p.data_disponibilizacao,text:(p.tipoComunicacao||'Comunicação')+': '+(p.nomeClasse||p.numeroprocessocommascara||'Processo judicial'),sub:p.siglaTribunal||'DJEN',cls:'warn'});
  });
  (dd2SancoesData?.ceis||[]).slice(0,3).forEach(s=>{
    if(s.dataInicioSancao)events.push({date:s.dataInicioSancao,text:'Sanção CEIS',sub:s.orgaoSancionador?.nome||'CEIS',cls:'danger'});
  });
  events.sort((a,b)=>b.date.localeCompare(a.date));
  if(!events.length){el.innerHTML='<p style="color:#64748b;font-size:.85rem">Nenhum evento registrado.</p>';return;}
  el.innerHTML=events.map(e=>`<div class="dd2-tl-item ${e.cls}">
    <div class="dd2-tl-date">${e.date}</div>
    <div class="dd2-tl-text">${e.text}</div>
    <div class="dd2-tl-sub">${e.sub}</div>
  </div>`).join('');
}

function dd2RenderChecklist(){
  const el=document.getElementById('dd2-checklist-content');
  const tipo=document.getElementById('dd2-tipo').value;
  const d=dd2CadastralData;
  const sit=d?.situacao||'';
  const sanTotal=dd2SanTotal(dd2SancoesData);
  const sancoesFalhouTudo=!!(dd2SancoesData?.semDocumento||(dd2SancoesData?.ceisFalhou&&dd2SancoesData?.cnepFalhou));
  let judPassivo=0,judAmbiguo=0;
  dd2JudicialData.forEach(item=>{
    const polo=dd2JudicialPoloAlvo(item,dd2JudicialNomesAlvo);
    if(polo==='P')judPassivo++;else if(polo!=='A')judAmbiguo++;
  });
  const judRisco=judPassivo+judAmbiguo;
  const items=[
    // Cadastral só existe pra CNPJ — pra CPF não há "situação"/abertura na Receita.
    ...(tipo==='cnpj'?[
      {state:d?'ok':'bad',label:'Dados cadastrais obtidos',icon:'&#127963;'},
      {state:(!sit||sit.toUpperCase().includes('ATIVA')||sit.toUpperCase().includes('REGULAR'))?'ok':'bad',label:'Situação cadastral regular',icon:'&#128188;'},
    ]:[]),
    {state:judRisco===0?'ok':'bad',label:dd2JudicialData.length?`${dd2JudicialData.length} comunicação(ões) no DJEN — ${judPassivo} como réu/executado, ${judAmbiguo} sem polo identificado`:'Sem comunicações processuais no DJEN',icon:'&#9878;'},
    {state:sancoesFalhouTudo?'warn':(sanTotal===0?'ok':'bad'),label:sancoesFalhouTudo?'Não foi possível verificar sanções/restrições':(sanTotal?`${sanTotal} sanção(ões)/restrição(ões) encontrada(s)`:'Sem sanções ou restrições'),icon:'&#128171;'},
    ...(tipo==='cnpj'?[(()=>{
      const comAchado=dd2SociosData.filter(dd2SocioTemAchado).length;
      return {state:dd2SociosFalhou?'warn':(comAchado===0?'ok':'bad'),label:dd2SociosFalhou?'Não foi possível investigar os sócios':(comAchado?`${comAchado} sócio(s) com apontamentos (PEP/sanções/mídia)`:(dd2SociosData.length?`${dd2SociosData.length} sócio(s) investigado(s) — sem apontamentos`:'Sócios não investigados')),icon:'&#128101;'};
    })()]:[]),
    {state:dd2PepFalhou?'warn':(dd2PepData.length===0?'ok':'bad'),label:dd2PepFalhou?'Não foi possível verificar PEP':'Sem registro PEP',icon:'&#127963;'},
    {state:dd2MidiaFalhou?'warn':(dd2MidiaData.length===0?'ok':'bad'),label:dd2MidiaFalhou?'Não foi possível verificar mídia negativa automaticamente':'Sem notícias negativas',icon:'&#128240;'},
    {state:dd2DiariosData.length===0?'ok':'bad',label:dd2DiariosData.length?`${dd2DiariosData.length} menção(ões) em diários oficiais municipais`:'Sem menções em diários oficiais municipais',icon:'&#128240;'}
  ];
  if(tipo==='cpf'){
    items.push({state:dd2BolsaData.length===0?'ok':'bad',label:dd2BolsaData.length?`Recebe Bolsa Família (${dd2BolsaData.length} parcela(s))`:'Não recebe Bolsa Família',icon:'&#128176;'});
  }
  el.innerHTML=items.map(i=>`<div class="dd2-chk-item ${i.state}">
    <span>${i.state==='ok'?'&#9989;':i.state==='warn'?'&#9888;&#65039;':'&#10060;'}</span>
    <span>${i.icon} ${i.label}</span>
  </div>`).join('');
}

// ═══════════════════════════════════════════════════════
// RADAR — acompanhamento de mudanças entre pesquisas
// ═══════════════════════════════════════════════════════
// Lista de empresas/pessoas marcadas pra acompanhamento (tabela "dd2_radar",
// acessada como qualquer outra tabela autenticada via Edge Function "api" —
// mesmo padrão de sbGet/sbInsert/sbDelete usado no resto do app). Cada item
// guarda um "snapshot" (jsonb) com as chaves das últimas ocorrências vistas
// em cada fonte — a próxima verificação compara contra esse snapshot pra
// saber o que é novo, sem precisar guardar o payload inteiro.
//
// A verificação é SEMPRE manual, item por item (botão "Verificar agora") —
// nunca automática/em lote — porque o DJEN só libera ~20 requisições por
// janela por IP; verificar uma lista inteira de uma vez estouraria esse
// limite rapidinho e derrubaria a verificação de todo mundo.
let dd2RadarLista=null;
// {tipo,doc,nome} da última investigação rodada na aba "Nova Pesquisa" —
// usado pelo botão "Adicionar ao Radar" no relatório, pra não precisar
// redigitar os dados de quem acabou de ser pesquisado.
let dd2UltimaPesquisa=null;

function dd2TrocarView(view){
  document.getElementById('dd2-view-pesquisa').style.display=view==='pesquisa'?'block':'none';
  document.getElementById('dd2-view-radar').style.display=view==='radar'?'block':'none';
  document.getElementById('dd2-view-tab-pesquisa').classList.toggle('active',view==='pesquisa');
  document.getElementById('dd2-view-tab-radar').classList.toggle('active',view==='radar');
  if(view==='radar'&&dd2RadarLista===null) dd2RadarCarregar();
}

async function dd2RadarCarregar(){
  const el=document.getElementById('dd2-radar-lista');
  el.innerHTML='<div class="dd2-loading">&#9203; Carregando radar...</div>';
  try{
    dd2RadarLista=await sbGet('dd2_radar');
  }catch(e){
    dd2RadarLista=null;
    el.innerHTML=`<p style="color:#ef4444">⚠️ Não foi possível carregar o radar: ${escapeHtml(e.message)}</p>`;
    return;
  }
  dd2RadarRenderLista();
}

function dd2RadarStatusBadge(item){
  if(!item.ultima_verificacao) return '<span class="dd2-badge info">&#128312; Nunca verificado</span>';
  const r=item.ultimo_resultado;
  if(r&&r.totalNovidades) return `<span class="dd2-badge danger">&#128308; ${r.totalNovidades} novidade(s)</span>`;
  return '<span class="dd2-badge ok">&#9989; Sem mudanças</span>';
}

function dd2RadarRenderLista(){
  const el=document.getElementById('dd2-radar-lista');
  const lista=(dd2RadarLista||[]).slice().sort((a,b)=>(b.criado_em||'').localeCompare(a.criado_em||''));
  if(!lista.length){
    el.innerHTML='<p style="color:#64748b;font-size:.85rem">Nenhum item no radar ainda. Adicione uma empresa ou pessoa acima, ou clique em "&#128225; Adicionar ao Radar" depois de rodar uma pesquisa na aba Nova Pesquisa.</p>';
    return;
  }
  el.innerHTML=`<div style="overflow-x:auto"><table class="dd2-table"><thead><tr>
    <th>Nome / Razão</th><th>Tipo</th><th>Documento</th><th>Adicionado em</th><th>Última verificação</th><th>Status</th><th>Ações</th>
  </tr></thead><tbody>${lista.map(item=>{
    const docFmt=item.doc?dd2FmtDoc(item.doc,item.tipo):'—';
    const r=item.ultimo_resultado;
    let detalhes='';
    if(r&&r.partes&&r.partes.length){
      detalhes=`<tr><td colspan="7" style="background:#f8fafc;font-size:.8rem;color:#334155;padding:10px 16px"><ul style="margin:0;padding-left:18px">${r.partes.map(p=>`<li>${p}</li>`).join('')}</ul>${r.falhas&&r.falhas.length?`<div style="color:#b45309;margin-top:4px">&#9888;&#65039; Não verificado nesta rodada: ${escapeHtml(r.falhas.join(', '))}</div>`:''}</td></tr>`;
    } else if(item.ultima_verificacao){
      const msg=r&&r.primeiraVez?'Primeira verificação — ponto de partida registrado. A comparação de mudanças aparece a partir da próxima verificação.':'Nenhuma novidade encontrada desde a última verificação.';
      detalhes=`<tr><td colspan="7" style="background:#f8fafc;font-size:.8rem;color:#64748b;padding:8px 16px">${msg}${r&&r.falhas&&r.falhas.length?`<div style="color:#b45309;margin-top:4px">&#9888;&#65039; Não verificado nesta rodada: ${escapeHtml(r.falhas.join(', '))}</div>`:''}</td></tr>`;
    }
    return `<tr id="dd2-radar-row-${item.id}">
      <td>${escapeHtml(item.nome)}</td>
      <td>${item.tipo==='cnpj'?'&#127970; CNPJ':'&#128100; CPF'}</td>
      <td style="font-family:'DM Mono',monospace">${docFmt}</td>
      <td>${item.criado_em?new Date(item.criado_em).toLocaleDateString('pt-BR'):'—'}</td>
      <td>${item.ultima_verificacao?new Date(item.ultima_verificacao).toLocaleString('pt-BR'):'—'}</td>
      <td>${dd2RadarStatusBadge(item)}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="dd2RadarVerificar(${item.id})">&#128269; Verificar agora</button><button class="btn btn-outline btn-sm" onclick="dd2RadarRemover(${item.id})">&#128465;&#65039;</button></div></td>
    </tr>${detalhes}`;
  }).join('')}</tbody></table></div>`;
}

async function dd2RadarAdicionarManual(){
  const tipo=document.getElementById('dd2-radar-tipo').value;
  const doc=document.getElementById('dd2-radar-doc').value;
  const nome=document.getElementById('dd2-radar-nome').value;
  const ok=await dd2RadarAdicionar(tipo,doc,nome);
  if(ok){
    document.getElementById('dd2-radar-doc').value='';
    document.getElementById('dd2-radar-nome').value='';
  }
}

async function dd2RadarAdicionar(tipo,doc,nome){
  nome=(nome||'').trim();
  if(!nome){alert('Informe o nome ou razão social pra adicionar ao Radar.');return false;}
  const docLimpo=tipo==='cnpj'?soAlfanum(doc):(doc||'').replace(/\D/g,'');
  const row={id:Date.now(),tipo,doc:docLimpo||null,nome,criado_em:new Date().toISOString(),ultima_verificacao:null,snapshot:null,ultimo_resultado:null};
  try{
    await sbInsert('dd2_radar',row);
  }catch(e){
    alert('Erro ao adicionar ao Radar: '+e.message);
    return false;
  }
  dd2RadarLista=null;
  if(document.getElementById('dd2-view-radar').style.display!=='none') await dd2RadarCarregar();
  return true;
}

async function dd2RadarAdicionarDoRelatorio(){
  if(!dd2UltimaPesquisa||!dd2UltimaPesquisa.nome){
    alert('Não foi possível identificar o nome/razão social desta pesquisa pra adicionar ao Radar.');
    return;
  }
  const ok=await dd2RadarAdicionar(dd2UltimaPesquisa.tipo,dd2UltimaPesquisa.doc,dd2UltimaPesquisa.nome);
  if(ok) alert('Adicionado ao Radar! Veja a aba "📡 Radar" pra acompanhar.');
}

async function dd2RadarRemover(id){
  if(!confirm('Remover este item do Radar? O histórico de verificação dele será perdido.'))return;
  try{
    await sbDelete('dd2_radar',id);
  }catch(e){
    alert('Erro ao remover do Radar: '+e.message);
    return;
  }
  dd2RadarLista=(dd2RadarLista||[]).filter(x=>x.id!==id);
  dd2RadarRenderLista();
}

// Verificação manual de UM item do radar — busca as mesmas fontes usadas na
// investigação principal (DJEN, diários oficiais, PEP/CEIS/CNEP/TCU/sanções
// internacionais, mídia negativa e, pra CNPJ, situação cadastral + QSA) e
// compara contra o snapshot da verificação anterior. Fonte que falhar nesta
// rodada NÃO conta como "sem novidade" — mantém o snapshot anterior daquela
// fonte intacto (fica "não verificado", não "limpo") e aparece na lista de
// falhas, pro usuário saber que aquele pedaço não foi realmente conferido.
async function dd2RadarVerificar(id){
  const item=(dd2RadarLista||[]).find(x=>x.id===id);
  if(!item)return;
  const row=document.getElementById('dd2-radar-row-'+id);
  const btn=row?.querySelector('button');
  if(btn){btn.disabled=true;btn.textContent='⏳ Verificando...';}
  try{
    const nome=item.nome, doc=item.doc||'', tipo=item.tipo;
    const docFmt=doc?dd2FmtDoc(doc,tipo):'';
    const chamar=(rota,params)=>dd2Chamar(rota,params,12000);
    const enc=encodeURIComponent(nome);

    const [djenR,diariosR,pepR,ceisR,cnepR,tcuR,intlR,midiaR,cadR]=await Promise.allSettled([
      dd2BuscarTodosProcessosDJEN(nome,doc,tipo,[]),
      dd2BuscarDiarios(nome,doc,tipo,''),
      dd2FetchPep(nome,tipo==='cpf'?doc:''),
      chamar('ceis','nomeSancionado='+enc),
      chamar('cnep','nomeSancionado='+enc),
      dd2FetchTCUInidoneos().then(items=>dd2TcuPorNome(items,nome)),
      dd2FetchSanctionsNetwork(nome).then(h=>dd2FiltrarRuidoSancoesIntl(h,nome)),
      dd2BuscarMidiaNegativa(nome,docFmt,''),
      (tipo==='cnpj'&&doc)?dd2BuscarCNPJ(doc):Promise.resolve(null),
    ]);

    const anterior=item.snapshot||{};
    const falhas=[];
    // extrator(valor) roda só se a fonte respondeu OK nesta rodada; se
    // falhou, devolve undefined (sinal pra "manter snapshot anterior" mais
    // abaixo) e registra o nome da fonte em `falhas`.
    const fonte=(nomeFonte,res,extrator)=>{
      if(res.status==='fulfilled') return extrator(res.value);
      falhas.push(nomeFonte);
      return undefined;
    };

    const djenIds=fonte('Processos (DJEN)',djenR,v=>v.items.map(x=>String(x.id)));
    const diariosKeys=fonte('Diários oficiais',diariosR,v=>v.items.map(x=>x.url||(x.titulo+'|'+x.data)));
    const pepKeys=fonte('PEP',pepR,v=>v.map(p=>p.nome+'|'+p.dt_inicio_exercicio));
    const ceisKeys=fonte('CEIS',ceisR,v=>v.map(x=>(x.sancionado?.nome||x.pessoa?.nome||'')+'|'+(x.tipoSancao?.descricaoResumida||'')));
    const cnepKeys=fonte('CNEP',cnepR,v=>v.map(x=>(x.sancionado?.nome||x.pessoa?.nome||'')+'|'+(x.tipoSancao?.descricaoResumida||'')));
    const tcuKeys=fonte('TCU',tcuR,v=>v.map(x=>x.processo||x.nome));
    const intlKeys=fonte('Sanções internacionais',intlR,v=>v.map(x=>(x.names||[]).join(',')+'|'+(x.source||'')));
    const midiaKeys=fonte('Mídia negativa',midiaR,v=>v.map(x=>x.link));
    let situacao,sociosNomes;
    if(tipo==='cnpj'&&doc){
      situacao=fonte('Situação cadastral',cadR,v=>v?.situacao||'');
      sociosNomes=fonte('Quadro societário (QSA)',cadR,v=>(v?.socios||[]).map(s=>s.nome).sort());
    }

    const diffCount=(atualArr,antArr)=>{
      if(atualArr===undefined)return 0; // fonte falhou nesta rodada — não conta como novidade
      if(!antArr)return 0; // primeira vez, sem base de comparação
      const antSet=new Set(antArr);
      return atualArr.filter(k=>!antSet.has(k)).length;
    };
    const dJudicial=diffCount(djenIds,anterior.djenIds);
    const dDiarios=diffCount(diariosKeys,anterior.diariosKeys);
    const dPep=diffCount(pepKeys,anterior.pepKeys);
    const dCeis=diffCount(ceisKeys,anterior.ceisKeys);
    const dCnep=diffCount(cnepKeys,anterior.cnepKeys);
    const dTcu=diffCount(tcuKeys,anterior.tcuKeys);
    const dIntl=diffCount(intlKeys,anterior.intlKeys);
    const dMidia=diffCount(midiaKeys,anterior.midiaKeys);
    // Comparação normalizada (maiúsculas/minúsculas) — BrasilAPI, ReceitaWS e
    // CNPJ.ws escrevem a mesma situação com capitalização diferente ("ATIVA"
    // vs "Ativa"), o que gerava falso positivo de "mudança" mesmo sem
    // nenhuma alteração real, só por ter caído numa fonte diferente na API
    // de fallback entre uma verificação e outra.
    const situacaoMudou=!!(anterior.situacao&&situacao&&anterior.situacao.trim().toUpperCase()!==situacao.trim().toUpperCase());
    const socioMudou=!!(anterior.sociosNomes&&sociosNomes&&JSON.stringify(anterior.sociosNomes)!==JSON.stringify(sociosNomes));

    const primeiraVez=!item.snapshot;
    const totalNovidades=dJudicial+dDiarios+dPep+dCeis+dCnep+dTcu+dIntl+dMidia+(situacaoMudou?1:0)+(socioMudou?1:0);

    const partes=[];
    if(dJudicial)partes.push(`&#9878; ${dJudicial} novo(s) processo(s)/comunicação(ões) no DJEN`);
    if(dDiarios)partes.push(`&#128240; ${dDiarios} nova(s) menção(ões) em diário oficial`);
    if(dPep)partes.push(`&#127963; ${dPep} novo(s) registro(s) PEP`);
    if(dCeis)partes.push(`&#128171; ${dCeis} nova(s) sanção(ões) CEIS`);
    if(dCnep)partes.push(`&#128171; ${dCnep} nova(s) sanção(ões) CNEP`);
    if(dTcu)partes.push(`&#9888;&#65039; ${dTcu} novo(s) registro(s) TCU inidôneos`);
    if(dIntl)partes.push(`&#127760; ${dIntl} nova(s) sanção(ões) internacional(is)`);
    if(dMidia)partes.push(`&#128240; ${dMidia} nova(s) notícia(s) negativa(s)`);
    if(situacaoMudou)partes.push(`&#127970; Situação cadastral mudou: "${escapeHtml(anterior.situacao)}" &#8594; "${escapeHtml(situacao)}"`);
    if(socioMudou)partes.push('&#128101; Quadro societário (QSA) mudou');

    item.snapshot={
      djenIds: djenIds!==undefined?djenIds:anterior.djenIds,
      diariosKeys: diariosKeys!==undefined?diariosKeys:anterior.diariosKeys,
      pepKeys: pepKeys!==undefined?pepKeys:anterior.pepKeys,
      ceisKeys: ceisKeys!==undefined?ceisKeys:anterior.ceisKeys,
      cnepKeys: cnepKeys!==undefined?cnepKeys:anterior.cnepKeys,
      tcuKeys: tcuKeys!==undefined?tcuKeys:anterior.tcuKeys,
      intlKeys: intlKeys!==undefined?intlKeys:anterior.intlKeys,
      midiaKeys: midiaKeys!==undefined?midiaKeys:anterior.midiaKeys,
      situacao: situacao!==undefined?situacao:anterior.situacao,
      sociosNomes: sociosNomes!==undefined?sociosNomes:anterior.sociosNomes,
    };
    item.ultimo_resultado={totalNovidades,partes,falhas,primeiraVez};
    item.ultima_verificacao=new Date().toISOString();
    await sbUpsert('dd2_radar',{
      id:item.id,tipo:item.tipo,doc:item.doc,nome:item.nome,criado_em:item.criado_em,
      ultima_verificacao:item.ultima_verificacao,snapshot:item.snapshot,ultimo_resultado:item.ultimo_resultado
    });
  }catch(e){
    alert('Erro ao verificar: '+e.message);
  }finally{
    dd2RadarRenderLista();
  }
}
