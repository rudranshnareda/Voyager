import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

# Resolve .env relative to the backend/ directory regardless of cwd
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
REQUEST_TIMEOUT = 30.0
MAX_HISTORY_MESSAGES = 6  # last 3 turns (user + assistant pairs)

SYSTEM_PROMPT = """You are Voyager, a personal tutor who helps users understand what they are reading.

Your job is to TEACH — answer questions clearly and directly, using your world knowledge as the primary source. The document context anchors your explanation to what the user is reading but does not limit what you can explain.

Rules:
1. Answer the question first. Be direct — do not open with "According to the document" or restate what the user can already see.
2. Teach from first principles. Explain mechanisms, give real-world examples, use analogies. A student should finish reading your response actually understanding the concept, not just knowing what the document said about it.
3. Do NOT add inline citations like (filename, Page N) anywhere in your response. Citations are shown separately — do not include them in your text.
4. Do NOT echo or describe the selected content back to the user. Explain what it means, not what it says.
5. When the user selects an image, diagram, or flowchart, explain the concept it illustrates — don't just describe what you see in it.
6. If a term is only briefly mentioned in the document without explanation, that is your cue to define and explain it fully from world knowledge.
7. Keep responses focused. Depth over length — one clear explanation is better than five paragraphs of hedging."""


class LLMClient:
    def __init__(self) -> None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is not set in environment / .env file")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        logger.info("LLMClient ready - model: %s", MODEL)

    def generate_answer(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        chat_history: List[Dict[str, str]],
        highlighted_context: Optional[Dict[str, Any]] = None,
        web_chunks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Call Groq and return {answer, citations}."""
        web_chunks = web_chunks or []
        has_image = bool(highlighted_context and highlighted_context.get("image_data"))

        if has_image:
            messages = self._build_vision_messages(query, context_chunks, chat_history, highlighted_context, web_chunks)  # type: ignore[arg-type]
            model = VISION_MODEL
        else:
            context_str = self._format_context(context_chunks)
            web_str = self._format_web_context(web_chunks)
            user_content = self._build_user_message(query, context_str, highlighted_context, web_str)
            messages = self._build_messages(user_content, chat_history)
            model = MODEL

        answer = self._call_groq(model, messages)
        citations = self._build_citations(context_chunks) + self._build_web_citations(web_chunks)

        logger.info(
            "LLM answer generated - model: %s, chunks_used: %d, web_chunks: %d, answer_len: %d, vision: %s",
            model, len(context_chunks), len(web_chunks), len(answer), has_image,
        )

        return {"answer": answer, "citations": citations}

    def _call_groq(self, model: str, messages: List[Dict[str, Any]]) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 2048,
        }
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.post(GROQ_API_URL, headers=self._headers, json=payload)

            if response.status_code == 429:
                raise RuntimeError("Rate limit reached. Please wait a moment and try again.")
            if response.status_code == 401:
                raise RuntimeError("Invalid Groq API key. Check GROQ_API_KEY in your .env file.")
            if response.status_code != 200:
                raise RuntimeError(f"Groq API error {response.status_code}: {response.text[:300]}")

            return response.json()["choices"][0]["message"]["content"] or ""

        except httpx.TimeoutException as exc:
            logger.error("Groq request timed out after %.0fs", REQUEST_TIMEOUT)
            raise RuntimeError("Language model request timed out. Try again.") from exc
        except httpx.RequestError as exc:
            logger.error("Groq connection error: %s", exc)
            raise RuntimeError("Could not connect to the language model service.") from exc

    # ------------------------------------------------------------------ #
    # Private helpers                                                       #
    # ------------------------------------------------------------------ #

    def _format_context(self, chunks: List[Dict[str, Any]]) -> str:
        if not chunks:
            return "(No relevant document excerpts were found for this query.)"
        parts = []
        for chunk in chunks:
            header = f"[Source: {chunk['filename']}, Page {chunk['page_number']}]"
            parts.append(f"{header}\n{chunk['content']}")
        return "\n\n---\n\n".join(parts)

    def _format_web_context(self, web_chunks: List[Dict[str, Any]]) -> str:
        if not web_chunks:
            return ""
        parts = []
        for chunk in web_chunks:
            header = f"[Web: {chunk['filename']} | {chunk['url']}]"
            parts.append(f"{header}\n{chunk['content']}")
        return "\n\n---\n\n".join(parts)

    def _build_user_message(
        self,
        query: str,
        context_str: str,
        highlighted_context: Optional[Dict[str, Any]] = None,
        web_str: str = "",
    ) -> str:
        prefix = ""
        if highlighted_context:
            text_preview = highlighted_context["text"][:300]
            prefix = (
                f"The user selected this from page {highlighted_context['page_number']}:\n"
                f"{text_preview}\n\n---\n\n"
            )
        parts = [f"{prefix}Relevant document context:\n\n{context_str}"]
        if web_str:
            parts.append(f"Current web search results:\n\n{web_str}")
        parts.append(f"Question: {query}")
        return "\n\n---\n\n".join(parts)

    def _build_messages(
        self,
        user_content: str,
        chat_history: List[Dict[str, str]],
    ) -> List[Dict[str, str]]:
        messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        recent = chat_history[-MAX_HISTORY_MESSAGES:] if chat_history else []
        for msg in recent:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_content})
        return messages

    def _build_vision_messages(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        chat_history: List[Dict[str, str]],
        highlighted_context: Dict[str, Any],
        web_chunks: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Build a multimodal messages list that sends the selected image directly to the vision LLM."""
        context_str = self._format_context(context_chunks)
        web_str = self._format_web_context(web_chunks or [])
        page_num = highlighted_context.get("page_number", "?")
        ocr_text = highlighted_context.get("text", "").strip()

        # Text part of the user turn
        parts: List[str] = [f"The user is reading a document and drew a selection on page {page_num}."]
        if ocr_text and len(ocr_text) > 10:
            parts.append(f"OCR extracted this text from the selected region:\n\"{ocr_text}\"")
        if context_str:
            parts.append(f"Relevant context from the document:\n{context_str}")
        if web_str:
            parts.append(f"Current web search results:\n{web_str}")
        parts.append(f"Question: {query}")
        user_text = "\n\n---\n\n".join(parts)

        image_b64 = highlighted_context["image_data"]
        data_url = f"data:image/png;base64,{image_b64}"

        messages: List[Dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        recent = chat_history[-MAX_HISTORY_MESSAGES:] if chat_history else []
        for msg in recent:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": user_text},
            ],
        })
        return messages

    def _build_citations(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        citations = []
        seen: set = set()
        for chunk in chunks:
            if len(citations) >= 3:
                break
            key = (chunk["filename"], chunk["page_number"])
            if key in seen:
                continue
            seen.add(key)
            citations.append({
                "filename":    chunk["filename"],
                "page_number": chunk["page_number"],
                "excerpt":     chunk["content"][:200].strip(),
            })
        return citations

    def _build_web_citations(self, web_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen_urls: set = set()
        citations = []
        for chunk in web_chunks:
            url = chunk.get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            citations.append({
                "filename":    chunk["filename"],  # page title
                "page_number": 0,
                "excerpt":     chunk["content"][:200].strip(),
                "url":         url,
            })
        return citations


llm_client = LLMClient()
