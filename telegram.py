"""Optioneel: ochtendbericht via je eigen Telegram-bot."""
import requests

from . import config


def stuur(tekst: str) -> bool:
    token, chat = config.get("TELEGRAM_BOT_TOKEN"), config.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return False
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      data={"chat_id": chat, "text": tekst[:4000]}, timeout=30)
    r.raise_for_status()
    return True
