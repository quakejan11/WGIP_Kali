#!/usr/bin/env python3
"""
Script to create the live_events table in the database.
"""
import sys
from pathlib import Path

# Add the backend directory to the path so we can import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.base_class import Base
from app.db.database import engine
# Import the LiveEvent model to ensure it's registered with Base
from app.models.live_event import LiveEvent

def create_live_events_table():
    """Create the live_events table"""
    try:
        # Create only the live_events table
        LiveEvent.__table__.create(engine, checkfirst=True)
        print("Live events table created successfully.")
        return True
    except Exception as e:
        print(f"Error creating live events table: {e}")
        return False

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("Usage: create_live_events_table.py [--help]")
        print("Creates the live_events table in the database.")
        return
    
    success = create_live_events_table()
    if success:
        print("Success: Live events table created.")
        sys.exit(0)
    else:
        print("Error: Failed to create live events table.")
        sys.exit(1)

if __name__ == "__main__":
    main()