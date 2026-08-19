import os
import glob
import warnings
from dotenv import load_dotenv

# Silence warnings
warnings.filterwarnings("ignore")
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
load_dotenv()

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader, TextLoader, CSVLoader
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter

DATASETS_DIR = "./datasets"
CHROMA_DB_DIR = "./chroma_db_free"

def load_doc(path: str):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".pdf": 
            return PyPDFLoader(path).load()
        if ext == ".csv": 
            try: return CSVLoader(path, encoding="utf-8").load()
            except: return CSVLoader(path, encoding="latin-1").load()
        if ext in [".txt", ".md"]: 
            try: return TextLoader(path, encoding="utf-8").load()
            except: return TextLoader(path, encoding="latin-1").load()
    except Exception as e:
        print(f"  ⚠️ Skipping {os.path.basename(path)}: {e}")
    return []

def main():
    print("🚀 Starting local document ingestion ($0)...")
    
    # 1. Initialize free embedding model
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    # 2. Scan and load documents
    docs = []
    print(f"📂 Reading files from '{DATASETS_DIR}'...")
    for ext in ["*.pdf", "*.csv", "*.txt", "*.md"]:
        for file_path in glob.glob(os.path.join(DATASETS_DIR, "**", ext), recursive=True):
            loaded = load_doc(file_path)
            if loaded:
                docs.extend(loaded)
                print(f"  ✓ Loaded {len(loaded)} record(s) from {os.path.basename(file_path)}")

    if not docs:
        print("❌ No valid documents found in ./datasets!")
        return

    print(f"\n📄 Total raw records: {len(docs)}")

    # 3. Chunk documents into manageable sizes
    splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
    chunks = splitter.split_documents(docs)
    print(f"🧩 Split into {len(chunks)} chunks.")

    # 4. Store in local ChromaDB
    print(f"📦 Storing vectors in '{CHROMA_DB_DIR}'...")
    Chroma.from_documents(chunks, embeddings, persist_directory=CHROMA_DB_DIR)

    print("\n✅ DONE! Database successfully built and saved to ./chroma_db_free")

if __name__ == "__main__":
    main()