from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434"
    default_model: str = "qwen2.5:1.5b"
    database_url: str = "sqlite+aiosqlite:///./chatbot.db"
    
    class Config:
        env_file = ".env"

settings = Settings()

