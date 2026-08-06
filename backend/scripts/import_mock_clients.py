import json
from pathlib import Path

import requests


API_URL = "http://127.0.0.1:8000/client-observations"
MOCK_FILE = Path("app/utils/mock_kismet_clients.json")


def main():
    if not MOCK_FILE.exists():
        print(f"ERROR: Mock file not found: {MOCK_FILE}")
        return

    with MOCK_FILE.open("r", encoding="utf-8") as file:
        client_observations = json.load(file)

    for item in client_observations:
        response = requests.post(API_URL, json=item, timeout=10)

        if response.status_code in (200, 201):
            print(
                "Inserted client:",
                item["client_mac"],
                "->",
                item["bssid"],
            )
        else:
            print(
                "FAILED:",
                item["client_mac"],
                "->",
                item["bssid"],
                response.status_code,
            )
            print(response.text)


if __name__ == "__main__":
    main()