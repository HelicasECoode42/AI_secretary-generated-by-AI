import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional

class Database:
    def __init__(self, db_path='ai_secretary.db'):
        self.db_path = db_path
        self.init_db()
    
    def get_connection(self):
        return sqlite3.connect(self.db_path)
    
    def init_db(self):
        """初始化数据库表"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # 任务表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                category TEXT DEFAULT '工作',
                priority TEXT DEFAULT 'medium',
                estimated_duration INTEGER DEFAULT 60,
                deadline TEXT,
                scheduled_start TEXT,
                scheduled_end TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT
            )
        ''')
        
        # 固定日程表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS fixed_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                day_of_week INTEGER,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                recurrence TEXT DEFAULT 'weekly',
                location TEXT,
                source TEXT DEFAULT 'manual',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 用户偏好表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY,
                work_start_time TEXT DEFAULT '09:00',
                work_end_time TEXT DEFAULT '22:00',
                break_duration INTEGER DEFAULT 15,
                focus_time_preference TEXT DEFAULT 'morning',
                enable_main_chat INTEGER DEFAULT 1,
                do_not_disturb_start TEXT DEFAULT '13:00',
                do_not_disturb_end TEXT DEFAULT '14:00'
            )
        ''')
        
        # 插入默认偏好
        cursor.execute('SELECT COUNT(*) FROM user_preferences')
        if cursor.fetchone()[0] == 0:
            cursor.execute('''
                INSERT INTO user_preferences (id) VALUES (1)
            ''')
        
        # 对话历史表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    # ========== 任务管理 ==========
    
    def add_task(self, content: str, category: str = '工作', 
                 priority: str = 'medium', estimated_duration: int = 60,
                 deadline: str = None) -> int:
        """添加新任务"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO tasks (content, category, priority, estimated_duration, deadline)
            VALUES (?, ?, ?, ?, ?)
        ''', (content, category, priority, estimated_duration, deadline))
        task_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return task_id
    
    def get_all_tasks(self, status: str = None) -> List[Dict]:
        """获取所有任务"""
        conn = self.get_connection()
        cursor = conn.cursor()
        if status:
            cursor.execute('SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at DESC', (status,))
        else:
            cursor.execute('SELECT * FROM tasks ORDER BY priority DESC, created_at DESC')
        
        columns = [col[0] for col in cursor.description]
        tasks = [dict(zip(columns, row)) for row in cursor.fetchall()]
        conn.close()
        return tasks
    
    def update_task(self, task_id: int, **kwargs):
        """更新任务"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        allowed_fields = ['content', 'category', 'priority', 'estimated_duration', 
                         'deadline', 'scheduled_start', 'scheduled_end', 'status', 'completed_at']
        updates = []
        values = []
        
        for key, value in kwargs.items():
            if key in allowed_fields:
                updates.append(f"{key} = ?")
                values.append(value)
        
        if updates:
            values.append(task_id)
            query = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"
            cursor.execute(query, values)
            conn.commit()
        
        conn.close()
    
    def delete_task(self, task_id: int):
        """删除任务"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        conn.commit()
        conn.close()
    
    def complete_task(self, task_id: int):
        """完成任务"""
        self.update_task(task_id, status='completed', completed_at=datetime.now().isoformat())
    
    # ========== 固定日程管理 ==========
    
    def add_fixed_schedule(self, title: str, day_of_week: int, 
                          start_time: str, end_time: str,
                          recurrence: str = 'weekly', location: str = None,
                          source: str = 'manual') -> int:
        """添加固定日程"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO fixed_schedules 
            (title, day_of_week, start_time, end_time, recurrence, location, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (title, day_of_week, start_time, end_time, recurrence, location, source))
        schedule_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return schedule_id
    
    def get_all_fixed_schedules(self) -> List[Dict]:
        """获取所有固定日程"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM fixed_schedules ORDER BY day_of_week, start_time')
        
        columns = [col[0] for col in cursor.description]
        schedules = [dict(zip(columns, row)) for row in cursor.fetchall()]
        conn.close()
        return schedules
    
    def delete_fixed_schedule(self, schedule_id: int):
        """删除固定日程"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM fixed_schedules WHERE id = ?', (schedule_id,))
        conn.commit()
        conn.close()
    
    # ========== 用户偏好 ==========
    
    def get_user_preferences(self) -> Dict:
        """获取用户偏好"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM user_preferences WHERE id = 1')
        columns = [col[0] for col in cursor.description]
        prefs = dict(zip(columns, cursor.fetchone()))
        conn.close()
        return prefs
    
    def update_user_preferences(self, **kwargs):
        """更新用户偏好"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        updates = []
        values = []
        for key, value in kwargs.items():
            updates.append(f"{key} = ?")
            values.append(value)
        
        if updates:
            values.append(1)
            query = f"UPDATE user_preferences SET {', '.join(updates)} WHERE id = ?"
            cursor.execute(query, values)
            conn.commit()
        
        conn.close()
    
    # ========== 对话历史 ==========
    
    def add_chat_message(self, role: str, content: str):
        """添加对话消息"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO chat_history (role, content)
            VALUES (?, ?)
        ''', (role, content))
        conn.commit()
        conn.close()
    
    def get_chat_history(self, limit: int = 50) -> List[Dict]:
        """获取对话历史"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM chat_history 
            ORDER BY timestamp DESC 
            LIMIT ?
        ''', (limit,))
        
        columns = [col[0] for col in cursor.description]
        messages = [dict(zip(columns, row)) for row in cursor.fetchall()]
        conn.close()
        return list(reversed(messages))  # 反转为时间正序