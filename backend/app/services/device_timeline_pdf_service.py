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


def get_device_records(db: Session, client_mac: str) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                id,
                survey_id,
                import_batch_id,
                client_mac,
                client_vendor,
                bssid,
                ssid,
                channel,
                relationship_type,
                signal_dbm,
                latitude,
                longitude,
                coordinate_source,
                timestamp
            FROM client_observations
            WHERE LOWER(client_mac) = LOWER(:client_mac)
            ORDER BY timestamp ASC NULLS LAST, id ASC
            """
        ),
        {"client_mac": client_mac},
    ).mappings().all()

    return rows_to_dicts(rows)


def get_device_summary(db: Session, client_mac: str) -> Dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT
                client_mac,
                MAX(client_vendor) AS client_vendor,
                COUNT(*) AS total_records,
                COUNT(DISTINCT import_batch_id) AS scan_count,
                COUNT(DISTINCT bssid) AS linked_bssid_count,
                COUNT(DISTINCT ssid) AS linked_ssid_count,
                MIN(timestamp) AS first_seen,
                MAX(timestamp) AS last_seen,
                MIN(latitude) AS sample_latitude,
                MIN(longitude) AS sample_longitude
            FROM client_observations
            WHERE LOWER(client_mac) = LOWER(:client_mac)
            GROUP BY client_mac
            """
        ),
        {"client_mac": client_mac},
    ).mappings().first()

    if not row:
        raise ValueError(f"Device {client_mac} was not found in observed scan records.")

    return dict(row)


def get_location_summary(db: Session, client_mac: str) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                COALESCE(coordinate_source, 'unknown') AS coordinate_source,
                latitude,
                longitude,
                COUNT(*) AS total_records,
                MIN(timestamp) AS first_seen,
                MAX(timestamp) AS last_seen
            FROM client_observations
            WHERE LOWER(client_mac) = LOWER(:client_mac)
            GROUP BY COALESCE(coordinate_source, 'unknown'), latitude, longitude
            ORDER BY total_records DESC, first_seen ASC NULLS LAST
            LIMIT 30
            """
        ),
        {"client_mac": client_mac},
    ).mappings().all()

    return rows_to_dicts(rows)


def get_linked_networks(db: Session, client_mac: str) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                c.bssid,
                MAX(c.ssid) AS ssid,
                MAX(c.channel) AS channel,
                MAX(c.relationship_type) AS relationship_type,
                COUNT(*) AS total_records,
                MIN(c.timestamp) AS first_seen,
                MAX(c.timestamp) AS last_seen,
                MAX(o.encryption) AS encryption,
                MAX(o.signal_dbm) AS network_signal_dbm
            FROM client_observations c
            LEFT JOIN observations o
                ON o.import_batch_id = c.import_batch_id
                AND c.bssid IS NOT NULL
                AND LOWER(o.bssid) = LOWER(c.bssid)
            WHERE LOWER(c.client_mac) = LOWER(:client_mac)
            GROUP BY c.bssid
            ORDER BY total_records DESC, first_seen ASC NULLS LAST
            LIMIT 50
            """
        ),
        {"client_mac": client_mac},
    ).mappings().all()

    return rows_to_dicts(rows)


def get_scan_history(db: Session, client_mac: str) -> List[Dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                c.import_batch_id,
                MAX(b.original_filename) AS original_filename,
                MAX(b.manual_area_label) AS manual_area_label,
                MAX(b.db_module) AS db_module,
                MAX(b.kismet_version) AS kismet_version,
                MAX(b.created_at) AS imported_at,
                COUNT(c.id) AS device_records,
                COUNT(DISTINCT c.bssid) AS linked_bssids,
                MIN(c.timestamp) AS first_seen,
                MAX(c.timestamp) AS last_seen
            FROM client_observations c
            LEFT JOIN kismet_import_batches b
                ON b.id = c.import_batch_id
            WHERE LOWER(c.client_mac) = LOWER(:client_mac)
            GROUP BY c.import_batch_id
            ORDER BY first_seen ASC NULLS LAST, c.import_batch_id ASC
            LIMIT 50
            """
        ),
        {"client_mac": client_mac},
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


def build_device_timeline_pdf(db: Session, client_mac: str) -> BytesIO:
    summary = get_device_summary(db, client_mac)
    records = get_device_records(db, client_mac)
    location_summary = get_location_summary(db, client_mac)
    linked_networks = get_linked_networks(db, client_mac)
    scan_history = get_scan_history(db, client_mac)

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=0.35 * inch,
        leftMargin=0.35 * inch,
        topMargin=0.35 * inch,
        bottomMargin=0.35 * inch,
        title=f"WGIP Device Timeline - {client_mac}",
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

    story.append(Paragraph("WGIP Device Timeline Report", styles["Title"]))
    story.append(
        Paragraph(
            "Wireless Geospatial Intelligence Platform - observed device records only. This report does not identify the device owner.",
            styles["Subtitle"],
        )
    )
    story.append(Spacer(1, 0.18 * inch))

    add_section_title(story, "Device Summary", styles)

    summary_data = [
        [
            make_paragraph("Client MAC", styles["SmallBold"]),
            make_paragraph(summary.get("client_mac"), styles["Small"]),
            make_paragraph("Manufacturer", styles["SmallBold"]),
            make_paragraph(summary.get("client_vendor") or "Unknown Manufacturer", styles["Small"]),
        ],
        [
            make_paragraph("Total Records", styles["SmallBold"]),
            make_paragraph(safe_number(summary.get("total_records")), styles["Small"]),
            make_paragraph("Scan Count", styles["SmallBold"]),
            make_paragraph(safe_number(summary.get("scan_count")), styles["Small"]),
        ],
        [
            make_paragraph("Linked BSSIDs", styles["SmallBold"]),
            make_paragraph(safe_number(summary.get("linked_bssid_count")), styles["Small"]),
            make_paragraph("Linked SSIDs", styles["SmallBold"]),
            make_paragraph(safe_number(summary.get("linked_ssid_count")), styles["Small"]),
        ],
        [
            make_paragraph("First Seen", styles["SmallBold"]),
            make_paragraph(summary.get("first_seen"), styles["Small"]),
            make_paragraph("Last Seen", styles["SmallBold"]),
            make_paragraph(summary.get("last_seen"), styles["Small"]),
        ],
        [
            make_paragraph("Sample Location", styles["SmallBold"]),
            make_paragraph(
                format_coordinate(summary.get("sample_latitude"), summary.get("sample_longitude")),
                styles["Small"],
            ),
            make_paragraph("Report Note", styles["SmallBold"]),
            make_paragraph("Observed scan record only; no owner identification.", styles["Small"]),
        ],
    ]

    story.append(
        make_table(
            summary_data,
            col_widths=[1.35 * inch, 3.25 * inch, 1.35 * inch, 3.25 * inch],
            repeat_rows=0,
        )
    )

    add_section_title(story, "Scan History", styles)

    scan_data = [
        [
            make_paragraph("Scan ID", styles["SmallBold"]),
            make_paragraph("Scan Name / File", styles["SmallBold"]),
            make_paragraph("Import Type", styles["SmallBold"]),
            make_paragraph("Records", styles["SmallBold"]),
            make_paragraph("Linked BSSIDs", styles["SmallBold"]),
            make_paragraph("First Seen", styles["SmallBold"]),
            make_paragraph("Last Seen", styles["SmallBold"]),
        ]
    ]

    for item in scan_history:
        scan_name = item.get("manual_area_label") or item.get("original_filename") or "Unknown scan"

        scan_data.append(
            [
                make_paragraph(f"#{item.get('import_batch_id')}", styles["Small"]),
                make_paragraph(scan_name, styles["Small"]),
                make_paragraph(item.get("db_module"), styles["Small"]),
                make_paragraph(safe_number(item.get("device_records")), styles["Small"]),
                make_paragraph(safe_number(item.get("linked_bssids")), styles["Small"]),
                make_paragraph(item.get("first_seen") or item.get("imported_at"), styles["Small"]),
                make_paragraph(item.get("last_seen") or item.get("imported_at"), styles["Small"]),
            ]
        )

    if len(scan_data) == 1:
        scan_data.append(
            [
                make_paragraph("No scan history found.", styles["Small"]),
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
            scan_data,
            col_widths=[
                0.7 * inch,
                2.0 * inch,
                1.1 * inch,
                0.75 * inch,
                0.9 * inch,
                1.45 * inch,
                1.45 * inch,
            ],
        )
    )

    add_section_title(story, "Linked Wi-Fi Networks", styles)

    network_data = [
        [
            make_paragraph("BSSID", styles["SmallBold"]),
            make_paragraph("SSID", styles["SmallBold"]),
            make_paragraph("Channel", styles["SmallBold"]),
            make_paragraph("Encryption", styles["SmallBold"]),
            make_paragraph("Relationship", styles["SmallBold"]),
            make_paragraph("Records", styles["SmallBold"]),
            make_paragraph("First Seen", styles["SmallBold"]),
            make_paragraph("Last Seen", styles["SmallBold"]),
        ]
    ]

    for item in linked_networks:
        network_data.append(
            [
                make_paragraph(item.get("bssid") or "Unlinked", styles["Small"]),
                make_paragraph(item.get("ssid") or "Hidden/Unknown", styles["Small"]),
                make_paragraph(item.get("channel"), styles["Small"]),
                make_paragraph(item.get("encryption"), styles["Small"]),
                make_paragraph(item.get("relationship_type") or "observed", styles["Small"]),
                make_paragraph(safe_number(item.get("total_records")), styles["Small"]),
                make_paragraph(item.get("first_seen"), styles["Small"]),
                make_paragraph(item.get("last_seen"), styles["Small"]),
            ]
        )

    if len(network_data) == 1:
        network_data.append(
            [
                make_paragraph("No linked network records found.", styles["Small"]),
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
            network_data,
            col_widths=[
                1.25 * inch,
                1.1 * inch,
                0.55 * inch,
                0.9 * inch,
                0.9 * inch,
                0.6 * inch,
                1.45 * inch,
                1.45 * inch,
            ],
        )
    )

    add_section_title(story, "Location Summary", styles)

    location_data = [
        [
            make_paragraph("Coordinates", styles["SmallBold"]),
            make_paragraph("Coordinate Source", styles["SmallBold"]),
            make_paragraph("Records", styles["SmallBold"]),
            make_paragraph("First Seen", styles["SmallBold"]),
            make_paragraph("Last Seen", styles["SmallBold"]),
        ]
    ]

    for item in location_summary:
        location_data.append(
            [
                make_paragraph(format_coordinate(item.get("latitude"), item.get("longitude")), styles["Small"]),
                make_paragraph(item.get("coordinate_source"), styles["Small"]),
                make_paragraph(safe_number(item.get("total_records")), styles["Small"]),
                make_paragraph(item.get("first_seen"), styles["Small"]),
                make_paragraph(item.get("last_seen"), styles["Small"]),
            ]
        )

    if len(location_data) == 1:
        location_data.append(
            [
                make_paragraph("No location records found.", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
                make_paragraph("-", styles["Small"]),
            ]
        )

    story.append(
        make_table(
            location_data,
            col_widths=[
                1.7 * inch,
                1.2 * inch,
                0.8 * inch,
                1.65 * inch,
                1.65 * inch,
            ],
        )
    )

    add_section_title(story, "Device Timeline Records", styles)

    timeline_data = [
        [
            make_paragraph("Time", styles["SmallBold"]),
            make_paragraph("Scan ID", styles["SmallBold"]),
            make_paragraph("Client MAC", styles["SmallBold"]),
            make_paragraph("Manufacturer", styles["SmallBold"]),
            make_paragraph("Linked BSSID", styles["SmallBold"]),
            make_paragraph("SSID", styles["SmallBold"]),
            make_paragraph("Relationship", styles["SmallBold"]),
            make_paragraph("Signal", styles["SmallBold"]),
            make_paragraph("Location", styles["SmallBold"]),
        ]
    ]

    for item in records[:150]:
        timeline_data.append(
            [
                make_paragraph(item.get("timestamp"), styles["Small"]),
                make_paragraph(f"#{item.get('import_batch_id')}", styles["Small"]),
                make_paragraph(item.get("client_mac"), styles["Small"]),
                make_paragraph(item.get("client_vendor") or "Unknown Manufacturer", styles["Small"]),
                make_paragraph(item.get("bssid") or "Unlinked", styles["Small"]),
                make_paragraph(item.get("ssid") or "-", styles["Small"]),
                make_paragraph(item.get("relationship_type") or "observed", styles["Small"]),
                make_paragraph(item.get("signal_dbm"), styles["Small"]),
                make_paragraph(format_coordinate(item.get("latitude"), item.get("longitude")), styles["Small"]),
            ]
        )

    if len(timeline_data) == 1:
        timeline_data.append(
            [
                make_paragraph("No timeline records found.", styles["Small"]),
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
            timeline_data,
            col_widths=[
                1.25 * inch,
                0.55 * inch,
                1.2 * inch,
                0.9 * inch,
                1.2 * inch,
                0.9 * inch,
                0.75 * inch,
                0.5 * inch,
                1.2 * inch,
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
