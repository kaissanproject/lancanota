document.addEventListener('DOMContentLoaded', () => {
    // --- Seleção dos Elementos do DOM ---
    const questoesContainer = document.getElementById('questoes-container');
    const provaForm = document.getElementById('prova-form');
    const addDoBancoBtn = document.getElementById('add-do-banco');
    const bancoModal = document.getElementById('banco-modal');
    const fecharModalBtn = document.getElementById('fechar-modal-btn');
    const bancoQuestoesLista = document.getElementById('banco-questoes-lista');
    const adicionarSelecionadasBtn = document.getElementById('adicionar-selecionadas-btn');

    let questoes = [];
    let editProvaId = null;

    // --- LÓGICA DE CARREGAR PROVA PARA EDIÇÃO ---
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
    
    // --- LÓGICA DE ADICIONAR QUESTÕES MANUALMENTE ---
    document.getElementById('add-multipla-escolha').addEventListener('click', () => adicionarQuestao('multipla_escolha'));
    document.getElementById('add-dissertativa').addEventListener('click', () => adicionarQuestao('dissertativa'));
    document.getElementById('add-vf').addEventListener('click', () => adicionarQuestao('verdadeiro_falso'));
    
    // --- LÓGICA DO BANCO DE QUESTÕES (CORRIGIDA E MELHORADA) ---
    
    // Função para abrir o modal
    function abrirModalBanco() {
        bancoQuestoesLista.innerHTML = '<p>Carregando questões...</p>';
        bancoModal.classList.remove('hidden');
        fetch('/api/questoes')
            .then(res => res.json())
            .then(questoesDoBanco => {
                bancoQuestoesLista.innerHTML = '';
                if (questoesDoBanco.length === 0) {
                    bancoQuestoesLista.innerHTML = '<p>Seu banco de questões está vazio. Salve questões a partir do editor para vê-las aqui.</p>';
                    return;
                }
                questoesDoBanco.forEach(q => {
                    const questaoEl = document.createElement('div');
                    questaoEl.className = 'banco-questao-item';
                    questaoEl.innerHTML = `
                        <input type="checkbox" id="q-${q.id_questao}" data-questao-json='${JSON.stringify(q)}'>
                        <label for="q-${q.id_questao}">${escapeHTML(q.enunciado.substring(0, 100))}...</label>
                    `;
                    bancoQuestoesLista.appendChild(questaoEl);
                });
            });
    }

    // Função para fechar o modal
    function fecharModalBanco() {
        bancoModal.classList.add('hidden');
    }
    
    // Adiciona os "ouvintes" de eventos para os botões do modal
    addDoBancoBtn.addEventListener('click', abrirModalBanco);
    fecharModalBtn.addEventListener('click', fecharModalBanco);
    adicionarSelecionadasBtn.addEventListener('click', adicionarQuestoesDoBanco);
    
    // NOVO: Adiciona a funcionalidade de fechar o modal ao clicar fora dele
    bancoModal.addEventListener('click', (event) => {
        if (event.target === bancoModal) { // Verifica se o clique foi no fundo escuro
            fecharModalBanco();
        }
    });

    function adicionarQuestoesDoBanco() {
        const checkboxes = bancoQuestoesLista.querySelectorAll('input[type="checkbox"]:checked');
        checkboxes.forEach(cb => {
            const questaoData = JSON.parse(cb.dataset.questaoJson);
            delete questaoData.id_questao;
            delete questaoData.user_email;
            questoes.push(questaoData);
        });
        renderizarQuestoes();
        fecharModalBanco();
    }
    
    // --- FUNÇÕES DE RENDERIZAÇÃO E MANIPULAÇÃO DE QUESTÕES ---
    function adicionarQuestao(tipo) {
        const novaQuestao = { tipo, enunciado: '', alternativas: [], resposta: '' };
        if (tipo === 'multipla_escolha') {
            novaQuestao.alternativas = ['', '', '', '', ''];
        }
        questoes.push(novaQuestao);
        renderizarQuestoes();
    }

    function renderizarQuestoes() {
        questoesContainer.innerHTML = '';
        questoes.forEach((questao, index) => {
            const questaoCard = document.createElement('div');
            questaoCard.className = 'questao-card';
            
            let alternativasHtml = '';
            if (questao.tipo === 'multipla_escolha') {
                const letras = ['a', 'b', 'c', 'd', 'e'];
                alternativasHtml = '<div class="alternativas-group">' + questao.alternativas.map((alt, i) => `
                    <div class="form-group">
                        <label>Alternativa ${letras[i].toUpperCase()}</label>
                        <input type="text" class="form-control alternativa-input" data-index="${index}" data-alt-index="${i}" value="${escapeHTML(alt)}">
                    </div>
                `).join('') + `
                    <div class="form-group">
                        <label>Resposta Correta (a, b, c, etc.)</label>
                        <input type="text" class="form-control resposta-input" data-index="${index}" value="${escapeHTML(questao.resposta)}">
                    </div>
                </div>`;
            } else if (questao.tipo === 'verdadeiro_falso') {
                 alternativasHtml = `
                    <div class="form-group">
                        <label>Resposta Correta</label>
                        <select class="form-control resposta-input" data-index="${index}">
                            <option value=""></option>
                            <option value="verdadeiro" ${questao.resposta === 'verdadeiro' ? 'selected' : ''}>Verdadeiro</option>
                            <option value="falso" ${questao.resposta === 'falso' ? 'selected' : ''}>Falso</option>
                        </select>
                    </div>`;
            } else if (questao.tipo === 'dissertativa') {
                alternativasHtml = `
                    <div class="form-group">
                         <label>Resposta Esperada (para gabarito)</label>
                         <textarea class="form-control resposta-input" data-index="${index}" rows="3">${escapeHTML(questao.resposta)}</textarea>
                    </div>`;
            }

            questaoCard.innerHTML = `
                <h4>Questão ${index + 1} (${questao.tipo.replace(/_/g, ' ')})</h4>
                <div class="form-group">
                    <label>Enunciado</label>
                    <textarea class="form-control enunciado-input" data-index="${index}" rows="3" required>${escapeHTML(questao.enunciado)}</textarea>
                </div>
                ${alternativasHtml}
                <div class="button-group">
                    <button type="button" class="button button-danger" onclick="removerQuestao(${index})">Remover</button>
                    <button type="button" class="button button-secondary" onclick="salvarQuestaoNoBanco(${index})">Salvar no Banco</button>
                </div>
            `;
            questoesContainer.appendChild(questaoCard);
        });
        
        document.querySelectorAll('.enunciado-input').forEach(el => el.addEventListener('input', e => {
            questoes[e.target.dataset.index].enunciado = e.target.value;
        }));
        document.querySelectorAll('.alternativa-input').forEach(el => el.addEventListener('input', e => {
            questoes[e.target.dataset.index].alternativas[e.target.dataset.altIndex] = e.target.value;
        }));
        document.querySelectorAll('.resposta-input').forEach(el => el.addEventListener('input', e => {
            questoes[e.target.dataset.index].resposta = e.target.value;
        }));
    }

    window.removerQuestao = (index) => {
        questoes.splice(index, 1);
        renderizarQuestoes();
    };

    window.salvarQuestaoNoBanco = (index) => {
        const questao = questoes[index];
        if (!questao.enunciado || !questao.resposta) {
            alert('Preencha o enunciado e a resposta antes de salvar no banco.');
            return;
        }
        fetch('/api/questoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questao)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Questão salva no seu banco com sucesso!');
            } else { throw new Error(data.error || 'Erro desconhecido'); }
        })
        .catch(err => {
            alert('Erro ao salvar a questão: ' + err.message);
        });
    };
    
    // --- LÓGICA DE SALVAR A PROVA ---
    provaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const provaData = {
            titulo: document.getElementById('prova-titulo').value,
            cabecalho: document.getElementById('prova-cabecalho').value,
            questoes: questoes
        };

        const method = editProvaId ? 'PUT' : 'POST';
        const url = editProvaId ? `/api/provas/${editProvaId}` : '/api/provas';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(provaData)
        })
        .then(response => {
            if (response.ok) {
                window.location.href = '/dashboard';
            } else { alert('Erro ao salvar a prova.'); }
        });
    });

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
});

