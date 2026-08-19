# src/sentinel/services/llm.py
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.language_models.chat_models import BaseChatModel

# Load environment variables from .env file
load_dotenv()

def get_llm(model_name: str = "llama-3.1-8b-instant", temperature: float = 0.1) -> BaseChatModel:
    """
    Dual-provider LLM gateway.
    Switches between Groq (cloud) and Ollama (local) based on the LLM_PROVIDER env var.
    """
    provider = os.getenv("LLM_PROVIDER", "groq").lower()

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