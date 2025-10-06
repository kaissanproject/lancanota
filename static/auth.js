// --- LÓGICA DE AUTENTICAÇÃO COM GOOGLE SHEETS VIA BACKEND ---

// Adiciona listener para o botão de logout
if (document.getElementById('logout-button')) {
    document.getElementById('logout-button').addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    });
}

// --- LÓGICA DA PÁGINA DE LOGIN/CADASTRO (index.html) ---
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorElement = document.getElementById('login-error');
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            window.location.href = '/dashboard';
        } else {
            const result = await response.json();
            errorElement.textContent = result.error;
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorElement = document.getElementById('register-error');

        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (response.ok) {
            window.location.href = '/dashboard';
        } else {
            const result = await response.json();
            errorElement.textContent = result.error;
        }
    });
}

// --- LÓGICA DA PÁGINA DASHBOARD ---
if (window.location.pathname === '/dashboard') {
    window.addEventListener('load', () => {
        fetch('/api/provas')
            .then(res => {
                if (!res.ok) window.location.href = '/'; // Redireciona se não estiver logado
                return res.json();
            })
            .then(provas => {
                const listElement = document.getElementById('provas-list');
                listElement.innerHTML = '';
                if (provas.length === 0) {
                    listElement.innerHTML = '<p>Você ainda não criou nenhuma prova.</p>';
                    return;
                }

                provas.forEach(prova => {
                    const card = document.createElement('div');
                    card.className = 'prova-card';
                    card.innerHTML = `
                        <h3>${prova.titulo}</h3>
                        <div class="prova-card-actions">
                            <a href="/editor?id=${prova.id}" class="btn">Editar</a>
                            <button class="btn" onclick="gerarPDF('${prova.id}', 'prova')">Gerar PDF</button>
                            <button class="btn" onclick="gerarPDF('${prova.id}', 'gabarito')">Gabarito</button>
                            <button class="btn btn-danger" onclick="deletarProva('${prova.id}')">Excluir</button>
                        </div>
                    `;
                    listElement.appendChild(card);
                });
            });
    });

    async function deletarProva(id) {
        if (!confirm('Tem certeza que deseja excluir esta prova?')) return;
        
        fetch(`/api/provas/${id}`, { method: 'DELETE' })
            .then(() => window.location.reload());
    }
    
    async function gerarPDF(id, tipo) {
        const url = tipo === 'gabarito' ? `/api/provas/${id}/gabarito` : `/api/provas/${id}/pdf`;
        
        const response = await fetch(url);

        if (response.ok) {
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${tipo}_${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } else {
            alert('Não foi possível gerar o PDF.');
        }
    }
}

// --- LÓGICA DA PÁGINA EDITOR ---
if (window.location.pathname === '/editor') {
    const questoesContainer = document.getElementById('questoes-container');
    const form = document.getElementById('editor-form');
    const urlParams = new URLSearchParams(window.location.search);
    const provaId = urlParams.get('id');

    window.addEventListener('load', async () => {
        if (provaId) {
            const response = await fetch(`/api/provas/${provaId}`);
            if (!response.ok) {
                alert('Prova não encontrada ou você não tem permissão.');
                window.location.href = '/dashboard';
                return;
            }
            const prova = await response.json();
            
            document.getElementById('prova-titulo').value = prova.titulo;
            document.getElementById('prova-cabecalho').value = prova.cabecalho;
            prova.questoes.forEach(q => {
                adicionarQuestao(q.tipo, q);
            });
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const provaData = {
            titulo: document.getElementById('prova-titulo').value,
            cabecalho: document.getElementById('prova-cabecalho').value,
            questoes: []
        };

        document.querySelectorAll('.questao-card').forEach(card => {
            const questao = {
                tipo: card.dataset.tipo,
                enunciado: card.querySelector('.enunciado').value
            };

            if (questao.tipo === 'multipla_escolha') {
                questao.alternativas = Array.from(card.querySelectorAll('.alternativa-input')).map(alt => alt.value);
                questao.resposta = card.querySelector('input[name^="correta-"]:checked').value;
            } else if (questao.tipo === 'verdadeiro_falso') {
                questao.resposta = card.querySelector('input[name^="correta-"]:checked').value;
            }

            provaData.questoes.push(questao);
        });
        
        const method = provaId ? 'PUT' : 'POST';
        const url = provaId ? `/api/provas/${provaId}` : '/api/provas';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(provaData)
        });

        const result = await response.json();
        const statusEl = document.getElementById('save-status');
        if (response.ok) {
            statusEl.textContent = 'Prova salva com sucesso!';
            setTimeout(() => statusEl.textContent = '', 3000);
            if (!provaId) {
                 window.location.href = `/editor?id=${result.id}`;
            }
        } else {
             statusEl.textContent = 'Erro ao salvar.';
        }
    });
}

function adicionarQuestao(tipo, data = {}) {
    const questoesContainer = document.getElementById('questoes-container');
    const questaoCounter = document.querySelectorAll('.questao-card').length;
    const id = `q-${questaoCounter}`;
    const card = document.createElement('div');
    card.className = 'questao-card';
    card.id = id;
    card.dataset.tipo = tipo;

    let content = `
        <div class="questao-card-header">
            <span>Questão ${questaoCounter + 1} - ${tipo.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            <button type="button" class="btn btn-danger" onclick="this.parentElement.parentElement.remove()">Remover</button>
        </div>
        <div class="form-group">
            <textarea class="enunciado" placeholder="Digite o enunciado da questão..." required>${data.enunciado || ''}</textarea>
        </div>
    `;

    if (tipo === 'multipla_escolha') {
        const alternativas = data.alternativas || ['', '', '', ''];
        const resposta = data.resposta || 'a';
        content += alternativas.map((alt, i) => {
            const letra = String.fromCharCode(97 + i);
            return `
            <div class="alternativa-group">
                <input type="radio" name="correta-${id}" value="${letra}" ${resposta === letra ? 'checked' : ''} required>
                <label>${letra})</label>
                <input type="text" class="alternativa-input" value="${alt}" placeholder="Alternativa ${letra.toUpperCase()}" required>
            </div>`;
        }).join('');
    } else if (tipo === 'verdadeiro_falso') {
        const resposta = data.resposta || 'Verdadeiro';
        content += `
            <div>
                <label><input type="radio" name="correta-${id}" value="Verdadeiro" ${resposta === 'Verdadeiro' ? 'checked' : ''} required> Verdadeiro</label>
                <label><input type="radio" name="correta-${id}" value="Falso" ${resposta === 'Falso' ? 'checked' : ''}> Falso</label>
            </div>
        `;
    }
    
    card.innerHTML = content;
    questoesContainer.appendChild(card);
}

