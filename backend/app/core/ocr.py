import base64
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

import cv2
import fitz  # PyMuPDF
import pytesseract

logger = logging.getLogger(__name__)

# Configure Tesseract path for Windows if the binary is present
_TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
if _TESSERACT.exists():
    pytesseract.pytesseract.tesseract_cmd = str(_TESSERACT)

_TESSERACT_AVAILABLE = _TESSERACT.exists()


def extract_region_smart(pdf_path: str, page_number: int, bbox: Dict[str, float]) -> Dict[str, Any]:
    """
    Extract text/description from a rectangular region of a PDF page.

    bbox values are NORMALIZED (0-1) relative to the page dimensions.
    Uses page.get_pixmap(clip=...) to render only the target region — avoids
    creating sub-Pixmaps and is the recommended PyMuPDF 1.24+ approach.
    """
    temp_path: Optional[str] = None
    try:
        doc = fitz.open(pdf_path)
        if page_number < 1 or page_number > len(doc):
            doc.close()
            return _error("Page %d out of range" % page_number)

        page = doc[page_number - 1]
        pw = page.rect.width   # page width in points
        ph = page.rect.height  # page height in points

        # Convert normalized bbox → page coordinate space (points)
        x0 = bbox.get("x", 0.0) * pw
        y0 = bbox.get("y", 0.0) * ph
        x1 = x0 + bbox.get("width", 1.0) * pw
        y1 = y0 + bbox.get("height", 1.0) * ph

        # Clamp to page bounds
        x0 = max(0.0, min(x0, pw))
        y0 = max(0.0, min(y0, ph))
        x1 = max(x0 + 1.0, min(x1, pw))
        y1 = max(y0 + 1.0, min(y1, ph))

        clip = fitz.Rect(x0, y0, x1, y1)

        # Render only the clipped region at 2× for OCR quality
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip)
        doc.close()

        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.close()  # release the handle — Windows won't let PyMuPDF open an already-open path
        temp_path = tmp.name
        pix.save(temp_path)

        # Encode the rendered region as base64 so the chat LLM can see it directly
        image_data = base64.b64encode(Path(temp_path).read_bytes()).decode()

        # ── OCR ──────────────────────────────────────────────────────────────
        ocr_text = ""
        if _TESSERACT_AVAILABLE:
            try:
                img = cv2.imread(temp_path)
                if img is not None:
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    _, thresh = cv2.threshold(
                        gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
                    )
                    ocr_text = pytesseract.image_to_string(
                        thresh, lang="eng", config="--psm 6"
                    ).strip()
                    logger.info("OCR result: %d chars", len(ocr_text))
            except Exception as exc:
                logger.warning("OCR failed: %s", exc)
        else:
            logger.info("Tesseract binary not found — Vision-only mode")

        # ── Determine method & final text ─────────────────────────────────────
        # The actual image is passed through to the vision LLM during chat,
        # so no pre-description is needed here. OCR text (if any) is used as
        # supplementary context; images without text show a neutral placeholder.
        if ocr_text:
            method = "ocr"
            final = ocr_text
        else:
            method = "vision"
            final = "(selected region)"

        return {
            "text": ocr_text,
            "description": "",
            "method": method,
            "final_text": final,
            "image_data": image_data,
        }

    except Exception as exc:
        logger.error("extract_region_smart error: %s", exc)
        return _error(str(exc))
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except Exception:
                pass


def _error(msg: str) -> Dict[str, Any]:
    return {"text": "", "description": "", "method": "error", "final_text": f"Error: {msg}", "image_data": None}
