import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

try:
    from app.db.session import SessionLocal
except ImportError:
    from app.db.database import SessionLocal


def main():
    db = SessionLocal()

    try:
        failed_rows = db.execute(
            text(
                """
                SELECT id, original_filename, import_status, error_message
                FROM kismet_import_batches
                WHERE import_status = 'failed'
                ORDER BY id
                """
            )
        ).mappings().all()

        if not failed_rows:
            print("No failed imports found.")
            return

        failed_ids = [row["id"] for row in failed_rows]

        print("Failed imports to delete:")
        for row in failed_rows:
            print(f"  #{row['id']} - {row['original_filename']} - {row['import_status']}")

        db.execute(
            text("DELETE FROM client_observations WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM observations WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_packets WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_messages WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_snapshots WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_alerts WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_data WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_datasources WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_raw_devices WHERE import_batch_id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.execute(
            text("DELETE FROM kismet_import_batches WHERE id = ANY(:ids)"),
            {"ids": failed_ids},
        )

        db.commit()

        print("")
        print(f"DONE: Deleted {len(failed_ids)} failed import batch record(s).")
        print("Completed imports were not touched.")

    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()