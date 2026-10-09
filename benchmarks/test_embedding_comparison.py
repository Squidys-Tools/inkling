import json
import tempfile
import unittest
from pathlib import Path

import embedding_comparison as comparison
import numpy as np
from PIL import Image
from pypdf import PdfWriter


class LibrarySampleTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "items").mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_manifest(self, data):
        path = self.root / "manifest.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_loads_local_text_image_and_pdf_with_text_sidecar(self):
        (self.root / "items" / "note.md").write_text(
            "A note about planting herbs.", encoding="utf-8"
        )
        Image.new("RGB", (24, 24), "green").save(self.root / "items" / "garden.png")
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        with (self.root / "items" / "scan.pdf").open("wb") as file:
            writer.write(file)
        (self.root / "items" / "scan.txt").write_text(
            "OCR text from the scanned PDF.", encoding="utf-8"
        )
        manifest = self.write_manifest(
            {
                "version": 1,
                "items": [
                    {"id": "sample-note", "type": "note", "path": "items/note.md"},
                    {"id": "sample-photo", "type": "image", "path": "items/garden.png"},
                    {
                        "id": "sample-pdf",
                        "type": "pdf",
                        "path": "items/scan.pdf",
                        "text_path": "items/scan.txt",
                    },
                ],
                "queries": [
                    {
                        "query": "Where are herbs planted?",
                        "relevant": ["sample-note"],
                        "group": "library-text",
                    },
                    {
                        "query": "Find the garden photo.",
                        "relevant": ["sample-photo"],
                        "group": "library-image",
                    },
                    {
                        "query": "What text was recognized in the scan?",
                        "relevant": ["sample-pdf"],
                        "group": "library-pdf-text",
                    },
                ],
            }
        )

        documents, query_data = comparison.read_library_samples(
            manifest, self.root / "cache"
        )

        self.assertEqual(
            documents["sample-note"]["text"], "A note about planting herbs."
        )
        self.assertEqual(
            documents["sample-photo"]["images"], [self.root / "items" / "garden.png"]
        )
        self.assertEqual(
            documents["sample-pdf"]["text"], "OCR text from the scanned PDF."
        )
        self.assertEqual(len(documents["sample-pdf"]["images"]), 1)
        self.assertEqual(len(query_data["queries"]), 3)

    def test_rejects_paths_outside_the_sample_bundle(self):
        outside = self.root.parent / "outside.txt"
        outside.write_text("not a sample", encoding="utf-8")
        manifest = self.write_manifest(
            {
                "version": 1,
                "items": [
                    {"id": "sample-note", "type": "text", "path": "../outside.txt"}
                ],
                "queries": [
                    {
                        "query": "Find the sample note.",
                        "relevant": ["sample-note"],
                        "group": "library-text",
                    }
                ],
            }
        )

        with self.assertRaisesRegex(ValueError, "stay inside"):
            comparison.read_library_samples(manifest, self.root / "cache")

    def test_html_text_skips_navigation_and_scripts(self):
        page = self.root / "article.html"
        page.write_text(
            "<html><head><title>Useful article</title></head>"
            "<body><nav>Menu text</nav><main>Body content</main>"
            "<script>hidden script</script><noscript>Fallback article text</noscript>"
            "</body></html>",
            encoding="utf-8",
        )

        text = comparison.html_text(page)

        self.assertIn("Useful article", text)
        self.assertIn("Body content", text)
        self.assertIn("Fallback article text", text)
        self.assertNotIn("Menu text", text)
        self.assertNotIn("hidden script", text)

    def test_bundled_queries_cover_text_images_and_pdf_inputs(self):
        repo_root = Path(__file__).resolve().parents[1]
        documents = comparison.read_documents(repo_root, self.root / "cache")
        queries = json.loads(
            (repo_root / "benchmarks" / "embedding_comparison_queries.json").read_text(
                encoding="utf-8"
            )
        )["queries"]

        self.assertTrue(any(item["type"] == "note" for item in documents.values()))
        self.assertTrue(any(item["type"] == "article" for item in documents.values()))
        self.assertTrue(any(item["type"] == "image" for item in documents.values()))
        self.assertTrue(any(item["type"] == "pdf" for item in documents.values()))
        self.assertEqual(
            {
                item_id
                for query in queries
                for item_id in query["relevant"]
                if item_id not in documents
            },
            set(),
        )

    def test_redacted_report_omits_per_query_content_and_ids(self):
        report = {
            "retrieval": {
                "library_samples": {
                    "model": {
                        "query_results": [
                            {"query": "private", "relevant": ["private-id"]}
                        ]
                    }
                }
            },
            "image_similarity": {
                "library_samples": {
                    "model": {"query_results": [{"source": "private-id"}]}
                }
            },
        }

        comparison.redact_sample_details(report)

        self.assertNotIn(
            "query_results", report["retrieval"]["library_samples"]["model"]
        )
        self.assertNotIn(
            "query_results", report["image_similarity"]["library_samples"]["model"]
        )

    def test_scores_library_queries_only_against_library_sample_ids(self):
        documents = {
            "fixture": {"text": [np.array([1.0, 0.0])]},
            "sample": {"text": [np.array([0.0, 1.0])]},
        }
        query = {
            "query": "sample query",
            "relevant": ["sample"],
            "group": "library-text",
        }

        result = comparison.score_search(
            documents, [np.array([0.0, 1.0])], [query], {"sample"}
        )

        self.assertEqual(result["query_results"][0]["rank"], 1)


if __name__ == "__main__":
    unittest.main()
