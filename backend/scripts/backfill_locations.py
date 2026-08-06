from app.db.database import SessionLocal
from app.models.observation import Observation
from app.services.geocoder import reverse_geocode


def backfill_locations():
    db = SessionLocal()

    try:
        observations = (
            db.query(Observation)
            .filter(Observation.latitude.isnot(None))
            .filter(Observation.longitude.isnot(None))
            .filter(Observation.area_label.is_(None))
            .all()
        )

        print(f"Found {len(observations)} observations to backfill.")

        updated = 0

        for item in observations:
            location_info = reverse_geocode(item.latitude, item.longitude)

            item.city = location_info.get("city")
            item.province = location_info.get("province")
            item.country = location_info.get("country")
            item.area_label = location_info.get("area_label")

            updated += 1

            print(
                f"Updated ID {item.id}: "
                f"{item.bssid} → {item.area_label}"
            )

        db.commit()

        print(f"Backfill complete. Updated {updated} records.")

    except Exception as e:
        db.rollback()
        print("Backfill failed:", e)

    finally:
        db.close()


if __name__ == "__main__":
    backfill_locations()