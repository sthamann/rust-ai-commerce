# Responsibilities

Revisioned legal/privacy settings with shop-basis inheritance and per-channel overrides. LegalSettings owns navigation and drafts; LegalServices owns purpose/provider disclosures; ProductCompliance edits safety facts in one selected language; ConsumerRequests reviews requests under customer permissions. This UI records evidence and configuration, not legal certification.

Regression coverage: frontend/tests/unit/legal-privacy.test.tsx and scripts/legal_privacy.py; connected provider tests in scripts/email_tests.py. See docs/european-operation.md for legal sources, configuration and proof limits.
