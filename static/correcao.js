document.addEventListener('DOMContentLoaded', () => {
    const provaTituloEl = document.getElementById('prova-titulo');
    const setupCorrecaoEl = document.getElementById('setup-correcao');
    const nomeAlunoInput = document.getElementById('nome-aluno');
    const iniciarCorrecaoBtn = document.getElementById('iniciar-correcao-btn');
    const interfaceQuestaoEl = document.getElementById('interface-questao');
    const resultadoCorrecaoEl = document.getElementById('resultado-correcao');
    const resultadoTextoEl = document.getElementById('resultado-texto');
    const corrigirOutraBtn = document.getElementById('corrigir-outra-btn');

    let provaData = null;
    let respostasAluno = {};
    let questaoAtualIndex = 0;
    
    const params = new URLSearchParams(window.location.search);
    const provaId = params.get('id');

    if (!provaId) {
        alert('ID da prova não encontrado.');
        window.location.href = '/dashboard';
        return;
    }

    // Carrega os dados da prova
    fetch(`/api/provas/${provaId}`)
        .then(response => response.ok ? response.json() : Promise.reject('Prova não encontrada'))
        .then(data => {
            provaData = data;
            provaTituloEl.textContent = `Corrigindo: ${provaData.titulo}`;
        })
        .catch(error => {
            console.error('Erro ao carregar prova:', error);
            alert('Não foi possível carregar a prova para correção.');
        });

    iniciarCorrecaoBtn.addEventListener('click', () => {
        if (!nomeAlunoInput.value.trim()) {
            alert('Por favor, digite o nome do aluno.');
            return;
        }
        setupCorrecaoEl.classList.add('hidden');
        interfaceQuestaoEl.classList.remove('hidden');
        renderizarQuestao();
    });

    corrigirOutraBtn.addEventListener('click', () => {
        questaoAtualIndex = 0;
        respostasAluno = {};
        nomeAlunoInput.value = '';
        resultadoCorrecaoEl.classList.add('hidden');
        setupCorrecaoEl.classList.remove('hidden');
    });

    function renderizarQuestao() {
        if (questaoAtualIndex >= provaData.questoes.length) {
            finalizarCorrecao();
            return;
        }

        const questao = provaData.questoes[questaoAtualIndex];
        let inputHtml = '';

        if (questao.tipo === 'multipla_escolha') {
            const letras = ['a', 'b', 'c', 'd', 'e'];
            inputHtml = `<div class="alternativas-correcao">` +
                questao.alternativas.map((alt, i) => 
                    `<button class="button button-secondary" data-resposta="${letras[i]}">${letras[i].toUpperCase()}</button>`
                ).join('') + `</div>`;
        } else if (questao.tipo === 'verdadeiro_falso') {
            inputHtml = `<div class="alternativas-correcao">
                <button class="button button-secondary" data-resposta="verdadeiro">Verdadeiro</button>
                <button class="button button-secondary" data-resposta="falso">Falso</button>
            </div>`;
        } else if (questao.tipo === 'dissertativa') {
            inputHtml = `<p class="dissertativa-aviso">Correção de questões dissertativas não é automática. Clique em 'Próxima' para pular.</p>`;
        }

        interfaceQuestaoEl.innerHTML = `
            <div class="questao-card-correcao">
                <h4>Questão ${questaoAtualIndex + 1}</h4>
                <p>${escapeHTML(questao.enunciado)}</p>
                ${inputHtml}
                <button id="proxima-btn" class="button button-primary">Próxima Questão</button>
            </div>
        `;

        // Adiciona eventos aos botões de resposta
        interfaceQuestaoEl.querySelectorAll('[data-resposta]').forEach(btn => {
            btn.addEventListener('click', () => {
                respostasAluno[questaoAtualIndex] = btn.dataset.resposta;
                renderizarProximaQuestao();
            });
        });
        
        document.getElementById('proxima-btn').addEventListener('click', renderizarProximaQuestao);
    }

    function renderizarProximaQuestao() {
        questaoAtualIndex++;
        renderizarQuestao();
    }

    function finalizarCorrecao() {
        interfaceQuestaoEl.classList.add('hidden');
        resultadoCorrecaoEl.classList.remove('hidden');
        resultadoTextoEl.textContent = 'Calculando nota...';

        const dadosCorrecao = {
            nome_aluno: nomeAlunoInput.value,
            respostas: respostasAluno
        };

        fetch(`/api/provas/${provaId}/corrigir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosCorrecao)
        })
        .then(response => response.json())
        .then(resultado => {
            if(resultado.success) {
                 resultadoTextoEl.innerHTML = `
                    <strong>Aluno(a):</strong> ${escapeHTML(resultado.nome_aluno)}<br>
                    <strong>Acertos:</strong> ${resultado.acertos} de ${resultado.total_questoes} questões objetivas.<br>
                    <strong>Resultado salvo com sucesso!</strong>
                 `;
            } else {
                throw new Error(resultado.error || 'Erro desconhecido');
            }
        })
        .catch(error => {
            console.error('Erro ao finalizar correção:', error);
            resultadoTextoEl.textContent = 'Ocorreu um erro ao salvar o resultado.';
        });
    }

    function escapeHTML(str) {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
});
