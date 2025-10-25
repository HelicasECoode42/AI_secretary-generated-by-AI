# -*- coding: utf-8 -*-
"""
AI���� MVP ���
ģ�黯��ƣ�����ά������չ
"""

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
from flask_cors import CORS
import sqlite3
import os
import requests
import json
from datetime import datetime, timedelta
from dateutil import parser as dateparser
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
import pytesseract
from PIL import Image
import io
import base64

load_dotenv()
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

DB_FILE = "tasks.db"

# ===========================
# ���ݿ��ʼ��
# ===========================
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # �����
    c.execute('''CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        category TEXT,
        priority TEXT CHECK(priority IN ('high','medium','low')),
        estimated_duration TEXT,
        deadline TEXT,
        scheduled_start TEXT,
        scheduled_end TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        completed_at TEXT
    )''')
    
    # �̶��ճ̱�
    c.execute('''CREATE TABLE IF NOT EXISTS fixed_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        day_of_week INTEGER,
        start_time TEXT,
        end_time TEXT,
        recurrence TEXT DEFAULT 'weekly',
        location TEXT,
        source TEXT DEFAULT 'manual'
    )''')
    
    # �û�ƫ��
    c.execute('''CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        work_start_time TEXT DEFAULT '09:00',
        work_end_time TEXT DEFAULT '18:00',
        break_duration TEXT DEFAULT '15m',
        focus_time_preference TEXT,
        enable_main_chat INTEGER DEFAULT 1,
        sleep_reminder_time TEXT DEFAULT '22:00',
        auto_reschedule_on_drag INTEGER DEFAULT 0
    )''')
    
    # �Ի���ʷ
    c.execute('''CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT,
        content TEXT,
        timestamp TEXT
    )''')
    
    # ��ʼ���û�ƫ�ã���������ڣ�
    c.execute("INSERT OR IGNORE INTO user_preferences (id) VALUES (1)")
    
    conn.commit()
    conn.close()

init_db()

# ===========================
# ���ߺ�����DeepSeek API����
# ===========================
def call_deepseek(prompt, system_prompt=None, temperature=0.0):
    """ͳһ��DeepSeek API����"""
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    data = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": temperature
    }
    
    try:
        resp = requests.post(DEEPSEEK_API_URL, headers=headers, json=data, timeout=15)
        content = resp.json()["choices"][0]["message"]["content"].strip()
        return content
    except Exception as e:
        return f"API����ʧ��: {str(e)}"

# ===========================
# AIģ�飺�������
# ===========================
def analyze_task(text):
    """
    AI�������񣺷��ࡢ���ȼ���Ԥ��ʱ������ֹ����
    """
    prompt = f"""
�뽫�����û��������ΪJSON��ʽ�����������ֶΣ�
- task: ����������
- category: ���ࣨ����/ѧϰ/����/������
- priority: ���ȼ���high/medium/low��
- estimated_duration: Ԥ��ʱ������ʽ��30m �� 2h��
- deadline: ��ֹ���ڣ�ISO��ʽ��null��

�û����룺{text}

������JSON����Ҫ����˵����
"""
    
    result = call_deepseek(prompt)
    
    try:
        # ������ܵ�markdown�����
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        
        parsed = json.loads(result.strip())
        
        # ����deadline
        if parsed.get("deadline"):
            try:
                dt = dateparser.parse(parsed["deadline"])
                parsed["deadline_iso"] = dt.isoformat()
            except:
                parsed["deadline_iso"] = None
        else:
            parsed["deadline_iso"] = None
            
        return parsed
    except Exception as e:
        return {
            "task": text,
            "category": "δ����",
            "priority": "medium",
            "estimated_duration": "1h",
            "deadline_iso": None,
            "error": str(e)
        }

# ===========================
# AIģ�飺OCRʶ��α�
# ===========================
def ocr_schedule_image(image_data):
    """
    ʹ��Tesseract OCRʶ��α�ͼƬ
    ����ʶ����ı�������AI����Ϊ�ṹ������
    """
    try:
        # ����base64ͼƬ
        image_bytes = base64.b64decode(image_data.split(',')[1])
        image = Image.open(io.BytesIO(image_bytes))
        
        # OCRʶ��
        text = pytesseract.image_to_string(image, lang='chi_sim+eng')
        
        # AI����Ϊ�ṹ���α�
        prompt = f"""
�����ǿα�OCRʶ�����������ΪJSON���飬ÿ���γ̰�����
- title: �γ�����
- day_of_week: ���ڼ���0=���գ�1=��һ...6=������
- start_time: ��ʼʱ�䣨HH:MM��ʽ��
- end_time: ����ʱ�䣨HH:MM��ʽ��
- location: �ص㣨����У�

OCR�ı���
{text}

����JSON�����ʽ��
"""
        result = call_deepseek(prompt)
        
        # ��������
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        
        schedules = json.loads(result.strip())
        return {"success": True, "schedules": schedules, "raw_text": text}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ===========================
# �����㷨������̰���㷨
# ===========================
def greedy_schedule(tasks, fixed_schedules, work_start, work_end):
    """
    ̰���㷨�������ȼ��ͽ�ֹ�������������ҿ���ʱ��
    """
    # ��������ʱ��
    work_start_minutes = time_to_minutes(work_start)
    work_end_minutes = time_to_minutes(work_end)
    
    # ��ȡ��������
    today = datetime.now().date()
    
    # �����ȼ��ͽ�ֹ��������
    priority_map = {"high": 3, "medium": 2, "low": 1}
    sorted_tasks = sorted(
        tasks,
        key=lambda t: (
            -priority_map.get(t.get("priority", "medium"), 2),
            t.get("deadline") or "9999-12-31"
        )
    )
    
    # ������ռ��ʱ��Σ��̶��ճ̣�
    occupied = []
    for fs in fixed_schedules:
        if fs.get("day_of_week") == today.weekday():
            start_min = time_to_minutes(fs["start_time"])
            end_min = time_to_minutes(fs["end_time"])
            occupied.append((start_min, end_min))
    
    occupied.sort()
    
    # Ϊÿ���������ʱ��
    scheduled = []
    current_time = work_start_minutes
    
    for task in sorted_tasks:
        duration = duration_to_minutes(task.get("estimated_duration", "1h"))
        
        # Ѱ�ҿ���ʱ��
        task_start = find_available_slot(current_time, duration, work_end_minutes, occupied)
        
        if task_start is not None:
            task_end = task_start + duration
            scheduled.append({
                "id": task["id"],
                "scheduled_start": minutes_to_time(task_start),
                "scheduled_end": minutes_to_time(task_end)
            })
            occupied.append((task_start, task_end))
            occupied.sort()
            current_time = task_end
    
    return scheduled

def time_to_minutes(time_str):
    """��HH:MMתΪ������"""
    h, m = map(int, time_str.split(':'))
    return h * 60 + m

def minutes_to_time(minutes):
    """��������תΪHH:MM"""
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

def duration_to_minutes(duration_str):
    """��1h��30mתΪ������"""
    if 'h' in duration_str:
        return int(duration_str.replace('h', '')) * 60
    elif 'm' in duration_str:
        return int(duration_str.replace('m', ''))
    return 60

def find_available_slot(start, duration, end, occupied):
    """��occupiedʱ������ҵ����õ�duration���ȵ�ʱ��"""
    current = start
    
    for occ_start, occ_end in occupied:
        if current + duration <= occ_start:
            return current
        if current < occ_end:
            current = occ_end
    
    if current + duration <= end:
        return current
    
    return None

# ===========================
# AI�����Ż�
# ===========================
def ai_optimize_schedule(tasks, fixed_schedules, user_prefs):
    """
    ����AI�������������Ż�
    """
    prompt = f"""
����һ��ʱ�����ר�ң���Ϊ�û����Ž�������

����ʱ�䣺{user_prefs['work_start_time']} - {user_prefs['work_end_time']}

�̶��ճ̣�����ռ�ã���
{json.dumps(fixed_schedules, ensure_ascii=False, indent=2)}

����������
{json.dumps(tasks, ensure_ascii=False, indent=2)}

���ڹ���
1. �����ȼ���������
2. ���ؽ�ֹ����
3. �ܿ��̶��ճ�
4. ���Ͼ����ã�����������
5. ��ͬ���������������ţ������л�

����JSON���飬ÿ��Ԫ�ذ�����
- id: ����ID
- scheduled_start: ��ʼʱ�䣨HH:MM��
- scheduled_end: ����ʱ�䣨HH:MM��
- reason: �������ɣ���̣�
"""
    
    result = call_deepseek(prompt, temperature=0.3)
    
    try:
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        return json.loads(result.strip())
    except:
        return []

# ===========================
# ·�ɣ���ҳ
# ===========================
@app.route("/")
def index():
    return render_template("index.html")

# ===========================
# ·�ɣ��̶��ճ̹���
# ===========================
@app.route("/fixed_schedules", methods=["GET", "POST"])
def fixed_schedules():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    if request.method == "POST":
        data = request.json
        c.execute("""
            INSERT INTO fixed_schedules 
            (title, day_of_week, start_time, end_time, recurrence, location, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("title"),
            data.get("day_of_week"),
            data.get("start_time"),
            data.get("end_time"),
            data.get("recurrence", "weekly"),
            data.get("location"),
            data.get("source", "manual")
        ))
        conn.commit()
        conn.close()
        socketio.emit("schedule_updated", {"status": "ok"})
        return jsonify({"status": "ok"})
    
    else:
        c.execute("""
            SELECT id, title, day_of_week, start_time, end_time, recurrence, location, source
            FROM fixed_schedules ORDER BY day_of_week, start_time
        """)
        rows = c.fetchall()
        conn.close()
        return jsonify([{
            "id": r[0],
            "title": r[1],
            "day_of_week": r[2],
            "start_time": r[3],
            "end_time": r[4],
            "recurrence": r[5],
            "location": r[6],
            "source": r[7]
        } for r in rows])

@app.route("/fixed_schedules/<int:schedule_id>", methods=["DELETE"])
def delete_fixed_schedule(schedule_id):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM fixed_schedules WHERE id=?", (schedule_id,))
    conn.commit()
    conn.close()
    socketio.emit("schedule_updated", {"status": "ok"})
    return jsonify({"status": "ok"})

@app.route("/ocr_schedule", methods=["POST"])
def ocr_schedule():
    """OCRʶ��α�ͼƬ"""
    data = request.json
    image_data = data.get("image")
    result = ocr_schedule_image(image_data)
    return jsonify(result)

# ===========================
# ·�ɣ��������
# ===========================
@app.route("/tasks", methods=["GET"])
def get_tasks():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        SELECT id, content, category, priority, estimated_duration, 
               deadline, scheduled_start, scheduled_end, status, created_at
        FROM tasks ORDER BY priority DESC, deadline
    """)
    rows = c.fetchall()
    conn.close()
    return jsonify([{
        "id": r[0],
        "content": r[1],
        "category": r[2],
        "priority": r[3],
        "estimated_duration": r[4],
        "deadline": r[5],
        "scheduled_start": r[6],
        "scheduled_end": r[7],
        "status": r[8],
        "created_at": r[9]
    } for r in rows])

@app.route("/add_task", methods=["POST"])
def add_task():
    data = request.json
    text = data.get("text", "")
    
    # AI��������
    parsed = analyze_task(text)
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        INSERT INTO tasks 
        (content, category, priority, estimated_duration, deadline, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        parsed.get("task", text),
        parsed.get("category"),
        parsed.get("priority"),
        parsed.get("estimated_duration"),
        parsed.get("deadline_iso"),
        datetime.now().isoformat()
    ))
    task_id = c.lastrowid
    conn.commit()
    conn.close()
    
    socketio.emit("task_added", {"id": task_id})
    return jsonify({"status": "ok", "task_id": task_id, "parsed": parsed})

@app.route("/update_task", methods=["POST"])
def update_task():
    data = request.json
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        UPDATE tasks SET
        content=?, category=?, priority=?, estimated_duration=?,
        deadline=?, scheduled_start=?, scheduled_end=?, status=?
        WHERE id=?
    """, (
        data.get("content"),
        data.get("category"),
        data.get("priority"),
        data.get("estimated_duration"),
        data.get("deadline"),
        data.get("scheduled_start"),
        data.get("scheduled_end"),
        data.get("status"),
        data.get("id")
    ))
    conn.commit()
    conn.close()
    socketio.emit("task_updated", data)
    return jsonify({"status": "ok"})

@app.route("/delete_task/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    socketio.emit("task_deleted", {"id": task_id})
    return jsonify({"status": "ok"})

@app.route("/complete_task", methods=["POST"])
def complete_task():
    data = request.json
    task_id = data.get("id")
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        UPDATE tasks SET status='completed', completed_at=?
        WHERE id=?
    """, (datetime.now().isoformat(), task_id))
    conn.commit()
    conn.close()
    socketio.emit("task_completed", {"id": task_id})
    return jsonify({"status": "ok"})

# ===========================
# ·�ɣ��Զ�����
# ===========================
@app.route("/auto_schedule", methods=["POST"])
def auto_schedule():
    """����̰���㷨����"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # ��ȡ����������
    c.execute("""
        SELECT id, content, category, priority, estimated_duration, deadline
        FROM tasks WHERE status='pending' AND scheduled_start IS NULL
    """)
    tasks = [{
        "id": r[0], "content": r[1], "category": r[2],
        "priority": r[3], "estimated_duration": r[4], "deadline": r[5]
    } for r in c.fetchall()]
    
    # ��ȡ�̶��ճ�
    today = datetime.now().weekday()
    c.execute("""
        SELECT title, start_time, end_time, day_of_week
        FROM fixed_schedules WHERE day_of_week=?
    """, (today,))
    fixed = [{
        "title": r[0], "start_time": r[1],
        "end_time": r[2], "day_of_week": r[3]
    } for r in c.fetchall()]
    
    # ��ȡ�û�ƫ��
    c.execute("SELECT work_start_time, work_end_time FROM user_preferences WHERE id=1")
    prefs = c.fetchone()
    work_start = prefs[0] if prefs else "09:00"
    work_end = prefs[1] if prefs else "18:00"
    
    # ִ������
    scheduled = greedy_schedule(tasks, fixed, work_start, work_end)
    
    # �������ݿ�
    for s in scheduled:
        c.execute("""
            UPDATE tasks SET scheduled_start=?, scheduled_end=?
            WHERE id=?
        """, (s["scheduled_start"], s["scheduled_end"], s["id"]))
    
    conn.commit()
    conn.close()
    
    socketio.emit("schedule_updated", {"status": "ok"})
    return jsonify({"status": "ok", "scheduled": scheduled})

@app.route("/ai_optimize_schedule", methods=["POST"])
def ai_optimize():
    """AI�Ż�����"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # ��ȡ���ݣ�ͬ�ϣ�
    c.execute("""
        SELECT id, content, category, priority, estimated_duration, deadline
        FROM tasks WHERE status='pending'
    """)
    tasks = [{
        "id": r[0], "content": r[1], "category": r[2],
        "priority": r[3], "estimated_duration": r[4], "deadline": r[5]
    } for r in c.fetchall()]
    
    today = datetime.now().weekday()
    c.execute("""
        SELECT title, start_time, end_time FROM fixed_schedules WHERE day_of_week=?
    """, (today,))
    fixed = [{"title": r[0], "start_time": r[1], "end_time": r[2]} for r in c.fetchall()]
    
    c.execute("SELECT work_start_time, work_end_time FROM user_preferences WHERE id=1")
    prefs = c.fetchone()
    user_prefs = {"work_start_time": prefs[0], "work_end_time": prefs[1]}
    
    # AI�Ż�
    scheduled = ai_optimize_schedule(tasks, fixed, user_prefs)
    
    # �������ݿ�
    for s in scheduled:
        c.execute("""
            UPDATE tasks SET scheduled_start=?, scheduled_end=?
            WHERE id=?
        """, (s["scheduled_start"], s["scheduled_end"], s["id"]))
    
    conn.commit()
    conn.close()
    
    socketio.emit("schedule_updated", {"status": "ok"})
    return jsonify({"status": "ok", "scheduled": scheduled})

# ===========================
# ·�ɣ�AI����
# ===========================
@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_msg = data.get("message")
    
    # ��ȡ�Ի���ʷ
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        SELECT role, content FROM chat_history 
        ORDER BY timestamp DESC LIMIT 10
    """)
    history = [{"role": r[0], "content": r[1]} for r in c.fetchall()]
    history.reverse()
    
    # ��ȡ��ǰ����������
    c.execute("""
        SELECT content, priority, status FROM tasks 
        WHERE status='pending' ORDER BY priority DESC LIMIT 5
    """)
    tasks = [{"content": r[0], "priority": r[1], "status": r[2]} for r in c.fetchall()]
    
    # ����System Prompt
    system_prompt = f"""
����һ�����ᡢ������AI���飬�����;����û������ճ̡�
��ǰʱ�䣺{datetime.now().strftime('%Y-%m-%d %H:%M')}
�û����մ�������{json.dumps(tasks, ensure_ascii=False)}

�Ը��ص㣺
- ������������˵��
- ���������֧��
- �����ػ��û�״̬
- �ṩʵ�ý���
"""
    
    # ����AI
    reply = call_deepseek(user_msg, system_prompt, temperature=0.7)
    
    # ����Ի���ʷ
    now = datetime.now().isoformat()
    c.execute("INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)",
              ("user", user_msg, now))
    c.execute("INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)",
              ("assistant", reply, now))
    conn.commit()
    conn.close()
    
    return jsonify({"reply": reply})

# ===========================
# ·�ɣ��û�ƫ��
# ===========================
@app.route("/preferences", methods=["GET", "POST"])
def preferences():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    if request.method == "POST":
        data = request.json
        c.execute("""
            UPDATE user_preferences SET
            work_start_time=?, work_end_time=?, sleep_reminder_time=?,
            auto_reschedule_on_drag=?, enable_main_chat=?
            WHERE id=1
        """, (
            data.get("work_start_time"),
            data.get("work_end_time"),
            data.get("sleep_reminder_time"),
            data.get("auto_reschedule_on_drag"),
            data.get("enable_main_chat")
        ))
        conn.commit()
        conn.close()
        return jsonify({"status": "ok"})
    
    else:
        c.execute("SELECT * FROM user_preferences WHERE id=1")
        row = c.fetchone()
        conn.close()
        if row:
            return jsonify({
                "work_start_time": row[1],
                "work_end_time": row[2],
                "break_duration": row[3],
                "focus_time_preference": row[4],
                "enable_main_chat": row[5],
                "sleep_reminder_time": row[6],
                "auto_reschedule_on_drag": row[7]
            })
        return jsonify({})

# ===========================
# ·�ɣ�AI�����Ի�API
# ===========================
@app.route("/api/ai/greeting/morning", methods=["GET"])
def get_morning_greeting():
    """��ȡ�糿�ʺ�"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # ��ȡ������������
    c.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'")
    count = c.fetchone()[0]
    
    # ��ȡ�����ȼ�����
    c.execute("""
        SELECT content FROM tasks 
        WHERE status='pending' AND priority='high'
        LIMIT 3
    """)
    high_tasks = [r[0] for r in c.fetchall()]
    
    # ��ȡ�û�ƫ��
    c.execute("SELECT enable_main_chat FROM user_preferences WHERE id=1")
    enable_chat = c.fetchone()[0]
    conn.close()
    
    # ��������������Ի������ؿ�����
    if not enable_chat:
        return jsonify({"content": ""})
    
    # �����ʺ���
    message = f"���Ϻã�������{count}����������"
    if high_tasks:
        message += f"������Ҫ���ǣ�{high_tasks[0]}"
    message += "��ף�����һ��˳����"
    
    return jsonify({"content": message})

@app.route("/api/ai/greeting/sleep", methods=["GET"])
def get_sleep_greeting():
    """��ȡ˯ǰ����"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # ��ȡ�������������
    c.execute("""
        SELECT COUNT(*) FROM tasks 
        WHERE status='completed' AND DATE(completed_at)=DATE('now')
    """)
    completed = c.fetchone()[0]
    
    # ��ȡ����������
    c.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'")
    pending = c.fetchone()[0]
    
    # ��ȡ�û�ƫ��
    c.execute("SELECT enable_main_chat FROM user_preferences WHERE id=1")
    enable_chat = c.fetchone()[0]
    conn.close()
    
    # ��������������Ի������ؿ�����
    if not enable_chat:
        return jsonify({"content": ""})
    
    # ����������Ϣ
    message = f"���������{completed}�����񣬻���{pending}�����졣"
    message += "������һ�죬�����Ϣ������������ͣ�"
    
    return jsonify({"content": message})

@app.route("/api/ai/reminders/task_start", methods=["GET"])
def get_task_start_reminders():
    """��ȡ������ʼ����������"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # ��ȡ��ǰʱ��
    now = datetime.now()
    now_str = now.isoformat()
    
    # ��ȡδ��5������Ҫ��ʼ������
    c.execute("""
        SELECT content, scheduled_start 
        FROM tasks 
        WHERE status='pending' 
        AND scheduled_start IS NOT NULL
        AND scheduled_start BETWEEN ? AND ?
    """, (now_str, (now + timedelta(minutes=5)).isoformat()))
    upcoming_tasks = c.fetchall()
    
    # ��ȡ�û�ƫ��
    c.execute("SELECT enable_main_chat FROM user_preferences WHERE id=1")
    enable_chat = c.fetchone()[0]
    conn.close()
    
    reminders = []
    
    # ��������������Ի������ؿ�����
    if not enable_chat:
        return jsonify({"reminders": reminders})
    
    # ����������Ϣ
    for task_content, start_time in upcoming_tasks:
        reminders.append(f"�쵽ʱ���ˣ�׼����ʼ'" + task_content + "'�ɣ�")
    
    return jsonify({"reminders": reminders})

@app.route("/api/ai/schedule/optimize", methods=["POST"])
def api_ai_optimize_schedule():
    """AI�Ż�����API"""
    try:
        data = request.json
        date_str = data.get("date")
        target_date = datetime.fromisoformat(date_str)
        
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        
        # ��ȡ����Ĺ̶��ճ�
        day_of_week = target_date.weekday() + 1  # 1-7��ʾ��һ������
        c.execute("""
            SELECT title, start_time, end_time 
            FROM fixed_schedules 
            WHERE day_of_week=?
        """, (day_of_week,))
        fixed_schedules = c.fetchall()
        
        # ��ȡ�����ŵ�����
        c.execute("""
            SELECT id, content, category, priority, estimated_duration 
            FROM tasks 
            WHERE status='pending' 
            AND scheduled_start IS NULL
            ORDER BY 
                CASE priority 
                    WHEN 'high' THEN 1 
                    WHEN 'medium' THEN 2 
                    WHEN 'low' THEN 3 
                END
        """)
        tasks = c.fetchall()
        
        # ��ȡ�û�ƫ��
        c.execute("SELECT work_start_time, work_end_time FROM user_preferences WHERE id=1")
        prefs = c.fetchone()
        work_start = datetime.strptime(prefs[0], "%H:%M").time()
        work_end = datetime.strptime(prefs[1], "%H:%M").time()
        
        # ��������͹̶��ճ�����
        tasks_data = []
        for task in tasks:
            tasks_data.append({
                "id": task[0],
                "content": task[1],
                "category": task[2],
                "priority": task[3],
                "estimated_duration": task[4]
            })
        
        # ת��ΪAI�����ĸ�ʽ
        context = {
            "date": target_date.strftime("%Y-%m-%d"),
            "day_of_week": day_of_week,
            "work_hours": {
                "start": prefs[0],
                "end": prefs[1]
            },
            "fixed_schedules": [
                {
                    "title": fs[0],
                    "start_time": fs[1],
                    "end_time": fs[2]
                } for fs in fixed_schedules
            ],
            "tasks": tasks_data
        }
        
        # ����AI�Ż�����
        optimized_schedule = ai_optimize_schedule(tasks_data, fixed_schedules, context)
        
        # �������ݿ�
        for task in optimized_schedule:
            c.execute("""
                UPDATE tasks SET 
                scheduled_start=?, 
                scheduled_end=? 
                WHERE id=?
            """, (task["scheduled_start"], task["scheduled_end"], task["id"]))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True,
            "scheduled": optimized_schedule
        })
        
    except Exception as e:
        print(f"�Ż�����ʧ��: {str(e)}")
        return jsonify({
            "success": False,
            "message": str(e)
        })

# ===========================
# ��ʱ���������Ի�
# ===========================
scheduler = BackgroundScheduler()

def morning_greeting():
    """�糿�ʺ�"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'")
    count = c.fetchone()[0]
    c.execute("""
        SELECT content FROM tasks 
        WHERE status='pending' AND priority='high'
        LIMIT 3
    """)
    high_tasks = [r[0] for r in c.fetchall()]
    conn.close()
    
    message = f"���Ϻã�������{count}����������"
    if high_tasks:
        message += f"������Ҫ���ǣ�{high_tasks[0]}"
    
    socketio.emit("ai_message", {"message": message, "type": "greeting"})

def sleep_reminder():
    """˯ǰ����"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        SELECT COUNT(*) FROM tasks 
        WHERE status='completed' AND DATE(completed_at)=DATE('now')
    """)
    completed = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'")
    pending = c.fetchone()[0]
    conn.close()
    
    message = f"���������{completed}�����񣬻���{pending}�����졣�����Ϣ������������ͣ�"
    socketio.emit("ai_message", {"message": message, "type": "sleep"})

# ע�ᶨʱ����
scheduler.add_job(morning_greeting, 'cron', hour=8, minute=0)
scheduler.add_job(sleep_reminder, 'cron', hour=22, minute=0)
scheduler.start()

# ===========================
# ��������
# ===========================
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)