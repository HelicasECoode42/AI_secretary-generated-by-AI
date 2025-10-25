# -*- coding: utf-8 -*-
"""
AI秘书 MVP 后端
模块化设计，易于维护和扩展
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
# 数据库初始化
# ===========================
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 任务表
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
    
    # 固定日程表
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
    
    # 用户偏好
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
    
    # 对话历史
    c.execute('''CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT,
        content TEXT,
        timestamp TEXT
    )''')
    
    # 初始化用户偏好（如果不存在）
    c.execute("INSERT OR IGNORE INTO user_preferences (id) VALUES (1)")
    
    conn.commit()
    conn.close()

init_db()

# ===========================
# 工具函数：DeepSeek API调用
# ===========================
def call_deepseek(prompt, system_prompt=None, temperature=0.0):
    """统一的DeepSeek API调用"""
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
        return f"API调用失败: {str(e)}"

# ===========================
# AI模块：任务解析
# ===========================
def analyze_task(text):
    """
    AI解析任务：分类、优先级、预计时长、截止日期
    """
    prompt = f"""
请将以下用户输入解析为JSON格式，包含以下字段：
- task: 任务简短描述
- category: 分类（工作/学习/生活/其他）
- priority: 优先级（high/medium/low）
- estimated_duration: 预计时长（格式：30m 或 2h）
- deadline: 截止日期（ISO格式或null）

用户输入：{text}

仅返回JSON，不要其他说明。
"""
    
    result = call_deepseek(prompt)
    
    try:
        # 清理可能的markdown代码块
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        
        parsed = json.loads(result.strip())
        
        # 解析deadline
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
            "category": "未分类",
            "priority": "medium",
            "estimated_duration": "1h",
            "deadline_iso": None,
            "error": str(e)
        }

# ===========================
# AI模块：OCR识别课表
# ===========================
def ocr_schedule_image(image_data):
    """
    使用Tesseract OCR识别课表图片
    返回识别的文本，再用AI解析为结构化数据
    """
    try:
        # 解码base64图片
        image_bytes = base64.b64decode(image_data.split(',')[1])
        image = Image.open(io.BytesIO(image_bytes))
        
        # OCR识别
        text = pytesseract.image_to_string(image, lang='chi_sim+eng')
        
        # AI解析为结构化课表
        prompt = f"""
以下是课表OCR识别结果，请解析为JSON数组，每个课程包含：
- title: 课程名称
- day_of_week: 星期几（0=周日，1=周一...6=周六）
- start_time: 开始时间（HH:MM格式）
- end_time: 结束时间（HH:MM格式）
- location: 地点（如果有）

OCR文本：
{text}

返回JSON数组格式。
"""
        result = call_deepseek(prompt)
        
        # 清理并解析
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        
        schedules = json.loads(result.strip())
        return {"success": True, "schedules": schedules, "raw_text": text}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ===========================
# 排期算法：本地贪心算法
# ===========================
def greedy_schedule(tasks, fixed_schedules, work_start, work_end):
    """
    贪心算法：按优先级和截止日期排序，依次找可用时段
    """
    # 解析工作时间
    work_start_minutes = time_to_minutes(work_start)
    work_end_minutes = time_to_minutes(work_end)
    
    # 获取今天日期
    today = datetime.now().date()
    
    # 按优先级和截止日期排序
    priority_map = {"high": 3, "medium": 2, "low": 1}
    sorted_tasks = sorted(
        tasks,
        key=lambda t: (
            -priority_map.get(t.get("priority", "medium"), 2),
            t.get("deadline") or "9999-12-31"
        )
    )
    
    # 构建已占用时间段（固定日程）
    occupied = []
    for fs in fixed_schedules:
        if fs.get("day_of_week") == today.weekday():
            start_min = time_to_minutes(fs["start_time"])
            end_min = time_to_minutes(fs["end_time"])
            occupied.append((start_min, end_min))
    
    occupied.sort()
    
    # 为每个任务分配时间
    scheduled = []
    current_time = work_start_minutes
    
    for task in sorted_tasks:
        duration = duration_to_minutes(task.get("estimated_duration", "1h"))
        
        # 寻找可用时段
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
    """将HH:MM转为分钟数"""
    h, m = map(int, time_str.split(':'))
    return h * 60 + m

def minutes_to_time(minutes):
    """将分钟数转为HH:MM"""
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

def duration_to_minutes(duration_str):
    """将1h或30m转为分钟数"""
    if 'h' in duration_str:
        return int(duration_str.replace('h', '')) * 60
    elif 'm' in duration_str:
        return int(duration_str.replace('m', ''))
    return 60

def find_available_slot(start, duration, end, occupied):
    """在occupied时间段中找到可用的duration长度的时段"""
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
# AI排期优化
# ===========================
def ai_optimize_schedule(tasks, fixed_schedules, user_prefs):
    """
    调用AI进行智能排期优化
    """
    prompt = f"""
你是一个时间管理专家，请为用户安排今日任务。

工作时间：{user_prefs['work_start_time']} - {user_prefs['work_end_time']}

固定日程（不可占用）：
{json.dumps(fixed_schedules, ensure_ascii=False, indent=2)}

待安排任务：
{json.dumps(tasks, ensure_ascii=False, indent=2)}

排期规则：
1. 高优先级任务优先
2. 尊重截止日期
3. 避开固定日程
4. 早上精力好，安排难任务
5. 相同分类任务连续安排，减少切换

返回JSON数组，每个元素包含：
- id: 任务ID
- scheduled_start: 开始时间（HH:MM）
- scheduled_end: 结束时间（HH:MM）
- reason: 安排理由（简短）
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
# 路由：首页
# ===========================
@app.route("/")
def index():
    return render_template("index.html")

# ===========================
# 路由：固定日程管理
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
    """OCR识别课表图片"""
    data = request.json
    image_data = data.get("image")
    result = ocr_schedule_image(image_data)
    return jsonify(result)

# ===========================
# 路由：任务管理
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
    
    # AI解析任务
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
# 路由：自动排期
# ===========================
@app.route("/auto_schedule", methods=["POST"])
def auto_schedule():
    """本地贪心算法排期"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 获取待排期任务
    c.execute("""
        SELECT id, content, category, priority, estimated_duration, deadline
        FROM tasks WHERE status='pending' AND scheduled_start IS NULL
    """)
    tasks = [{
        "id": r[0], "content": r[1], "category": r[2],
        "priority": r[3], "estimated_duration": r[4], "deadline": r[5]
    } for r in c.fetchall()]
    
    # 获取固定日程
    today = datetime.now().weekday()
    c.execute("""
        SELECT title, start_time, end_time, day_of_week
        FROM fixed_schedules WHERE day_of_week=?
    """, (today,))
    fixed = [{
        "title": r[0], "start_time": r[1],
        "end_time": r[2], "day_of_week": r[3]
    } for r in c.fetchall()]
    
    # 获取用户偏好
    c.execute("SELECT work_start_time, work_end_time FROM user_preferences WHERE id=1")
    prefs = c.fetchone()
    work_start = prefs[0] if prefs else "09:00"
    work_end = prefs[1] if prefs else "18:00"
    
    # 执行排期
    scheduled = greedy_schedule(tasks, fixed, work_start, work_end)
    
    # 更新数据库
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
    """AI优化排期"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 获取数据（同上）
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
    
    # AI优化
    scheduled = ai_optimize_schedule(tasks, fixed, user_prefs)
    
    # 更新数据库
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
# 路由：AI聊天
# ===========================
@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_msg = data.get("message")
    
    # 获取对话历史
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        SELECT role, content FROM chat_history 
        ORDER BY timestamp DESC LIMIT 10
    """)
    history = [{"role": r[0], "content": r[1]} for r in c.fetchall()]
    history.reverse()
    
    # 获取当前任务上下文
    c.execute("""
        SELECT content, priority, status FROM tasks 
        WHERE status='pending' ORDER BY priority DESC LIMIT 5
    """)
    tasks = [{"content": r[0], "priority": r[1], "status": r[2]} for r in c.fetchall()]
    
    # 构建System Prompt
    system_prompt = f"""
你是一个温柔、鼓励的AI秘书，帮助低精力用户管理日程。
当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}
用户今日待办任务：{json.dumps(tasks, ensure_ascii=False)}

性格特点：
- 温柔体贴，不说教
- 给予鼓励和支持
- 主动关怀用户状态
- 提供实用建议
"""
    
    # 调用AI
    reply = call_deepseek(user_msg, system_prompt, temperature=0.7)
    
    # 保存对话历史
    now = datetime.now().isoformat()
    c.execute("INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)",
              ("user", user_msg, now))
    c.execute("INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)",
              ("assistant", reply, now))
    conn.commit()
    conn.close()
    
    return jsonify({"reply": reply})

# ===========================
# 路由：用户偏好
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
# 路由：AI主动对话API
# ===========================
@app.route("/api/ai/greeting/morning", methods=["GET"])
def get_morning_greeting():
    """获取早晨问候"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 获取待办任务数量
    c.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'")
    count = c.fetchone()[0]
    
    # 获取高优先级任务
    c.execute("""
        SELECT content FROM tasks 
        WHERE status='pending' AND priority='high'
        LIMIT 3
    """)
    high_tasks = [r[0] for r in c.fetchall()]
    
    # 获取用户偏好
    c.execute("SELECT enable_main_chat FROM user_preferences WHERE id=1")
    enable_chat = c.fetchone()[0]
    conn.close()
    
    # 如果禁用了主动对话，返回空内容
    if not enable_chat:
        return jsonify({"content": ""})
    
    # 构建问候语
    message = f"早上好！今天有{count}个待办任务"
    if high_tasks:
        message += f"，最重要的是：{high_tasks[0]}"
    message += "。祝你今天一切顺利！"
    
    return jsonify({"content": message})

@app.route("/api/ai/greeting/sleep", methods=["GET"])
def get_sleep_greeting():
    """获取睡前复盘"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 获取今日完成任务数
    c.execute("""
        SELECT COUNT(*) FROM tasks 
        WHERE status='completed' AND DATE(completed_at)=DATE('now')
    """)
    completed = c.fetchone()[0]
    
    # 获取待办任务数
    c.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'")
    pending = c.fetchone()[0]
    
    # 获取用户偏好
    c.execute("SELECT enable_main_chat FROM user_preferences WHERE id=1")
    enable_chat = c.fetchone()[0]
    conn.close()
    
    # 如果禁用了主动对话，返回空内容
    if not enable_chat:
        return jsonify({"content": ""})
    
    # 构建复盘消息
    message = f"今天完成了{completed}个任务，还有{pending}个待办。"
    message += "辛苦了一天，早点休息，明天继续加油！"
    
    return jsonify({"content": message})

@app.route("/api/ai/reminders/task_start", methods=["GET"])
def get_task_start_reminders():
    """获取即将开始的任务提醒"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 获取当前时间
    now = datetime.now()
    now_str = now.isoformat()
    
    # 获取未来5分钟内要开始的任务
    c.execute("""
        SELECT content, scheduled_start 
        FROM tasks 
        WHERE status='pending' 
        AND scheduled_start IS NOT NULL
        AND scheduled_start BETWEEN ? AND ?
    """, (now_str, (now + timedelta(minutes=5)).isoformat()))
    upcoming_tasks = c.fetchall()
    
    # 获取用户偏好
    c.execute("SELECT enable_main_chat FROM user_preferences WHERE id=1")
    enable_chat = c.fetchone()[0]
    conn.close()
    
    reminders = []
    
    # 如果禁用了主动对话，返回空提醒
    if not enable_chat:
        return jsonify({"reminders": reminders})
    
    # 构建提醒消息
    for task_content, start_time in upcoming_tasks:
        reminders.append(f"快到时间了，准备开始'" + task_content + "'吧！")
    
    return jsonify({"reminders": reminders})

@app.route("/api/ai/schedule/optimize", methods=["POST"])
def api_ai_optimize_schedule():
    """AI优化排期API"""
    try:
        data = request.json
        date_str = data.get("date")
        target_date = datetime.fromisoformat(date_str)
        
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        
        # 获取当天的固定日程
        day_of_week = target_date.weekday() + 1  # 1-7表示周一到周日
        c.execute("""
            SELECT title, start_time, end_time 
            FROM fixed_schedules 
            WHERE day_of_week=?
        """, (day_of_week,))
        fixed_schedules = c.fetchall()
        
        # 获取待安排的任务
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
        
        # 获取用户偏好
        c.execute("SELECT work_start_time, work_end_time FROM user_preferences WHERE id=1")
        prefs = c.fetchone()
        work_start = datetime.strptime(prefs[0], "%H:%M").time()
        work_end = datetime.strptime(prefs[1], "%H:%M").time()
        
        # 构建任务和固定日程数据
        tasks_data = []
        for task in tasks:
            tasks_data.append({
                "id": task[0],
                "content": task[1],
                "category": task[2],
                "priority": task[3],
                "estimated_duration": task[4]
            })
        
        # 转换为AI可理解的格式
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
        
        # 调用AI优化排期
        optimized_schedule = ai_optimize_schedule(tasks_data, fixed_schedules, context)
        
        # 更新数据库
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
        print(f"优化排期失败: {str(e)}")
        return jsonify({
            "success": False,
            "message": str(e)
        })

# ===========================
# 定时任务：主动对话
# ===========================
scheduler = BackgroundScheduler()

def morning_greeting():
    """早晨问候"""
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
    
    message = f"早上好！今天有{count}个待办任务"
    if high_tasks:
        message += f"，最重要的是：{high_tasks[0]}"
    
    socketio.emit("ai_message", {"message": message, "type": "greeting"})

def sleep_reminder():
    """睡前复盘"""
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
    
    message = f"今天完成了{completed}个任务，还有{pending}个待办。早点休息，明天继续加油！"
    socketio.emit("ai_message", {"message": message, "type": "sleep"})

# 注册定时任务
scheduler.add_job(morning_greeting, 'cron', hour=8, minute=0)
scheduler.add_job(sleep_reminder, 'cron', hour=22, minute=0)
scheduler.start()

# ===========================
# 启动服务
# ===========================
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)