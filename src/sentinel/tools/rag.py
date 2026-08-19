# src/sentinel/tools/rag.py
import os
import logging
from pathlib import Path
from typing import List

from langchain_core.tools import tool
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Mute HuggingFace Hub warnings & progress logs
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DB_DIR = BASE_DIR / "chroma_db"
POLICIES_DIR = BASE_DIR / "policies"

DEFAULT_POLICY = """
SENTINEL ENTERPRISE RISK ASSESSMENT POLICY (FRAMEWORK 2026)

Section 1: Valuation & Debt Risk Thresholds
- Any target company operating with a P/E Ratio > 40 is categorized as high valuation risk.
- Total Debt exceeding free cash flow by more than 5x requires mandatory ELEVATED risk classification.
- Negative free cash flow combined with high debt requires human compliance officer override.

Section 2: Legal & Litigation OSINT Standards
- Active SEC investigations, fraud allegations, or major antitrust lawsuits automatically trigger an ELEVATED risk status.
- Key executive departures under investigation require mandatory audit logging.

Section 3: Compliance & HITL Protocol
- Assessments marked ELEVATED must be reviewed and manually signed off by a Senior Compliance Officer before report generation.
"""


def load_documents() -> List[Document]:
    """Loads PDF documents from the policies/ directory or returns default policy text."""
    POLICIES_DIR.mkdir(parents=True, exist_ok=True)
    pdf_files = list(POLICIES_DIR.glob("*.pdf"))

    if pdf_files:
        # Load all PDFs found in policies/ directory
        loader = PyPDFDirectoryLoader(str(POLICIES_DIR))
        raw_docs = loader.load()

        # Chunk large PDFs (e.g., 50+ page filings) into sub-documents for RAG retrieval
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        docs = text_splitter.split_documents(raw_docs)
        print(f"📄 Loaded {len(docs)} text chunks from {len(pdf_files)} PDF file(s).")
    else:
        # Fallback to default inline policy if no PDFs are found
        docs = [Document(page_content=DEFAULT_POLICY, metadata={"source": "sentinel_policy_2026.pdf"})]

    return docs


def get_vectorstore() -> Chroma:
    """Initializes or loads the local ChromaDB vector store with HuggingFace embeddings."""
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

    vectorstore = Chroma(
        collection_name="sentinel_compliance",
        embedding_function=embeddings,
        persist_directory=str(DB_DIR),
    )

    # Automatically index documents if vectorstore is empty
    if vectorstore._collection.count() == 0:
        docs = load_documents()
        if docs:
            vectorstore.add_documents(docs)

    return vectorstore


@tool
def query_compliance_policy(query: str) -> str:
    """
    Searches internal SENTINEL risk management guidelines and ingested PDF policies.
    """
    try:
        vectorstore = get_vectorstore()
        results = vectorstore.similarity_search(query, k=3)
        if not results:
            return "No specific internal compliance policy found matching query."

        formatted_results = []
        for doc in results:
            source = doc.metadata.get("source", "Policy PDF")
            page = doc.metadata.get("page", None)
            
            # Format source title with page citation if available
            location = Path(source).name
            if page is not None:
                location += f" (Page {page + 1})"

            formatted_results.append(f"[Source: {location}]\n{doc.page_content.strip()}")

        return "\n\n".join(formatted_results)
    except Exception as e:
        return f"RAG Search Error: {str(e)}"