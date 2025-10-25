# ? AI秘书系统部署指南

## ? 系统架构

```
ai-secretary/
├── app.py                 # Flask主应用
├── database.py            # 数据库层
├── scheduler.py           # 排期算法
├── ocr_handler.py         # OCR识别
├── requirements.txt       # Python依赖
├── .env                   # 环境变量配置
├── templates/
│   └── index.html        # 前端页面
└── static/
    ├── script.js         # JavaScript逻辑
    └── style.css         # 样式表
```

---

## ?? 环境要求

- **Python**: 3.8+
- **Tesseract OCR**: 需要安装（用于课表识别）
- **DeepSeek API**: 需要API密钥（可选，用于AI功能）

---

## ? 安装步骤

### 1. 安装Python依赖

```bash
pip install -r requirements.txt
```

### 2. 安装Tesseract OCR

#### Windows:
1. 下载安装包：https://github.com/UB-Mannheim/tesseract/wiki
2. 安装到默认路径：`C:\Program Files\Tesseract-OCR\`
3. 下载中文语言包：
   - 访问 https://github.com/tesseract-ocr/tessdata
   - 下载 `chi_sim.traineddata`
   - 放到 `C:\Program Files\Tesseract-OCR\tessdata\`

#### macOS:
```bash
brew install tesseract
brew install tesseract-lang  # 中文支持
```

#### Linux:
```bash
sudo apt-get install tesseract-ocr
sudo apt-get install tesseract-ocr-chi-sim  # 中文支持
```

### 3. 配置环境变量

创建 `.env` 文件（与app.py同级）：

```env
# DeepSeek API配置（必须）
DEEPSEEK_API_KEY=your_api_key_here

# 数据库配置（可选）
DATABASE_PATH=ai_secretary.db
```

**获取DeepSeek API密钥**：
1. 访问 https://platform.deepseek.com/
2. 注册并登录
3. 创建API密钥
4. 复制密钥到 `.env` 文件

---

## ? 启动系统

```bash
python app.py
```

启动成功后访问：http://127.0.0.1:5000

---

## ? 功能使用指南

### 1?? 固定日程管理

#### 方式一：手动输入
1. 点击左侧 "?? 手动输入" 按钮
2. 填写课程信息（名称、时间、地点）
3. 点击保存

#### 方式二：OCR识别
1. 点击 "? 上传课表" 按钮
2. 上传课表截图（建议清晰、正面拍摄）
3. 系统自动识别后，可手动校对
4. 确认添加

#### 删除日程
- 在左侧列表中点击 ?? 图标即可删除

---

### 2?? 任务管理

#### 快速添加任务
在"快速添加任务"输入框中输入，支持自然语言：

```
示例：
- 写报告 2h [工作] 高优先级
- 学英语 1小时
- 买菜 30分钟 [生活] 低
```

系统会自动解析：
- **分类**：[工作] / [学习] / [生活]
- **优先级**：高/中/低
- **时长**：2h / 30m

#### 查看和筛选任务
在"总任务一览"区域：
- 按**分类**筛选
- 按**优先级**筛选
- 按**状态**筛选（待办/已完成）

#### 任务操作
- ? **完成**：点击复选框
- ?? **编辑**：点击编辑按钮，可修改详细信息
- ?? **删除**：点击删除按钮

---

### 3?? 自动排期

#### 方式一：本地算法（快速）
1. 点击 "? 自动排期" 按钮
2. 系统使用贪心算法自动安排任务到空闲时段
3. 排期结果立即显示在时间轴上

**排期规则**：
- 高优先级任务优先
- 尊重截止日期
- 避开固定日程
- 填充工作时间内的空闲时段

#### 方式二：AI优化（智能）
1. 点击 "? AI优化" 按钮
2. AI综合考虑任务类型、个人习惯等因素
3. 生成更人性化的排期方案

**注意**：AI优化需要消耗API额度

#### 清除排期
点击 "? 清除排期" 可清空所有任务的时间安排

---

### 4?? AI对话助手

#### 功能
- ? **自由对话**：询问任务建议、时间管理技巧
- ? **主动提醒**：早晨问候、睡前复盘（需后端定时任务）
- ? **数据分析**：查看今日完成情况

#### 使用方式
直接在右侧对话框输入问题，AI会根据你的当前任务给出建议。

示例对话：
```
用户：我今天任务太多了，怎么办？
AI：我看到你有5个高优先级任务。建议先完成"写报告"，它今天截止。
    其他任务可以延后或分解成小步骤。
```

---

### 5?? 时间轴视图

#### 日视图（当前实现）
- 显示24小时时间轴
- 紫色块：固定日程（不可移动）
- 彩色块：已排期任务（按优先级着色）
- 红线：当前时间
- 鼠标悬停：查看详情

#### 周视图/月视图（Phase 2）
点击顶部 "周" / "月" 按钮切换（开发中）

---

## ? 故障排查

### 问题1：OCR识别失败

**可能原因**：
- Tesseract未正确安装
- 缺少中文语言包

**解决方案**：
```bash
# 检查Tesseract是否安装
tesseract --version

# 检查语言包
tesseract --list-langs  # 应该看到 chi_sim
```

### 问题2：AI对话/排期失败

**可能原因**：
- 未配置DEEPSEEK_API_KEY
- API密钥无效
- 网络问题

**解决方案**：
1. 检查 `.env` 文件是否存在且配置正确
2. 测试API密钥：
```python
import requests
headers = {"Authorization": "Bearer your_key"}
r = requests.get("https://api.deepseek.com/v1/models", headers=headers)
print(r.json())
```

### 问题3：任务无法删除/编辑

**可能原因**：
- 前端JavaScript错误
- 数据库锁定

**解决方案**：
1. 按F12打开浏览器控制台，查看错误信息
2. 重启Flask服务
3. 检查数据库文件权限

### 问题4：时间轴不显示任务

**可能原因**：
- 任务未排期（scheduled_start为空）
- 日期选择器日期与任务日期不匹配

**解决方案**：
1. 先点击 "? 自动排期" 按钮
2. 检查日期选择器是否选择了正确日期

---

## ? 自定义配置

### 修改工作时间

进入数据库修改（或后续实现设置页面）：
```sql
UPDATE user_preferences SET 
    work_start_time = '08:00',
    work_end_time = '22:00'
WHERE id = 1;
```

### 修改主题颜色

编辑 `static/style.css`，查找关键颜色变量：
```css
/* 主色调 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* 修改为你喜欢的颜色 */
background: linear-gradient(135deg, #your_color1 0%, #your_color2 100%);
```

---

## ? 数据库说明

系统使用SQLite数据库，文件名：`ai_secretary.db`

### 主要表结构

#### tasks（任务表）
- `id`: 主键
- `content`: 任务内容
- `category`: 分类
- `priority`: 优先级
- `estimated_duration`: 预计时长（分钟）
- `deadline`: 截止日期
- `scheduled_start`: 排期开始时间
- `scheduled_end`: 排期结束时间
- `status`: 状态（pending/completed）

#### fixed_schedules（固定日程表）
- `id`: 主键
- `title`: 课程名称
- `day_of_week`: 星期几（0-6）
- `start_time`: 开始时间
- `end_time`: 结束时间
- `recurrence`: 重复规则
- `source`: 来源（manual/ocr）

#### chat_history（对话历史表）
- `id`: 主键
- `role`: 角色（user/assistant）
- `content`: 消息内容
- `timestamp`: 时间戳

---

## ? 数据备份

定期备份数据库文件：
```bash
# 复制数据库
cp ai_secretary.db backups/ai_secretary_$(date +%Y%m%d).db

# 或使用SQLite导出
sqlite3 ai_secretary.db .dump > backup.sql
```

---

## ? 开发路线图

### ? Phase 1（已完成）
- 固定日程管理（手动+OCR）
- 任务管理（CRUD+筛选）
- 24小时时间轴
- 自动排期算法
- AI对话基础

### ? Phase 2（进行中）
- 任务拖拽调整时间
- 周视图/月视图
- 网页链接导入课表

### ? Phase 3（计划中）
- AI主动对话（定时提醒）
- 睡前复盘功能
- 任务开始提醒

### ? Phase 4（未来）
- 日程复盘模块
- 能力增长追踪
- 学习日志+AI分析

---

## ? 支持与反馈

如遇问题或有建议，请：
1. 检查本文档的故障排查部分
2. 查看浏览器控制台错误信息
3. 检查Flask终端输出日志

---

## ? 更新日志

### v1.0.0 (2025-10-25)
- ? 完整前端UI
- ? 固定日程OCR识别
- ? 任务AI解析
- ? 自动排期算法
- ? AI对话功能
- ? 24小时时间轴

---

**祝你使用愉快！?**