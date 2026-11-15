from fastapi import FastAPI, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import httpx
import json
import uuid
import io
from pypdf import PdfReader

from database import get_db, init_db
from models import ChatSession, ChatMessage, Document, Project

app = FastAPI(title="Local Chatbot API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup(): await init_db()

# --- ENDPOINT PROJECTS ---
@app.get("/api/projects")
async def get_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return [{"id": p.id, "name": p.name} for p in result.scalars().all()]

@app.post("/api/projects")
async def create_project(data: dict, db: AsyncSession = Depends(get_db)):
    project_id = str(uuid.uuid4())
    new_project = Project(id=project_id, name=data.get("name", "New Project"))
    db.add(new_project)
    await db.commit()
    return {"id": project_id, "name": new_project.name}

# --- ENDPOINT UPLOAD DOKUMEN (RAG) ---
@app.post("/api/upload")
async def upload_document(
    session_id: str = Form(...), 
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db)
):
    content = await file.read()
    text = ""
    
    if file.filename.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text += page.extract_text() + "\n"
        except Exception as e:
            return {"error": f"Gagal membaca PDF: {str(e)}"}
    elif file.filename.endswith(".txt"):
        text = content.decode("utf-8")
    else:
        return {"error": "Format harus PDF atau TXT"}

    doc = Document(session_id=session_id, filename=file.filename, content=text)
    db.add(doc)
    await db.commit()
    return {"status": "success", "filename": file.filename}

# --- ENDPOINT SESSION & HISTORY ---
@app.post("/api/sessions")
async def create_session(data: dict = None, db: AsyncSession = Depends(get_db)):
    session_id = str(uuid.uuid4())
    project_id = data.get("project_id") if data else None
    new_session = ChatSession(id=session_id, title="New Chat", project_id=project_id)
    db.add(new_session)
    await db.commit()
    return {"id": session_id, "title": "New Chat", "project_id": project_id}

@app.get("/api/sessions")
async def get_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).order_by(ChatSession.created_at.desc()))
    return [{"id": s.id, "title": s.title, "project_id": s.project_id} for s in result.scalars().all()]

@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()))
    return [{"role": m.role, "content": m.content} for m in result.scalars().all()]

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(ChatMessage.__table__.delete().where(ChatMessage.session_id == session_id))
    await db.execute(ChatSession.__table__.delete().where(ChatSession.id == session_id))
    await db.execute(Document.__table__.delete().where(Document.session_id == session_id))
    await db.commit()
    return {"status": "deleted"}

@app.post("/api/test-connection")
async def test_connection(data: dict):
    provider = data.get("provider"); api_key = data.get("api_key"); base_url = data.get("base_url")
    if provider == "ollama": return {"success": True, "message": "Ollama Lokal Aktif"}
    if not api_key or not base_url: return {"success": False, "message": "API Key & Base URL wajib diisi"}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{base_url.rstrip('/')}/models", headers={"Authorization": f"Bearer {api_key}"}, timeout=10.0)
            return {"success": True, "message": "Koneksi Berhasil!"} if r.status_code == 200 else {"success": False, "message": f"Gagal: {r.status_code}"}
    except Exception as e: return {"success": False, "message": str(e)}

# --- ENDPOINT CHAT DENGAN RAG & SYSTEM PROMPT ---
@app.post("/api/chat")
async def chat(data: dict, db: AsyncSession = Depends(get_db)):
    session_id = data.get("session_id")
    user_message = data.get("message")
    messages = data.get("messages", [])
    system_prompt = data.get("system_prompt", "Anda adalah asisten AI yang membantu dan ramah.")
    
    provider = data.get("provider", "ollama")
    api_key = data.get("api_key")
    model = data.get("model", "qwen2.5:1.5b")
    base_url = data.get("base_url", "https://api.openai.com/v1")

    # LOGIKA RAG: Ambil dokumen di session ini
    context_text = ""
    if session_id:
        doc_result = await db.execute(select(Document).where(Document.session_id == session_id))
        docs = doc_result.scalars().all()
        if docs:
            context_text = "\n\n".join([f"--- DOKUMEN: {d.filename} ---\n{d.content[:5000]}" for d in docs])
            system_prompt += f"\n\nGunakan informasi dari dokumen berikut untuk menjawab pertanyaan user jika relevan:\n{context_text}"

    final_messages = [{"role": "system", "content": system_prompt}]
    for m in messages[:-1]: final_messages.append(m)
    final_messages.append({"role": "user", "content": user_message})

    if session_id and user_message:
        db.add(ChatMessage(session_id=session_id, role="user", content=user_message))
        await db.commit()

    async def save_and_stream(stream_generator):
        full_response = []
        try:
            async for chunk in stream_generator:
                yield chunk
                if chunk.startswith('data: {"token"'):
                    try: full_response.append(json.loads(chunk[6:])["token"])
                    except: pass
            if session_id and full_response:
                db.add(ChatMessage(session_id=session_id, role="assistant", content="".join(full_response)))
                await db.commit()
                result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
                sess = result.scalar_one_or_none()
                if sess and sess.title == "New Chat" and user_message:
                    sess.title = user_message[:25]
                    await db.commit()
        except Exception as e: print("Error DB:", e)

    async def stream_ollama():
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", "http://localhost:11434/api/chat", json={"model": "qwen2.5:1.5b", "messages": final_messages, "stream": True}) as response:
                async for line in response.aiter_lines():
                    if line.strip():
                        try:
                            chunk = json.loads(line)
                            if "message" in chunk and "content" in chunk["message"]:
                                yield f"data: {json.dumps({'token': chunk['message']['content']})}\n\n"
                            if chunk.get("done"): yield "data: [DONE]\n\n"
                        except: pass

    async def stream_custom():
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, headers=headers, json={"model": model, "messages": final_messages, "stream": True}) as response:
                    async for line in response.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                chunk = json.loads(line[6:])
                                token = chunk["choices"][0]["delta"].get("content", "")
                                if token: yield f"data: {json.dumps({'token': token})}\n\n"
                            except: pass
                    yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'token': f'Error: {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"

    active_stream = stream_custom() if provider != "ollama" and api_key else stream_ollama()
    return StreamingResponse(save_and_stream(active_stream), media_type="text/event-stream")
