import os
import requests

BASE = os.environ.get("PHOENIX_ZERO_BASE_URL", "https://phoenix-zero-web.onrender.com")


def main() -> None:
    service = requests.get(f"{BASE}/.well-known/ai-service.json", timeout=30).json()
    pricing = requests.get(f"{BASE}/api/pricing", timeout=30).json()
    compat = requests.post(
        f"{BASE}/api/compatibility",
        json={"operation": "protect_video", "intent": "execute", "client": "agent"},
        timeout=30,
    ).json()

    print("discovery:", service.get("discovery"))
    print("pricing ok:", pricing.get("ok"), "currency:", pricing.get("currency"))
    print("compatible:", compat.get("compatible"), "reason:", compat.get("reason"))


if __name__ == "__main__":
    main()
