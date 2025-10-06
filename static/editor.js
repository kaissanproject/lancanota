document.addEventListener('DOMContentLoaded', () => {
    const provaForm = document.getElementById('prova-form');
    const questoesContainer = document.getElementById('questoes-container');
    const editorTitle = document.getElementById('editor-title');
    const salvarProvaBtn = document.getElementById('salvar-prova-btn');

    let questoes = [];
    let provaId = null;

    // --- Lógica para Adicionar Questões ---

    document.getElementById('add-multipla-escolha').addEventListener('click', () => {
        addQuestao('multipla_escolha');
    });

    document.getElementById('add-dissertativa').addEventListener('click', () => {
        addQuestao('dissertativa');
    });

    document.getElementById('add-vf').addEventListener('click', () => {
        addQuestao('verdadeiro_falso');
    });

    // --- Carregar Dados da Prova (se estiver editando) ---

    const params = new URLSearchParams(window.location.search);
    provaId = params.get('id');

    if (provaId) {
        editorTitle.textContent = 'Editar Prova';
        fetch(`/api/provas/${provaId}`)
            .then(response => response.ok ? response.json() : Promise.reject('Prova não encontrada.'))
            .then(data => {
                document.getElementById('prova-titulo').value = data.titulo;
                document.getElementById('prova-cabecalho').value = data.cabecalho;
                questoes = data.questoes || [];
                renderizarQuestoes();
            })
            .catch(error => {
                console.error("Erro ao carregar prova:", error);
                alert("Não foi possível carregar os dados da prova para edição.");
                window.location.href = '/dashboard';
            });
    }

    // --- Submissão do Formulário ---

    provaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        salvarProva();
    });

    // --- Funções Principais ---

    function addQuestao(tipo) {
        const novaQuestao = {
            id: `q_${new Date().getTime()}`,
            tipo: tipo,
            enunciado: '',
            alternativas: tipo === 'multipla_escolha' ? ['', '', '', ''] : [],
            resposta: ''
        };
        questoes.push(novaQuestao);
        renderizarQuestoes();
    }

    function renderizarQuestoes() {
        questoesContainer.innerHTML = '';
        questoes.forEach((q, index) => {
            const questaoCard = document.createElement('div');
            questaoCard.className = 'questao-card';
            questaoCard.dataset.id = q.id;

            let camposEspecificos = '';
            if (q.tipo === 'multipla_escolha') {
                camposEspecificos = `
                    <div class="alternativas-group">
                        ${q.alternativas.map((alt, i) => `
                            <div class="form-group">
                                <label>Alternativa ${String.fromCharCode(97 + i)}</label>
                                <input type="text" class="form-control alternativa-input" value="${escapeHTML(alt)}" data-index="${i}">
                            </div>
                        `).join('')}
                    </div>
                    <div class="form-group">
                        <label>Resposta Correta (a, b, c, etc.)</label>
                        <input type="text" class="form-control resposta-input" value="${escapeHTML(q.resposta)}">
                    </div>
                `;
            } else if (q.tipo === 'verdadeiro_falso') {
                camposEspecificos = `
                    <div class="form-group">
                        <label>Resposta Correta</label>
                        <select class="form-control resposta-input">
                            <option value="Verdadeiro" ${q.resposta === 'Verdadeiro' ? 'selected' : ''}>Verdadeiro</option>
                            <option value="Falso" ${q.resposta === 'Falso' ? 'selected' : ''}>Falso</option>
                        </select>
                    </div>
                `;
            } else if (q.tipo === 'dissertativa') {
                // Não precisa de campos específicos, mas podemos adicionar um placeholder para a resposta no gabarito
                 camposEspecificos = `
                    <div class="form-group">
                        <label>Resposta Esperada (para o gabarito)</label>
                        <textarea class="form-control resposta-input" rows="2">${escapeHTML(q.resposta)}</textarea>
                    </div>
                `;
            }

            questaoCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>Questão ${index + 1} (${formatarTipo(q.tipo)})</strong>
                    <button type="button" class="button button-danger" onclick="removerQuestao('${q.id}')">Remover</button>
                </div>
                <div class="form-group" style="margin-top: 1rem;">
                    <label>Enunciado</label>
                    <textarea class="form-control enunciado-input" rows="3">${escapeHTML(q.enunciado)}</textarea>
                </div>
                ${camposEspecificos}
            `;
            questoesContainer.appendChild(questaoCard);
        });

        // Adiciona os event listeners aos inputs recém-criados
        document.querySelectorAll('.questao-card').forEach(card => {
            const id = card.dataset.id;
            card.querySelector('.enunciado-input').addEventListener('change', (e) => updateQuestaoField(id, 'enunciado', e.target.value));
            
            const respostaInput = card.querySelector('.resposta-input');
            if(respostaInput) respostaInput.addEventListener('change', (e) => updateQuestaoField(id, 'resposta', e.target.value));

            card.querySelectorAll('.alternativa-input').forEach(altInput => {
                altInput.addEventListener('change', (e) => {
                    const qIndex = questoes.findIndex(q => q.id === id);
                    if (qIndex > -1) {
                        questoes[qIndex].alternativas[parseInt(e.target.dataset.index)] = e.target.value;
                    }
                });
            });
        });
    }

    window.removerQuestao = (id) => {
        questoes = questoes.filter(q => q.id !== id);
        renderizarQuestoes();
    }

    function updateQuestaoField(id, field, value) {
        const index = questoes.findIndex(q => q.id === id);
        if (index > -1) {
            questoes[index][field] = value;
        }
    }

    function salvarProva() {
        const titulo = document.getElementById('prova-titulo').value;
        const cabecalho = document.getElementById('prova-cabecalho').value;

        if (!titulo) {
            alert('Por favor, preencha o título da prova.');
            return;
        }

        const provaData = {
            titulo,
            cabecalho,
            questoes
        };

        const method = provaId ? 'PUT' : 'POST';
        const url = provaId ? `/api/provas/${provaId}` : '/api/provas';

        salvarProvaBtn.textContent = 'Salvando...';
        salvarProvaBtn.disabled = true;

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(provaData)
        })
        .then(response => {
            if (response.ok) {
                window.location.href = '/dashboard';
            } else {
                return response.json().then(err => Promise.reject(err));
            }
        })
        .catch(error => {
            console.error('Erro ao salvar prova:', error);
            alert(`Não foi possível salvar a prova. Erro: ${error.error || 'Erro desconhecido'}`);
        })
        .finally(() => {
            salvarProvaBtn.textContent = 'Salvar Prova';
            salvarProvaBtn.disabled = false;
        });
    }

    // --- Funções Utilitárias ---
    function formatarTipo(tipo) {
        if (tipo === 'multipla_escolha') return 'Múltipla Escolha';
        if (tipo === 'dissertativa') return 'Dissertativa';
        if (tipo === 'verdadeiro_falso') return 'Verdadeiro ou Falso';
        return tipo;
    }

    function escapeHTML(str) {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
});
