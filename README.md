# Kanban Board — Desktop (Windows)

Application: kanban board + AI assistant (opencode) + voice input
(local faster-whisper recognition), собственный окно + system tray + autorun.
Сервер встроен и слушает только `127.0.0.1`.

## Дистрибутивы

```bash
cd kanban-desktop\windows
npm install
npm run dist
```

Появятся в `windows\dist`:
- `Kanban Board Setup ...exe` — установщик (меню «Пуск», ярлык рабочего стола);
- `Kanban Board ...exe` — portable-версия (без установки).

Если сборка идёт на Windows — всё готово к работе. Сборка возможна и с Linux
(нужен Wine), но проще собирать на Windows.

## Где что лежит

| Что | Путь |
|---|---|
| Данные доски (db.json, config.json, uploads) | `%USERPROFILE%\.kanban-desktop` |
| Проекты, которые ИИ создаёт/изменяет | `%USERPROFILE%\AI Projects` |
| Модель распознавания речи (75 МБ) | внутри папки приложения `app\stt` |

## Зависимости для полной функциональности

- **ИИ-ассистент**: бинарь `opencode.exe`. Установка:
  `curl -fsSL https://opencode.ai/install | bash` (кладёт в `%USERPROFILE%\.opencode\bin`).
  Путь находится автоматически; при необходимости укажите свой в
  `%USERPROFILE%\.kanban-desktop\config.json` → `ai.opencodeBin`.
- **Распознавание речи**: нужен `python` (Python 3) в PATH +
  `pip install faster-whisper pyav`. Без него голос запишется и уйдёт ИИ без распознанного текста.

## Работа с приложением

- Трей — иконка: открыть/скрыть окно, открыть в браузере, автозапуск, перезапуск сервера, выход.
- Закрытие окна крестиком убирает в трей.
- Глобальная клавиша `Ctrl+Shift+K` — показать/скрыть.
- Внутри всё как в веб-версии: доска, ИИ-панель, голос 🎙️ (нажмите — говорите — пауза отправит),
  wake-слово «Саша», вкладка 📁 — файлы проектов.

> Примечание: на Windows браузерное распознавание речи (Google) обычно тоже недоступно —
> приложение использует локальный серверный STT, это работает всегда.