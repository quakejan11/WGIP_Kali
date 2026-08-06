from sqlalchemy import text

from app.db.session import engine


SQL = """
ALTER TABLE survey
ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);

ALTER TABLE survey
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE survey
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
"""


with engine.begin() as connection:
    connection.execute(text(SQL))

print("Survey location fields added or already exist.")