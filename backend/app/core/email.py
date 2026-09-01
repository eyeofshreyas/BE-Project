"""SMTP email sending helper used for notification emails throughout the app."""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Best-effort email send -- returns False and logs instead of raising,
    so a notification failure never fails the request that triggered it."""
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        logger.warning("SMTP not configured; skipping email to %s", to)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg.set_content(body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


if __name__ == "__main__":
    assert send_email("test@example.com", "subject", "body") is False
    print("ok")
