import os
import io
import json
import uuid
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
import gspread
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch

# --- Configuração Inicial ---
app = Flask(__name__)
app.secret_key = os.urandom(24) 

# --- Configuração do Google Sheets (ATUALIZADO) ---
def get_sheets():
    """Conecta-se à API do Google Sheets e retorna as planilhas."""
    gc = gspread.service_account(filename="google_credentials.json")
    sheet = gc.open("LancaNotas-DB") 
    users_sheet = sheet.worksheet("usuarios")
    provas_sheet = sheet.worksheet("provas")
    resultados_sheet = sheet.worksheet("resultados")
    # Adicionamos a nova planilha do banco de questões
    banco_questoes_sheet = sheet.worksheet("banco_questoes")
    return users_sheet, provas_sheet, resultados_sheet, banco_questoes_sheet

# --- Funções Auxiliares para PDF ---
def draw_multiline_text(canvas, text, x, y, max_width):
    text_object = canvas.beginText(x, y)
    line_count = 0
    for line in text.splitlines():
        if canvas.stringWidth(line) > max_width:
            words = line.split()
            current_line = ''
            for word in words:
                if canvas.stringWidth(current_line + word) < max_width:
                    current_line += word + ' '
                else:
                    text_object.textLine(current_line)
                    line_count += 1
                    current_line = word + ' '
            text_object.textLine(current_line)
            line_count += 1
        else:
            text_object.textLine(line)
            line_count += 1
    return text_object, line_count

def generate_pdf_base(prova_data):
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin = 0.75 * inch
    p.setFont("Helvetica-Bold", 16)
    p.drawString(margin, height - margin, prova_data.get('titulo', 'Prova'))
    p.setFont("Helvetica", 12)
    y_position = height - margin - 0.5 * inch
    header_text = p.beginText(margin, y_position)
    header_content = prova_data.get('cabecalho', 'Nome: \nData: \nTurma:')
    for line in header_content.split('\n'):
        header_text.textLine(line)
    p.drawText(header_text)
    y_position -= (header_content.count('\n') + 2) * 18
    p.setFont("Helvetica", 11)
    questoes = prova_data.get('questoes', [])
    q_num = 1
    for questao in questoes:
        if y_position < margin + 1 * inch:
            p.showPage()
            p.setFont("Helvetica", 11)
            y_position = height - margin
        enunciado = f"{q_num}. {questao['enunciado']}"
        text_obj, line_count = draw_multiline_text(p, enunciado, margin, y_position, width - 2 * margin)
        p.drawText(text_obj)
        y_position -= (line_count) * 14
        if questao['tipo'] == 'multipla_escolha':
            letras = ['a', 'b', 'c', 'd', 'e']
            for i, alt in enumerate(questao['alternativas']):
                p.drawString(margin + 0.25 * inch, y_position, f"({letras[i]}) {alt}")
                y_position -= 20
        elif questao['tipo'] == 'verdadeiro_falso':
            p.drawString(margin + 0.25 * inch, y_position, "(  ) Verdadeiro   (  ) Falso")
            y_position -= 20
        elif questao['tipo'] == 'dissertativa':
            y_position -= 1 * inch
        y_position -= 0.5 * inch
        q_num += 1
    p.save()
    buffer.seek(0)
    return buffer

def generate_gabarito_table_pdf(prova_data):
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin = 0.75 * inch
    p.setFont("Helvetica-Bold", 16)
    p.drawString(margin, height - margin, "GABARITO OFICIAL")
    p.setFont("Helvetica", 14)
    p.drawString(margin, height - margin - 25, prova_data.get('titulo', 'Prova'))
    y_position = height - margin - 70
    p.setFont("Helvetica-Bold", 12)
    p.drawString(margin, y_position, "Questão")
    p.drawString(margin + 1.5 * inch, y_position, "Resposta")
    p.line(margin, y_position - 8, width - margin, y_position - 8)
    y_position -= 30
    p.setFont("Helvetica", 11)
    questoes = prova_data.get('questoes', [])
    q_num = 1
    for questao in questoes:
        if y_position < margin:
            p.showPage()
            y_position = height - margin - 30
            p.setFont("Helvetica", 11)
        p.drawString(margin, y_position, f"{q_num}.")
        resposta = str(questao.get('resposta', ''))
        text_obj, line_count = draw_multiline_text(p, resposta, margin + 1.5 * inch, y_position, width - margin - (margin + 1.5 * inch))
        p.drawText(text_obj)
        y_position -= (line_count * 14) + 15
        q_num += 1
    p.save()
    buffer.seek(0)
    return buffer

# --- Rotas das Páginas ---
@app.route('/')
def index():
    if 'user_email' in session: return redirect(url_for('dashboard'))
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

# --- Rotas de API (Autenticação) ---
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    users_sheet, _, _, _ = get_sheets()
    users = users_sheet.get_all_records()
    for user in users:
        if user['email'] == data['email'] and user['senha'] == data['password']:
            session['user_email'] = user['email']
            return jsonify({"success": True}), 200
    return jsonify({"error": "E-mail ou senha inválidos"}), 401

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    users_sheet, _, _, _ = get_sheets()
    if any(user['email'] == data['email'] for user in users_sheet.get_all_records()):
        return jsonify({"error": "Este e-mail já está cadastrado"}), 409
    users_sheet.append_row([data['email'], data['password']])
    session['user_email'] = data['email']
    return jsonify({"success": True}), 201
    
@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_email', None)
    return jsonify({"success": True}), 200

# --- Rotas de API (Provas) ---
@app.route('/api/provas', methods=['POST', 'GET'])
def handle_provas():
    if 'user_email' not in session: return jsonify({"error": "Usuário não autorizado"}), 403
    user_email = session['user_email']
    _, provas_sheet, _, _ = get_sheets()

    if request.method == 'POST':
        data = request.json
        new_id = str(uuid.uuid4())
        questoes_str = json.dumps(data.get('questoes', []))
        provas_sheet.append_row([new_id, user_email, data.get('titulo', ''), data.get('cabecalho', ''), questoes_str])
        data['id'] = new_id
        return jsonify(data), 201
    
    if request.method == 'GET':
        all_provas = provas_sheet.get_all_records()
        user_provas = [p for p in all_provas if p['user_email'] == user_email]
        for prova in user_provas:
            try: prova['questoes'] = json.loads(prova['questoes']) if prova['questoes'] else []
            except json.JSONDecodeError: prova['questoes'] = []
        return jsonify(user_provas)

def get_prova_data_by_id(prova_id, user_email):
    _, provas_sheet, _, _ = get_sheets()
    cell = provas_sheet.find(prova_id, in_column=1)
    if not cell: return None
    row_values = provas_sheet.row_values(cell.row)
    if row_values[1] != user_email: return None
    headers = provas_sheet.row_values(1)
    prova_data = dict(zip(headers, row_values))
    try: prova_data['questoes'] = json.loads(prova_data['questoes']) if prova_data['questoes'] else []
    except json.JSONDecodeError: prova_data['questoes'] = []
    return prova_data

@app.route('/api/provas/<prova_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_prova_by_id(prova_id):
    if 'user_email' not in session: return jsonify({"error": "Usuário não autorizado"}), 403
    user_email = session['user_email']
    _, provas_sheet, _, _ = get_sheets()

    cell = provas_sheet.find(prova_id, in_column=1)
    if not cell or provas_sheet.cell(cell.row, 2).value != user_email:
        return jsonify({"error": "Prova não encontrada"}), 404

    if request.method == 'GET':
        return jsonify(get_prova_data_by_id(prova_id, user_email))
    
    if request.method == 'PUT':
        data = request.json
        questoes_str = json.dumps(data.get('questoes', []))
        provas_sheet.batch_update([{
            'range': f'C{cell.row}:E{cell.row}',
            'values': [[data.get('titulo', ''), data.get('cabecalho', ''), questoes_str]]
        }])
        return jsonify({"success": True}), 200

    if request.method == 'DELETE':
        provas_sheet.delete_rows(cell.row)
        return jsonify({"success": True}), 200

# --- NOVAS ROTAS DE API (BANCO DE QUESTÕES) ---
@app.route('/api/questoes', methods=['POST', 'GET'])
def handle_questoes_banco():
    if 'user_email' not in session: return jsonify({"error": "Usuário não autorizado"}), 403
    user_email = session['user_email']
    _, _, _, banco_sheet = get_sheets()

    if request.method == 'POST':
        data = request.json
        new_id = str(uuid.uuid4())
        alternativas_str = json.dumps(data.get('alternativas', []))
        banco_sheet.append_row([
            new_id, user_email, data.get('enunciado'), data.get('tipo'), 
            alternativas_str, data.get('resposta')
        ])
        return jsonify({"success": True, "id": new_id}), 201

    if request.method == 'GET':
        all_questoes = banco_sheet.get_all_records()
        user_questoes = [q for q in all_questoes if q['user_email'] == user_email]
        for questao in user_questoes:
            try: questao['alternativas'] = json.loads(questao['alternativas']) if questao['alternativas'] else []
            except (json.JSONDecodeError, TypeError): questao['alternativas'] = []
        return jsonify(user_questoes)

# --- Rota de Correção ---
@app.route('/api/provas/<prova_id>/corrigir', methods=['POST'])
def corrigir_prova(prova_id):
    if 'user_email' not in session: return jsonify({"error": "Não autorizado"}), 403
    dados_aluno = request.json
    prova_data = get_prova_data_by_id(prova_id, session['user_email'])
    if not prova_data: return jsonify({"error": "Prova não encontrada"}), 404
    
    acertos = 0
    questoes_objetivas = 0
    for i, questao_gabarito in enumerate(prova_data.get('questoes', [])):
        if questao_gabarito['tipo'] != 'dissertativa':
            questoes_objetivas += 1
            if str(questao_gabarito.get('resposta', '')).strip().lower() == str(dados_aluno.get('respostas', {}).get(str(i), '')).strip().lower():
                acertos += 1
    
    _, _, resultados_sheet, _ = get_sheets()
    resultados_sheet.append_row([
        str(uuid.uuid4()), prova_id, prova_data.get('titulo'), 
        dados_aluno.get('nome_aluno', 'N/A'), acertos, questoes_objetivas
    ])
    return jsonify({"success": True, "acertos": acertos, "total_questoes": questoes_objetivas, "nome_aluno": dados_aluno.get('nome_aluno')})

# --- Rota de PDF ---
@app.route('/api/provas/<prova_id>/pdf')
@app.route('/api/provas/<prova_id>/gabarito')
def get_pdf(prova_id):
    if 'user_email' not in session: return "Não autorizado", 403
    prova_data = get_prova_data_by_id(prova_id, session['user_email'])
    if not prova_data: return "Prova não encontrada", 404
    
    is_gabarito = 'gabarito' in request.path
    pdf_buffer = generate_gabarito_table_pdf(prova_data) if is_gabarito else generate_pdf_base(prova_data)
    
    file_name = f"{'gabarito' if is_gabarito else 'prova'}_{prova_id[:8]}.pdf"
    return send_file(pdf_buffer, as_attachment=True, download_name=file_name, mimetype='application/pdf')

# --- Inicia o Servidor ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))

