CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Embedding" ADD COLUMN "embedding" vector(384);

CREATE INDEX "Embedding_embedding_idx" ON "Embedding" USING hnsw ("embedding" vector_cosine_ops);
