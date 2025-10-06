import os
import json
import uuid
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
import gspread
from google.oauth2.service_account import Credentials
import io

# --- Configuração Inicial ---
app = Flask(__name__)
app.secret_key = os.urandom(24)

# --- Configuração do Google Sheets (VERSÃO FINAL E MAIS ESTÁVEL) ---
def get_sheets():
    """Conecta-se à API do Google Sheets e retorna as planilhas."""
    try:
        scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
        creds_json_str = os.getenv('GOOGLE_CREDENTIALS_JSON')
        if not creds_json_str:
            if os.path.exists("google_credentials.json"):
                with open("google_credentials.json", "r") as f:
                    creds_json_str = f.read()
            else:
                raise ValueError("Credenciais do Google não encontradas.")
        creds_dict = json.loads(creds_json_str)
        creds = Credentials.from_service_account_info(creds_dict, scopes=scope)
        client = gspread.authorize(creds)
        spreadsheet = client.open("LancaNotas-DB")
        users_sheet = spreadsheet.worksheet("usuarios")
        provas_sheet = spreadsheet.worksheet("provas")
        resultados_sheet = spreadsheet.worksheet("resultados")
        banco_questoes_sheet = spreadsheet.worksheet("banco_questoes")
        return users_sheet, provas_sheet, resultados_sheet, banco_questoes_sheet
    except Exception as e:
        print(f"ERRO CRÍTICO ao conectar com Google Sheets: {e}")
        return None, None, None, None

# --- Funções de Geração de PDF ---
def generate_pdf_base(prova_data, is_gabarito=False):
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    p.setFont("Helvetica-Bold", 16)
    p.drawCentredString(width / 2.0, height - inch, prova_data.get('titulo', 'Prova Sem Título'))
    if is_gabarito:
        p.setFont("Helvetica-Bold", 14)
        p.drawCentredString(width / 2.0, height - 1.25 * inch, "GABARITO")
    p.setFont("Helvetica", 12)
    y_position = height - 1.75 * inch
    header_text = prova_data.get('cabecalho', '')
    for line in header_text.split('\n'):
        p.drawString(inch, y_position, line)
        y_position -= 20
    y_position -= 20
    for i, questao in enumerate(prova_data.get('questoes', [])):
        if y_position < 2 * inch:
            p.showPage()
            p.setFont("Helvetica", 12)
            y_position = height - inch
        p.setFont("Helvetica-Bold", 12)
        enunciado_lines = f"{i + 1}. {questao.get('enunciado', '')}".split('\n')
        for line in enunciado_lines:
            p.drawString(inch, y_position, line)
            y_position -= 15
        p.setFont("Helvetica", 12)
        y_position -= 10
        if not is_gabarito:
            if questao.get('tipo') == 'multipla_escolha':
                letras = ['a', 'b', 'c', 'd', 'e']
                for j, alt in enumerate(questao.get('alternativas', [])):
                    p.drawString(inch * 1.2, y_position, f"({letras[j]}) {alt}")
                    y_position -= 20
            elif questao.get('tipo') == 'verdadeiro_falso':
                p.drawString(inch * 1.2, y_position, "(  ) Verdadeiro")
                y_position -= 20
                p.drawString(inch * 1.2, y_position, "(  ) Falso")
                y_position -= 20
            elif questao.get('tipo') == 'dissertativa':
                y_position -= 80
        if is_gabarito:
            p.setFont("Helvetica-Bold", 12)
            resposta = str(questao.get('resposta', '')).upper()
            p.drawString(inch * 1.2, y_position, f"Resposta: {resposta}")
            y_position -= 20
        y_position -= 20
    p.save()
    buffer.seek(0)
    return buffer

def generate_gabarito_tabela(prova_data):
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    p.setFont("Helvetica-Bold", 16)
    p.drawCentredString(width / 2.0, height - inch, f"Gabarito - {prova_data.get('titulo', 'Prova')}")
    y = height - 1.5 * inch
    x = inch
    p.setFont("Helvetica", 12)
    for i, q in enumerate(prova_data.get('questoes', [])):
        if y < inch:
            p.showPage()
            y = height - inch
        resposta = str(q.get('resposta', '-')).upper()
        p.drawString(x, y, f"Questão {i+1}:")
        p.drawString(x + 1.5 * inch, y, resposta)
        y -= 25
    p.save()
    buffer.seek(0)
    return buffer

# --- ROTAS DAS PÁGINAS ---
@app.route('/')
def index():
    if 'user_email' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    if 'user_email' not in session: return redirect(url_for('index'))
    return render_template('dashboard.html')

@app.route('/editor')
def editor():
    if 'user_email' not in session: return redirect(url_for('index'))
    return render_template('editor.html')

@app.route('/correcao')
def correcao():
    if 'user_email' not in session: return redirect(url_for('index'))
    return render_template('correcao.html')

# --- ROTAS DA API ---

@app.route('/api/register', methods=['POST'])
def register():
    users_sheet, _, _, _ = get_sheets()
    if not users_sheet: return jsonify({"error": "Erro no servidor ao conectar com a base de dados."}), 500
    
    data = request.json
    email_input = data.get('email', '').lower().strip()
    senha_input = data.get('senha', '').strip()

    if not email_input or not senha_input: 
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    all_users = users_sheet.get_all_records()
    for user in all_users:
        if user.get('email', '').lower().strip() == email_input:
            return jsonify({"error": "Usuário já existe"}), 409
        
    users_sheet.append_row([email_input, senha_input])
    return jsonify({"success": True}), 201

@app.route('/api/login', methods=['POST'])
def login():
    users_sheet, _, _, _ = get_sheets()
    if not users_sheet: return jsonify({"error": "Erro no servidor ao conectar com a base de dados."}), 500
    
    data = request.json
    email_input = data.get('email', '').lower().strip()
    senha_input = data.get('senha', '').strip()

    all_users = users_sheet.get_all_records()
    for user in all_users:
        if user.get('email', '').lower().strip() == email_input:
            if user.get('senha', '').strip() == senha_input:
                session['user_email'] = email_input
                return jsonify({"success": True})
            else:
                return jsonify({"error": "Credenciais inválidas"}), 401
    
    return jsonify({"error": "Credenciais inválidas"}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_email', None)
    return jsonify({"success": True})

@app.route('/api/provas', methods=['GET', 'POST'])
def handle_provas():
    if 'user_email' not in session: return jsonify({"error": "Não autorizado"}), 401
    _, provas_sheet, _, _ = get_sheets()
    if not provas_sheet: return jsonify({"error": "Erro no servidor."}), 500
    if request.method == 'GET':
        provas = [p for p in provas_sheet.get_all_records() if p.get('user_email') == session['user_email']]
        return jsonify(provas)
    if request.method == 'POST':
        data = request.json
        nova_prova = {
            "id_prova": str(uuid.uuid4()), "user_email": session['user_email'],
            "titulo": data.get('titulo'), "cabecalho": data.get('cabecalho'),
            "questoes": json.dumps(data.get('questoes', []))
        }
        provas_sheet.append_row(list(nova_prova.values()))
        return jsonify(nova_prova), 201

@app.route('/api/provas/<prova_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_prova_by_id(prova_id):
    if 'user_email' not in session: return jsonify({"error": "Não autorizado"}), 401
    _, provas_sheet, _, _ = get_sheets()
    if not provas_sheet: return jsonify({"error": "Erro no servidor."}), 500
    
    all_provas = provas_sheet.get_all_records()
    prova_row_index, prova_encontrada = -1, None
    for i, p in enumerate(all_provas):
        if p.get('id_prova') == prova_id and p.get('user_email') == session['user_email']:
            prova_row_index, prova_encontrada = i + 2, p
            break
    if prova_row_index == -1: return jsonify({"error": "Prova não encontrada"}), 404

    if request.method == 'GET':
        questoes_json = []
        try:
            questoes_str = prova_encontrada.get('questoes')
            if questoes_str: questoes_json = json.loads(questoes_str)
            if questoes_json is None: questoes_json = []
        except (json.JSONDecodeError, TypeError):
            questoes_json = []
        prova_encontrada['questoes'] = questoes_json
        return jsonify(prova_encontrada)
    if request.method == 'PUT':
        data = request.json
        provas_sheet.update_cell(prova_row_index, 3, data.get('titulo'))
        provas_sheet.update_cell(prova_row_index, 4, data.get('cabecalho'))
        provas_sheet.update_cell(prova_row_index, 5, json.dumps(data.get('questoes', [])))
        return jsonify({"success": True})
    if request.method == 'DELETE':
        provas_sheet.delete_rows(prova_row_index)
        return jsonify({"success": True})

@app.route('/api/provas/<prova_id>/pdf')
@app.route('/api/provas/<prova_id>/gabarito')
def get_prova_pdf_or_gabarito(prova_id):
    if 'user_email' not in session: return "Não autorizado", 401
    _, provas_sheet, _, _ = get_sheets()
    if not provas_sheet: return "Erro no servidor", 500
    
    prova_data = next((p for p in provas_sheet.get_all_records() if p.get('id_prova') == prova_id and p.get('user_email') == session['user_email']), None)
    if not prova_data: return "Prova não encontrada", 404
    
    try:
        prova_data['questoes'] = json.loads(prova_data.get('questoes', '[]')) or []
    except json.JSONDecodeError:
        prova_data['questoes'] = []

    is_gabarito_req = 'gabarito' in request.path
    if is_gabarito_req:
        pdf_buffer = generate_gabarito_tabela(prova_data)
        filename = f"gabarito_{prova_data.get('titulo', 'prova')}.pdf"
    else:
        pdf_buffer = generate_pdf_base(prova_data, is_gabarito=False)
        filename = f"{prova_data.get('titulo', 'prova')}.pdf"
        
    return send_file(pdf_buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')

@app.route('/api/provas/<prova_id>/corrigir', methods=['POST'])
def corrigir_prova(prova_id):
    if 'user_email' not in session: return jsonify({"error": "Não autorizado"}), 401
    _, provas_sheet, resultados_sheet, _ = get_sheets()
    if not provas_sheet or not resultados_sheet: return jsonify({"error": "Erro no servidor."}), 500
    
    data = request.json
    prova_data = next((p for p in provas_sheet.get_all_records() if p.get('id_prova') == prova_id and p.get('user_email') == session['user_email']), None)
    if not prova_data: return jsonify({"error": "Prova não encontrada"}), 404

    gabarito_questoes = json.loads(prova_data.get('questoes', '[]')) or []
    acertos, total_questoes = 0, len(gabarito_questoes)
    respostas_aluno = data.get('respostas', [])

    for i, questao in enumerate(gabarito_questoes):
        if i < len(respostas_aluno):
            if str(questao.get('resposta', '')).lower().strip() == str(respostas_aluno[i]).lower().strip():
                acertos += 1
    
    novo_resultado = {
        "id_resultado": str(uuid.uuid4()), "id_prova": prova_id, "titulo_prova": prova_data.get('titulo'),
        "nome_aluno": data.get('nome_aluno'), "acertos": acertos, "total_questoes": total_questoes
    }
    resultados_sheet.append_row(list(novo_resultado.values()))
    return jsonify(novo_resultado)

@app.route('/api/questoes', methods=['GET', 'POST'])
def handle_questoes():
    if 'user_email' not in session: return jsonify({"error": "Não autorizado"}), 401
    *_, banco_sheet = get_sheets()
    if not banco_sheet: return jsonify({"error": "Erro no servidor."}), 500
    
    if request.method == 'GET':
        questoes = [q for q in banco_sheet.get_all_records() if q.get('user_email') == session['user_email']]
        return jsonify(questoes)
    
    if request.method == 'POST':
        data = request.json
        nova_questao = {
            "id_questao": str(uuid.uuid4()), "user_email": session['user_email'], "enunciado": data.get('enunciado'),
            "tipo": data.get('tipo'), "alternativas": json.dumps(data.get('alternativas', [])), "resposta": data.get('resposta')
        }
        banco_sheet.append_row(list(nova_questao.values()))
        return jsonify({"success": True}), 201

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

