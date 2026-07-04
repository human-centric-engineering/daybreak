-- Framework — facilitation map (f-map t-2). Adds the authored graph + its
-- immutable version snapshots. Touches only `framework_*` tables.
--
-- NOTE: `prisma migrate dev` also emitted spurious `DROP INDEX` for the pgvector
-- HNSW / tsvector GIN indexes and an `ai_knowledge_chunk` DEFAULT drop — objects
-- Prisma cannot model. Those were stripped by hand (the documented migrate-dev
-- footgun; see .context/database/prisma-unmodelled-objects.md). Only the
-- framework DDL below is kept, so the migration stays `framework_*`-only.

-- CreateTable
CREATE TABLE "framework_facilitation_graph" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "draftDefinition" JSONB,
    "publishedVersionId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_facilitation_graph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_facilitation_graph_version" (
    "id" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_facilitation_graph_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_facilitation_graph_slug_key" ON "framework_facilitation_graph"("slug");

-- CreateIndex
CREATE INDEX "framework_facilitation_graph_publishedVersionId_idx" ON "framework_facilitation_graph"("publishedVersionId");

-- CreateIndex
CREATE INDEX "framework_facilitation_graph_version_graphId_idx" ON "framework_facilitation_graph_version"("graphId");

-- CreateIndex
CREATE UNIQUE INDEX "framework_facilitation_graph_version_graphId_version_key" ON "framework_facilitation_graph_version"("graphId", "version");

-- AddForeignKey
ALTER TABLE "framework_facilitation_graph" ADD CONSTRAINT "framework_facilitation_graph_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "framework_facilitation_graph_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_facilitation_graph_version" ADD CONSTRAINT "framework_facilitation_graph_version_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "framework_facilitation_graph"("id") ON DELETE CASCADE ON UPDATE CASCADE;
