# check_bssids.py
from sqlalchemy import text
from app.db.session import SessionLocal

db = SessionLocal()

# Count unique BSSIDs
result = db.execute(text("""
    SELECT COUNT(DISTINCT bssid) as total 
    FROM observation 
    WHERE bssid IS NOT NULL AND bssid != ''
"""))

total_bssids = result.fetchone()[0]
print(f"Total unique BSSIDs (APs): {total_bssids}")

# Show sample of BSSIDs
result2 = db.execute(text("""
    SELECT DISTINCT bssid, ssid, channel 
    FROM observation 
    WHERE bssid IS NOT NULL AND bssid != '' 
    LIMIT 10
"""))

print("\nSample BSSIDs:")
for row in result2:
    print(f"  BSSID: {row[0]}, SSID: {row[1] or 'Unknown'}, Channel: {row[2] or '?'}")

db.close()