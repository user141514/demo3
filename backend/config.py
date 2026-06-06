from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./workshop.db"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_CHAT_MODEL: str = "deepseek-chat"
    DEEPSEEK_REASONER_MODEL: str = "deepseek-reasoner"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_BASE_URL: str = "https://api.deepseek.com"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    KB_UPLOAD_DIR: str = "./uploads/knowledge"
    KB_LIGHTRAG_DIR: str = "./lightrag_storage"
    LOCAL_EMBEDDING_MODEL: str = "BAAI/bge-small-zh-v1.5"
    KB_CHUNK_SIZE: int = 1000
    KB_CHUNK_OVERLAP: int = 200

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
