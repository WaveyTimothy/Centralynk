import base64
import hashlib
import os
from cryptography.fernet import Fernet


def get_fernet() -> Fernet:
    secret = os.getenv("SECRET_KEY", "")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_key(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()


def decrypt_key(value: str) -> str:
    """Decrypt a Fernet token; fall back to the raw value for plaintext keys during migration."""
    try:
        return get_fernet().decrypt(value.encode()).decode()
    except Exception:
        return value
