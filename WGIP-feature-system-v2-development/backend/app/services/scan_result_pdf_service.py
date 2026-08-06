from io import BytesIO
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import text
from sqlalchemy.orm import Session


def safe_text(value: Any, default: str = "-") -> str:
    if value is None:
        return default

    text_value = str(value).strip()

    if text_value == "":
        return default

    return text_value


def safe_number(value: Any) -> str:
    if value is None:
        return "0"

    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return safe_text(value)


def format_coordinate(lat: Any, lon: Any) -> str:
    try:
        lat_value = float(lat)
        lon_value = float(lon)
    except (TypeError, ValueError):
        return "No GPS"

    if lat_value == 0 and lon_value == 0:
        return "No GPS"

    return f"{lat_value:.6f}, {lon_value:.6f}"


def rows_to_dicts(rows) -> List[Dict[str, Any]]:
    return [dict(row) for row in rows]


def get_batch(db: Session, import_batch_id: int) -> Dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT
                id,
                original_filename,
                file_hash,
                kismet_version,
                db_version,
                db_module,
                import_status,
                import_notes,
                manual_area_label,
                manual_latitude,
                manual_longitude,
                coordinate_source,
                device_count,
                packet_count,
                message_count,
                snapshot_count,
                alert_count,
                data_count,
                datasource_count,
                wifi_observation_count,
                client_observation_count,
                failed_count,
                error_message,
                created_at,
                completed_at
            FROM kismet_import_batches
            WHERE id = :import_batch_id
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().first()

    if not row:
        raise ValueError(f"Scan ID #{import_batch_id} was not found.")

    return dict(row)


def get_stats(db: Session, import_batch_id: int) -> Dict[str, Any]:
    wifi_stats = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS wifi_observations,
                COUNT(DISTINCT bssid) AS unique_bssids,
                COUNT(DISTINCT ssid) AS unique_ssids
            FROM observations
            WHERE import_batch_id = :import_batch_id
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().first()

    client_stats = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS client_observations,
                COUNT(DISTINCT client_mac) AS unique_clients,
                COUNT(DISTINCT bssid) AS linked_bssids
            FROM client_observations
            WHERE import_batch_id = :import_batch_id
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().first()

    return {
        "wifi_observations": int(wifi_stats["wifi_observations"] or 0),
        "unique_bssids": int(wifi_stats["unique_bssids"] or 0),
        "unique_ssids": int(wifi_stats["unique_ssids"] or 0),
        "client_observations": int(client_stats["client_observations"] or 0),
        "unique_clients": int(client_stats["unique_clients"] or 0),
        "linked_bssids": int(client_stats["linked_bssids"] or 0),
    }


def get_review_items(db: Session, import_batch_id: int) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                o.bssid,
                MAX(o.ssid) AS ssid,
                MAX(o.manufacturer) AS manufacturer,
                MAX(o.channel) AS channel,
                MAX(o.encryption) AS encryption,
                MAX(o.signal_dbm) AS signal_dbm,
                MAX(o.latitude) AS latitude,
                MAX(o.longitude) AS longitude,
                MAX(o.coordinate_source) AS coordinate_source,
                COUNT(c.id) AS observed_device_count
            FROM observations o
            LEFT JOIN client_observations c
                ON c.import_batch_id = o.import_batch_id
                AND c.bssid IS NOT NULL
                AND LOWER(c.bssid) = LOWER(o.bssid)
            WHERE o.import_batch_id = :import_batch_id
            GROUP BY o.bssid
            ORDER BY observed_device_count DESC, o.bssid ASC
            LIMIT 50
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    return rows_to_dicts(rows)


def get_wifi_records(db: Session, import_batch_id: int) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                id,
                bssid,
                ssid,
                manufacturer,
                channel,
                encryption,
                signal_dbm,
                latitude,
                longitude,
                coordinate_source,
                timestamp,
                created_at
            FROM observations
            WHERE import_batch_id = :import_batch_id
            ORDER BY timestamp ASC NULLS LAST, id ASC
            LIMIT 100
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    return rows_to_dicts(rows)


def get_client_records(db: Session, import_batch_id: int) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                id,
                client_mac,
                bssid,
                ssid,
                channel,
                client_vendor,
                relationship_type,
                signal_dbm,
                latitude,
                longitude,
                coordinate_source,
                timestamp
            FROM client_observations
            WHERE import_batch_id = :import_batch_id
            ORDER BY timestamp ASC NULLS LAST, id ASC
            LIMIT 120
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    return rows_to_dicts(rows)


def get_raw_breakdown(db: Session, import_batch_id: int) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                COALESCE(device_type, 'Unknown') AS device_type,
                COUNT(*) AS total
            FROM kismet_raw_devices
            WHERE import_batch_id = :import_batch_id
            GROUP BY COALESCE(device_type, 'Unknown')
            ORDER BY total DESC, device_type ASC
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    return rows_to_dicts(rows)


def make_paragraph(value: Any, style) -> Paragraph:
    return Paragraph(safe_text(value), style)


def make_table(data, col_widths=None, repeat_rows=1):
    table = Table(data, colWidths=col_widths, repeatRows=repeat_rows)

    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )

    return table


def add_section_title(story, title: str, styles):
    story.append(Spacer(1, 0.14 * inch))
    story.append(Paragraph(title, styles["SectionTitle"]))
    story.append(Spacer(1, 0.06 * inch))


def build_scan_result_pdf(db: Session, import_batch_id: int) -> BytesIO:
    batch = get_batch(db, import_batch_id)
    stats = get_stats(db, import_batch_id)
    review_items = get_review_items(db, import_batch_id)
    wifi_records = get_wifi_records(db, import_batch_id)
    client_records = get_client_records(db, import_batch_id)
    raw_breakdown = get_raw_breakdown(db, import_batch_id)

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=0.35 * inch,
        leftMargin=0.35 * inch,
        topMargin=0.35 * inch,
        bottomMargin=0.35 * inch,
        title=f"WGIP Scan Result #{import_batch_id}",
    )

    sample_styles = getSampleStyleSheet()

    styles = {
        "Title": ParagraphStyle(
            "Title",
            parent=sample_styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#111827"),
        ),
        "Subtitle": ParagraphStyle(
            "Subtitle",
            parent=sample_styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#4B5563"),
        ),
        "SectionTitle": ParagraphStyle(
            "SectionTitle",
            parent=sample_styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#111827"),
            spaceAfter=4,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=sample_styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#374151"),
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=sample_styles["BodyText"],
            fontName="Helvetica",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#374151"),
        ),
        "SmallBold": ParagraphStyle(
            "SmallBold",
            parent=sample_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#111827"),
        ),
    }

    story = []

    story.append(Paragraph("WGIP Scan Result Report", styles["Title"]))
    story.append(
        Paragraph(
            "Wireless Geospatial Intelligence Platform - observed wireless scan records only. This report does not identify device owners.",
            styles["Subtitle"],
        )
    )
    story.append(Spacer(1, 0.18 * inch))

    add_section_title(story, "Scan Summary", styles)

    scan_summary_data = [
        [
            make_paragraph("Scan ID", styles["SmallBold"]),
            make_paragraph(f"#{batch['id']}", styles["Small"]),
            make_paragraph("Source File", styles["SmallBold"]),
            make_paragraph(batch.get("original_filename"), styles["Small"]),
        ],
        [
            make_paragraph("Import Type", styles["SmallBold"]),
            make_paragraph(batch.get("db_module"), styles["Small"]),
            make_paragraph("Status", styles["SmallBold"]),
            make_paragraph(batch.get("import_status"), styles["Small"]),
        ],
        [
            make_paragraph("Kismet Version", styles["SmallBold"]),
            make_paragraph(batch.get("kismet_version"), styles["Small"]),
            make_paragraph("Coordinate Source", styles["SmallBold"]),
            make_paragraph(batch.get("coordinate_source"), styles["Small"]),
        ],
        [
            make_paragraph("Scan Location Label", styles["SmallBold"]),
            make_paragraph(batch.get("manual_area_label"), styles["Small"]),
            make_paragraph("Fallback Coordinates", styles["SmallBold"]),
            make_paragraph(
                format_coordinate(batch.get("manual_latitude"), batch.get("manual_longitude")),
                styles["Small"],
            ),
        ],
        [
            make_paragraph("Imported", styles["SmallBold"]),
            make_paragraph(batch.get("created_at"), styles["Small"]),
            make_paragraph("Completed", styles["SmallBold"]),
            make_paragraph(batch.get("completed_at"), styles["Small"]),
        ],
    ]

    story.append(
        make_table(
            scan_summary_data,
            col_widths=[1.35 * inch, 3.25 * inch, 1.45 * inch, 3.25 * inch],
            repeat_rows=0,
        )
    )

    add_section_title(story, "Record Counts", styles)

    counts_data = [
        [
            make_paragraph("Wi-Fi Observations", styles["SmallBold"]),
            make_paragraph(safe_number(stats["wifi_observations"]), styles["Small"]),
            make_paragraph("Unique BSSIDs", styles["SmallBold"]),
            make_paragraph(safe_number(stats["unique_bssids"]), styles["Small"]),
            make_paragraph("Unique SSIDs", styles["SmallBold"]),
            make_paragraph(safe_number(stats["unique_ssids"]), styles["Small"]),
        ],
        [
            make_paragraph("Observed Device Records", styles["SmallBold"]),
            make_paragraph(safe_number(stats["client_observations"]), styles["Small"]),
            make_paragraph("Unique Devices", styles["SmallBold"]),
            make_paragraph(safe_number(stats["unique_clients"]), styles["Small"]),
            make_paragraph("Linked BSSIDs", styles["SmallBold"]),
            make_paragraph(safe_number(stats["linked_bssids"]), styles["Small"]),
        ],
        [
            make_paragraph("Raw Devices", styles["SmallBold"]),
            make_paragraph(safe_number(batch.get("device_count")), styles["Small"]),
            make_paragraph("Raw Packets", styles["SmallBold"]),
            make_paragraph(safe_number(batch.get("packet_count")), styles["Small"]),
            make_paragraph("Failed Rows", styles["SmallBold"]),
            make_paragraph(safe_number(batch.get("failed_count")), styles["Small"]),
        ],
    ]

    story.append(
        make_table(
            counts_data,
            col_widths=[
                1.55 * inch,
                1.05 * inch,
                1.45 * inch,
                1.05 * inch,
                1.45 * inch,
                1.05 * inch,
            ],
            repeat_rows=0,
        )
    )

    add_section_title(story, "Raw Device Type Breakdown", styles)

    raw_breakdown_data = [
        [
            make_paragraph("Device Type", styles["SmallBold"]),
            make_paragraph("Total", styles["SmallBold"]),
        ]
    ]

    for item in raw_breakdown:
        raw_breakdown_data.append(
            [
                make_paragraph(item.get("device_type"), styles["Small"]),
                make_paragraph(safe_number(item.get("total")), styles["Small"]),
            ]
        )

    if len(raw_breakdown_data) == 1:
        raw_breakdown_data.append(
            [
                make_paragraph("No raw device breakdown found.", styles["Small"]),
                make_paragraph("0", styles["Small"]),
            ]
        )

    story.append(make_table(raw_breakdown_data, col_widths=[4.0 * inch, 1.0 * inch]))

    add_section_title(story, "Review Items - Wi-Fi Networks", styles)

    review_data = [
        [
            make_paragraph("SSID", styles["SmallBold"]),
            make_paragraph("BSSID", styles["SmallBold"]),
            make_paragraph("Manufacturer", styles["SmallBold"]),
            make_paragraph("Channel", styles["SmallBold"]),
            make_paragraph("Encryption", styles["SmallBold"]),
            make_paragraph("Signal", styles["SmallBold"]),
            make_paragraph("Observed Devices", styles["SmallBold"]),
            make_paragraph("Location", styles["SmallBold"]),
        ]
    ]

    for item in review_items:
        review_data.append(
            [
                make_paragraph(item.get("ssid") or "Hidden/Unknown", styles["Small"]),
                make_paragraph(item.get("bssid"), styles["Small"]),
                make_paragraph(item.get("manufacturer") or "Unknown Manufacturer", styles["Small"]),
                make_paragraph(item.get("channel"), styles["Small"]),
                make_paragraph(item.get("encryption"), styles["Small"]),
                make_paragraph(item.get("signal_dbm"), styles["Small"]),
                make_paragraph(safe_number(item.get("observed_device_count")), styles["Small"]),
                make_paragraph(format_coordinate(item.get("latitude"), item.get("longitude")), styles["Small"]),
            ]
        )

    if len(review_data) == 1:
        review_data.append(
            [
                make_paragraph("No review items found.", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
            ]
        )

    story.append(
        make_table(
            review_data,
            col_widths=[
                1.55 * inch,
                1.45 * inch,
                1.35 * inch,
                0.65 * inch,
                1.05 * inch,
                0.65 * inch,
                1.0 * inch,
                1.55 * inch,
            ],
        )
    )

    add_section_title(story, "Wi-Fi Detection Records", styles)

    wifi_data = [
        [
            make_paragraph("SSID", styles["SmallBold"]),
            make_paragraph("BSSID", styles["SmallBold"]),
            make_paragraph("Manufacturer", styles["SmallBold"]),
            make_paragraph("Channel", styles["SmallBold"]),
            make_paragraph("Encryption", styles["SmallBold"]),
            make_paragraph("Signal", styles["SmallBold"]),
            make_paragraph("Location", styles["SmallBold"]),
            make_paragraph("Source", styles["SmallBold"]),
            make_paragraph("Time", styles["SmallBold"]),
        ]
    ]

    for item in wifi_records:
        wifi_data.append(
            [
                make_paragraph(item.get("ssid") or "Hidden/Unknown", styles["Small"]),
                make_paragraph(item.get("bssid"), styles["Small"]),
                make_paragraph(item.get("manufacturer") or "Unknown Manufacturer", styles["Small"]),
                make_paragraph(item.get("channel"), styles["Small"]),
                make_paragraph(item.get("encryption"), styles["Small"]),
                make_paragraph(item.get("signal_dbm"), styles["Small"]),
                make_paragraph(format_coordinate(item.get("latitude"), item.get("longitude")), styles["Small"]),
                make_paragraph(item.get("coordinate_source"), styles["Small"]),
                make_paragraph(item.get("timestamp") or item.get("created_at"), styles["Small"]),
            ]
        )

    if len(wifi_data) == 1:
        wifi_data.append(
            [
                make_paragraph("No Wi-Fi records found.", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
            ]
        )

    story.append(
        make_table(
            wifi_data,
            col_widths=[
                1.25 * inch,
                1.35 * inch,
                1.25 * inch,
                0.55 * inch,
                0.85 * inch,
                0.55 * inch,
                1.35 * inch,
                0.85 * inch,
                1.55 * inch,
            ],
        )
    )

    add_section_title(story, "Observed Device Records", styles)

    client_data = [
        [
            make_paragraph("Client MAC", styles["SmallBold"]),
            make_paragraph("Linked BSSID", styles["SmallBold"]),
            make_paragraph("SSID", styles["SmallBold"]),
            make_paragraph("Manufacturer", styles["SmallBold"]),
            make_paragraph("Relationship", styles["SmallBold"]),
            make_paragraph("Signal", styles["SmallBold"]),
            make_paragraph("Location", styles["SmallBold"]),
            make_paragraph("Time", styles["SmallBold"]),
        ]
    ]

    for item in client_records:
        client_data.append(
            [
                make_paragraph(item.get("client_mac"), styles["Small"]),
                make_paragraph(item.get("bssid") or "Unlinked", styles["Small"]),
                make_paragraph(item.get("ssid") or "-", styles["Small"]),
                make_paragraph(item.get("client_vendor") or "Unknown Manufacturer", styles["Small"]),
                make_paragraph(item.get("relationship_type") or "observed", styles["Small"]),
                make_paragraph(item.get("signal_dbm"), styles["Small"]),
                make_paragraph(format_coordinate(item.get("latitude"), item.get("longitude")), styles["Small"]),
                make_paragraph(item.get("timestamp"), styles["Small"]),
            ]
        )

    if len(client_data) == 1:
        client_data.append(
            [
                make_paragraph("No observed device records found.", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
            ]
        )

    story.append(
        make_table(
            client_data,
            col_widths=[
                1.25 * inch,
                1.25 * inch,
                1.05 * inch,
                1.0 * inch,
                0.9 * inch,
                0.55 * inch,
                1.25 * inch,
                1.55 * inch,
            ],
        )
    )

    story.append(Spacer(1, 0.16 * inch))
    story.append(
        Paragraph(
            "Note: This report is generated from authorized Kismet import records. Device observations are technical scan records only and do not identify device owners.",
            styles["Small"],
        )
    )

    doc.build(story)
    buffer.seek(0)

    return buffer
