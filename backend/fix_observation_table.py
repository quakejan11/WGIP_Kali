from sqlalchemy import text

from app.db.session import engine


SQL = """
CREATE TABLE IF NOT EXISTS observation (
    id SERIAL PRIMARY KEY
);

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS survey_id INTEGER;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS import_batch_id INTEGER;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS bssid VARCHAR;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS ssid VARCHAR;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS channel INTEGER;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS rssi INTEGER;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS signal_dbm INTEGER;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS encryption VARCHAR;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE observation
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE observation
ALTER COLUMN created_at SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'observation_survey_id_fkey'
        AND table_name = 'observation'
    ) THEN
        ALTER TABLE observation
        ADD CONSTRAINT observation_survey_id_fkey
        FOREIGN KEY (survey_id) REFERENCES survey(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'observation_import_batch_id_fkey'
        AND table_name = 'observation'
    ) THEN
        ALTER TABLE observation
        ADD CONSTRAINT observation_import_batch_id_fkey
        FOREIGN KEY (import_batch_id) REFERENCES import_batch(id);
    END IF;
END $$;
"""


CHECK_SQL = """
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'observation'
ORDER BY ordinal_position;
"""


with engine.begin() as connection:
    connection.execute(text(SQL))

    result = connection.execute(text(CHECK_SQL))
    columns = result.fetchall()

print("observation table fixed successfully.")
print("Current observation columns:")

for column_name, data_type in columns:
    print(f"- {column_name}: {data_type}")