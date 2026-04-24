import os
import secrets
import sys
from pathlib import Path

os.environ.setdefault("SECRET_KEY", secrets.token_urlsafe(24))
os.environ.setdefault("DEMO_ADMIN_PASSWORD", secrets.token_urlsafe(12))
os.environ.setdefault("DEMO_SUPERUSER_PASSWORD", secrets.token_urlsafe(12))
os.environ.setdefault("DEMO_CARRIER_PASSWORD", secrets.token_urlsafe(12))
os.environ.setdefault("DEMO_FIELD_PASSWORD", secrets.token_urlsafe(12))
os.environ.setdefault("DEMO_USER_PASSWORD", secrets.token_urlsafe(12))


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
