from sqlalchemy import text

from app.db.session import SessionLocal


db = SessionLocal()

try:
    result = db.execute(
        text("select to_regclass('public.device_profiles')")
    ).scalar()

    print(result)
finally:
    db.close()