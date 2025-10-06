document.addEventListener('DOMContentLoaded', () => {
    const correcaoContainer = document.getElementById('correcao-container');
    const tituloProvaEl = document.getElementById('titulo-prova');
    const nomeAlunoForm = document.getElementById('nome-aluno-form');
    const nomeAlunoInput = document.getElementById('nome-aluno-input');
    const questaoDisplay = document.getElementById('questao-display');

    const urlParams = new URLSearchParams(window.location.search);
    const provaId = urlParams.get('prova_id');

    let provaData = null;
    let respostasAluno = [];
    let questaoAtualIndex = 0;

    if (!provaId) {
        correcaoContainer.innerHTML = '<h2>Erro: ID da prova não fornecido.</h2>';
        return;
    }

    // --- LÓGICA PRINCIPAL ---

    function iniciarCorrecao() {
        nomeAlunoForm.classList.add('hidden');
        questaoDisplay.classList.remove('hidden');
        renderizarQuestao();
    }

    function renderizarQuestao() {
        // **INÍCIO DA CORREÇÃO**
        // Verifica se a prova tem questões antes de continuar
        if (!provaData || !Array.isArray(provaData.questoes) || provaData.questoes.length === 0) {
            finalizarCorrecao(true); // Finaliza informando que não há questões
            return;
        }
        // **FIM DA CORREÇÃO**

        if (questaoAtualIndex >= provaData.questoes.length) {
            finalizarCorrecao();
            return;
        }

        const questao = provaData.questoes[questaoAtualIndex];
        let alternativasHtml = '';

        if (questao.tipo === 'multipla_escolha') {
            const letras = ['a', 'b', 'c', 'd', 'e'];
            alternativasHtml = questao.alternativas.map((alt, i) =>
                `<button class="button button-secondary resposta-btn" data-resposta="${letras[i]}">${letras[i].toUpperCase()}) ${escapeHTML(alt)}</button>`
            ).join('');
        } else if (questao.tipo === 'verdadeiro_falso') {
            alternativasHtml = `
                <button class="button button-secondary resposta-btn" data-resposta="verdadeiro">Verdadeiro</button>
                <button class="button button-secondary resposta-btn" data-resposta="falso">Falso</button>
            `;
        } else if (questao.tipo === 'dissertativa') {
            alternativasHtml = `<p class="dissertativa-aviso">Questão dissertativa, correção manual. Clique para pular.</p>
                                <button class="button button-secondary resposta-btn" data-resposta="">Pular Questão</button>`;
        }

        questaoDisplay.innerHTML = `
            <div class="questao-card-correcao">
                <h4>Questão ${questaoAtualIndex + 1} de ${provaData.questoes.length}</h4>
                <p>${escapeHTML(questao.enunciado)}</p>
                <div class="alternativas-correcao">
                    ${alternativasHtml}
                </div>
            </div>
        `;
    }

    function finalizarCorrecao(semQuestoes = false) {
        if (semQuestoes) {
            questaoDisplay.innerHTML = `
                <div class="questao-card-correcao">
                    <h3>Prova Finalizada</h3>
                    <p>Esta prova não contém questões para corrigir.</p>
                    <a href="/dashboard" class="button button-primary">Voltar ao Dashboard</a>
                </div>`;
            return;
        }

        const nomeAluno = nomeAlunoInput.value;
        fetch(`/api/provas/${provaId}/corrigir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome_aluno: nomeAluno, respostas: respostasAluno })
        })
        .then(res => res.json())
        .then(resultado => {
            questaoDisplay.innerHTML = `
                <div class="questao-card-correcao">
                    <h3>Correção Finalizada!</h3>
                    <p><strong>Aluno:</strong> ${escapeHTML(resultado.nome_aluno)}</p>
                    <p><strong>Nota:</strong> ${resultado.acertos} de ${resultado.total_questoes} questões corretas.</p>
                    <div class="button-group">
                        <a href="/dashboard" class="button button-primary">Voltar ao Dashboard</a>
                        <button id="corrigir-outra-btn" class="button button-secondary">Corrigir Outra Prova</button>
                    </div>
                </div>
            `;
        });
    }

    // --- EVENT LISTENERS ---

    nomeAlunoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (nomeAlunoInput.value.trim()) {
            iniciarCorrecao();
        } else {
            alert('Por favor, insira o nome do aluno.');
        }
    });

    questaoDisplay.addEventListener('click', (e) => {
        if (e.target.classList.contains('resposta-btn')) {
            respostasAluno.push(e.target.dataset.resposta);
            questaoAtualIndex++;
            renderizarQuestao();
        }
        if (e.target.id === 'corrigir-outra-btn') {
            // Reinicia o processo
            respostasAluno = [];
            questaoAtualIndex = 0;
            nomeAlunoInput.value = '';
            nomeAlunoForm.classList.remove('hidden');
            questaoDisplay.classList.add('hidden');
        }
    });

    // --- INICIALIZAÇÃO ---

    fetch(`/api/provas/${provaId}`)
        .then(response => {
            if (!response.ok) throw new Error('Prova não encontrada.');
            return response.json();
        })
        .then(data => {
            // **INÍCIO DA CORREÇÃO**
            if (!data || !Array.isArray(data.questoes)) {
                throw new Error('Os dados recebidos da prova são inválidos.');
            }
            // **FIM DA CORREÇÃO**
            provaData = data;
            tituloProvaEl.textContent = `Corrigindo: ${escapeHTML(provaData.titulo)}`;
        })
        .catch(error => {
            correcaoContainer.innerHTML = `<h2>Erro ao carregar prova</h2><p>${error.message}</p><a href="/dashboard">Voltar</a>`;
        });

    function escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
});

