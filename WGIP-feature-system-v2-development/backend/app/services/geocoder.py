import reverse_geocoder as rg


def reverse_geocode(latitude, longitude):
    """
    Convert latitude/longitude into approximate location details.

    Note:
    This uses nearest-place lookup.
    Later, we can upgrade this to official PostGIS boundary matching.
    """

    if latitude is None or longitude is None:
        return {
            "city": None,
            "province": None,
            "country": None,
            "area_label": None,
        }

    try:
        result = rg.search((latitude, longitude), mode=1)[0]

        city = result.get("name")
        province = result.get("admin1")
        country = result.get("cc")

        area_parts = [
            part for part in [city, province, country] if part
        ]

        area_label = ", ".join(area_parts) if area_parts else None

        return {
            "city": city,
            "province": province,
            "country": country,
            "area_label": area_label,
        }

    except Exception:
        return {
            "city": None,
            "province": None,
            "country": None,
            "area_label": None,
        }