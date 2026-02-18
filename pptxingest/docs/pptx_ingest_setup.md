# PPTX Ingest Setup

Offline policy:

- Runtime is offline-only for model loading.
- EasyOCR model downloads are disabled at runtime.
- Hugging Face caption model loading is `local_files_only` with offline flags.
- If required model files are not already present locally, the script writes warnings and continues.

## 1) Create and activate a virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

## 2) Install dependencies

Core ingest (text extraction + OCR integration, default EasyOCR backend):

```bash
pip install -r requirements-easyocr.txt
```

Core + image captioning:

```bash
pip install -r requirements-captioning.txt
```

Tesseract backend only (optional, if you specifically want Tesseract):

```bash
pip install -r requirements.txt
```

## 3) System dependency for OCR

`pytesseract` requires the native Tesseract executable. A Python `.venv` alone
cannot provide that binary.

### Install Tesseract

Windows (choose one):

```powershell
winget install --id UB-Mannheim.TesseractOCR -e
```

```powershell
choco install tesseract
```

macOS:

```bash
brew install tesseract
```

Ubuntu/Debian:

```bash
sudo apt-get update && sudo apt-get install -y tesseract-ocr
```

Verify:

```bash
tesseract --version
```

### If you do NOT want system PATH changes

You can keep Tesseract in a project-local folder and pass its full path:

```powershell
python pptx_to_structured_text.py path\to\deck.pptx --tesseract-cmd "C:\tools\tesseract\tesseract.exe"
```

Or set once per shell:

```powershell
$env:TESSERACT_CMD = "C:\tools\tesseract\tesseract.exe"
python pptx_to_structured_text.py path\to\deck.pptx
```

## 4) Run

```bash
python pptx_to_structured_text.py path/to/deck.pptx
```

Default behavior:

- Uses EasyOCR for OCR.
- Uses caption model for image computer-vision descriptions.
- Writes combined `Image RAG Context` per image (visual + OCR summary).
- Omits raw OCR blocks unless requested.

Include raw OCR text blocks in the extracted output:

```bash
python pptx_to_structured_text.py path/to/deck.pptx --include-raw-image-ocr
```

Run with Tesseract backend:

```bash
python pptx_to_structured_text.py path/to/deck.pptx --ocr-backend tesseract --ocr-language eng
```

Outputs:

- `<pptx_stem>_extracted.txt`
- `<pptx_stem>_RAG_errors.txt`

## 5) SCIF / air-gapped usage

If using captioning in a SCIF, pre-stage model files on an internet-connected machine,
then copy the local model cache/artifacts into the target environment before execution.
Do not rely on runtime downloads.
