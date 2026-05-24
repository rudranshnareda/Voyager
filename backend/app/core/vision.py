import base64
import logging
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
REQUEST_TIMEOUT = 30.0

_PROMPT = (
    "Analyze this image from a document and describe it thoroughly:\n"
    "1. What type of content is this? (flowchart, anatomical diagram, table, chart, handwritten text, illustration, etc.)\n"
    "2. All visible text, labels, annotations, and values — transcribe them exactly as written\n"
    "3. The main concept or information being conveyed\n"
    "4. Key relationships, flows, or structure (for diagrams and flowcharts, trace every path)\n"
    "5. Any data, measurements, or numeric values (for charts and tables)\n\n"
    "Be thorough and precise. Your description will be used to explain this content to a student."
)


def describe_image(image_path: str) -> str:
    """Send a cropped region image to Groq vision API. Returns '' on any failure."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.error("GROQ_API_KEY not set — cannot call vision API")
        return ""

    path = Path(image_path)
    if not path.exists():
        logger.error("Image not found: %s", image_path)
        return ""

    try:
        image_b64 = base64.b64encode(path.read_bytes()).decode()
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        data_url = f"data:{mime};base64,{image_b64}"

        payload = {
            "model": VISION_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": _PROMPT},
                    ],
                }
            ],
            "temperature": 0.2,
            "max_tokens": 1024,
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.post(GROQ_API_URL, headers=headers, json=payload)

        if response.status_code == 429:
            logger.warning("Groq vision rate limit hit — returning empty description")
            return ""
        if response.status_code != 200:
            logger.error("Groq vision error %s: %s", response.status_code, response.text[:200])
            return ""

        description = response.json()["choices"][0]["message"]["content"].strip()
        logger.info("Vision description: %d chars (model: %s)", len(description), VISION_MODEL)
        return description

    except httpx.TimeoutException:
        logger.error("Groq vision timed out after %.0fs", REQUEST_TIMEOUT)
        return ""
    except httpx.RequestError as exc:
        logger.error("Groq vision connection error: %s", exc)
        return ""
    except Exception as exc:
        logger.error("Vision error: %s", exc)
        return ""
