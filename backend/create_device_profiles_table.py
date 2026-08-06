from sqlalchemy import text

from app.db.session import engine


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS device_profiles (
    id SERIAL PRIMARY KEY,
    client_mac VARCHAR(32) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS ix_device_profiles_client_mac
ON device_profiles (client_mac);
"""


with engine.begin() as connection:
    connection.execute(text(CREATE_TABLE_SQL))
    connection.execute(text(CREATE_INDEX_SQL))

print("device_profiles table created or already exists.")