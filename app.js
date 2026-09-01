
(() => {
  const STORE_KEY = "qtg_trainer_v1";
  const $ = (id) => document.getElementById(id);

  const state = {
    screen: "home",
    filters: { family:"Todas", norm:"Todas", year:"Todos", focus:"Todas" },
    session: [],
    answers: {},
    current: 0,
    lastPool: [],
  };

  function loadHistory(){
    try{
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {
        attempts:0, correct:0, answered:{}, wrong:{}, sessions:0
      };
    }catch(e){
      return { attempts:0, correct:0, answered:{}, wrong:{}, sessions:0 };
    }
  }
  function saveHistory(h){ localStorage.setItem(STORE_KEY, JSON.stringify(h)); }
  let history = loadHistory();

  const allFamilies = [...new Set(QUESTIONS.flatMap(q => q.familias || []))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const allYears = [...new Set(QUESTIONS.map(q => q.ano))].sort();

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function renderStructuredText(block){
    if(!block) return "";
    if(block.tipo === "texto"){
      return `<div class="structured-text"><div class="structured-intro">${escapeHtml(block.texto || "")}</div></div>`;
    }
    const intro = block.introducao ? `<div class="structured-intro">${escapeHtml(block.introducao)}</div>` : "";
    const items = (block.itens || []).map(item => `
      <div class="statement">
        <span class="statement-label">${escapeHtml(item.rotulo)}</span>
        <span>${escapeHtml(item.texto)}</span>
      </div>
    `).join("");
    const conclusion = block.conclusao
      ? `<div class="structured-conclusion">${escapeHtml(block.conclusao)}</div>`
      : "";
    return `<div class="structured-text">${intro}<div class="statement-list">${items}</div>${conclusion}</div>`;
  }

  function renderChipSequence(values, cssClass="choice-chip"){
    return `<div class="choice-seq">${(values || []).map((v,i) =>
      `${i ? '<span class="choice-sep">•</span>' : ''}<span class="${cssClass}">${escapeHtml(v)}</span>`
    ).join("")}</div>`;
  }

  function renderOptionContent(q, letter){
    const block = q.apresentacao && q.apresentacao.alternativas ? q.apresentacao.alternativas[letter] : null;
    if(!block) return escapeHtml((q.alternativas || {})[letter] || "");
    if(block.tipo === "sequencia_vf"){
      return renderChipSequence(block.valores || [], "vf-chip");
    }
    if(block.tipo === "selecao_numeros"){
      return renderChipSequence((block.valores || []).map(v => `(${v})`));
    }
    if(block.tipo === "selecao_romanos"){
      return renderChipSequence(block.valores || []);
    }
    if(block.tipo === "itens_numerados"){
      const intro = block.introducao ? `<div>${escapeHtml(block.introducao)}</div>` : "";
      const rows = (block.itens || []).map(item => `
        <div class="option-numbered-row">
          <span class="option-numbered-label">(${escapeHtml(item.rotulo)})</span>
          <span>${escapeHtml(item.texto)}</span>
        </div>
      `).join("");
      return `<div class="option-numbered">${intro}${rows}</div>`;
    }
    return escapeHtml(block.texto || "");
  }

  function shuffle(arr){
    const a = [...arr];
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }
  function percent(a,b){ return b ? Math.round((a/b)*100) : 0; }

  function populateFilters(){
    const family = $("familyFilter");
    family.innerHTML = `<option>Todas</option>` + allFamilies.map(x=>`<option>${escapeHtml(x)}</option>`).join("");
    const year = $("yearFilter");
    year.innerHTML = `<option>Todos</option>` + allYears.map(x=>`<option>${x}</option>`).join("");
    updateNormFilter();
  }

  function updateNormFilter(){
    const selectedFamily = $("familyFilter").value;
    const norms = [...new Set(
      QUESTIONS
        .filter(q => selectedFamily === "Todas" || (q.familias || []).includes(selectedFamily))
        .flatMap(q => q.normas || [])
    )].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true}));
    const norm = $("normFilter");
    const old = norm.value;
    norm.innerHTML = `<option>Todas</option>` + norms.map(x=>`<option>${escapeHtml(x)}</option>`).join("");
    if(norms.includes(old)) norm.value = old;
  }

  function currentPool(){
    const f = {
      family: $("familyFilter").value,
      norm: $("normFilter").value,
      year: $("yearFilter").value,
      focus: $("focusFilter").value
    };
    state.filters = f;
    return QUESTIONS.filter(q => {
      if(f.family !== "Todas" && !(q.familias || []).includes(f.family)) return false;
      if(f.norm !== "Todas" && !(q.normas || []).includes(f.norm)) return false;
      if(f.year !== "Todos" && String(q.ano) !== f.year) return false;
      if(f.focus === "Não respondidas" && history.answered[q.id]) return false;
      if(f.focus === "Erradas" && !history.wrong[q.id]) return false;
      return true;
    });
  }

  function refreshPoolCount(){
    const pool = currentPool();
    $("poolCount").textContent = `${pool.length} questão${pool.length===1?"":"ões"} disponível${pool.length===1?"":"is"} com estes filtros.`;
    $("startBtn").disabled = pool.length === 0;
  }

  function refreshStats(){
    const unique = Object.keys(history.answered || {}).length;
    $("statAnswered").textContent = unique;
    $("statAccuracy").textContent = `${percent(history.correct, history.attempts)}%`;
    $("statAttempts").textContent = history.attempts;
    $("statWrong").textContent = Object.keys(history.wrong || {}).length;
    $("heroAvailable").textContent = QUESTIONS.length;
  }

  function showScreen(name){
    ["homeScreen","quizScreen","resultScreen"].forEach(id => $(id).classList.add("hidden"));
    $(`${name}Screen`).classList.remove("hidden");
    state.screen = name;
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function startSession(customQuestions=null){
    let pool = customQuestions || currentPool();
    if(!pool.length) return;
    state.lastPool = [...pool];
    state.session = customQuestions ? [...customQuestions] : shuffle(pool).slice(0,10);
    state.answers = {};
    state.current = 0;
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion(){
    const q = state.session[state.current];
    const total = state.session.length;
    $("qCounter").textContent = `Questão ${state.current+1} de ${total}`;
    $("qMeta").textContent = `${q.prova} • questão ${q.questao_original}`;
    $("qNorms").innerHTML = (q.normas || []).map(n=>`<span class="badge">${escapeHtml(n)}</span>`).join("");
    $("progress").style.width = `${((state.current+1)/total)*100}%`;
    $("questionText").innerHTML = renderStructuredText(q.apresentacao ? q.apresentacao.enunciado : {tipo:"texto",texto:q.enunciado});

    const selected = state.answers[q.id];
    const opts = Object.entries(q.alternativas || {});
    $("options").innerHTML = opts.map(([letter,text]) => `
      <button class="option ${selected===letter?"selected":""}" data-letter="${letter}" type="button">
        <span class="letter">${letter}</span>
        <span class="option-body">${renderOptionContent(q, letter)}</span>
      </button>
    `).join("");

    document.querySelectorAll(".option").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.answers[q.id] = btn.dataset.letter;
        renderQuestion();
      });
    });

    $("prevBtn").disabled = state.current === 0;
    $("nextBtn").textContent = state.current === total-1 ? "Finalizar" : "Próxima";
    $("nextBtn").disabled = !state.answers[q.id];
  }

  function nextQuestion(){
    if(state.current < state.session.length-1){
      state.current++;
      renderQuestion();
    }else{
      finishSession();
    }
  }

  function finishSession(){
    const results = state.session.map(q => ({
      q,
      user: state.answers[q.id],
      correct: q.gabarito,
      ok: state.answers[q.id] === q.gabarito
    }));
    const score = results.filter(r=>r.ok).length;

    history.sessions = (history.sessions || 0) + 1;
    results.forEach(r=>{
      history.attempts = (history.attempts || 0) + 1;
      if(r.ok) history.correct = (history.correct || 0) + 1;
      history.answered[r.q.id] = (history.answered[r.q.id] || 0) + 1;
      if(r.ok) delete history.wrong[r.q.id];
      else history.wrong[r.q.id] = (history.wrong[r.q.id] || 0) + 1;
    });
    saveHistory(history);
    renderResults(results, score);
    refreshStats();
    showScreen("result");
  }

  function renderResults(results, score){
    const total = results.length;
    const pct = percent(score,total);
    $("scoreMain").textContent = `${score}/${total}`;
    $("scorePct").textContent = `${pct}% de acertos`;
    $("scoreRing").style.background = `conic-gradient(var(--brand2) ${pct*3.6}deg,#e7edf4 0deg)`;
    $("resultHeadline").textContent =
      pct >= 90 ? "Excelente resultado." :
      pct >= 70 ? "Bom desempenho." :
      pct >= 50 ? "Há espaço claro para ganho." :
      "Vale revisar os temas mais frágeis.";
    $("resultSub").textContent = `Você concluiu ${total} questão${total===1?"":"ões"}. As respostas corretas só são exibidas agora, após o fechamento do bloco.`;

    // Performance by norm.
    const perf = {};
    results.forEach(r=>{
      (r.q.normas || ["Sem classificação"]).forEach(n=>{
        if(!perf[n]) perf[n]={ok:0,total:0};
        perf[n].total++;
        if(r.ok) perf[n].ok++;
      });
    });
    const normRows = Object.entries(perf)
      .sort((a,b)=> (a[1].ok/a[1].total)-(b[1].ok/b[1].total) || b[1].total-a[1].total)
      .map(([n,p])=>`
        <tr>
          <td>${escapeHtml(n)}</td>
          <td>${p.ok}/${p.total}</td>
          <td>${percent(p.ok,p.total)}%</td>
        </tr>
      `).join("");
    $("normPerf").innerHTML = normRows || `<tr><td colspan="3">Sem dados.</td></tr>`;

    $("reviewList").innerHTML = results.map((r,idx)=>{
      const userText = r.q.alternativas[r.user] || "";
      const correctText = r.q.alternativas[r.correct] || "";
      const prelim = (r.q.natureza_gabarito || "").toLowerCase().includes("preliminar");
      return `
        <div class="review-card ${r.ok?"ok":"bad"}">
          <div class="review-top">
            <span class="badge neutral">${escapeHtml(r.q.prova)} • Q${r.q.questao_original}</span>
            <strong class="${r.ok?"correct":"incorrect"}">${r.ok?"✓ Acertou":"✕ Errou"}</strong>
          </div>
          <div class="review-q"><div style="margin-bottom:7px">${idx+1}.</div><div class="review-question-body">${renderStructuredText(r.q.apresentacao ? r.q.apresentacao.enunciado : {tipo:"texto",texto:r.q.enunciado})}</div></div>
          <div class="review-answer"><span class="review-answer-label">Sua resposta:</span><div class="${r.ok?"correct":"incorrect"}"><strong>${r.user}</strong> — ${renderOptionContent(r.q, r.user)}</div></div>
          ${r.ok ? "" : `<div class="review-answer"><span class="review-answer-label">Resposta correta:</span><div class="correct"><strong>${r.correct}</strong> — ${renderOptionContent(r.q, r.correct)}</div></div>`}
          <div class="source">Fonte: ${escapeHtml(r.q.prova)} • ${escapeHtml((r.q.normas || []).join(", "))}</div>
          ${prelim ? `<div class="warning">Este item pertence à prova 2025.1, cujo arquivo de gabarito fornecido está identificado como preliminar.</div>` : ""}
        </div>
      `;
    }).join("");

    const wrong = results.filter(r=>!r.ok).map(r=>r.q);
    $("retryWrongBtn").disabled = wrong.length === 0;
    $("retryWrongBtn").onclick = ()=> startSession(wrong);
    $("nextTenBtn").onclick = () => startSession();
  }

  function resetHistory(){
    $("modalBackdrop").classList.remove("hidden");
  }

  // Wire UI.
  $("familyFilter").addEventListener("change", ()=>{ updateNormFilter(); refreshPoolCount(); });
  ["normFilter","yearFilter","focusFilter"].forEach(id => $(id).addEventListener("change", refreshPoolCount));
  $("startBtn").addEventListener("click", ()=>startSession());
  $("prevBtn").addEventListener("click", ()=>{ if(state.current>0){state.current--;renderQuestion();} });
  $("nextBtn").addEventListener("click", nextQuestion);
  $("backHomeBtn").addEventListener("click", ()=>{ showScreen("home"); refreshPoolCount(); });
  $("resultHomeBtn").addEventListener("click", ()=>{ showScreen("home"); refreshPoolCount(); });
  $("resetBtn").addEventListener("click", resetHistory);
  $("cancelReset").addEventListener("click", ()=> $("modalBackdrop").classList.add("hidden"));
  $("confirmReset").addEventListener("click", ()=>{
    localStorage.removeItem(STORE_KEY);
    history = loadHistory();
    refreshStats();
    refreshPoolCount();
    $("modalBackdrop").classList.add("hidden");
  });

  populateFilters();
  refreshStats();
  refreshPoolCount();
})();
