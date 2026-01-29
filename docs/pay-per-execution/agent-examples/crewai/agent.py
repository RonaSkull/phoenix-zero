import os
import requests

BASE = os.environ.get("PHOENIX_ZERO_BASE_URL", "https://phoenix-zero-web.onrender.com")


def discover() -> dict:
    return requests.get(f"{BASE}/.well-known/ai-service.json", timeout=30).json()


def pricing() -> dict:
    return requests.get(f"{BASE}/api/pricing", timeout=30).json()


def compatible() -> dict:
    return requests.post(
        f"{BASE}/api/compatibility",
        json={"operation": "protect_video", "intent": "execute", "client": "agent"},
        timeout=30,
    ).json()


def main() -> None:
    svc = discover()
    pr = pricing()
    cp = compatible()

    print("serviceId:", svc.get("serviceId"))
    print("pricingModel:", pr.get("pricingModel"))
    print("compatible:", cp.get("compatible"))


if __name__ == "__main__":
    main()
