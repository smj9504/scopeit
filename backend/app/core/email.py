"""
ScopeIt - Email Service
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Email sending service using SMTP"""

    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.EMAIL_FROM
        self.from_name = settings.EMAIL_FROM_NAME

    def is_configured(self) -> bool:
        """Check if email service is properly configured"""
        return all([
            self.smtp_host,
            self.smtp_user,
            self.smtp_password,
        ])

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """
        Send an email

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML body content
            text_content: Plain text body (optional, fallback)

        Returns:
            True if email was sent successfully, False otherwise
        """
        if not self.is_configured():
            logger.warning("Email service is not configured. Skipping email send.")
            # In development, log the email content instead
            if settings.DEBUG:
                logger.info(f"[DEBUG EMAIL] To: {to_email}")
                logger.info(f"[DEBUG EMAIL] Subject: {subject}")
                logger.info(f"[DEBUG EMAIL] Content: {html_content[:500]}...")
            return True  # Return True in dev to not block registration

        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = subject
            message["From"] = f"{self.from_name} <{self.from_email}>"
            message["To"] = to_email

            # Add plain text and HTML parts
            if text_content:
                part1 = MIMEText(text_content, "plain")
                message.attach(part1)

            part2 = MIMEText(html_content, "html")
            message.attach(part2)

            # Send email
            context = ssl.create_default_context()

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls(context=context)
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(
                    self.from_email,
                    to_email,
                    message.as_string()
                )

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def send_welcome_email(self, to_email: str, user_name: str) -> bool:
        """
        Send welcome email to new user

        Args:
            to_email: New user's email
            user_name: User's display name

        Returns:
            True if sent successfully
        """
        subject = f"Welcome to {settings.APP_NAME}! 🎉"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to {settings.APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
            <td style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                            <h1 style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">
                                Welcome to {settings.APP_NAME}!
                            </h1>
                        </td>
                    </tr>
                </table>

                <!-- Content -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="padding-bottom: 20px;">
                            <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                Hi {user_name},
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 20px;">
                            <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                Thank you for signing up for {settings.APP_NAME}! We're excited to have you on board.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 20px;">
                            <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                {settings.APP_NAME} helps restoration contractors create professional estimates quickly and easily. Here's what you can do:
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 25px;">
                            <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 16px; line-height: 1.8;">
                                <li>Create detailed estimates with line items</li>
                                <li>Convert estimates to invoices with one click</li>
                                <li>Manage your customer database</li>
                                <li>Build your company's line item library</li>
                            </ul>
                        </td>
                    </tr>
                    <tr>
                        <td style="text-align: center; padding: 25px 0;">
                            <a href="{settings.FRONTEND_URL}/app/dashboard"
                               style="display: inline-block; background-color: #111827; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                Get Started
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding-top: 20px;">
                            <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                                If you have any questions, feel free to reach out to our support team.
                            </p>
                        </td>
                    </tr>
                </table>

                <!-- Footer -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="padding-top: 40px; border-top: 1px solid #e5e7eb; margin-top: 40px;">
                            <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                                Best regards,<br>
                                The {settings.APP_NAME} Team
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding-top: 20px;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                &copy; 2024 {settings.APP_NAME}. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

        text_content = f"""
Welcome to {settings.APP_NAME}!

Hi {user_name},

Thank you for signing up for {settings.APP_NAME}! We're excited to have you on board.

{settings.APP_NAME} helps restoration contractors create professional estimates quickly and easily. Here's what you can do:

- Create detailed estimates with line items
- Convert estimates to invoices with one click
- Manage your customer database
- Build your company's line item library

Get started: {settings.FRONTEND_URL}/app/dashboard

If you have any questions, feel free to reach out to our support team.

Best regards,
The {settings.APP_NAME} Team
"""

        return self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )


# Singleton instance
email_service = EmailService()
