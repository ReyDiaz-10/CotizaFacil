"""SMTP email delivery for subscription notices and receipts."""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage


def configured() -> bool:
    return bool(os.getenv("MAIL_HOST", "smtp.gmail.com").strip() and (os.getenv("MAIL_USER", "").strip() or os.getenv("ADMIN_EMAIL", "").strip()) and os.getenv("MAIL_APP_PASSWORD", "").strip())


def send_email(recipient: str, subject: str, body: str) -> bool:
    if not configured() or not recipient.strip():
        return False
    host = os.getenv("MAIL_HOST", "smtp.gmail.com").strip()
    port = int(os.getenv("MAIL_PORT", "587"))
    username = os.getenv("MAIL_USER", "").strip() or os.getenv("ADMIN_EMAIL", "").strip()
    sender = os.getenv("MAIL_FROM", "").strip() or username
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient.strip()
    message["Subject"] = subject
    message.set_content(body)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as server:
            server.login(username, os.getenv("MAIL_APP_PASSWORD", ""))
            server.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(username, os.getenv("MAIL_APP_PASSWORD", ""))
            server.send_message(message)
    return True
