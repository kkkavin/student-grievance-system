"""Campus grievance machine learning and deduplication package."""
try:
    from backend.app.ml.classifier import (
        ComplaintClassifier,
        classify_complaint,
        analyze_spam,
        COMPLAINT_CATEGORIES,
        CATEGORY_ICONS,
        CATEGORY_DEPARTMENT_MAP,
    )
    from backend.app.ml.deduplication import (
        cosine_similarity,
        jaccard_similarity,
        compute_hybrid_similarity,
        evaluate_deduplication,
        generate_embedding_vector,
        check_location_adjacency,
        run_two_stage_deduplication,
        group_semantic_grievances,
        cascade_resolve_ticket_tree,
        EmbeddingService,
        compute_embedding,
        compute_cosine_similarity,
        find_semantic_duplicate,
    )
except ImportError:
    from app.ml.classifier import (
        ComplaintClassifier,
        classify_complaint,
        analyze_spam,
        COMPLAINT_CATEGORIES,
        CATEGORY_ICONS,
        CATEGORY_DEPARTMENT_MAP,
    )
    from app.ml.deduplication import (
        cosine_similarity,
        jaccard_similarity,
        compute_hybrid_similarity,
        evaluate_deduplication,
        generate_embedding_vector,
        check_location_adjacency,
        run_two_stage_deduplication,
        group_semantic_grievances,
        cascade_resolve_ticket_tree,
        EmbeddingService,
        compute_embedding,
        compute_cosine_similarity,
        find_semantic_duplicate,
    )

__all__ = [
    "ComplaintClassifier",
    "classify_complaint",
    "analyze_spam",
    "COMPLAINT_CATEGORIES",
    "CATEGORY_ICONS",
    "CATEGORY_DEPARTMENT_MAP",
    "cosine_similarity",
    "compute_cosine_similarity",
    "EmbeddingService",
    "compute_embedding",
    "find_semantic_duplicate",
    "jaccard_similarity",
    "compute_hybrid_similarity",
    "evaluate_deduplication",
    "generate_embedding_vector",
    "check_location_adjacency",
    "run_two_stage_deduplication",
    "group_semantic_grievances",
    "cascade_resolve_ticket_tree",
]
