from sqlalchemy import distinct
from sqlalchemy.inspection import inspect

from app.db.session import SessionLocal
from app.models.client_observation import ClientObservation
from app.models.survey import Survey


DEFAULT_DEVICE_MAC = "11:22:33:44:55:66"


def get_model_columns(model):
    mapper = inspect(model)
    return {column.key for column in mapper.columns}


def get_first_available_column(model, possible_columns):
    model_columns = get_model_columns(model)

    for column_name in possible_columns:
        if column_name in model_columns:
            return column_name

    return None


def get_text_value(instance, field_name):
    if not instance or not field_name:
        return None

    value = getattr(instance, field_name, None)

    if value is None:
        return None

    return str(value)


def parse_float(value):
    value = value.strip()

    if not value:
        return None

    try:
        return float(value)
    except ValueError:
        return None


db = SessionLocal()

try:
    survey_table_name = Survey.__tablename__
    survey_columns = get_model_columns(Survey)

    print(f"Detected survey table: {survey_table_name}")
    print(f"Detected survey columns: {sorted(survey_columns)}")

    name_column = get_first_available_column(
        Survey,
        ["survey_name", "name", "title"],
    )

    location_column = get_first_available_column(
        Survey,
        ["description", "location", "location_name", "address", "notes"],
    )

    if not location_column:
        print("\nNo editable location column found in Survey model.")
        print("Expected one of: description, location, location_name, address, notes")
        raise SystemExit

    print(f"Using location column: {location_column}")

    device_mac = input(f"\nDevice MAC [{DEFAULT_DEVICE_MAC}]: ").strip()

    if not device_mac:
        device_mac = DEFAULT_DEVICE_MAC

    survey_ids = (
        db.query(distinct(ClientObservation.survey_id))
        .filter(ClientObservation.client_mac == device_mac)
        .filter(ClientObservation.survey_id.isnot(None))
        .order_by(ClientObservation.survey_id)
        .all()
    )

    survey_ids = [row[0] for row in survey_ids]

    if not survey_ids:
        print(f"No scan records found for device: {device_mac}")
        raise SystemExit

    print(f"\nDevice: {device_mac}")
    print("Scans found:")

    for survey_id in survey_ids:
        survey = db.query(Survey).filter(Survey.id == survey_id).first()

        client_records = (
            db.query(ClientObservation)
            .filter(ClientObservation.client_mac == device_mac)
            .filter(ClientObservation.survey_id == survey_id)
            .all()
        )

        current_latitude = None
        current_longitude = None

        if client_records:
            current_latitude = client_records[0].latitude
            current_longitude = client_records[0].longitude

        if survey:
            scan_name = get_text_value(survey, name_column) or f"Scan #{survey_id}"
            current_location = get_text_value(survey, location_column)

            print(
                f"- Survey ID: {survey_id} | "
                f"Scan Name: {scan_name} | "
                f"Current Location: {current_location} | "
                f"Current Coordinates: {current_latitude}, {current_longitude}"
            )
        else:
            print(f"- Survey ID: {survey_id} | Survey not found")

    print("\nEnter location and coordinates per scan.")
    print("Example:")
    print("Cubao    = 14.6196, 121.0510")
    print("Ortigas  = 14.5869, 121.0614")
    print("Leave blank if you do not want to change a value.\n")

    for survey_id in survey_ids:
        survey = db.query(Survey).filter(Survey.id == survey_id).first()

        if not survey:
            continue

        print(f"\nSurvey ID {survey_id}")

        new_location = input("Location name: ").strip()
        new_latitude = parse_float(input("Latitude: "))
        new_longitude = parse_float(input("Longitude: "))

        if new_location:
            setattr(survey, location_column, new_location)

        if new_latitude is not None and new_longitude is not None:
            updated_count = (
                db.query(ClientObservation)
                .filter(ClientObservation.client_mac == device_mac)
                .filter(ClientObservation.survey_id == survey_id)
                .update(
                    {
                        ClientObservation.latitude: new_latitude,
                        ClientObservation.longitude: new_longitude,
                    },
                    synchronize_session=False,
                )
            )

            print(
                f"Updated {updated_count} client observation record(s) "
                f"for Survey ID {survey_id}."
            )
        elif new_latitude is not None or new_longitude is not None:
            print(
                "Skipped coordinate update because both latitude and longitude are required."
            )

    db.commit()

    print("\nScan locations and coordinates updated successfully.")

finally:
    db.close()