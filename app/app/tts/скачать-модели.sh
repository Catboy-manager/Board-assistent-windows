#!/usr/bin/env bash
# скачать-модели.sh — скачивает модель piper (русский голос) для озвучки (TTS).
# Изменяет ~/.kanban-desktop/tts/ (вместо неё можно задать KANBAN_DATA_DIR).
# Требуется: curl, python3 (для piper-tts:  pip install piper-tts)
set -e
DIR="${KANBAN_DATA_DIR:-$HOME/.kanban-desktop}/tts"
mkdir -p "$DIR"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium"
echo "Скачиваю голос piper (irina, medium, ~60МБ) в $DIR ..."
curl -L --fail --retry 3 -o "$DIR/ru_RU-irina-medium.onnx"      "$BASE/ru_RU-irina-medium.onnx"
curl -L --fail --retry 3 -o "$DIR/ru_RU-irina-medium.onnx.json" "$BASE/ru_RU-irina-medium.onnx.json"
echo "Готово:"
ls -la "$DIR"
echo "Если piper-tts ещё не установлен: pip install piper-tts"