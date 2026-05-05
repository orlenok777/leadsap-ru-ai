# 🌱 LeadSap RU — ИИ-агент для WhatsApp на Claude API

> Превращаем лиды в реальные встречи с помощью искусственного интеллекта Anthropic Claude.

[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-готов-brightgreen)]()
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)]()
[![Claude](https://img.shields.io/badge/Claude-Sonnet_4.5-purple)]()

## 🎯 Что это

Полнофункциональная платформа автоматизации лидов:
- **Лендинг на русском языке** — копия дизайна leadsap.com
- **Регистрация / вход** с JWT-авторизацией
- **Дашборд** с CRM, настройкой ИИ-агента и тестовым чатом
- **Бэкенд Node.js + Express + SQLite**
- **Интеграция Claude API** (модель claude-sonnet-4-5) для естественных диалогов с клиентами

## 🚀 Запуск за 5 минут

### Шаг 1. Клонировать репозиторий
```bash
git clone https://github.com/orlenok777/leadsap-ru-ai.git
cd leadsap-ru-ai
```

### Шаг 2. Установить зависимости
Нужен **Node.js 20 или новее** (https://nodejs.org/)
```bash
npm install
```

### Шаг 3. Получить API-ключ Anthropic Claude
1. Откройте https://console.anthropic.com/settings/keys
2. Нажмите **Create Key** → дайте имя → скопируйте ключ (формата `sk-ant-api03-...`)
3. Пополните баланс минимум на $5: https://console.anthropic.com/settings/billing

> ⚠️ Подписка Claude Max (claude.ai) — это **другое**. Для API нужен отдельный ключ и отдельный баланс.

### Шаг 4. Настроить .env
```bash
cp .env.example .env
```
Откройте `.env` в редакторе и вставьте ваш ключ:
```
ANTHROPIC_API_KEY=sk-ant-api03-ваш-ключ
JWT_SECRET=любая-длинная-случайная-строка
```

### Шаг 5. Запустить сервер
```bash
npm run dev
```

Откройте http://localhost:3000 — готово! 🎉

## 📂 Структура

```
leadsap-ru-ai/
├── index.html         # Лендинг
├── login.html         # Страница входа
├── register.html      # Регистрация
├── dashboard.html     # Личный кабинет с ИИ-чатом
├── style.css          # Все стили
├── main.js            # JS лендинга
├── server.js          # Бэкенд (Express + Claude API + SQLite)
├── package.json       # Зависимости
├── .env.example       # Шаблон конфигурации
└── README.md
```

## 🤖 Как работает ИИ-агент

1. Зарегистрируйтесь и войдите в дашборд
2. Откройте вкладку **«Настройка агента»**
3. Опишите ваш бизнес: название, услуги, часы работы
4. (Опционально) Задайте свой системный промпт для Claude
5. Откройте **«Тестировать ИИ»** и напишите сообщение как клиент
6. Claude ответит в стиле вашего бизнеса

## 📡 API эндпоинты

| Метод | URL | Что делает |
|-------|-----|------------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход (возвращает JWT) |
| GET | `/api/auth/me` | Профиль текущего пользователя |
| PATCH | `/api/auth/profile` | Обновить настройки агента |
| GET/POST | `/api/leads` | CRUD лидов |
| POST | `/api/chat/message` | **Отправить сообщение в Claude** |
| GET | `/api/chat/history/:leadId` | История переписки |
| GET/POST | `/api/appointments` | Встречи |

## 💰 Стоимость Claude API

Claude Sonnet 4.5:
- ~$3 за 1M входных токенов
- ~$15 за 1M выходных токенов

Один диалог (~10 сообщений) ≈ $0.01–0.05.
1000 лидов в месяц ≈ $30–50.

## 🌐 Деплой в облако

### Вариант А: Render.com (бесплатный план)
1. Зарегистрируйтесь на render.com
2. New → Web Service → Connect GitHub → выберите этот репо
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables: добавьте `ANTHROPIC_API_KEY` и `JWT_SECRET`

### Вариант Б: Railway / Fly.io / Vercel
Аналогично — подключите репо, добавьте переменные окружения.

### Вариант В: GitHub Pages (только лендинг, без бэкенда)
Settings → Pages → Source: Deploy from branch → main / root → Save.
Лендинг будет доступен на: `https://orlenok777.github.io/leadsap-ru-ai/`

## 🛡️ Безопасность

- НИКОГДА не коммитьте `.env` (он уже в `.gitignore`)
- Не вставляйте API-ключи в код или чат
- Меняйте `JWT_SECRET` на длинную случайную строку
- Для продакшена включите HTTPS

## 🛠 Технологии

- Node.js 20+, Express 4
- better-sqlite3 (база данных)
- @anthropic-ai/sdk (Claude API)
- bcryptjs + jsonwebtoken (авторизация)
- HTML5 + CSS3 + Vanilla JS (без фреймворков)

## 📝 Лицензия

MIT — используйте свободно.

---

**Создано с ❤️ для тех, кто хочет автоматизировать общение с клиентами.**
