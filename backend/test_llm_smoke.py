"""Smoke test: LLMClient initialises and returns a real answer from Groq."""
import sys
sys.stdout.reconfigure(line_buffering=True)

from app.core.llm import llm_client

chunks = [
    {
        "content": (
            "Retrieval-Augmented Generation (RAG) combines a dense retrieval "
            "system with a generative language model. The retriever fetches "
            "relevant passages from a document store; the generator conditions "
            "its output on those passages to produce grounded, cited answers."
        ),
        "filename": "ai_overview.pdf",
        "page_number": 2,
    },
    {
        "content": (
            "ChromaDB is an open-source vector database that stores embedding "
            "vectors and supports approximate nearest-neighbour search via HNSW."
        ),
        "filename": "ai_overview.pdf",
        "page_number": 4,
    },
]

print("Calling generate_answer...", flush=True)
result = llm_client.generate_answer(
    query="What is RAG and how does it work?",
    context_chunks=chunks,
    chat_history=[],
)

print("\n--- Answer ---", flush=True)
print(result["answer"], flush=True)
print("\n--- Citations ---", flush=True)
for c in result["citations"]:
    print(f"  {c['filename']}, Page {c['page_number']}", flush=True)
    print(f"  Excerpt: \"{c['excerpt'][:80]}...\"", flush=True)

assert result["answer"], "Empty answer returned"
assert len(result["citations"]) == 2, f"Expected 2 citations, got {len(result['citations'])}"
print("\nLLMClient smoke test OK.", flush=True)
