import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, MessageSquare, Trash2, Settings as SettingsIcon, Send, Bot, User, Menu, Paperclip, Moon, Sun, X, Search, Folder } from 'lucide-react';

interface Message { role: 'user' | 'assistant'; content: string; }
interface Session { id: string; title: string; }
interface ApiConfig { provider: string; api_key: string; base_url: string; model: string; }

// KODE DINAMIS: Otomatis mendeteksi IP (untuk HP) atau localhost (untuk PC)
const API_BASE_URL = `http://${window.location.hostname}:8000`;

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Deteksi layar HP untuk default sidebar tertutup
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  
  // Fitur
  const [isDark, setIsDark] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("Anda adalah asisten AI yang membantu, cerdas, dan ramah.");
  const [uploading, setUploading] = useState(false);
  const [fileUploaded, setFileUploaded] = useState<string | null>(null);
  
  const [config, setConfig] = useState<ApiConfig>({
    provider: 'ollama', api_key: '', base_url: 'https://api.openai.com/v1', model: 'qwen2.5:1.5b'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Theme
  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  useEffect(() => { fetchSessions(); }, []);
  useEffect(() => {
    if (currentSessionId) {
      fetch(`${API_BASE_URL}/api/sessions/${currentSessionId}/messages`).then(res => res.json()).then(data => setMessages(data));
    } else setMessages([]);
  }, [currentSessionId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`);
      setSessions(await res.json());
    } catch (e) { console.error("Backend mati atau belum siap."); }
  };

  const createNewSession = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`, { method: 'POST' });
      const newSession = await res.json();
      setSessions([newSession, ...sessions]);
      setCurrentSessionId(newSession.id);
      setFileUploaded(null);
    } catch (e) { alert("Gagal membuat chat baru. Pastikan Backend menyala."); }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE_URL}/api/sessions/${id}`, { method: 'DELETE' });
      setSessions(sessions.filter(s => s.id !== id));
      if (currentSessionId === id) setCurrentSessionId(null);
    } catch (e) { console.error(e); }
  };

  // FITUR UPLOAD DOKUMEN
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let activeId = currentSessionId;
    if (!activeId) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions`, { method: 'POST' });
        const newSession = await res.json();
        activeId = newSession.id;
        setSessions([newSession, ...sessions]);
        setCurrentSessionId(activeId);
      } catch (err) { return alert("Gagal koneksi ke backend"); }
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("session_id", activeId);
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.status === 'success') {
        setFileUploaded(data.filename);
      } else {
        alert(data.error);
      }
    } catch (err) { alert("Gagal upload file. Pastikan Backend menyala."); } 
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions`, { method: 'POST' });
        const newSession = await res.json();
        activeSessionId = newSession.id;
        setSessions([newSession, ...sessions]);
        setCurrentSessionId(activeSessionId);
      } catch (err) { return alert("Gagal koneksi ke backend"); }
    }

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages); setInput(''); setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: activeSessionId, message: userMessage.content, messages: newMessages.slice(-10),
          provider: config.provider, api_key: config.api_key, base_url: config.base_url, model: config.model,
          system_prompt: systemPrompt
        }),
      });

      if (!response.body) throw new Error('No body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let renderTimeout: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                assistantContent += parsed.token;
                if (!renderTimeout) {
                  renderTimeout = setTimeout(() => {
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                      return updated;
                    });
                    renderTimeout = null;
                  }, 50);
                }
              }
            } catch (e) {}
          }
        }
      }
      setMessages((prev) => { const up = [...prev]; up[up.length - 1] = { role: 'assistant', content: assistantContent }; return up; });
      fetchSessions();
    } catch (error) {
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: 'Error koneksi ke server. Pastikan Backend menyala.' }]);
    } finally { setIsLoading(false); }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? 'dark' : ''}`}>
      <div className="flex w-full bg-[#f9fafb] dark:bg-[#111827] text-[#111827] dark:text-gray-100 transition-colors duration-200">
        
        {/* SIDEBAR (Dengan Menu Baru) */}
        <aside className={`absolute md:relative z-20 h-full ${sidebarOpen ? 'w-64' : 'w-0'} bg-[#f3f4f6] dark:bg-[#1f2937] border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col flex-shrink-0 overflow-hidden`}>
          <div className="p-3 space-y-1">
            {/* Tombol New Chat */}
            <button onClick={createNewSession} className="w-full flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-all mb-2">
              <Plus size={16} /> New Chat
            </button>

            {/* MENU BARU */}
            <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg text-sm font-medium transition-colors">
              <Search size={16} /> Search
            </button>
            
            <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg text-sm font-medium transition-colors">
              <Folder size={16} /> Projects
            </button>

            {/* Garis Pembatas */}
            <div className="h-px bg-gray-200 dark:bg-gray-700 my-2"></div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-1">Recents</p>
          </div>

          {/* Area Riwayat Chat */}
          <div className="flex-1 overflow-y-auto px-3 space-y-1">
            {sessions.map(s => (
              <div key={s.id} onClick={() => { setCurrentSessionId(s.id); setFileUploaded(null); if(window.innerWidth < 768) setSidebarOpen(false); }} className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${currentSessionId === s.id ? 'bg-gray-200/70 dark:bg-gray-700 text-black dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2 truncate"><MessageSquare size={14} className="flex-shrink-0 opacity-50" /><span className="truncate">{s.title}</span></div>
                <button onClick={(e) => deleteSession(e, s.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"><SettingsIcon size={16} /> Settings</button>
            <button onClick={() => setIsDark(!isDark)} className="p-2 text-gray-500 hover:text-black dark:hover:text-white">{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </aside>

        {/* MAIN AREA */}
        <div className="flex-1 flex flex-col h-full relative min-w-0">
          <header className="bg-white/80 dark:bg-[#1f2937]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 h-14 flex items-center px-4 shrink-0">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-3 text-gray-500 hover:text-black dark:hover:text-white"><Menu size={20} /></button>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-semibold tracking-tight">Local Assistant</h1>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-2 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
              {messages.length === 0 && (
                <div className="text-center mt-32 space-y-4 animate-fade-in">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black dark:bg-white rounded-xl mx-auto flex items-center justify-center mb-4 sm:mb-6 shadow-lg"><Bot size={20} className="text-white dark:text-black" /></div>
                  <h2 className="text-xl sm:text-2xl font-semibold">Ada yang bisa saya bantu?</h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto px-4">Unggah PDF/TXT lalu tanyakan isinya, atau ubah System Prompt di Settings.</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <div key={index} className={`flex gap-3 sm:gap-4 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1 ${msg.role === 'user' ? 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200' : 'bg-blue-600 text-white'}`}>
                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block text-left text-[13px] sm:text-sm leading-relaxed ${msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-800 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl rounded-tr-sm' : 'pt-1.5'}`}>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content || (isLoading && index === messages.length - 1 ? '●' : '')}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </main>

          <footer className="bg-gradient-to-t from-[#f9fafb] dark:from-[#111827] via-[#f9fafb] dark:via-[#111827] to-transparent pt-2 sm:pt-4 pb-4 sm:pb-6 shrink-0">
            <div className="max-w-3xl mx-auto px-2 sm:px-4">
              
              {/* INDIKATOR FILE TERUPLOAD */}
              {fileUploaded && (
                <div className="flex items-center gap-2 mb-2 animate-fade-in px-1">
                  <span className="flex items-center gap-1.5 text-[10px] sm:text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-md border border-green-200 dark:border-green-800">
                    📄 {fileUploaded}
                    <button onClick={() => setFileUploaded(null)} className="hover:text-green-900 dark:hover:text-green-200">
                      <X size={10} />
                    </button>
                  </span>
                </div>
              )}

              <div className="relative flex items-end bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm focus-within:ring-1 focus-within:ring-gray-400 transition-all overflow-hidden">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt" className="hidden" />
                
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-3 text-gray-400 hover:text-black dark:hover:text-white disabled:opacity-50">
                  <Paperclip size={16} className="sm:w-[18px] sm:h-[18px]" />
                </button>
                
                <textarea
                  ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter' && !e.shiftKey) { 
                      e.preventDefault(); 
                      sendMessage(); 
                    } 
                  }}
                  placeholder={uploading ? "Membaca..." : "Ketik pesan..."} disabled={isLoading || uploading} rows={1}
                  className="w-full max-h-32 py-3 sm:py-3.5 pr-2 sm:pr-4 bg-transparent border-none focus:ring-0 resize-none text-[13px] sm:text-sm placeholder-gray-400"
                  style={{ outline: 'none' }}
                />
                <button onClick={sendMessage} disabled={isLoading || !input.trim() || uploading} className="m-2 p-2 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors">
                  <Send size={14} className="sm:w-4 sm:h-4" />
                </button>
              </div>
              <p className="text-center text-[9px] sm:text-[11px] text-gray-400 mt-2 sm:mt-3 font-medium">AI dapat membuat kesalahan.</p>
            </div>
          </footer>
        </div>
      </div>

      {showSettings && (
        <SettingsModal config={config} systemPrompt={systemPrompt} onSave={(newConfig, newPrompt) => { setConfig(newConfig); setSystemPrompt(newPrompt); setShowSettings(false); }} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function SettingsModal({ config, systemPrompt, onSave, onClose }: { config: ApiConfig, systemPrompt: string, onSave: (c: ApiConfig, p: string) => void, onClose: () => void }) {
  const [localConfig, setLocalConfig] = useState(config);
  const [localPrompt, setLocalPrompt] = useState(systemPrompt);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/test-connection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: localConfig.provider, api_key: localConfig.api_key, base_url: localConfig.base_url }) });
      setTestResult(await res.json());
    } catch (e) { setTestResult({ success: false, message: "Gagal menghubungi backend." }); } finally { setIsTesting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden dark:text-white">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-base font-semibold">Pengaturan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {/* System Prompt */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">System Prompt (Persona AI)</label>
            <textarea value={localPrompt} onChange={(e) => setLocalPrompt(e.target.value)} rows={3}
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white outline-none resize-none" 
              placeholder="Contoh: Anda adalah seorang programmer senior..." />
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Provider Config */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Tipe Provider</label>
            <select value={localConfig.provider} onChange={(e) => setLocalConfig({...localConfig, provider: e.target.value, api_key: '', base_url: e.target.value === 'ollama' ? '' : 'https://api.openai.com/v1', model: e.target.value === 'ollama' ? 'qwen2.5:1.5b' : ''})}
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white outline-none">
              <option value="ollama">Ollama (Local)</option>
              <option value="custom">Custom OpenAI-Compatible</option>
            </select>
          </div>
          {localConfig.provider === 'custom' && (
            <>
              <div><label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Base URL</label><input type="text" value={localConfig.base_url} onChange={(e) => setLocalConfig({...localConfig, base_url: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">API Key</label><input type="password" value={localConfig.api_key} onChange={(e) => setLocalConfig({...localConfig, api_key: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Nama Model</label><input type="text" value={localConfig.model} onChange={(e) => setLocalConfig({...localConfig, model: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none" /></div>
            </>
          )}
          {testResult && <div className={`p-3 rounded-lg text-sm font-medium ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{testResult.message}</div>}
        </div>
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button onClick={handleTest} disabled={isTesting} className="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg py-2 text-sm font-medium transition-colors">{isTesting ? 'Menguji...' : 'Test Koneksi'}</button>
          <button onClick={() => onSave(localConfig, localPrompt)} className="flex-1 bg-black dark:bg-white text-white dark:text-black rounded-lg py-2 text-sm font-medium hover:bg-gray-800 transition-colors">Simpan</button>
        </div>
      </div>
    </div>
  );
}
