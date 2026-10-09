from __future__ import annotations

import argparse
import gc
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from statistics import median

import numpy as np
import onnxruntime as ort
import psutil
import pypdfium2 as pdfium
from litert_lm import Backend, Content, EmbeddingEngine, EmbeddingOptions
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pypdf import PdfReader
from tokenizers import Tokenizer

GEMMA = {
    "name": "embeddinggemma-2-text-vision-440m",
    "revision": "e301f74d5551b0c2641bd5cb4652a76239d5c5f8",
    "filename": "embeddinggemma-2-text-vision-440m.litertlm",
    "url": "https://huggingface.co/litert-community/embeddinggemma-2-text-vision-440m-litert-lm/resolve/e301f74d5551b0c2641bd5cb4652a76239d5c5f8/embeddinggemma-2-text-vision-440m.litertlm",
    "sha256": "92dcbea108899e5d6e30d919b0744f90d9967e80c67a4ab5503ac16d54f62eb0",
}

SAMPLE_TYPES = {"text", "note", "quote", "article", "image", "screenshot", "pdf"}
SAMPLE_GROUP_TYPES = {
    "library-text": {"text", "note", "quote", "article"},
    "library-image": {"image"},
    "library-screenshot": {"screenshot"},
    "library-pdf-text": {"pdf"},
    "library-pdf-visual": {"pdf"},
}


def default_cache_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return base / "inkling" / "embedding-comparison"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_asset(path: Path, url: str, expected_sha256: str) -> Path:
    if path.is_file() and sha256_file(path) == expected_sha256:
        return path

    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    partial.unlink(missing_ok=True)
    print(f"Downloading {path.name} (public model artifact)")
    try:
        with (
            urllib.request.urlopen(url, timeout=60) as response,
            partial.open("wb") as output,
        ):
            total = int(response.headers.get("Content-Length", "0"))
            received = 0
            last_report = 0
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                received += len(chunk)
                if total and received - last_report >= 32 * 1024 * 1024:
                    print(f"  {received / total:.0%} downloaded", flush=True)
                    last_report = received
    except Exception:
        partial.unlink(missing_ok=True)
        raise

    actual_sha256 = sha256_file(partial)
    if actual_sha256 != expected_sha256:
        partial.unlink(missing_ok=True)
        raise RuntimeError(
            f"SHA-256 verification failed for {path.name}: expected "
            f"{expected_sha256}, got {actual_sha256}"
        )
    partial.replace(path)
    return path


def unit(vector: np.ndarray | list[float]) -> np.ndarray:
    vector = np.asarray(vector, dtype=np.float32).reshape(-1)
    if vector.size != 768:
        raise RuntimeError(
            f"Expected a 768-dimensional embedding, received {vector.size} dimensions."
        )
    magnitude = float(np.linalg.norm(vector))
    return vector / magnitude if magnitude else vector


def timed(function, *args, **kwargs):
    started = time.perf_counter()
    value = function(*args, **kwargs)
    return value, (time.perf_counter() - started) * 1000


def html_text(path: Path) -> str:
    class TextParser(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.hidden = []
            self.parts = []

        def handle_starttag(self, tag, attrs):
            if self.hidden or tag in {
                "script",
                "style",
                "svg",
                "nav",
                "footer",
            }:
                self.hidden.append(tag)

        def handle_endtag(self, tag):
            if self.hidden:
                for index in range(len(self.hidden) - 1, -1, -1):
                    if self.hidden[index] == tag:
                        del self.hidden[index:]
                        break

        def handle_data(self, data):
            if not self.hidden:
                self.parts.append(data)

    parser = TextParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return " ".join(" ".join(parser.parts).split())


def resolve_sample_file(root: Path, relative_path: str, field: str) -> Path:
    if not isinstance(relative_path, str) or not relative_path:
        raise ValueError(f"Sample {field} must be a non-empty relative path.")
    root = root.resolve()
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Sample {field} must stay inside its manifest directory.")
    if not path.is_file():
        raise ValueError(f"Sample {field} does not name a file: {relative_path}")
    return path


def read_library_samples(manifest_path: Path, cache_dir: Path) -> tuple[dict, dict]:
    manifest_path = manifest_path.expanduser().resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        not isinstance(manifest, dict)
        or manifest.get("version") != 1
        or not isinstance(manifest.get("items"), list)
        or not manifest["items"]
    ):
        raise ValueError(
            "Library sample manifest must have version 1 and an items array."
        )

    documents = {}
    for item in manifest["items"]:
        if not isinstance(item, dict):
            raise TypeError("Each library sample item must be an object.")
        item_id = item.get("id")
        kind = item.get("type")
        if not isinstance(item_id, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", item_id
        ):
            raise ValueError(
                "Sample IDs must use 1-64 letters, digits, underscores, or hyphens."
            )
        if item_id in documents:
            raise ValueError(f"Duplicate library sample ID: {item_id}")
        if kind not in SAMPLE_TYPES:
            raise ValueError(f"Unsupported library sample type for {item_id}: {kind}")

        source = resolve_sample_file(manifest_path.parent, item.get("path"), "path")
        text_path = (
            resolve_sample_file(manifest_path.parent, item["text_path"], "text_path")
            if item.get("text_path")
            else None
        )
        if text_path and text_path.suffix.lower() not in {".txt", ".md"}:
            raise ValueError(f"Text sidecar for {item_id} must be a .txt or .md file.")
        if kind in {"text", "note", "quote", "article"}:
            text_source = text_path or source
            if text_source.suffix.lower() not in {".txt", ".md"}:
                raise ValueError(f"Text sample {item_id} must be a .txt or .md file.")
            text = text_source.read_text(encoding="utf-8", errors="replace").strip()
            images = []
        elif kind in {"image", "screenshot"}:
            if source.suffix.lower() not in {
                ".bmp",
                ".gif",
                ".jpeg",
                ".jpg",
                ".png",
                ".tif",
                ".tiff",
                ".webp",
            }:
                raise ValueError(
                    f"Image sample {item_id} must use a supported image file."
                )
            text = (
                text_path.read_text(encoding="utf-8", errors="replace").strip()
                if text_path
                else ""
            )
            images = [source]
        else:
            if source.suffix.lower() != ".pdf":
                raise ValueError(f"PDF sample {item_id} must use a .pdf file.")
            text = (
                text_path.read_text(encoding="utf-8", errors="replace").strip()
                if text_path
                else "\n".join(
                    page.extract_text() or "" for page in PdfReader(str(source)).pages
                ).strip()
            )
            images = render_pdf(source, item_id, cache_dir / "rendered-pages")
        documents[item_id] = {"text": text, "images": images, "type": kind}

    queries = manifest.get("queries", [])
    if not isinstance(queries, list) or not queries:
        raise ValueError(
            "Library sample manifest must contain a non-empty queries array."
        )
    for query in queries:
        if not isinstance(query, dict):
            raise TypeError("Each library sample query must be an object.")
        group = query.get("group")
        relevant = query.get("relevant")
        if not isinstance(group, str) or group not in SAMPLE_GROUP_TYPES:
            raise ValueError(f"Unsupported library query group: {group}")
        if not isinstance(query.get("query"), str) or not query["query"].strip():
            raise ValueError(
                "Each library sample query must contain non-empty query text."
            )
        if (
            not isinstance(relevant, list)
            or not relevant
            or any(not isinstance(item_id, str) for item_id in relevant)
        ):
            raise ValueError(
                "Each library sample query must list at least one relevant item ID."
            )
        for item_id in relevant:
            if item_id not in documents:
                raise ValueError(
                    f"Library query refers to missing sample ID: {item_id}"
                )
            if documents[item_id]["type"] not in SAMPLE_GROUP_TYPES[group]:
                raise ValueError(
                    f"Library query group {group} does not match sample type {item_id}."
                )

    similarity_pairs = manifest.get("similarity_pairs", [])
    if not isinstance(similarity_pairs, list):
        raise TypeError("Library sample similarity_pairs must be an array.")
    for pair in similarity_pairs:
        if not isinstance(pair, dict):
            raise TypeError("Each library image-similarity pair must be an object.")
        relevant = pair.get("relevant")
        source = pair.get("source")
        if (
            not isinstance(source, str)
            or not isinstance(relevant, list)
            or not relevant
            or any(not isinstance(item_id, str) for item_id in relevant)
        ):
            raise ValueError(
                "Each library image-similarity pair must list relevant item IDs."
            )
        ids = [source, *relevant]
        for item_id in ids:
            if item_id not in documents or documents[item_id]["type"] not in {
                "image",
                "screenshot",
            }:
                raise ValueError(
                    f"Library similarity pair refers to a non-image sample: {item_id}"
                )

    return documents, {"queries": queries, "similarity_pairs": similarity_pairs}


def render_pdf(path: Path, item_id: str, render_dir: Path) -> list[Path]:
    rendered_paths = []
    document = pdfium.PdfDocument(str(path))
    document_digest = sha256_file(path)[:16]
    try:
        for page_index, page in enumerate(document):
            image_path = (
                render_dir / f"{item_id}-{document_digest}-page-{page_index + 1:04}.png"
            )
            if not image_path.is_file():
                image_path.parent.mkdir(parents=True, exist_ok=True)
                bitmap = page.render(scale=2.5)
                bitmap.to_pil().save(image_path)
                bitmap.close()
            rendered_paths.append(image_path)
            page.close()
    finally:
        document.close()
    return rendered_paths


def read_documents(repo_root: Path, cache_dir: Path) -> dict[str, dict]:
    manifest = json.loads(
        (repo_root / "benchmarks" / "manifest.json").read_text(encoding="utf-8")
    )
    render_dir = cache_dir / "rendered-pages"
    documents = {}
    for item in manifest["items"]:
        item_id = item["id"]
        kind = item["type"]
        source_path = repo_root / "benchmarks" / item["path"]
        if kind in ("article", "recipe"):
            documents[item_id] = {
                "text": html_text(source_path),
                "images": [],
                "type": kind,
            }
            continue
        if kind in ("note", "quote"):
            documents[item_id] = {
                "text": source_path.read_text(encoding="utf-8").strip(),
                "images": [],
                "type": kind,
            }
            continue
        if kind == "pdf":
            extracted_text = "\n".join(
                page.extract_text() or "" for page in PdfReader(str(source_path)).pages
            ).strip()
            expected_ocr = (
                repo_root / "benchmarks" / "expected" / "ocr" / f"{item_id}.txt"
            )
            if not extracted_text and expected_ocr.is_file():
                extracted_text = expected_ocr.read_text(encoding="utf-8").strip()
            documents[item_id] = {
                "text": extracted_text,
                "images": render_pdf(source_path, item_id, render_dir),
                "type": kind,
            }
            continue

        if kind not in ("image", "screenshot"):
            continue
        expected_ocr = repo_root / "benchmarks" / "expected" / "ocr" / f"{item_id}.txt"
        documents[item_id] = {
            "text": expected_ocr.read_text(encoding="utf-8").strip()
            if expected_ocr.is_file()
            else "",
            "images": [source_path],
            "type": kind,
        }
    documents.update(create_visual_document_fixtures(cache_dir))
    if not documents:
        raise RuntimeError("No image, screenshot, or PDF fixtures were found.")
    return documents


def create_visual_document_fixtures(cache_dir: Path) -> dict[str, dict]:
    fixture_dir = cache_dir / "generated-visual-pages"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    title_font = ImageFont.load_default(size=52)
    label_font = ImageFont.load_default(size=34)

    def page(item_id: str, title: str, text: str, draw_content, matching: bool) -> dict:
        path = fixture_dir / f"{item_id}.png"
        image = Image.new("RGB", (900, 1165), "#faf8f3")
        draw = ImageDraw.Draw(image)
        draw.text((80, 100), title, font=title_font, fill="#302f2d")
        draw_content(draw, label_font, matching)
        image.save(path)
        return {"text": text, "images": [path], "type": "pdf"}

    def chart(draw, font, q4_is_highest: bool):
        baseline = 890
        draw.line((150, 300, 150, baseline, 790, baseline), fill="#494743", width=6)
        for y in (420, 540, 660, 780):
            draw.line((150, y, 790, y), fill="#d7d3cb", width=2)
        tallest = "Q4" if q4_is_highest else "Q1"
        heights = {
            "Q1": 340 if tallest == "Q1" else 610,
            "Q2": 500,
            "Q3": 560,
            "Q4": 340 if tallest == "Q4" else 610,
        }
        bars = [(220, "Q1"), (360, "Q2"), (500, "Q3"), (640, "Q4")]
        for x, label in bars:
            color = "#e77d49" if label == tallest else "#648fbd"
            draw.rounded_rectangle(
                (x, heights[label], x + 90, baseline), radius=10, fill=color
            )
            draw.text((x + 26, baseline + 28), label, font=font, fill="#302f2d")

    def floor_plan(draw, font, garden_below_study: bool):
        if garden_below_study:
            rooms = [
                (120, 300, 310, 300, "KITCHEN", "#dce8f0"),
                (470, 300, 310, 300, "STUDY", "#e4ecd9"),
                (120, 640, 660, 310, "GARDEN", "#f1e0cd"),
            ]
        else:
            rooms = [
                (120, 300, 310, 300, "KITCHEN", "#dce8f0"),
                (470, 300, 310, 300, "GARDEN", "#f1e0cd"),
                (120, 640, 660, 310, "STUDY", "#e4ecd9"),
            ]
        for x, y, width, height, label, color in rooms:
            draw.rectangle((x, y, x + width, y + height), fill=color)
            draw.text((x + 70, y + height // 2), label, font=font, fill="#302f2d")
        draw.line((450, 280, 450, 620), fill="#494743", width=8)
        draw.line((100, 620, 800, 620), fill="#494743", width=8)
        draw.rectangle((100, 280, 800, 970), outline="#494743", width=8)

    def transit_map(draw, font, lines_cross_at_central: bool):
        draw.line((170, 480, 740, 480), fill="#d94b45", width=24)
        blue_x = 450 if lines_cross_at_central else 690
        draw.line((blue_x, 260, blue_x, 910), fill="#477fb4", width=24)
        for x in (220, 450, 690):
            draw.ellipse(
                (x - 24, 456, x + 24, 504), fill="#faf8f3", outline="#7f3432", width=6
            )
        for y in (330, 480, 820):
            draw.ellipse(
                (blue_x - 24, y - 24, blue_x + 24, y + 24),
                fill="#faf8f3",
                outline="#315e86",
                width=6,
            )
        for x, label in ((450, "CENTRAL"), (690, "MUSEUM")):
            draw.ellipse(
                (x - 35, 445, x + 35, 515), fill="#faf8f3", outline="#302f2d", width=8
            )
            draw.text((x - 45, 530), label, font=font, fill="#302f2d")

    def workflow(draw, font, arrows_forward: bool):
        workflow_font = ImageFont.load_default(size=28)
        boxes = [
            (80, "CAPTURE", "#dce8f0"),
            (300, "OCR", "#eee5c9"),
            (520, "EMBED", "#e4ecd9"),
            (720, "SEARCH", "#f1e0cd"),
        ]
        for x, label, color in boxes:
            draw.rounded_rectangle(
                (x, 500, x + 155, 660),
                radius=18,
                fill=color,
                outline="#494743",
                width=5,
            )
            draw.text((x + 18, 555), label, font=workflow_font, fill="#302f2d")
        for left, right in ((235, 300), (455, 520), (675, 720)):
            start, end = (left, right) if arrows_forward else (right, left)
            draw.line((start, 580, end, 580), fill="#494743", width=8)
            head = (end, 580)
            wings = (end - 20, end + 20) if arrows_forward else (end + 20, end - 20)
            draw.polygon((head, (wings[0], 566), (wings[0], 594)), fill="#494743")

    def heatmap(draw, font, warm_cells_on_east: bool):
        colors = [
            ["#4a91b7", "#77adad", "#d97a54"],
            ["#347ea5", "#a7b49c", "#d95e4b"],
            ["#5ba0b3", "#d4bf81", "#e77d49"],
        ]
        if not warm_cells_on_east:
            colors = [list(reversed(row)) for row in colors]
        for row, values in enumerate(colors):
            for col, color in enumerate(values):
                left, top = 170 + col * 190, 310 + row * 190
                draw.rectangle(
                    (left, top, left + 170, top + 170),
                    fill=color,
                    outline="#faf8f3",
                    width=8,
                )
        draw.text((175, 910), "WEST", font=font, fill="#302f2d")
        draw.text((650, 910), "EAST", font=font, fill="#302f2d")

    def timeline(draw, font, chronological: bool):
        draw.line((130, 620, 770, 620), fill="#77736c", width=12)
        labels = [
            ("PLAN", "#648fbd"),
            ("SCAN", "#83b291"),
            ("INDEX", "#9b8ac1"),
            ("SEARCH", "#e77d49"),
        ]
        if not chronological:
            labels.reverse()
        for x, (label, color) in zip((170, 370, 570, 770), labels):
            draw.ellipse(
                (x - 48, 572, x + 48, 668), fill=color, outline="#faf8f3", width=6
            )
            draw.text((x - 48, 700), label, font=font, fill="#302f2d")

    definitions = [
        (
            "quarterly-chart",
            "Quarterly Revenue",
            "Quarterly revenue Q1 Q2 Q3 Q4",
            chart,
        ),
        ("studio-plan", "Studio Plan", "Studio plan Kitchen Study Garden", floor_plan),
        (
            "transit-map",
            "City Transit Map",
            "City transit map Red Line Blue Line Central Museum",
            transit_map,
        ),
        (
            "capture-workflow",
            "Capture Workflow",
            "Capture workflow Capture OCR Embed Search",
            workflow,
        ),
        (
            "temperature-map",
            "Room Temperature Map",
            "Room temperature map West East",
            heatmap,
        ),
        (
            "project-timeline",
            "Project Timeline",
            "Project timeline Plan Scan Index Search",
            timeline,
        ),
    ]
    documents = {}
    for slug, title, text, draw_content in definitions:
        for variant, matches_query in (("a", False), ("b", True)):
            item_id = f"visual-doc-{slug}-{variant}"
            documents[item_id] = page(item_id, title, text, draw_content, matches_query)
    return documents


def create_nomic_text_embedder(session: ort.InferenceSession, tokenizer: Tokenizer):
    def embed(text: str, task: str) -> np.ndarray:
        encoding = tokenizer.encode(f"{task}: {text}", add_special_tokens=True)
        feeds = {
            "input_ids": np.asarray([encoding.ids], dtype=np.int64),
            "token_type_ids": np.asarray([encoding.type_ids], dtype=np.int64),
            "attention_mask": np.asarray([encoding.attention_mask], dtype=np.int64),
        }
        hidden = session.run(["last_hidden_state"], feeds)[0][0]
        mask = np.asarray(encoding.attention_mask, dtype=bool)
        vector = hidden[mask].mean(axis=0).astype(np.float32)
        mean = float(vector.mean())
        variance = float(np.mean(np.square(vector - mean)))
        return unit((vector - mean) / np.sqrt(variance + 1e-12))

    return embed


def create_nomic_image_embedder(session: ort.InferenceSession):
    mean = np.asarray([0.4814547, 0.4578275, 0.4082107], dtype=np.float32)
    std = np.asarray([0.26862954, 0.2613026, 0.2757771], dtype=np.float32)

    def embed(path: Path) -> np.ndarray:
        with Image.open(path) as source:
            image = ImageOps.fit(
                source.convert("RGB"), (224, 224), method=Image.Resampling.BICUBIC
            )
        pixels = (np.asarray(image, dtype=np.float32) / 255.0 - mean) / std
        pixels = pixels.transpose(2, 0, 1)[None]
        hidden = session.run(["last_hidden_state"], {"pixel_values": pixels})[0]
        return unit(hidden[0, 0])

    return embed


def build_nomic_vectors(
    documents: dict[str, dict],
    queries: list[dict],
    manifest_path: Path,
    model_dir: Path,
    threads: int,
):
    model_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    text_model = model_manifest["text"]
    image_model = model_manifest["image"]
    text_model_path = download_asset(
        model_dir / text_model["name"] / text_model["model"]["path"],
        text_model["model"]["url"],
        text_model["model"]["sha256"],
    )
    tokenizer_asset = text_model["tokenizer"]
    tokenizer_path = download_asset(
        model_dir / text_model["name"] / tokenizer_asset["path"],
        tokenizer_asset["url"],
        tokenizer_asset["sha256"],
    )
    image_model_path = download_asset(
        model_dir / image_model["name"] / image_model["model"]["path"],
        image_model["model"]["url"],
        image_model["model"]["sha256"],
    )

    options = ort.SessionOptions()
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.inter_op_num_threads = 1
    options.intra_op_num_threads = threads
    tokenizer = Tokenizer.from_file(str(tokenizer_path))
    tokenizer.enable_truncation(max_length=8192)
    started = time.perf_counter()
    text_session = ort.InferenceSession(
        str(text_model_path), sess_options=options, providers=["CPUExecutionProvider"]
    )
    text_load_ms = (time.perf_counter() - started) * 1000
    started = time.perf_counter()
    image_session = ort.InferenceSession(
        str(image_model_path), sess_options=options, providers=["CPUExecutionProvider"]
    )
    image_load_ms = (time.perf_counter() - started) * 1000
    embed_text = create_nomic_text_embedder(text_session, tokenizer)
    embed_image = create_nomic_image_embedder(image_session)

    text_vectors = {}
    text_times = []
    for item_id, item in documents.items():
        if item["text"]:
            vector, elapsed = timed(embed_text, item["text"], "search_document")
            text_vectors[item_id] = vector
            text_times.append(elapsed)

    query_vectors = []
    query_times = []
    for query in queries:
        vector, elapsed = timed(embed_text, query["query"], "search_query")
        query_vectors.append(vector)
        query_times.append(elapsed)

    image_vectors = {}
    image_times = []
    page_vectors = {}
    page_times = []
    for item_id, item in documents.items():
        vectors = []
        for document_image_path in item["images"]:
            vector, elapsed = timed(embed_image, document_image_path)
            vectors.append(vector)
            if item["type"] == "pdf":
                page_times.append(elapsed)
            else:
                image_times.append(elapsed)
        if item["type"] == "pdf":
            page_vectors[item_id] = vectors
        else:
            image_vectors[item_id] = vectors

    model_file_sizes = {
        "text_onnx": text_model_path.stat().st_size,
        "tokenizer": tokenizer_path.stat().st_size,
        "vision_onnx": image_model_path.stat().st_size,
    }
    model_size_bytes = sum(model_file_sizes.values())
    model_revisions = {
        "text": text_model["model"]["url"].split("/resolve/", 1)[1].split("/", 1)[0],
        "vision": image_model["model"]["url"].split("/resolve/", 1)[1].split("/", 1)[0],
    }
    rss_loaded_mb = memory_mb()
    del text_session, image_session, embed_text, embed_image, tokenizer
    gc.collect()
    return {
        "text_vectors": text_vectors,
        "query_vectors": query_vectors,
        "image_vectors": image_vectors,
        "page_vectors": page_vectors,
        "query_times": query_times,
        "text_times": text_times,
        "image_times": image_times,
        "page_times": page_times,
        "load_ms": {"text_session": text_load_ms, "image_session": image_load_ms},
        "model_file_sizes_bytes": model_file_sizes,
        "model_size_bytes": model_size_bytes,
        "model_revisions": model_revisions,
        "model_ids": {"text": text_model["name"], "image": image_model["name"]},
        "rss_loaded_mb": rss_loaded_mb,
    }


def create_gemma_backend(name: str, threads: int):
    if name == "cpu":
        return Backend.CPU(thread_count=threads)
    if name == "gpu":
        return Backend.GPU()
    return Backend.NPU()


def build_gemma_vectors(
    documents: dict[str, dict],
    query_data: dict,
    model_dir: Path,
    backend_name: str,
    threads: int,
):
    model_path = download_asset(
        model_dir / GEMMA["name"] / GEMMA["filename"], GEMMA["url"], GEMMA["sha256"]
    )
    backend = create_gemma_backend(backend_name, threads)
    runtime_cache = model_dir / "litert-runtime-cache"
    runtime_cache.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    engine = EmbeddingEngine(
        str(model_path),
        backend=backend,
        vision_backend=backend,
        cache_dir=str(runtime_cache),
        max_input_length=8192,
        vision_tokens_per_image=140,
    )
    load_ms = (time.perf_counter() - started) * 1000

    def options(tokens: int) -> EmbeddingOptions:
        return EmbeddingOptions(
            normalize=True, output_size=768, vision_tokens_per_image=tokens
        )

    def embed_text(text: str, task: str) -> np.ndarray:
        result = engine.compute_embedding(
            f"task: {task} | text: {text}", options=options(70)
        )
        return unit(result.embedding)

    def embed_image(path: Path, tokens: int) -> np.ndarray:
        result = engine.compute_embedding(
            Content.ImageFile(str(path.resolve())), options=options(tokens)
        )
        return unit(result.embedding)

    queries = query_data["queries"]
    _, first_text_ms = timed(lambda: embed_text(queries[0]["query"], "search query"))
    first_image_path = next(
        (path for item in documents.values() for path in item["images"]), None
    )
    first_image_ms = (
        timed(lambda: embed_image(first_image_path, 70))[1]
        if first_image_path
        else None
    )

    text_vectors = {}
    text_times = []
    for item_id, item in documents.items():
        if item["text"]:
            vector, elapsed = timed(
                lambda text=item["text"]: embed_text(text, "search result")
            )
            text_vectors[item_id] = vector
            text_times.append(elapsed)

    query_vectors = []
    query_times = []
    for query in queries:
        vector, elapsed = timed(
            lambda text=query["query"]: embed_text(text, "search query")
        )
        query_vectors.append(vector)
        query_times.append(elapsed)

    image_vectors = {70: {}, 140: {}}
    image_times = {70: [], 140: []}
    page_vectors = {70: {}, 140: {}}
    page_times = {70: [], 140: []}
    for item_id, item in documents.items():
        for tokens in (70, 140):
            vectors = []
            for image_path in item["images"]:
                vector, elapsed = timed(
                    lambda path=image_path, size=tokens: embed_image(path, size)
                )
                vectors.append(vector)
                (page_times if item["type"] == "pdf" else image_times)[tokens].append(
                    elapsed
                )
            (page_vectors if item["type"] == "pdf" else image_vectors)[tokens][
                item_id
            ] = vectors

    rss_loaded_mb = memory_mb()
    engine.close()
    gc.collect()
    return {
        "text_vectors": text_vectors,
        "query_vectors": query_vectors,
        "image_vectors": image_vectors,
        "page_vectors": page_vectors,
        "query_times": query_times,
        "text_times": text_times,
        "image_times": image_times,
        "page_times": page_times,
        "load_ms": {
            "engine": load_ms,
            "first_text_embedding": first_text_ms,
            "first_image_embedding": first_image_ms,
        },
        "model_size_bytes": model_path.stat().st_size,
        "backend": backend_name,
        "model_id": GEMMA["name"],
        "model_revision": GEMMA["revision"],
        "rss_loaded_mb": rss_loaded_mb,
    }


def rank_documents(
    documents: dict[str, dict[str, list[np.ndarray]]], query_vector: np.ndarray
):
    rankings = []
    for item_id, views in documents.items():
        scores = [
            float(np.dot(query_vector, vector))
            for vectors in views.values()
            for vector in vectors
        ]
        if scores:
            rankings.append((item_id, max(scores)))
    return sorted(rankings, key=lambda row: (-row[1], row[0]))


def score_search(
    documents: dict[str, dict[str, list[np.ndarray]]],
    query_vectors: list[np.ndarray],
    queries: list[dict],
    candidate_ids: set[str] | None = None,
):
    candidates = (
        documents
        if candidate_ids is None
        else {
            item_id: views
            for item_id, views in documents.items()
            if item_id in candidate_ids
        }
    )
    query_results = []
    for query, vector in zip(queries, query_vectors):
        rankings = rank_documents(candidates, vector)
        relevant = set(query["relevant"])
        ranks = [
            index + 1
            for index, (item_id, _) in enumerate(rankings)
            if item_id in relevant
        ]
        query_results.append(
            {
                "query": query["query"],
                "group": query["group"],
                "relevant": query["relevant"],
                "rank": min(ranks) if ranks else None,
                "reciprocal_rank": 1 / min(ranks) if ranks else 0.0,
                "top5": [
                    {"id": item_id, "score": score} for item_id, score in rankings[:5]
                ],
            }
        )

    def metrics(indices: list[int]) -> dict:
        rows = [query_results[index] for index in indices]
        return {
            "queries": len(rows),
            "hit_at_1": sum(row["rank"] == 1 for row in rows) / len(rows),
            "hit_at_3": sum(
                row["rank"] is not None and row["rank"] <= 3 for row in rows
            )
            / len(rows),
            "mrr": sum(row["reciprocal_rank"] for row in rows) / len(rows),
        }

    groups = sorted({query["group"] for query in queries})
    return {
        "overall": metrics(list(range(len(queries)))),
        "by_group": {
            group: metrics(
                [
                    index
                    for index, query in enumerate(queries)
                    if query["group"] == group
                ]
            )
            for group in groups
        },
        "query_results": query_results,
    }


def image_similarity(
    vectors: dict[str, list[np.ndarray]],
    pairs: list[dict],
    candidate_ids: set[str] | None = None,
) -> dict:
    item_vectors = {
        item_id: values[0]
        for item_id, values in vectors.items()
        if values and (candidate_ids is None or item_id in candidate_ids)
    }
    results = []
    for pair in pairs:
        query = item_vectors[pair["source"]]
        candidates = sorted(
            (
                (item_id, float(np.dot(query, vector)))
                for item_id, vector in item_vectors.items()
                if item_id != pair["source"]
            ),
            key=lambda row: (-row[1], row[0]),
        )
        ranks = [
            index + 1
            for index, (item_id, _) in enumerate(candidates)
            if item_id in pair["relevant"]
        ]
        results.append(
            {
                "source": pair["source"],
                "relevant": pair["relevant"],
                "rank": min(ranks) if ranks else None,
                "top3": [item_id for item_id, _ in candidates[:3]],
            }
        )
    if not results:
        return {"queries": 0, "hit_at_1": None, "mrr": None, "query_results": []}
    return {
        "queries": len(results),
        "hit_at_1": sum(result["rank"] == 1 for result in results) / len(results),
        "mrr": sum(1 / result["rank"] if result["rank"] else 0 for result in results)
        / len(results),
        "query_results": results,
    }


def timing_summary(samples: list[float]) -> dict:
    return {
        "count": len(samples),
        "median_ms": median(samples) if samples else None,
        "p90_ms": float(np.percentile(samples, 90)) if samples else None,
        "total_ms": sum(samples),
    }


def redact_sample_details(report: dict) -> None:
    for result in report["retrieval"].get("library_samples", {}).values():
        result.pop("query_results", None)
    for result in report["image_similarity"].get("library_samples", {}).values():
        result.pop("query_results", None)


def memory_mb() -> float:
    return psutil.Process().memory_info().rss / (1024 * 1024)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare Inkling's pinned Nomic embeddings with local EmbeddingGemma 2 LiteRT."
    )
    parser.add_argument("--cache-dir", type=Path, default=default_cache_dir())
    parser.add_argument(
        "--library-manifest",
        type=Path,
        help="Optional manifest for selected local copies of library items.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="JSON report path (defaults to the cache directory).",
    )
    parser.add_argument("--threads", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--gemma-backend", choices=("cpu", "gpu", "npu"), default="cpu")
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads must be at least 1")

    repo_root = Path(__file__).resolve().parents[1]
    cache_dir = args.cache_dir.expanduser().resolve()
    model_dir = cache_dir / "models"
    query_data = json.loads(
        (Path(__file__).with_name("embedding_comparison_queries.json")).read_text(
            encoding="utf-8"
        )
    )
    fixture_documents = read_documents(repo_root, cache_dir)
    fixture_queries = list(query_data["queries"])
    fixture_similarity_pairs = list(query_data["similarity_pairs"])
    documents = dict(fixture_documents)
    library_sample_documents = {}
    library_sample_queries = {"queries": [], "similarity_pairs": []}
    library_sample_count = 0
    if args.library_manifest:
        library_sample_documents, library_sample_queries = read_library_samples(
            args.library_manifest, cache_dir
        )
        collisions = set(documents).intersection(library_sample_documents)
        if collisions:
            raise ValueError(
                f"Library sample IDs collide with fixture IDs: {sorted(collisions)}"
            )
        documents.update(library_sample_documents)
        query_data["queries"].extend(library_sample_queries["queries"])
        query_data["similarity_pairs"].extend(
            library_sample_queries["similarity_pairs"]
        )
        library_sample_count = len(library_sample_documents)
    fixture_document_ids = set(fixture_documents)
    library_sample_ids = set(library_sample_documents)
    document_ids = set(documents)
    missing_relevant = {
        item_id
        for query in query_data["queries"]
        for item_id in query["relevant"]
        if item_id not in document_ids
    }
    missing_similarity = {
        item_id
        for pair in query_data["similarity_pairs"]
        for item_id in [pair["source"], *pair["relevant"]]
        if item_id not in document_ids
    }
    if missing_relevant or missing_similarity:
        raise RuntimeError(
            f"Benchmark labels refer to missing fixture IDs: {sorted(missing_relevant | missing_similarity)}"
        )
    text_ids = [item_id for item_id, item in documents.items() if item["text"]]
    pdf_ids = [item_id for item_id, item in documents.items() if item["type"] == "pdf"]
    document_types = {}
    for item in documents.values():
        document_types[item["type"]] = document_types.get(item["type"], 0) + 1
    visual_documents = sum(bool(item["images"]) for item in documents.values())
    visual_inputs = sum(len(item["images"]) for item in documents.values())
    memory_baseline = memory_mb()
    print(
        f"Documents: {len(documents)} ({len(pdf_ids)} PDFs), {len(query_data['queries'])} queries"
    )
    print(
        f"Types: {', '.join(f'{kind} {count}' for kind, count in sorted(document_types.items()))}"
    )
    print(
        f"Backend: Nomic ONNX CPU, EmbeddingGemma 2 {args.gemma_backend.upper()} ({args.threads} CPU threads)"
    )
    print(f"Cache: {cache_dir}")
    nomic = build_nomic_vectors(
        documents,
        query_data["queries"],
        repo_root / "src-tauri" / "model-manifest.json",
        model_dir / "nomic",
        args.threads,
    )
    nomic_memory_mb = nomic["rss_loaded_mb"]

    nomic_current = {}
    nomic_with_pdf_pages = {}
    for item_id in documents:
        text = (
            {"text": [nomic["text_vectors"][item_id]]}
            if item_id in nomic["text_vectors"]
            else {}
        )
        current = dict(text)
        with_pages = dict(text)
        if item_id in nomic["image_vectors"]:
            current["image"] = nomic["image_vectors"][item_id]
            with_pages["image"] = nomic["image_vectors"][item_id]
        if item_id in nomic["page_vectors"]:
            with_pages["image"] = nomic["page_vectors"][item_id]
        nomic_current[item_id] = current
        nomic_with_pdf_pages[item_id] = with_pages

    gemma = build_gemma_vectors(
        documents, query_data, model_dir / "gemma", args.gemma_backend, args.threads
    )
    memory_after_gemma_mb = gemma["rss_loaded_mb"]

    gemma_text = {}
    gemma_by_size = {70: {}, 140: {}}
    for item_id in documents:
        text = (
            {"text": [gemma["text_vectors"][item_id]]}
            if item_id in gemma["text_vectors"]
            else {}
        )
        gemma_text[item_id] = text
        for token_size in (70, 140):
            views = dict(text)
            if item_id in gemma["image_vectors"][token_size]:
                views["image"] = gemma["image_vectors"][token_size][item_id]
            if item_id in gemma["page_vectors"][token_size]:
                views["image"] = gemma["page_vectors"][token_size][item_id]
            gemma_by_size[token_size][item_id] = views

    queries = query_data["queries"]
    variants = {
        "nomic_current": (nomic_current, nomic["query_vectors"]),
        "nomic_with_pdf_pages": (nomic_with_pdf_pages, nomic["query_vectors"]),
        "gemma_text_only": (gemma_text, gemma["query_vectors"]),
        "gemma_vision_70": (gemma_by_size[70], gemma["query_vectors"]),
        "gemma_vision_140": (gemma_by_size[140], gemma["query_vectors"]),
    }
    evaluations = {
        "bundled_fixtures": (fixture_document_ids, fixture_queries, 0),
    }
    if library_sample_count:
        evaluations["library_samples"] = (
            library_sample_ids,
            library_sample_queries["queries"],
            len(fixture_queries),
        )
    retrieval = {}
    for corpus_name, (
        candidate_ids,
        corpus_queries,
        query_offset,
    ) in evaluations.items():
        query_end = query_offset + len(corpus_queries)
        retrieval[corpus_name] = {
            name: score_search(
                model_documents,
                query_vectors[query_offset:query_end],
                corpus_queries,
                candidate_ids,
            )
            for name, (model_documents, query_vectors) in variants.items()
        }
    similarity_variants = {
        "nomic": nomic["image_vectors"],
        "gemma_70": gemma["image_vectors"][70],
        "gemma_140": gemma["image_vectors"][140],
    }
    similarity = {
        "bundled_fixtures": {
            name: image_similarity(
                vectors, fixture_similarity_pairs, fixture_document_ids
            )
            for name, vectors in similarity_variants.items()
        }
    }
    if library_sample_count:
        similarity["library_samples"] = {
            name: image_similarity(
                vectors, library_sample_queries["similarity_pairs"], library_sample_ids
            )
            for name, vectors in similarity_variants.items()
        }
    timings = {
        "nomic_text_query": timing_summary(nomic["query_times"]),
        "nomic_text_document": timing_summary(nomic["text_times"]),
        "nomic_image": timing_summary(nomic["image_times"]),
        "nomic_pdf_page_image": timing_summary(nomic["page_times"]),
        "nomic_current_index_total_ms": sum(nomic["text_times"])
        + sum(nomic["image_times"]),
        "nomic_with_pdf_pages_index_total_ms": sum(nomic["text_times"])
        + sum(nomic["image_times"])
        + sum(nomic["page_times"]),
        "gemma_text_query": timing_summary(gemma["query_times"]),
        "gemma_text_document": timing_summary(gemma["text_times"]),
        "gemma_image_70": timing_summary(
            gemma["image_times"][70] + gemma["page_times"][70]
        ),
        "gemma_image_140": timing_summary(
            gemma["image_times"][140] + gemma["page_times"][140]
        ),
        "gemma_70_index_total_ms": sum(gemma["text_times"])
        + sum(gemma["image_times"][70])
        + sum(gemma["page_times"][70]),
        "gemma_140_index_total_ms": sum(gemma["text_times"])
        + sum(gemma["image_times"][140])
        + sum(gemma["page_times"][140]),
    }
    output_path = args.output or (
        cache_dir
        / "reports"
        / f"embedding-comparison-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
    )
    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "runtime": {
            "platform": platform.platform(),
            "processor": platform.processor(),
            "python": platform.python_version(),
            "cpu_count": os.cpu_count(),
            "threads": args.threads,
            "onnxruntime": ort.__version__,
            "litert_lm_api": importlib.metadata.version("litert-lm-api"),
            "pypdf": importlib.metadata.version("pypdf"),
            "pypdfium2": importlib.metadata.version("pypdfium2"),
            "tokenizers": importlib.metadata.version("tokenizers"),
            "litert_backend": args.gemma_backend,
            "litert_model_revision": gemma["model_revision"],
            "rss_baseline_mb": memory_baseline,
            "rss_nomic_loaded_mb": nomic_memory_mb,
            "rss_gemma_loaded_mb": memory_after_gemma_mb,
        },
        "corpus": {
            "documents": len(documents),
            "text_documents": len(text_ids),
            "visual_documents": visual_documents,
            "visual_inputs_including_pdf_pages": visual_inputs,
            "pdfs": len(pdf_ids),
            "document_types": document_types,
            "queries": len(queries),
            "generated_fixtures_only": library_sample_count == 0,
            "library_sample_items": library_sample_count,
            "text_used": "Bundled articles and notes, PDF text layers and OCR expectations, plus local sample text sidecars when provided",
        },
        "models": {
            "nomic": {
                **nomic["model_ids"],
                "model_files_bytes": nomic["model_size_bytes"],
                "files": nomic["model_file_sizes_bytes"],
                "revisions": nomic["model_revisions"],
                "load_ms": nomic["load_ms"],
            },
            "gemma": {
                "id": gemma["model_id"],
                "revision": gemma["model_revision"],
                "model_file_bytes": gemma["model_size_bytes"],
                "backend": gemma["backend"],
                "load_ms": gemma["load_ms"],
                "vision_tokens_tested": [70, 140],
            },
        },
        "timings": timings,
        "retrieval": retrieval,
        "image_similarity": similarity,
    }
    if library_sample_count:
        redact_sample_details(report)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\nVector retrieval (hit@1 / hit@3 / MRR)")
    print(
        f"{'corpus':20} {'variant':25} {'group':20} {'n':>4} {'Hit@1':>8} {'Hit@3':>8} {'MRR':>8}"
    )
    for corpus_name, model_results in retrieval.items():
        for name, result in model_results.items():
            groups = [
                ("overall", result["overall"]),
                *sorted(result["by_group"].items()),
            ]
            for group, metrics in groups:
                print(
                    f"{corpus_name:20} {name:25} {group:20} {metrics['queries']:4} "
                    f"{metrics['hit_at_1']:8.2f} {metrics['hit_at_3']:8.2f} {metrics['mrr']:8.2f}"
                )
    print("\nMedian inference latency")
    for name in (
        "nomic_text_query",
        "gemma_text_query",
        "nomic_image",
        "gemma_image_70",
        "gemma_image_140",
    ):
        values = timings[name]
        if values["median_ms"] is None:
            print(f"{name:24} no samples")
        else:
            print(
                f"{name:24} {values['median_ms']:.1f} ms (p90 {values['p90_ms']:.1f} ms)"
            )
    print(
        f"\nModel files: Nomic {nomic['model_size_bytes'] / 1e6:.1f} MB; Gemma {gemma['model_size_bytes'] / 1e6:.1f} MB"
    )
    print(
        f"Memory RSS: baseline {memory_baseline:.0f} MB, Nomic loaded {nomic_memory_mb:.0f} MB, Gemma loaded {memory_after_gemma_mb:.0f} MB"
    )
    print(f"Report: {output_path}")
    if library_sample_count:
        print(
            f"Read {library_sample_count} selected sample copies; no app database was opened or changed."
        )
        print(
            "The saved report omits sample queries, item IDs, and per-query rankings."
        )
    else:
        print("No app database or user library was read or changed.")


if __name__ == "__main__":
    main()
