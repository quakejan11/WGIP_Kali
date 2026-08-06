# check_tables.py
from sqlalchemy import create_engine, text
from app.core.config import settings

# Get database URL from your settings
DATABASE_URL = settings.DATABASE_URL

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if tables exist
    result = conn.execute(text("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name LIKE 'deauth_%'
        ORDER BY table_name;
    """))
    
    tables = result.fetchall()
    
    if tables:
        print("✅ Deauth tables found:")
        for table in tables:
            print(f"   - {table[0]}")
    else:
        print("❌ No deauth tables found")