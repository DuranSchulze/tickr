# Findings

This file collects the most actionable observations from the current email system.

## Architecture findings

1. A single mailer entrypoint already exists, which is a strong design choice and should stay the system boundary.
2. Provider order is `Resend -> SMTP fallback`, so any test panel copy or docs should reflect that exact order.
3. The app currently relies more on logs than on persistent delivery records.

## Forgot-password findings

1. The reset flow is correctly delegated to Better Auth, which reduces token/security mistakes.
2. The reset email benefits from mailer link extraction, making incident recovery easier during provider outages.
3. The template should remain brand-driven, not hardcoded per product name.

## Timer-reminder findings

1. The reminder path is practical and already deduplicated.
2. The current policy is coarse-grained because the reminder hour is environment-driven, not workspace-driven.
3. There is no end-user preference model yet for reminder emails.

## SMTP / provider findings

1. SMTP and Resend are operationally mixed into one pipeline, which is convenient for delivery resilience.
2. The system does not yet record which provider actually delivered a given email in a queryable way.
3. Admins can manually test both SMTP and the Resend/fallback chain from settings, which is a useful operational feature.

## Recommended sequence for future work

1. Introduce an `email_deliveries` persistence model.
2. Add render tests for email templates.
3. Move any remaining inline email markup into dedicated template files.
4. Add workspace settings for timer-reminder policies.
5. Add an operational admin page or diagnostics card for email health.
