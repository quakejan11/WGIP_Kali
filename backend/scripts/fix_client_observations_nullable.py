import sys
from pathlib import Path

from sqlalchemy import text

# Para siguradong makita niya yung app folder kahit script file ang gamit.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

try:
    from app.db.session import SessionLocal
except ImportError:
    from app.db.database import SessionLocal


def print_nullable_status(db, label):
    rows = db.execute(
        text(
            """
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'client_observations'
              AND column_name IN ('bssid', 'ssid')
            ORDER BY column_name
            """
        )
    ).mappings().all()

    print("")
    print(label)
    print("-" * 50)

    for row in rows:
        print(f"{row['column_name']}: nullable = {row['is_nullable']}")


def main():
    db = SessionLocal()

    try:
        print_nullable_status(db, "BEFORE FIX")

        db.execute(
            text(
                """
                ALTER TABLE client_observations
                    ALTER COLUMN bssid DROP NOT NULL
                """
            )
        )

        db.execute(
            text(
                """
                ALTER TABLE client_observations
                    ALTER COLUMN ssid DROP NOT NULL
                """
            )
        )

        db.commit()

        print_nullable_status(db, "AFTER FIX")

        print("")
        print("DONE: client_observations.bssid and ssid now allow NULL.")
        print("This supports actual Kismet devices that are observed but not linked to an AP.")

    finally:
        db.close()


if __name__ == "__main__":
    main()