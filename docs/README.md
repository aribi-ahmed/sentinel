# Compliance Source Documents

This directory holds raw regulatory policy documents, compliance handbooks, and disclosure filings (e.g., SEC rules, AML policies, TSLA/FINRA guidelines) used as source context for the Compliance RAG engine.

## Notice
This folder is intentionally **git-ignored** to keep heavy PDF/binary source files out of the remote repository.

## How to Use
1. Drop your regulatory PDFs, Markdown files, or text disclosures directly into this folder.
2. Run the chunking and embedding pipeline to populate `chroma_db`:

```bash
python ingest.py
```

## Supported File Formats:
```.pdf```
```.md```
```.txt```
