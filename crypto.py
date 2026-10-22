"""Versleuteling die de browser (WebCrypto) en Python allebei snappen.

AES-256-GCM, sleutel = PBKDF2-SHA256(wachtzin, salt, 200.000 rondes).
Bestandsformaat: JSON {"v":1,"salt":b64,"iv":b64,"ct":b64}  (ct = ciphertext + tag).
"""
import base64
import json
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

RONDES = 200_000


def _sleutel(wachtzin: str, salt: bytes) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=RONDES).derive(wachtzin.encode())


def versleutel(data: bytes, wachtzin: str) -> str:
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(_sleutel(wachtzin, salt)).encrypt(iv, data, None)
    b = lambda x: base64.b64encode(x).decode()  # noqa: E731
    return json.dumps({"v": 1, "salt": b(salt), "iv": b(iv), "ct": b(ct)})


def ontsleutel(tekst: str, wachtzin: str) -> bytes:
    d = json.loads(tekst)
    salt, iv, ct = (base64.b64decode(d[k]) for k in ("salt", "iv", "ct"))
    return AESGCM(_sleutel(wachtzin, salt)).decrypt(iv, ct, None)


def versleutel_json(obj, wachtzin: str) -> str:
    return versleutel(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode(), wachtzin)


def ontsleutel_json(tekst: str, wachtzin: str):
    return json.loads(ontsleutel(tekst, wachtzin))
