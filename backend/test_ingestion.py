"""
Phase 1 end-to-end test for the Voyager ingestion pipeline.

Run from the backend/ directory:
    .\\venv\\Scripts\\python.exe test_ingestion.py

What this tests:
  - SQLite DB initialisation and all models
  - PDF text extraction via PyMuPDF
  - Text chunking with overlap
  - Batch embedding generation (GPU)
  - ChromaDB vector storage
  - Semantic search / ranking
  - Full cleanup (no test artifacts left behind)
"""

import sys
import time
from pathlib import Path

import fitz  # pymupdf


# ── Helpers ─────────────────────────────────────────────────────────────────

def _print_section(title: str) -> None:
    print(f"\n{'-' * 55}")
    print(f"  {title}")
    print(f"{'-' * 55}")


def create_test_pdf(path: Path) -> None:
    """
    Create a 5-page PDF with dense AI/ML content.
    Total text is ~6 000 chars, which produces several overlapping chunks.
    """
    pages = [
        """\
Introduction to Artificial Intelligence

Artificial intelligence (AI) refers to the simulation of human intelligence
processes by computer systems. These processes include learning (acquiring
information and rules for using it), reasoning (using rules to reach
approximate or definite conclusions), and self-correction.

AI can be categorised into narrow AI, which is designed for specific tasks
such as voice recognition, and general AI, which can perform any intellectual
task that a human being can do. Modern AI systems rely heavily on machine
learning and deep learning techniques to achieve their capabilities.

The history of AI dates back to the 1950s when Alan Turing proposed the
Turing Test as a measure of machine intelligence. Since then, the field has
gone through multiple cycles of optimism, funding cuts (AI winters), and
renewed interest driven by breakthroughs in compute and data availability.
""",
        """\
Machine Learning Fundamentals

Machine learning is a subset of AI that enables systems to learn and improve
from experience without being explicitly programmed. It focuses on developing
computer programs that can access data and use it to learn for themselves.

Supervised learning uses labelled training data to learn a mapping from inputs
to outputs. Common algorithms include linear regression, decision trees, random
forests, support vector machines, and neural networks. The model is evaluated
on a held-out test set to measure generalisation performance.

Unsupervised learning finds hidden patterns in data without labels. Clustering
algorithms such as k-means and DBSCAN group similar data points together.
Dimensionality reduction techniques like PCA and t-SNE help visualise and
compress high-dimensional data into lower-dimensional representations.

Reinforcement learning trains agents to make decisions by rewarding desirable
behaviour. An agent interacts with an environment, receives rewards or
penalties, and learns a policy that maximises cumulative reward over time.
""",
        """\
Deep Learning and Neural Networks

Deep learning uses artificial neural networks with many layers to model complex
patterns in data. Each layer learns increasingly abstract representations:
early layers detect edges and textures; deeper layers recognise objects and
concepts.

Convolutional neural networks (CNNs) are particularly effective for image
recognition tasks. They use shared weight filters that slide over the input to
detect local features regardless of position. Pooling layers reduce spatial
dimensions, and fully connected layers produce final class predictions.

Recurrent neural networks (RNNs) and their variants, LSTM and GRU, are
designed for sequential data such as text and time series. They maintain a
hidden state that captures information from previous time steps, enabling
the network to model long-range dependencies.

The transformer architecture, introduced in the paper "Attention is All You
Need" (2017), replaced recurrence with self-attention mechanisms. Transformers
process all tokens in parallel and capture global dependencies efficiently,
enabling models like BERT and GPT to achieve state-of-the-art NLP performance.
""",
        """\
Natural Language Processing

Natural language processing (NLP) is the branch of AI concerned with giving
computers the ability to understand text and spoken words in the same way
human beings can. NLP combines computational linguistics with statistical and
machine learning models.

Core NLP tasks include tokenisation (splitting text into words or subwords),
part-of-speech tagging, named entity recognition, sentiment analysis, machine
translation, question answering, and text summarisation.

Word embeddings such as Word2Vec and GloVe represent words as dense vectors
in a continuous space, where semantically similar words are geometrically
close. Contextual embeddings produced by models like ELMo and BERT improve
on this by producing different vectors for the same word in different contexts.

Large language models (LLMs) trained on vast text corpora can generate
coherent, contextually appropriate text. Models such as GPT-4 and LLaMA
use the transformer decoder architecture with billions of parameters trained
with next-token prediction as the primary objective.
""",
        """\
Vector Databases and Retrieval-Augmented Generation

Vector databases store high-dimensional embedding vectors and enable fast
approximate nearest-neighbour search. They are a core component of modern
AI applications that need to retrieve semantically relevant information at
query time.

Popular vector databases include Pinecone, Weaviate, Milvus, Qdrant, and
ChromaDB. They use indexing structures such as HNSW (Hierarchical Navigable
Small World graphs) to achieve sub-millisecond query times even over millions
of vectors.

Retrieval-augmented generation (RAG) combines a retrieval system with a
generative language model. When a user asks a question, the system first
retrieves the most semantically relevant documents from the vector database,
then passes them as context to the LLM to generate a grounded answer with
citations. RAG significantly reduces hallucination and keeps answers factual.

Embedding models such as sentence-transformers convert text into dense vectors
that capture semantic meaning. The cosine distance between two vectors measures
their semantic similarity -vectors close in angle represent texts that mean
similar things, regardless of the exact words used.
""",
    ]

    doc = fitz.open()
    for text in pages:
        page = doc.new_page(width=595, height=842)  # A4
        page.insert_text((60, 72), text, fontsize=10.5, lineheight=1.6)
    doc.save(str(path))
    doc.close()


# ── Main test ────────────────────────────────────────────────────────────────

def main() -> None:
    _print_section("Voyager - Phase 1 Ingestion Test")

    # Initialise DB
    from app.db.database import init_db, SessionLocal
    from app.db.models import Workspace, Document, Chunk

    init_db()
    db = SessionLocal()

    pdf_path = Path("test_ai_document.pdf")

    try:
        # ── 1. Create test PDF ───────────────────────────────────────────────
        _print_section("Step 1 -Creating test PDF")
        create_test_pdf(pdf_path)
        size_kb = pdf_path.stat().st_size // 1024
        print(f"  Created : {pdf_path.name}  ({size_kb} KB, 5 pages)")

        # ── 2. Create workspace + document records ───────────────────────────
        _print_section("Step 2 -Setting up DB records")
        workspace = Workspace(name="voyager-phase1-test")
        db.add(workspace)
        db.commit()
        db.refresh(workspace)
        print(f"  Workspace id : {workspace.id}")

        doc = Document(
            workspace_id=workspace.id,
            filename=pdf_path.name,
            file_path=str(pdf_path),
            status="pending",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        print(f"  Document id  : {doc.id}")
        print(f"  Status       : {doc.status}")

        # ── 3. Run ingestion pipeline ────────────────────────────────────────
        _print_section("Step 3 -Running ingestion pipeline")
        from app.core.ingestion import ingestion_pipeline

        t0 = time.time()
        summary = ingestion_pipeline.ingest_document(
            document_id=doc.id,
            file_path=pdf_path,
            workspace_id=workspace.id,
            db=db,
        )
        elapsed = time.time() - t0

        db.refresh(doc)
        print(f"  Pages processed : {summary['pages_processed']}")
        print(f"  Chunks created  : {summary['chunks_created']}")
        print(f"  Time taken      : {summary['time_taken']}s  (total incl. model load: {elapsed:.2f}s)")
        print(f"  Document status : {doc.status}")

        # Verify Chunk rows in SQLite
        chunk_count = db.query(Chunk).filter(Chunk.document_id == doc.id).count()
        print(f"  SQLite chunks   : {chunk_count}")
        assert chunk_count == summary["chunks_created"], "Chunk count mismatch between pipeline and DB!"
        assert doc.status == "ready", f"Expected status 'ready', got '{doc.status}'"

        # ── 4. Vector queries ────────────────────────────────────────────────
        _print_section("Step 4 -Semantic search queries")
        from app.core.embeddings import embeddings_manager
        from app.core.vectorstore import vector_store

        queries = [
            "what is this document about?",
            "how do neural networks learn from data?",
            "what is retrieval-augmented generation?",
        ]

        for query in queries:
            print(f"\n  Query: \"{query}\"")
            q_emb = embeddings_manager.generate_embedding(query)
            results = vector_store.query(workspace.id, q_emb, n_results=3)
            for i, r in enumerate(results, 1):
                snippet = r["content"][:90].replace("\n", " ").strip()
                print(f"    [{i}] page={r['metadata']['page_number']}  "
                      f"dist={r['distance']:.4f}  \"{snippet}...\"")

        # ── 5. Cleanup ───────────────────────────────────────────────────────
        _print_section("Step 5 -Cleanup")
        vector_store.delete_document(workspace.id, doc.id)
        vector_store._client.delete_collection(f"workspace_{workspace.id}")
        db.delete(workspace)   # cascades → Document → Chunk
        db.commit()
        db.close()
        pdf_path.unlink(missing_ok=True)
        print("  Removed ChromaDB vectors")
        print("  Removed SQLite records (workspace, document, chunks)")
        print("  Removed test PDF")

        _print_section("ALL TESTS PASSED -Phase 1 ingestion pipeline is working")

    except Exception as exc:
        print(f"\n  FAILED: {exc}", file=sys.stderr)
        db.close()
        raise


if __name__ == "__main__":
    main()
