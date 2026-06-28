# Data Retention Policy (NDPR/GDPR)

## Overview

Lumigift complies with the Nigeria Data Protection Regulation (NDPR) and GDPR principles for users who request data deletion via `DELETE /api/v1/users/me`.

## What is deleted / anonymized

| Data | Action |
|------|--------|
| Phone number | Replaced with `deleted-<userId>` |
| Display name | Replaced with `Deleted User` |
| Email address | Set to NULL |
| Avatar URL | Set to NULL |
| Stellar public key | Set to NULL |
| Gift messages | Set to NULL |
| Voice note URLs | Set to NULL |
| Media URLs | Set to NULL |
| Device tracking records | Hard deleted |
| Gift invitations | Hard deleted |

## What is retained (legal exceptions)

| Data | Retention Period | Reason |
|------|-----------------|--------|
| `audit_logs` | 7 years minimum | Financial compliance, NDPR Art. 2.1(b) |
| `gifts` (financial fields) | 7 years minimum | Transaction records, tax compliance |
| `data_deletion_requests` | Permanent | Proof of compliance |

## Process

1. User calls `DELETE /api/v1/users/me` (requires authentication + CSRF token)
2. All PII is anonymized/deleted in a single database transaction
3. Deletion request logged in `data_deletion_requests` table
4. Audit log entry created in `audit_logs`
5. Confirmation email sent to user's email address (if available)

## Compliance References

- [NDPR 2019](https://nitda.gov.ng/wp-content/uploads/2020/11/NigeriaDataProtectionRegulation11.pdf) — Art. 2.1(b), Art. 3.1(9)
- [GDPR Art. 17](https://gdpr-info.eu/art-17-gdpr/) — Right to erasure
