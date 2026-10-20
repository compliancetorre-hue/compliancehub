<div class="dd2-container">
  <div class="dd2-view-tabs">
    <button type="button" class="dd2-view-tab active" id="dd2-view-tab-pesquisa" onclick="dd2TrocarView('pesquisa')">&#128269; Nova Pesquisa</button>
    <button type="button" class="dd2-view-tab" id="dd2-view-tab-radar" onclick="dd2TrocarView('radar')">&#128225; Radar</button>
  </div>
  <div id="dd2-view-pesquisa">
  <div class="dd2-search">
    <h2>&#128269; Investigação Prévia — Due Diligence 2</h2>
    <div class="dd2-form-row">
      <div class="dd2-form-group">
        <label>Tipo</label>
        <select id="dd2-tipo" onchange="dd2OnTipoChange()">
          <option value="cnpj">&#127970; CNPJ</option>
          <option value="cpf">&#128100; CPF</option>
        </select>
      </div>
      <div class="dd2-form-group" style="flex:1;min-width:200px">
        <label>Documento</label>
        <input type="text" id="dd2-doc" placeholder="00.000.000/0001-00" maxlength="18" oninput="dd2FormatDoc(this)"/>
      </div>
      <div class="dd2-form-group" id="dd2-nome-group" style="flex:1;min-width:200px;display:none">
        <label>Nome completo (opcional)</label>
        <input type="text" id="dd2-nome" placeholder="Ex: Maria da Silva Souza"/>
      </div>
      <div class="dd2-form-group" style="max-width:180px">
        <label>Nível</label>
        <select id="dd2-nivel">
          <option value="basico">&#129001; Básico</option>
          <option value="intermediario" selected>&#129000; Intermediário</option>
          <option value="forense">&#128308; Forense</option>
        </select>
      </div>
    </div>
    <div class="dd2-scope-grid">
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-cadastral" checked> &#127963; Dados Cadastrais</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-fiscal" checked> &#128188; Situação Fiscal</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-judicial" checked> &#9878; Processos Judiciais</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-sancoes" checked> &#128171; Sanções e Restrições</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-socios" checked> &#128101; Investigação dos Sócios / Empresas Vinculadas</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-pep" checked> &#127963; PEP</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-contratos" checked> &#128196; Contratos c/ Governo Federal</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-midia"> &#128240; Mídia Negativa</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-diarios" checked> &#128240; Diários Oficiais (DOU + Municipais)</label>
      <label class="dd2-scope-item"><input type="checkbox" id="dd2-sc-bolsa" checked> &#128176; Bolsa Família (CPF)</label>
    </div>
    <div class="dd2-form-row" style="margin-top:-6px;margin-bottom:16px">
      <div class="dd2-form-group" style="max-width:160px">
        <label>Bolsa Família — Período de</label>
        <input type="month" id="dd2-bolsa-de" value="2025-06"/>
      </div>
      <div class="dd2-form-group" style="max-width:160px">
        <label>Período até</label>
        <input type="month" id="dd2-bolsa-ate" value="2026-07"/>
      </div>
    </div>
    <button class="dd2-btn-search" onclick="dd2Iniciar()">&#128269; Investigar</button>
  </div>

  <div class="dd2-progress" id="dd2-progress">
    <div style="font-weight:600;margin-bottom:8px">Consultando fontes oficiais...</div>
    <div class="dd2-prog-track"><div class="dd2-prog-fill" id="dd2-prog-fill" style="width:0%"></div></div>
    <div class="dd2-prog-steps" id="dd2-steps">
      <span class="dd2-step" id="dd2-step-cadastral">&#127963; Cadastral</span>
      <span class="dd2-step" id="dd2-step-fiscal">&#128188; Fiscal</span>
      <span class="dd2-step" id="dd2-step-judicial">&#9878; Judicial</span>
      <span class="dd2-step" id="dd2-step-sancoes">&#128171; Sanções</span>
      <span class="dd2-step" id="dd2-step-socios">&#128101; Sócios</span>
      <span class="dd2-step" id="dd2-step-pep">&#127963; PEP</span>
      <span class="dd2-step" id="dd2-step-contratos">&#128196; Contratos</span>
      <span class="dd2-step" id="dd2-step-midia">&#128240; Mídia</span>
      <span class="dd2-step" id="dd2-step-diarios">&#128240; Diários</span>
      <span class="dd2-step" id="dd2-step-bolsa">&#128176; Bolsa Família</span>
      <span class="dd2-step" id="dd2-step-analise">&#128202; Análise</span>
    </div>
  </div>

  <div class="dd2-report" id="dd2-report">
    <div class="dd2-export-bar">
      <div class="dd2-export-meta" id="dd2-export-meta"></div>
      <div class="dd2-export-btns">
        <button class="dd2-btn-radar" onclick="dd2RadarAdicionarDoRelatorio()">&#128225; Adicionar ao Radar</button>
        <button class="dd2-btn-print" onclick="window.print()">&#128438; Imprimir</button>
        <button class="dd2-btn-pdf" onclick="window.print()">&#128229; Exportar PDF</button>
      </div>
    </div>
    <div class="dd2-score-section" id="dd2-score-section">
      <div class="dd2-gauge-wrap">
        <div class="dd2-gauge-circle" id="dd2-gauge">--</div>
        <div class="dd2-gauge-label" id="dd2-gauge-label">Calculando...</div>
      </div>
      <div class="dd2-pillars" id="dd2-pillars"></div>
      <div class="dd2-score-breakdown" id="dd2-score-breakdown"></div>
    </div>
    <div class="dd2-card" id="dd2-sec-cadastral">
      <div class="dd2-card-title">&#127963; Dados Cadastrais</div>
      <div id="dd2-cadastral-content"><div class="dd2-loading">&#9203; Consultando Receita Federal...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-qsa" style="display:none">
      <div class="dd2-card-title">&#128101; Quadro Societário (QSA)</div>
      <div id="dd2-qsa-content"></div>
    </div>
    <div class="dd2-card" id="dd2-sec-socios" style="display:none">
      <div class="dd2-card-title"><span id="dd2-socios-titulo">&#128373; Investigação dos Sócios</span></div>
      <div id="dd2-socios-content"><div class="dd2-loading">&#9203; Investigando cada sócio (PEP, sanções, mídia negativa)...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-fiscal">
      <div class="dd2-card-title">&#128188; Situação Fiscal</div>
      <div id="dd2-fiscal-content"><div class="dd2-loading">&#9203; Verificando situação fiscal...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-judicial">
      <div class="dd2-card-title">&#9878; Processos Judiciais (DJEN — CNJ)</div>
      <div class="dd2-jud-tabs">
        <button type="button" class="dd2-jud-tab active" id="dd2-jud-tab-recentes" onclick="dd2AbaJudicial('recentes')">&#128240; Comunicações Recentes (3 dias)</button>
        <button type="button" class="dd2-jud-tab" id="dd2-jud-tab-empresa" onclick="dd2AbaJudicial('empresa')">&#127970; Processos da Empresa</button>
        <button type="button" class="dd2-jud-tab" id="dd2-jud-tab-socios" onclick="dd2AbaJudicial('socios')">&#128101; Processos dos Sócios</button>
      </div>
      <div id="dd2-judicial-content"><div class="dd2-loading">&#9203; Consultando o Diário de Justiça Eletrônico Nacional...</div></div>
      <div id="dd2-judicial-empresa-content" style="display:none"></div>
      <div id="dd2-judicial-socios-content" style="display:none"></div>
    </div>
    <div class="dd2-card" id="dd2-sec-sancoes">
      <div class="dd2-card-title">&#128171; Sanções e Restrições (CEIS, CNEP, Leniência, CEPIM, CEAF, TCU, Internacional)</div>
      <div id="dd2-sancoes-content"><div class="dd2-loading">&#9203; Consultando Portal da Transparência...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-pep">
      <div class="dd2-card-title">&#127963; Pessoas Expostas Politicamente (PEP)</div>
      <div id="dd2-pep-content"><div class="dd2-loading">&#9203; Consultando base de PEPs...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-contratos">
      <div class="dd2-card-title">&#128196; Contratos com o Governo Federal</div>
      <div id="dd2-contratos-content"><div class="dd2-loading">&#9203; Consultando Portal da Transparência...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-midia" style="display:none">
      <div class="dd2-card-title">&#128240; Mídia Negativa</div>
      <div id="dd2-midia-content"><div class="dd2-loading">&#9203; Buscando notícias negativas...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-diarios">
      <div class="dd2-card-title">&#128240; Diários Oficiais (DOU + Querido Diário)</div>
      <div id="dd2-diarios-content"><div class="dd2-loading">&#9203; Consultando o DOU e diários oficiais de mais de 350 municípios...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-bolsa" style="display:none">
      <div class="dd2-card-title">&#128176; Bolsa Família</div>
      <div id="dd2-bolsa-content"><div class="dd2-loading">&#9203; Consultando Portal da Transparência...</div></div>
    </div>
    <div class="dd2-card" id="dd2-sec-timeline">
      <div class="dd2-card-title">&#128197; Linha do Tempo</div>
      <div class="dd2-timeline" id="dd2-timeline-content"></div>
    </div>
    <div class="dd2-card">
      <div class="dd2-card-title">&#9989; Checklist de Qualidade</div>
      <div class="dd2-checklist" id="dd2-checklist-content"></div>
    </div>
  </div>
  </div>
  <div id="dd2-view-radar" style="display:none">
    <div class="dd2-card">
      <div class="dd2-card-title">&#128225; Radar — Acompanhamento de Mudanças</div>
      <p style="font-size:.82rem;color:#64748b;margin-bottom:14px">Marque empresas ou pessoas pra acompanhar e clique em "Verificar agora" pra ver se surgiu algo novo desde a última verificação (processos judiciais, diários oficiais, sanções/PEP, mídia negativa e, pra CNPJ, mudança de situação cadastral ou do quadro societário). A verificação é sempre manual, item por item — nunca automática — pra não estourar o limite de consultas do DJEN. A primeira verificação de um item só registra o ponto de partida; a comparação aparece a partir da segunda.</p>
      <div class="dd2-form-row" style="margin-bottom:16px">
        <div class="dd2-form-group">
          <label>Tipo</label>
          <select id="dd2-radar-tipo">
            <option value="cnpj">&#127970; CNPJ</option>
            <option value="cpf">&#128100; CPF</option>
          </select>
        </div>
        <div class="dd2-form-group" style="flex:1;min-width:200px">
          <label>Documento (opcional pra CPF)</label>
          <input type="text" id="dd2-radar-doc" placeholder="00.000.000/0001-00"/>
        </div>
        <div class="dd2-form-group" style="flex:1;min-width:200px">
          <label>Nome / Razão Social</label>
          <input type="text" id="dd2-radar-nome" placeholder="Ex: Empresa XYZ Ltda"/>
        </div>
        <button class="dd2-btn-search" style="margin-top:0" onclick="dd2RadarAdicionarManual()">&#10133; Adicionar ao Radar</button>
      </div>
      <div id="dd2-radar-lista"><div class="dd2-loading">&#9203; Carregando radar...</div></div>
    </div>
  </div>
</div>
