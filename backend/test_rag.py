"""
Phase 2 end-to-end test for the Voyager RAG + chat pipeline.

Run from the backend/ directory:
    .\\venv\\Scripts\\python.exe test_rag.py

What this tests:
  - Document ingestion (PDF -> chunks -> embeddings -> ChromaDB)
  - RAG retrieval (query -> embed -> search -> filter)
  - LLM answer generation (Groq API with context)
  - Chat history carried across turns
  - Citations returned and stored in SQLite
  - Full cleanup
"""

import sys
import fitz
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)


def section(title: str) -> None:
    print(f"\n{'-' * 56}", flush=True)
    print(f"  {title}", flush=True)
    print(f"{'-' * 56}", flush=True)


def make_test_pdf(path: Path) -> None:
    """5-page AI/ML document — same content as Phase 1 test for consistency."""
    pages = [
        """\
Introduction to Artificial Intelligence

Artificial intelligence (AI) refers to the simulation of human intelligence
processes by computer systems. These processes include learning, reasoning,
and self-correction. AI can be narrow (task-specific) or general (human-level).

The history of AI dates to the 1950s. Alan Turing proposed the Turing Test
as a measure of machine intelligence. AI has gone through multiple cycles of
optimism and AI winters, driven by breakthroughs in compute and data.
""",
        """\
Machine Learning Fundamentals

Machine learning enables systems to learn from experience without explicit
programming. Supervised learning uses labelled data; common algorithms include
linear regression, decision trees, and neural networks.

Unsupervised learning finds hidden patterns without labels. Clustering
algorithms such as k-means group similar data points. Reinforcement learning
trains agents to maximise cumulative reward through environment interaction.
""",
        """\
Deep Learning and Neural Networks

Deep learning uses neural networks with many layers to model complex patterns.
Convolutional neural networks (CNNs) are effective for image recognition.
Recurrent neural networks (RNNs), LSTMs, and GRUs handle sequential data.

The transformer architecture (2017) replaced recurrence with self-attention,
processing all tokens in parallel. BERT and GPT achieved state-of-the-art NLP
performance by pre-training on vast text corpora with transformer decoders.
""",
        """\
Natural Language Processing

NLP allows machines to understand and generate human language. Core tasks
include tokenisation, named entity recognition, sentiment analysis, machine
translation, question answering, and text summarisation.

Large language models (LLMs) such as GPT-4 and LLaMA are trained on vast
text corpora and can generate coherent, contextually appropriate text. They
use the transformer architecture with billions of parameters.
""",
        """\
Retrieval-Augmented Generation

Retrieval-Augmented Generation (RAG) combines a retrieval system with a
generative language model. When a user asks a question, the system retrieves
the most semantically relevant passages from a vector database, then passes
them as context to the LLM to generate a grounded, cited answer.

RAG significantly reduces hallucination and keeps answers factual. Vector
databases such as ChromaDB store embedding vectors and enable fast approximate
nearest-neighbour search via HNSW indexing. Embedding models like
sentence-transformers convert text into dense vectors capturing semantic meaning.
""",
    ]
    doc = fitz.open()
    for text in pages:
        page = doc.new_page(width=595, height=842)
        page.insert_text((60, 72), text, fontsize=10.5, lineheight=1.6)
    doc.save(str(path))
    doc.close()


def main() -> None:
    from app.db.database import init_db, SessionLocal
    from app.db.models import Workspace, Document, Chat, Message
    from app.core.ingestion import ingestion_pipeline
    from app.core.rag import rag_engine
    from app.core.llm import llm_client
    from app.core.vectorstore import vector_store

    init_db()
    db = SessionLocal()

    pdf_path = Path("test_rag_document.pdf")
    workspace = None

    try:
        # ── 1. Create test PDF ───────────────────────────────────────────────
        section("Step 1 - Creating test PDF")
        make_test_pdf(pdf_path)
        print(f"  Created : {pdf_path.name}  ({pdf_path.stat().st_size // 1024} KB, 5 pages)")

        # ── 2. Create workspace + ingest document ────────────────────────────
        section("Step 2 - Ingesting document")
        workspace = Workspace(name="rag-test-workspace")
        db.add(workspace)
        db.commit()
        db.refresh(workspace)

        doc_record = Document(
            workspace_id=workspace.id,
            filename=pdf_path.name,
            file_path=str(pdf_path),
            status="pending",
        )
        db.add(doc_record)
        db.commit()
        db.refresh(doc_record)

        summary = ingestion_pipeline.ingest_document(
            document_id=doc_record.id,
            file_path=pdf_path,
            workspace_id=workspace.id,
            db=db,
        )
        print(f"  Pages     : {summary['pages_processed']}")
        print(f"  Chunks    : {summary['chunks_created']}")
        print(f"  Time      : {summary['time_taken']}s")

        # ── 3. Create chat ───────────────────────────────────────────────────
        section("Step 3 - Creating chat")
        chat = Chat(workspace_id=workspace.id, title="RAG Test Chat")
        db.add(chat)
        db.commit()
        db.refresh(chat)
        print(f"  Chat id : {chat.id}")

        # ── 4. Send 3 messages ───────────────────────────────────────────────
        test_queries = [
            "What is this document about?",
            "Summarize the key points about deep learning and transformers.",
            "What are the main conclusions about RAG and vector databases?",
        ]

        for i, query in enumerate(test_queries, 1):
            section(f"Step 4.{i} - Message: \"{query}\"")

            # Load history before saving user message
            recent = (
                db.query(Message)
                .filter(Message.chat_id == chat.id)
                .order_by(Message.created_at.desc())
                .limit(6)
                .all()
            )
            history = [{"role": m.role, "content": m.content} for m in reversed(recent)]

            # Save user message
            user_msg = Message(chat_id=chat.id, role="user", content=query)
            db.add(user_msg)
            db.commit()

            # RAG retrieval
            rag_result = rag_engine.retrieve(query, workspace.id)
            print(f"  Sources found : {rag_result['found']}")

            # LLM generation
            llm_result = llm_client.generate_answer(
                query=query,
                context_chunks=rag_result["chunks"],
                chat_history=history,
            )

            # Save assistant message
            assistant_msg = Message(
                chat_id=chat.id,
                role="assistant",
                content=llm_result["answer"],
                citations=llm_result["citations"],
            )
            db.add(assistant_msg)
            db.commit()
            db.refresh(assistant_msg)

            print(f"\n  Answer:\n")
            for line in llm_result["answer"].splitlines():
                print(f"    {line}")

            if llm_result["citations"]:
                print(f"\n  Citations ({len(llm_result['citations'])}):")
                for c in llm_result["citations"]:
                    print(f"    - {c['filename']}, Page {c['page_number']}")
                    print(f"      \"{c['excerpt'][:80].strip()}...\"")
            else:
                print("\n  Citations: none")

            # Verify citations stored in DB
            db.refresh(assistant_msg)
            assert assistant_msg.citations is not None or rag_result["found"] == 0, \
                "Citations missing in DB for answered message"

        # ── 5. Print full chat history ───────────────────────────────────────
        section("Step 5 - Full chat history")
        all_messages = (
            db.query(Message)
            .filter(Message.chat_id == chat.id)
            .order_by(Message.created_at.asc())
            .all()
        )
        print(f"  Total messages : {len(all_messages)}  "
              f"({len(all_messages)//2} user + {len(all_messages)//2} assistant)")
        for msg in all_messages:
            role_label = "USER " if msg.role == "user" else "ASST "
            snippet = msg.content[:80].replace("\n", " ")
            cites = f"  [{len(msg.citations)} citations]" if msg.citations else ""
            print(f"  {role_label}: {snippet}...{cites}")

        # ── 6. Cleanup ───────────────────────────────────────────────────────
        section("Step 6 - Cleanup")
        vector_store.delete_document(workspace.id, doc_record.id)
        try:
            vector_store._client.delete_collection(f"workspace_{workspace.id}")
        except Exception:
            pass
        db.delete(workspace)  # cascades: Document, Chunk, Chat, Message
        db.commit()
        pdf_path.unlink(missing_ok=True)
        print("  Removed ChromaDB vectors")
        print("  Removed all SQLite records")
        print("  Removed test PDF")

        section("ALL TESTS PASSED - Phase 2 RAG pipeline is working")

    except Exception as exc:
        print(f"\n  FAILED: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
