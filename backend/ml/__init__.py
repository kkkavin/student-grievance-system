from backend.ml.classifier import classify_complaint, default_classifier
from backend.ml.deduplication import (
    cosine_similarity,
    jaccard_similarity,
    compute_hybrid_similarity,
    evaluate_deduplication,
)

__all__ = [
    "classify_complaint",
    "default_classifier",
    "cosine_similarity",
    "jaccard_similarity",
    "compute_hybrid_similarity",
    "evaluate_deduplication",
]
