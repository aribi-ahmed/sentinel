# src/sentinel/services/llm.py
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.language_models.chat_models import BaseChatModel

# Load environment variables from .env file
load_dotenv()

def get_llm(model_name: str | None = None, temperature: float = 0.1) -> BaseChatModel:
    """
    Dual-provider LLM gateway.
    Switches between Groq (cloud) and Ollama (local) based on the LLM_PROVIDER env var.
    Falls back to the LLM_MODEL env var (then a known-good Groq default) when no
    explicit model_name is passed in.
    """
    provider = os.getenv("LLM_PROVIDER", "groq").lower()
    model_name = model_name or os.getenv("LLM_MODEL", "openai/gpt-oss-120b")

    if provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            raise ImportError(
                "❌ To use Ollama, please install the partner package: `pip install langchain-ollama`"
            )
        return ChatOllama(model="llama3", temperature=temperature)
    else:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("❌ Missing valid GROQ_API_KEY! Please set it in your .env file.")
        
        return ChatGroq(
            model_name=model_name,
            temperature=temperature,
            api_key=api_key
        )