from sqlalchemy import text

from app.db.session import engine


SQL = """
CREATE TABLE IF NOT EXISTS import_batch (
    id SERIAL PRIMARY KEY
);

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS survey_id INTEGER;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS filename VARCHAR;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS file_type VARCHAR;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS total_records INTEGER;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS inserted_records INTEGER;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS status VARCHAR;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS source VARCHAR;

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE import_batch
ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE import_batch
ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE import_batch
SET
    total_records = COALESCE(total_records, 0),
    inserted_records = COALESCE(inserted_records, 0),
    status = COALESCE(status, 'completed'),
    source = COALESCE(source, 'kismet_import'),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW());

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'import_batch_survey_id_fkey'
        AND table_name = 'import_batch'
    ) THEN
        ALTER TABLE import_batch
        ADD CONSTRAINT import_batch_survey_id_fkey
        FOREIGN KEY (survey_id) REFERENCES survey(id);
    END IF;
END $$;
"""


with engine.begin() as connection:
    connection.execute(text(SQL))

print("import_batch table fixed successfully.")