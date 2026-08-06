from sqlalchemy import create_engine, text


DB_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/postgis_wgip"


def main():
    engine = create_engine(DB_URL)

    query = text(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_observations';
        """
    )

    with engine.connect() as conn:
        result = conn.execute(query).fetchall()

    if result:
        print("SUCCESS: client_observations table exists.")
        print(result)
    else:
        print("NOT FOUND: client_observations table does not exist yet.")


if __name__ == "__main__":
    main()