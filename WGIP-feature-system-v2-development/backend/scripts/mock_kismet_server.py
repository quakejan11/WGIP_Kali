import json
import random
import time
from flask import Flask, jsonify

app = Flask(__name__)

# Mock Kismet data generator
def generate_mock_devices():
    devices = []
    for i in range(5):
        device = {
            "kismet.device.base.macaddr": f"AA:BB:CC:DD:EE:{i+1:02d}",
            "kismet.device.base.name": f"Network_{i+1}",
            "kismet.device.base.signal": random.randint(-80, -30),
            "kismet.device.base.channel": random.choice([1, 6, 11]),
            "kismet.device.base.location": {
                "lat": 14.5995 + random.random() * 0.01,
                "lon": 120.9842 + random.random() * 0.01
            },
            "kismet.device.base.crypto": random.choice(["wpa2", "wpa", "open"])
        }
        devices.append(device)
    return devices

@app.route('/devices/views/last-time')
def get_devices():
    duration = request.args.get('duration', 60)
    return jsonify(generate_mock_devices())

if __name__ == "__main__":
    from flask import request
    app.run(port=2501)