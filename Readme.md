# QA Agent for TQA Checks

AI-агент на базе Claude Code CLI и Playwright CLI для автоматической проверки сайтов по TQA-чеклисту (визуал, контент, техника, Figma).

**Промпты и Skills оптимизированы для минимального расхода токенов (экономия до 60%).**

## 🚀 Быстрый старт

### 1. Установите необходимое ПО

- **Node.js 18+** – [скачать](https://nodejs.org/)
- **Git Bash** (для Windows) – [скачать](https://git-scm.com/downloads/win)
- **Аккаунт Claude** – [зарегистрироваться](https://claude.ai/)
- **Аккаунт Figma** (опционально, если нужна сверка с макетами)

### 2. Установите Claude Code CLI

\`\`\`bash
npm install -g @anthropic-ai/claude-code
\`\`\`

Проверьте установку:

\`\`\`bash
claude --version
\`\`\`

### 3. Установите Playwright CLI и браузеры

\`\`\`bash
npm install -g @playwright/cli@latest
playwright-cli install-browser
\`\`\`

### 4. Авторизуйтесь в Claude Code

Запустите:

\`\`\`bash
claude
\`\`\`

Следуйте инструкциям в терминале: откроется браузер, где нужно войти в аккаунт Claude.

### 5. Клонируйте репозиторий

\`\`\`bash
git clone https://github.com/vekonev-prof/qa-agent-tqa.git
cd qa-agent-tqa
\`\`\`

### 6. Установите Skill для Playwright CLI (обязательно!)

\`\`\`bash
playwright-cli install --skills
\`\`\`

Эта команда создаст файл `.claude/skills/playwright-cli/SKILL.md` для интеграции Playwright CLI с Claude Code.

### 7. Настройте Figma MCP (опционально)

Если вы планируете сверять с макетами:

\`\`\`bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
\`\`\`

При первом запуске `claude` откроется браузер для авторизации в Figma.

### 8. Подготовьте файл с сайтами

Создайте файл `Сайты.txt` в корне проекта. Формат:

\`\`\`text
https://example.com
https://demo-site.ru | https://www.figma.com/file/abcd1234/Project-Name
\`\`\`

- Первый столбец – URL сайта.
- Второй (через `|`) – опциональная ссылка на Figma-макет.
- Можно добавить правки для перепроверки (в конце файла).

### 9. Запустите агента

\`\`\`bash
claude -p "Проверь сайты из файла Сайты.txt" --output-format text | tee report.txt
\`\`\`

Вывод будет показан в терминале и одновременно сохранён в файл `report.txt`.
Скриншоты и снапшоты сохраняются в папку `.playwright-cli/`.

### 10. Посмотрите отчёт

Откройте `report.txt` – там структурированный список багов с приоритетами и ссылками на скриншоты.

## 🧠 Как это работает

| Что делает агент | Подробнее |
|---|---|
| Выбор страниц | Проверяет только 1–2 страницы из каждого типа (шаблона) – не ходит по всему сайту |
| Проверки | Выполняет 3 группы: визуальные (visual-checks), контентные (content-checks), технические (technical-checks) |
| Figma | Сравнивает с макетом только при расхождениях (экономия токенов) |
| Скриншоты | Делает только при обнаружении проблем – не тратит токены на успешные шаги |
| Оптимизация токенов | Использует `snapshot --depth=4` и `find` вместо полного accessibility tree – экономия до 60% |
| Отчёт | Структурированный список багов с приоритетами (красный / жёлтый / зелёный) |

## 📁 Структура проекта

\`\`\`text
qa-agent-tqa/
├── .claude/
│   ├── CLAUDE.md                    # Системный промпт (роль, алгоритм, обработка ошибок)
│   └── skills/
│       ├── visual-checks/
│       │   └── SKILL.md             # Визуальные проверки
│       ├── content-checks/
│       │   └── SKILL.md             # Контентные проверки
│       ├── technical-checks/
│       │   └── SKILL.md             # Технические проверки
│       └── figma-compare/
│           └── SKILL.md             # Сравнение с Figma
├── .gitignore
├── README.md
└── Сайты.txt                        # Список URL и ссылок на Figma
\`\`\`

## 📌 Важно

- Агент не отправляет формы – только визуальная проверка валидации.
- Агент не ходит по всему сайту – выбирает 1–2 страницы из каждого типа (экономия токенов).
- Для работы с Figma нужен Pro-аккаунт (или токен доступа).
- Оптимизирован для Claude Sonnet – минимальный расход токенов.

## 🛠 Требования

- Node.js 18+
- Аккаунт Claude (Pro/Max/API)
- Git Bash (Windows) или Terminal (macOS/Linux)

## 📄 Лицензия

MIT – свободно для использования и модификации.

## 🙋‍♂️ Автор

Vladislav Konev – QA Engineer