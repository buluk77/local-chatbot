#!/bin/bash

# Dapatkan path direktori tempat script ini berada
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Warna untuk teks terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Memulai Local AI Chatbot...${NC}"

# 1. Pastikan Ollama berjalan di background
if ! pgrep -x "ollama" > /dev/null; then
    echo "Menyalakan Ollama di background..."
    ollama serve > /dev/null 2>&1 &
    sleep 2
fi

# 2. Buka Tab Baru untuk Backend (Uvicorn)
if command -v wt.exe &> /dev/null; then
    wt.exe -w 0 new-tab --title "Backend API" wsl.exe bash -c "cd $PROJECT_DIR/backend && source venv/bin/activate && echo 'Menjalankan Backend...' && uvicorn main:app --host 0.0.0.0 --port 8000"
    wt.exe -w 0 new-tab --title "Frontend UI" wsl.exe bash -c "cd $PROJECT_DIR/frontend && echo 'Menjalankan Frontend...' && npm run dev -- --host"
else
    gnome-terminal --tab --title="Backend API" -- bash -c "cd $PROJECT_DIR/backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000; exec bash"
    gnome-terminal --tab --title="Frontend UI" -- bash -c "cd $PROJECT_DIR/frontend && npm run dev -- --host; exec bash"
fi

echo -e "${GREEN}✅ Sistem sedang dinyalakan di tab terpisah!${NC}"
echo -e "Menunggu Frontend siap..."
sleep 5

# 3. Buka browser secara otomatis (menggunakan IP Lokal agar bisa diakses dari HP)
cmd.exe /c start http://192.168.202.47:5173

echo -e "${GREEN}🎉 Aplikasi siap digunakan di browser!${NC}"
