from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from config import BASE_DIR


KNOWLEDGE_DIR = BASE_DIR / "knowledge_base"
KNOWLEDGE_FILE = BASE_DIR / "knowledge_base.txt"


class RetrievalService:
    def __init__(self):
        self.documents = self._load_documents()
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=3000)
        matrix = self.vectorizer.fit_transform([item["content"] for item in self.documents])
        components = min(64, max(2, matrix.shape[0] - 1), matrix.shape[1] - 1)
        if components >= 2:
            self.reducer = TruncatedSVD(n_components=components, random_state=42)
            embeddings = self.reducer.fit_transform(matrix)
        else:  # pragma: no cover - tiny corpus fallback
            self.reducer = None
            embeddings = matrix.toarray()
        self.embeddings = normalize(embeddings)

    def _load_documents(self) -> list[dict]:
        documents = []
        if KNOWLEDGE_FILE.exists():
            for idx, chunk in enumerate(KNOWLEDGE_FILE.read_text(encoding="utf-8").split("\n\n")):
                content = chunk.strip()
                if content:
                    documents.append({"id": f"kb-{idx}", "source": "knowledge_base.txt", "content": content})

        rules_path = KNOWLEDGE_DIR / "logistics_rules.txt"
        if rules_path.exists():
            for idx, chunk in enumerate(rules_path.read_text(encoding="utf-8").split("\n\n")):
                content = chunk.strip()
                if content:
                    documents.append({"id": f"rules-{idx}", "source": "logistics_rules.txt", "content": content})

        disruptions_path = KNOWLEDGE_DIR / "disruptions.json"
        if disruptions_path.exists():
            disruptions = json.loads(disruptions_path.read_text(encoding="utf-8"))
            for idx, item in enumerate(disruptions):
                documents.append(
                    {
                        "id": f"disruption-{idx}",
                        "source": "disruptions.json",
                        "content": json.dumps(item, ensure_ascii=True),
                    }
                )
        return documents or [{"id": "empty", "source": "generated", "content": "No knowledge base loaded."}]

    def search(self, query: str, top_k: int = 3) -> list[dict]:
        query_matrix = self.vectorizer.transform([query])
        if self.reducer:
            query_embedding = self.reducer.transform(query_matrix)
        else:
            query_embedding = query_matrix.toarray()
        query_embedding = normalize(query_embedding)
        scores = np.asarray(self.embeddings @ query_embedding.T).ravel()
        ranked = scores.argsort()[::-1][:top_k]
        return [
            {
                "source": self.documents[index]["source"],
                "content": self.documents[index]["content"],
                "score": round(float(scores[index]), 4),
            }
            for index in ranked
        ]


@lru_cache(maxsize=1)
def get_retrieval_service() -> RetrievalService:
    return RetrievalService()
