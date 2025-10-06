// --- Função principal que inicializa todo o editor ---
function inicializarEditor() {
    console.log("Editor script v3 inicializando...");

    // --- Seleção dos Elementos do DOM ---
    const questoesContainer = document.getElementById('questoes-container');
    const provaForm = document.getElementById('prova-form');
    const addDoBancoBtn = document.getElementById('add-do-banco');
    const bancoModal = document.getElementById('banco-modal');
    const fecharModalBtn = document.getElementById('fechar-modal-btn');
    const bancoQuestoesLista = document.getElementById('banco-questoes-lista');
    const adicionarSelecionadasBtn = document.getElementById('adicionar-selecionadas-btn');

    if (!bancoModal || !fecharModalBtn || !addDoBancoBtn) {
        console.error("ERRO CRÍTICO: Elementos essenciais do modal não encontrados. Verifique os IDs no arquivo editor.html.");
        return;
    }

    let questoes = [];
    let editProvaId = null;

    // --- LÓGICA DO BANCO DE QUESTÕES ---
    const abrirModalBanco = () => {
        console.log("Abrindo modal do banco...");
        bancoQuestoesLista.innerHTML = '<p>Carregando questões...</p>';
        bancoModal.classList.remove('hidden');
        fetch('/api/questoes')
            .then(res => res.ok ? res.json() : Promise.reject('Falha ao buscar questões.'))
            .then(questoesDoBanco => {
                bancoQuestoesLista.innerHTML = '';
                if (questoesDoBanco.length === 0) {
                    bancoQuestoesLista.innerHTML = '<p>Seu banco de questões está vazio.</p>';
                } else {
                    questoesDoBanco.forEach(q => {
                        const item = document.createElement('div');
                        item.className = 'banco-questao-item';
                        item.innerHTML = `
                            <input type="checkbox" id="q-${q.id_questao}" data-questao-json='${JSON.stringify(q)}'>
                            <label for="q-${q.id_questao}">${escapeHTML(q.enunciado.substring(0, 100))}...</label>
                        `;
                        bancoQuestoesLista.appendChild(item);
                    });
                }
            }).catch(err => {
                bancoQuestoesLista.innerHTML = `<p style="color: red;">${err}</p>`;
            });
    };

    const fecharModalBanco = () => {
        console.log("Fechando modal do banco...");
        bancoModal.classList.add('hidden');
    };

    const adicionarQuestoesDoBanco = () => {
        bancoQuestoesLista.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            const questaoData = JSON.parse(cb.dataset.questaoJson);
            delete questaoData.id_questao;
            delete questaoData.user_email;
            questoes.push(questaoData);
        });
        renderizarQuestoes();
        fecharModalBanco();
    };
    
    // --- FUNÇÕES DE RENDERIZAÇÃO E MANIPULAÇÃO DE QUESTÕES ---
    const adicionarQuestao = (tipo) => {
        const novaQuestao = { tipo, enunciado: '', alternativas: [], resposta: '' };
        if (tipo === 'multipla_escolha') novaQuestao.alternativas = ['', '', '', '', ''];
        questoes.push(novaQuestao);
        renderizarQuestoes();
    };

    const renderizarQuestoes = () => {
        questoesContainer.innerHTML = '';
        questoes.forEach((questao, index) => {
            const questaoCard = document.createElement('div');
            questaoCard.className = 'questao-card';
            
            let alternativasHtml = '';
            if (questao.tipo === 'multipla_escolha') {
                const letras = ['a', 'b', 'c', 'd', 'e'];
                alternativasHtml = '<div class="alternativas-group">' + questao.alternativas.map((alt, i) => `
                    <div class="form-group"><label>Alternativa ${letras[i].toUpperCase()}</label><input type="text" class="form-control alternativa-input" data-index="${index}" data-alt-index="${i}" value="${escapeHTML(alt)}"></div>
                `).join('') + `<div class="form-group"><label>Resposta Correta (a, b, c, etc.)</label><input type="text" class="form-control resposta-input" data-index="${index}" value="${escapeHTML(questao.resposta)}"></div></div>`;
            } else if (questao.tipo === 'verdadeiro_falso') {
                 alternativasHtml = `<div class="form-group"><label>Resposta Correta</label><select class="form-control resposta-input" data-index="${index}"><option value=""></option><option value="verdadeiro" ${questao.resposta === 'verdadeiro' ? 'selected' : ''}>Verdadeiro</option><option value="falso" ${questao.resposta === 'falso' ? 'selected' : ''}>Falso</option></select></div>`;
            } else if (questao.tipo === 'dissertativa') {
                alternativasHtml = `<div class="form-group"><label>Resposta Esperada (para gabarito)</label><textarea class="form-control resposta-input" data-index="${index}" rows="3">${escapeHTML(questao.resposta)}</textarea></div>`;
            }

            questaoCard.innerHTML = `
                <h4>Questão ${index + 1} (${questao.tipo.replace(/_/g, ' ')})</h4>
                <div class="form-group"><label>Enunciado</label><textarea class="form-control enunciado-input" data-index="${index}" rows="3" required>${escapeHTML(questao.enunciado)}</textarea></div>
                ${alternativasHtml}
                <div class="button-group"><button type="button" class="button button-danger remover-questao-btn" data-index="${index}">Remover</button><button type="button" class="button button-secondary salvar-banco-btn" data-index="${index}">Salvar no Banco</button></div>
            `;
            questoesContainer.appendChild(questaoCard);
        });
    };
    
    const salvarQuestaoNoBanco = (index) => {
        const questao = questoes[index];
        if (!questao.enunciado || !questao.resposta) return alert('Preencha o enunciado e a resposta antes de salvar.');
        fetch('/api/questoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(questao) })
            .then(res => res.json())
            .then(data => {
                if (data.success) alert('Questão salva no seu banco!');
                else throw new Error(data.error);
            })
            .catch(err => alert('Erro ao salvar: ' + err.message));
    };

    const escapeHTML = (str) => {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };
    
    // --- ATRIBUIÇÃO DE EVENT LISTENERS ---
    
    // Listeners estáticos (sempre presentes na página)
    document.getElementById('add-multipla-escolha').addEventListener('click', () => adicionarQuestao('multipla_escolha'));
    document.getElementById('add-dissertativa').addEventListener('click', () => adicionarQuestao('dissertativa'));
    document.getElementById('add-vf').addEventListener('click', () => adicionarQuestao('verdadeiro_falso'));
    addDoBancoBtn.addEventListener('click', abrirModalBanco);
    fecharModalBtn.addEventListener('click', fecharModalBanco);
    adicionarSelecionadasBtn.addEventListener('click', adicionarQuestoesDoBanco);
    bancoModal.addEventListener('click', (event) => {
        if (event.target === bancoModal) fecharModalBanco();
    });

    provaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const provaData = {
            titulo: document.getElementById('prova-titulo').value,
            cabecalho: document.getElementById('prova-cabecalho').value,
            questoes: questoes
        };
        const method = editProvaId ? 'PUT' : 'POST';
        const url = editProvaId ? `/api/provas/${editProvaId}` : '/api/provas';
        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(provaData) })
            .then(res => { if (res.ok) window.location.href = '/dashboard'; else alert('Erro ao salvar prova.'); });
    });

    // Listeners dinâmicos (para elementos que são criados/destruídos)
    questoesContainer.addEventListener('input', (e) => {
        const index = e.target.dataset.index;
        if (index === undefined) return;
        if (e.target.classList.contains('enunciado-input')) questoes[index].enunciado = e.target.value;
        else if (e.target.classList.contains('alternativa-input')) questoes[index].alternativas[e.target.dataset.altIndex] = e.target.value;
        else if (e.target.classList.contains('resposta-input')) questoes[index].resposta = e.target.value;
    });

    questoesContainer.addEventListener('click', (e) => {
        const index = e.target.dataset.index;
        if (index === undefined) return;
        if (e.target.classList.contains('remover-questao-btn')) {
            questoes.splice(index, 1);
            renderizarQuestoes();
        } else if (e.target.classList.contains('salvar-banco-btn')) {
            salvarQuestaoNoBanco(index);
        }
    });

    // --- LÓGICA DE INICIALIZAÇÃO (Carregar dados para edição) ---
    const params = new URLSearchParams(window.location.search);
    editProvaId = params.get('id');
    if (editProvaId) {
        document.getElementById('editor-title').textContent = 'Editar Prova';
        fetch(`/api/provas/${editProvaId}`)
            .then(response => response.json())
            .then(data => {
                document.getElementById('prova-titulo').value = data.titulo;
                document.getElementById('prova-cabecalho').value = data.cabecalho;
                questoes = data.questoes || [];
                renderizarQuestoes();
            });
    }
}

// Garante que o script só rode depois que a página inteira carregar.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEditor);
} else {
    inicializarEditor();
}

