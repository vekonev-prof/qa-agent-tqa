Чтобы начать, в BASH терминале прописываем 
claude -p "Проверь сайты из файла Сайты.txt" --output-format text | tee report.txt

claude -p "Проверь сайты из файла Сайты.txt"
Запускает агента в режиме однократного запроса, передавая ему эту команду.

--output-format text
Указывает агенту выводить результат в простом текстовом формате (без разметки, без JSON).

| (pipe)
Передаёт вывод (stdout) команды слева (агента) как входной поток для команды справа (tee).

tee report.txt
Читает свой стандартный ввод и одновременно пишет его и в терминал (stdout), и в файл report.txt. Без флага -a файл перезаписывается.


для GitHub (инструкция по установке и запуску)

markdown
# QA Agent for TQA Checks

AI-агент на базе Claude Code CLI и Playwright CLI для автоматической проверки сайтов по TQA-чеклисту (визуал, контент, техника, Figma).

## 🚀 Быстрый старт

### 1. Установите необходимое ПО
- **Node.js 18+** – [скачать](https://nodejs.org/)
- **Git Bash** (для Windows) – [скачать](https://git-scm.com/downloads/win)
- **Аккаунт Claude** – [зарегистрироваться](https://claude.ai/)
- **Аккаунт Figma** (опционально, если нужна сверка с макетами)

---

### 2. Установите Claude Code CLI
bash
npm install -g @anthropic-ai/claude-code

Проверьте установку:
bash
claude --version

---

3. Установите Playwright CLI и браузеры
bash
npm install -g @playwright/cli@latest
playwright-cli install-browser

---

4. Авторизуйтесь в Claude Code
Запустите:
bash
claude
Следуйте инструкциям в терминале: откроется браузер, где нужно войти в аккаунт Claude.

---

5. Клонируйте репозиторий
bash
git clone https://github.com/vekonev-prof/qa-agent-tqa.git
cd qa-agent-tqa

---

6. Установите Skill для Playwright CLI (обязательно!)
bash
playwright-cli install --skills
Эта команда создаст файл .claude/skills/playwright-cli/SKILL.md, который уже есть в репозитории, но лучше обновить.

---

7. Настройте Figma MCP (опционально)
Если вы планируете сверять с макетами, подключите Figma MCP:

bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
При первом запуске claude откроется браузер для авторизации в Figma.

---

8. Подготовьте файл с сайтами
Создайте файл Сайты.txt в корне проекта. Формат:
https://example.com
https://demo-site.ru | https://www.figma.com/file/abcd1234/Project-Name

Первый столбец – URL сайта.
Второй (через |) – опциональная ссылка на Figma-макет.
Можно прописать правки ниже для перепроверки

---

9. Запустите агента
bash
claude -p "Проверь сайты из файла Сайты.txt" --output-format text | tee report.txt
Вывод будет показан в терминале и одновременно сохранён в файл report.txt.
Скриншоты и снапшоты сохраняются в папку с агентом

---

10. Посмотрите отчёт
Откройте report.txt – там структурированный список багов с приоритетами и ссылками на скриншоты.

---

🧠 Структура проекта
.claude/CLAUDE.md – системный промпт (роль, алгоритм, обработка ошибок).
.claude/skills/*/SKILL.md – отдельные Skills (визуал, контент, техника, Figma).
Сайты.txt – список URL и ссылок на Figma.

---

📌 Важно
Агент не отправляет формы – только визуальная проверка валидации.
Агент проверяет не ходит по всему сайту – выбирает по 1–2 страницы из каждого типа.
Для работы с Figma нужен Pro-аккаунт (или токен доступа).

---