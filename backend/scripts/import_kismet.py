import json
import requests

API_URL = "http://127.0.0.1:8000/observations"


def import_kismet(file_path, survey_id=1):
    with open(file_path, "r") as f:
        data = json.load(f)

    for item in data:
        payload = {
            "survey_id": survey_id,
            "bssid": item.get("bssid"),
            "ssid": item.get("ssid"),
            "rssi": item.get("rssi"),
            "channel": item.get("channel"),

            "latitude": item.get("latitude") or item.get("lat"),
            "longitude": item.get("longitude") or item.get("lon") or item.get("lng"),

            "encryption": item.get("encryption")
        }

        response = requests.post(API_URL, json=payload)

        if response.status_code == 200:
            print(f"Inserted: {payload['bssid']}")
        else:
            print(f"Failed: {payload['bssid']} → {response.text}")


if __name__ == "__main__":
    import_kismet("app/utils/mock_kismet.json")