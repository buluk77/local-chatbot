# 🤖 Local AI Assistant

Aplikasi Chatbot AI cerdas yang berjalan **100% secara lokal (Offline)** di komputer Anda tanpa memerlukan GPU, dirancang dengan antarmuka yang sangat premium dan responsif (seperti Claude/ChatGPT).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![Ollama](https://img.shields.io/badge/Ollama-CPU--Only-orange)

## ✨ Fitur Utama
- **100% Offline (Local AI):** Ditenagai oleh Ollama (Qwen 1.5B) tanpa GPU.
- **Multi-Session:** Sidebar untuk mengelola banyak riwayat percakapan (tersimpan di SQLite).
- **Document Intelligence (RAG):** Unggah file PDF/TXT dan tanyakan isinya langsung ke AI.
- **Custom Provider:** Dukungan API Cloud (OpenAI, DeepSeek, Groq, dll) dengan Base URL kustom.
- **Premium UI/UX:** Desain responsif (Mobile & Desktop), Dark Mode, dan animasi Streaming yang mulus.
- **System Prompt:** Ubah persona AI menjadi "Programmer Senior", "Guru", atau apa pun yang Anda mau.

## 🛠️ Teknologi yang Digunakan
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend:** Python, FastAPI, SQLAlchemy, SQLite.
- **AI Engine:** Ollama (Model Qwen 2.5 1.5B).
- **Deployment:** Windows WSL2 (Ubuntu 22.04).

## 🚀 Cara Menjalankan (Instalasi)

### Prasyarat
- Windows 11 dengan WSL2 (Ubuntu) terinstal.
- Python 3.10+ & Node.js 20+ terinstal di dalam WSL.
- Ollama terinstal di dalam WSL.

### Langkah 1: Clone Repo
```bash
git clone https://github.com/buluk77/local-chatbot.git
cd local-chatbot
