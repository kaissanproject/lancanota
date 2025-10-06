document.addEventListener('DOMContentLoaded', () => {
    // --- Seleção dos Elementos do DOM ---
    const questoesContainer = document.getElementById('questoes-container');
    const provaForm = document.getElementById('prova-form');
    const addDoBancoBtn = document.getElementById('add-do-banco');
    const bancoModal = document.getElementById('banco-modal');
    const fecharModalBtn = document.getElementById('fechar-modal-btn');
    const bancoQuestoesLista = document.getElementById('banco-questoes-lista');
    const adicionarSelecionadasBtn = document.getElementById('adicionar-selecionadas-btn');

    // Se algum elemento essencial do modal não for encontrado, interrompe para evitar mais erros.
    if (!bancoModal || !fecharModalBtn || !addDoBancoBtn) {
        console.error("ERRO: Um ou mais elementos do modal não foram encontrados. Verifique os IDs no arquivo editor.html.");
        return;
    }

    let questoes = [];
    let editProvaId = null;

    // --- LÓGICA DO BANCO DE QUESTÕES ---
    function abrirModalBanco() {
        bancoQuestoesLista.innerHTML = '<p>Carregando questões...</p>';
        bancoModal.classList.remove('hidden');
        fetch('/api/questoes')
            .then(res => {
                if (!res.ok) throw new Error('Falha ao buscar questões.');
                return res.json();
            })
            .then(questoesDoBanco => {
                bancoQuestoesLista.innerHTML = '';
                if (questoesDoBanco.length === 0) {
                    bancoQuestoesLista.innerHTML = '<p>Seu banco de questões está vazio. Salve questões a partir do editor para vê-las aqui.</p>';
                } else {
                    questoesDoBanco.forEach(q => {
                        const questaoEl = document.createElement('div');
                        questaoEl.className = 'banco-questao-item';
                        // Usamos textContent para segurança ao inserir dados do usuário
                        const label = document.createElement('label');
                        label.htmlFor = `q-${q.id_questao}`;
                        label.textContent = `${q.enunciado.substring(0, 100)}...`;
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `q-${q.id_questao}`;
                        checkbox.dataset.questaoJson = JSON.stringify(q);

                        questaoEl.appendChild(checkbox);
                        questaoEl.appendChild(label);
                        bancoQuestoesLista.appendChild(questaoEl);
                    });
                }
            }).catch(err => {
                bancoQuestoesLista.innerHTML = `<p style="color: red;">${err.message}</p>`;
            });
    }

    function fecharModalBanco() {
        bancoModal.classList.add('hidden');
    }

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
                    <button type="button" class="button button-danger remover-questao-btn" data-index="${index}">Remover</button>
                    <button type="button" class="button button-secondary salvar-banco-btn" data-index="${index}">Salvar no Banco</button>
                </div>
            `;
            questoesContainer.appendChild(questaoCard);
        });
    }

    // --- EVENT LISTENERS DINÂMICOS (para botões dentro das questões) ---
    questoesContainer.addEventListener('input', (e) => {
        const index = e.target.dataset.index;
        if (index === undefined) return;

        if (e.target.classList.contains('enunciado-input')) {
            questoes[index].enunciado = e.target.value;
        } else if (e.target.classList.contains('alternativa-input')) {
            const altIndex = e.target.dataset.altIndex;
            questoes[index].alternativas[altIndex] = e.target.value;
        } else if (e.target.classList.contains('resposta-input')) {
            questoes[index].resposta = e.target.value;
        }
    });

    questoesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remover-questao-btn')) {
            const index = e.target.dataset.index;
            questoes.splice(index, 1);
            renderizarQuestoes();
        } else if (e.target.classList.contains('salvar-banco-btn')) {
            const index = e.target.dataset.index;
            salvarQuestaoNoBanco(index);
        }
    });

    function salvarQuestaoNoBanco(index) {
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
    }
    
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

        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(provaData) })
            .then(response => {
                if (response.ok) { window.location.href = '/dashboard'; } 
                else { alert('Erro ao salvar a prova.'); }
            });
    });

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }

    // --- INICIALIZAÇÃO E EVENT LISTENERS ESTÁTICOS ---
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

    document.getElementById('add-multipla-escolha').addEventListener('click', () => adicionarQuestao('multipla_escolha'));
    document.getElementById('add-dissertativa').addEventListener('click', () => adicionarQuestao('dissertativa'));
    document.getElementById('add-vf').addEventListener('click', () => adicionarQuestao('verdadeiro_falso'));
    
    addDoBancoBtn.addEventListener('click', abrirModalBanco);
    fecharModalBtn.addEventListener('click', fecharModalBanco);
    adicionarSelecionadasBtn.addEventListener('click', adicionarQuestoesDoBanco);
    bancoModal.addEventListener('click', (event) => {
        if (event.target === bancoModal) { fecharModalBanco(); }
    });

    console.log("Editor script v2 loaded and listeners attached.");
});

