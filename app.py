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
# Chave secreta para gerenciar sessões de login
app.secret_key = os.urandom(24) 

# --- Configuração do Google Sheets ---
def get_sheets():
    """Conecta-se à API do Google Sheets e retorna as planilhas."""
    gc = gspread.service_account(filename="google_credentials.json")
    sheet = gc.open("LancaNotas-DB") 
    users_sheet = sheet.worksheet("usuarios")
    provas_sheet = sheet.worksheet("provas")
    return users_sheet, provas_sheet

# --- Funções Auxiliares para PDF ---

def draw_multiline_text(canvas, text, x, y, max_width):
    """Desenha texto com múltiplas linhas e retorna o objeto de texto e a contagem de linhas."""
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
    """Gera o PDF da prova completa para o aluno."""
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
    """NOVA FUNÇÃO: Gera um PDF de gabarito em formato de tabela."""
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin = 0.75 * inch

    # Título
    p.setFont("Helvetica-Bold", 16)
    p.drawString(margin, height - margin, "GABARITO OFICIAL")
    p.setFont("Helvetica", 14)
    p.drawString(margin, height - margin - 25, prova_data.get('titulo', 'Prova'))

    y_position = height - margin - 70
    
    # Cabeçalho da tabela
    p.setFont("Helvetica-Bold", 12)
    p.drawString(margin, y_position, "Questão")
    p.drawString(margin + 1.5 * inch, y_position, "Resposta")
    p.line(margin, y_position - 8, width - margin, y_position - 8)
    
    y_position -= 30
    p.setFont("Helvetica", 11)

    questoes = prova_data.get('questoes', [])
    q_num = 1
    for questao in questoes:
        # Checa se precisa de uma nova página
        if y_position < margin:
            p.showPage()
            p.setFont("Helvetica-Bold", 12)
            p.drawString(margin, height - margin, "Questão")
            p.drawString(margin + 1.5 * inch, height - margin, "Resposta")
            p.line(margin, height - margin - 8, width - margin, height - margin - 8)
            y_position = height - margin - 30
            p.setFont("Helvetica", 11)
            
        p.drawString(margin, y_position, f"{q_num}.")
        
        resposta = str(questao.get('resposta', ''))
        # Usa a função de desenhar múltiplas linhas para respostas longas (dissertativas)
        text_obj, line_count = draw_multiline_text(p, resposta, margin + 1.5 * inch, y_position, width - margin - (margin + 1.5 * inch))
        p.drawText(text_obj)
        
        y_position -= (line_count * 14) + 15 # Adiciona um espaçamento extra entre as linhas
        q_num += 1

    p.save()
    buffer.seek(0)
    return buffer

# --- Rotas para Servir as Páginas HTML e Autenticação ---
@app.route('/')
def index():
    if 'user_email' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    if 'user_email' not in session:
        return redirect(url_for('index'))
    return render_template('dashboard.html')

@app.route('/editor')
def editor():
    if 'user_email' not in session:
        return redirect(url_for('index'))
    return render_template('editor.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    users_sheet, _ = get_sheets()
    users = users_sheet.get_all_records()
    for user in users:
        if user['email'] == data['email'] and user['senha'] == data['password']:
            session['user_email'] = user['email']
            return jsonify({"success": True}), 200
    return jsonify({"error": "E-mail ou senha inválidos"}), 401

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    users_sheet, _ = get_sheets()
    users = users_sheet.get_all_records()
    if any(user['email'] == data['email'] for user in users):
        return jsonify({"error": "Este e-mail já está cadastrado"}), 409
    
    users_sheet.append_row([data['email'], data['password']])
    session['user_email'] = data['email']
    return jsonify({"success": True}), 201
    
@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_email', None)
    return jsonify({"success": True}), 200

# --- API Endpoints com Google Sheets ---
@app.route('/api/provas', methods=['POST'])
def create_prova():
    if 'user_email' not in session:
        return jsonify({"error": "Usuário não autorizado"}), 403
    
    user_email = session['user_email']
    data = request.json
    
    _, provas_sheet = get_sheets()
    new_id = str(uuid.uuid4())
    questoes_str = json.dumps(data.get('questoes', []))
    
    provas_sheet.append_row([
        new_id, user_email, data.get('titulo', ''),
        data.get('cabecalho', ''), questoes_str
    ])
    
    data['id'] = new_id
    return jsonify(data), 201

@app.route('/api/provas', methods=['GET'])
def get_provas():
    if 'user_email' not in session:
        return jsonify({"error": "Usuário não autorizado"}), 403
        
    user_email = session['user_email']
    _, provas_sheet = get_sheets()
    
    all_provas = provas_sheet.get_all_records()
    user_provas = [p for p in all_provas if p['user_email'] == user_email]

    for prova in user_provas:
        try:
            prova['questoes'] = json.loads(prova['questoes']) if prova['questoes'] else []
        except json.JSONDecodeError:
            prova['questoes'] = []

    return jsonify(user_provas)

def get_prova_data_by_id(prova_id, user_email):
    """Busca os dados de uma prova específica e verifica a permissão do usuário."""
    _, provas_sheet = get_sheets()
    cell = provas_sheet.find(prova_id, in_column=1)
    if not cell:
        return None
    
    row_values = provas_sheet.row_values(cell.row)
    if row_values[1] != user_email: 
        return None
        
    headers = provas_sheet.row_values(1)
    prova_data = dict(zip(headers, row_values))
    
    try:
        prova_data['questoes'] = json.loads(prova_data['questoes']) if prova_data['questoes'] else []
    except json.JSONDecodeError:
        prova_data['questoes'] = []

    return prova_data

@app.route('/api/provas/<prova_id>', methods=['GET'])
def get_prova_by_id(prova_id):
    if 'user_email' not in session:
        return jsonify({"error": "Usuário não autorizado"}), 403
        
    prova_data = get_prova_data_by_id(prova_id, session['user_email'])
    if not prova_data:
        return jsonify({"error": "Prova não encontrada ou não autorizada"}), 404
        
    return jsonify(prova_data)

@app.route('/api/provas/<prova_id>', methods=['PUT'])
def update_prova(prova_id):
    if 'user_email' not in session:
        return jsonify({"error": "Usuário não autorizado"}), 403

    user_email = session['user_email']
    _, provas_sheet = get_sheets()
    
    cell = provas_sheet.find(prova_id, in_column=1)
    if not cell or provas_sheet.cell(cell.row, 2).value != user_email:
        return jsonify({"error": "Prova não encontrada"}), 404
        
    data = request.json
    questoes_str = json.dumps(data.get('questoes', []))
    
    provas_sheet.update_cell(cell.row, 3, data.get('titulo', ''))
    provas_sheet.update_cell(cell.row, 4, data.get('cabecalho', ''))
    provas_sheet.update_cell(cell.row, 5, questoes_str)
    
    return jsonify({"success": True}), 200

@app.route('/api/provas/<prova_id>', methods=['DELETE'])
def delete_prova(prova_id):
    if 'user_email' not in session:
        return jsonify({"error": "Usuário não autorizado"}), 403

    user_email = session['user_email']
    _, provas_sheet = get_sheets()
    
    cell = provas_sheet.find(prova_id, in_column=1)
    if not cell or provas_sheet.cell(cell.row, 2).value != user_email:
        return jsonify({"error": "Prova não encontrada"}), 404
        
    provas_sheet.delete_rows(cell.row)
    return jsonify({"success": True}), 200

# --- ROTA DE PDF ATUALIZADA ---
@app.route('/api/provas/<prova_id>/pdf')
@app.route('/api/provas/<prova_id>/gabarito')
def get_pdf(prova_id):
    if 'user_email' not in session:
        return "Não autorizado", 403

    prova_data = get_prova_data_by_id(prova_id, session['user_email'])
    if not prova_data:
        return "Prova não encontrada ou não autorizada", 404
    
    is_gabarito = 'gabarito' in request.path
    
    if is_gabarito:
        pdf_buffer = generate_gabarito_table_pdf(prova_data)
    else:
        pdf_buffer = generate_pdf_base(prova_data)
    
    file_name = f"{'gabarito' if is_gabarito else 'prova'}_{prova_id[:8]}.pdf"
    return send_file(pdf_buffer, as_attachment=True, download_name=file_name, mimetype='application/pdf')

# --- Inicia o Servidor ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))

