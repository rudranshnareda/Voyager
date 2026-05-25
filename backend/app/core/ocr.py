import base64
import logging
import tempfile
import os
from pathlib import Path
from typing import Any, Dict

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


def extract_region_smart(pdf_path: str, page_number: int, bbox: Dict[str, float]) -> Dict[str, Any]:
    """
    Render a rectangular region of a PDF page and return it as a base64 PNG.
    The image is passed directly to the vision LLM — no OCR needed.
    """
    try:
        doc = fitz.open(pdf_path)
        if page_number < 1 or page_number > len(doc):
            doc.close()
            return _error("Page %d out of range" % page_number)

        page = doc[page_number - 1]
        pw = page.rect.width
        ph = page.rect.height

        x0 = bbox.get("x", 0.0) * pw
        y0 = bbox.get("y", 0.0) * ph
        x1 = x0 + bbox.get("width", 1.0) * pw
        y1 = y0 + bbox.get("height", 1.0) * ph

        x0 = max(0.0, min(x0, pw))
        y0 = max(0.0, min(y0, ph))
        x1 = max(x0 + 1.0, min(x1, pw))
        y1 = max(y0 + 1.0, min(y1, ph))

        clip = fitz.Rect(x0, y0, x1, y1)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip)
        doc.close()

        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.close()
        try:
            pix.save(tmp.name)
            image_data = base64.b64encode(Path(tmp.name).read_bytes()).decode()
        finally:
            os.unlink(tmp.name)

        return {
            "text": "",
            "description": "",
            "method": "vision",
            "final_text": "(selected region)",
            "image_data": image_data,
        }

    except Exception as exc:
        logger.error("extract_region_smart error: %s", exc)
        return _error(str(exc))


def _error(msg: str) -> Dict[str, Any]:
    return {"text": "", "description": "", "method": "error", "final_text": f"Error: {msg}", "image_data": None}
