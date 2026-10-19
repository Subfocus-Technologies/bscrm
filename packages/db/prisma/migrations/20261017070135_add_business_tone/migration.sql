-- AlterTable
ALTER TABLE "business" ADD COLUMN     "tone" INTEGER NOT NULL DEFAULT 0;

UPDATE "business" AS b
SET "tone" = ranked.position % 5
FROM (
    SELECT "id", (ROW_NUMBER() OVER (ORDER BY "createdAt", "id") - 1) AS position
    FROM "business"
) AS ranked
WHERE b."id" = ranked."id";
