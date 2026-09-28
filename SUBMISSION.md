# Submission

## Assumptions

- **Lead Creation & Status Enforcement:**
  - `POST /api/leads` strictly sets `status: "NEW"` regardless of what status (if any) the client sends.
  - A single message can be referenced by multiple leads (`Message` to `Lead` is 1-to-many).
  - `material` is optional and empty strings are sanitized to `null`.
  - `budget` accepts non-negative finite numbers or `null`.
  - If `sourceMessageId` does not exist in the database, the API returns a `404 Not Found` response.

- **Status Transition Constraints:**
  - `PATCH /api/leads/:leadId/status` uses strict Zod validation accepting exclusively `{ "status": "CONTACTED" }`. Any additional keys or alternative status values are rejected with `400 Bad Request`.
  - Only transitions from `NEW` to `CONTACTED` are valid; attempting to transition a lead that is already `CONTACTED` returns `400 Bad Request` without altering database state.

- **UI Extraction & Accessibility:**
  - Re-clicking `Extract with AI` only fills empty/blank form fields, preserving any existing inputs or manual corrections made by the user.
  - If extraction fails or returns an empty payload, manual input remains fully enabled.
  - Extraction and validation errors are announced to screen readers via semantic `role="alert"` containers.
  - Clicking `Mark as contacted` updates the lead status locally in state without requiring a full page refresh.

## AI usage

- **Tools used:** Antigravity IDE with Gemini assistant.
- **Scope:**
  - Designed and implemented Zod schemas for HTTP boundary validation in Express (`server/app.ts`).
  - Added comprehensive integration tests in Vitest (`tests/api.test.ts`).
  - Structured the React form with precise labels, manual override preservation, and responsive CSS styling.

## Verification

- **Automated Tests:**
  - Ran comprehensive Vitest test suite (`tests/api.test.ts`) verifying:
    - Valid lead creation and SQLite persistence.
    - Rejection of invalid payloads (empty product, non-positive or float quantities, negative budgets, non-existent messages).
    - Status transition rules (`NEW` -> `CONTACTED` success, repeated transition rejection, non-existent lead rejection).
  - Executed `npm run typecheck` (`tsc --noEmit`) to verify strict TypeScript adherence with zero errors.
  - Verified production build via `npm run build`.

- **Manual End-to-End Verification:**
  - Verified `message-perfect`: `Extract with AI` auto-populates Product, Quantity, Material, Budget. Saving redirects to `/pipeline`.
  - Verified partial and error fixtures (`message-partial`, `message-failure`, `message-empty`): verified fallback to manual completion and `role="alert"` visual error feedback.
  - Verified manual edit preservation: modified product text, re-triggered `Extract with AI`, confirmed custom text was preserved while empty fields were filled.
  - Verified `/pipeline`: clicked `Mark as contacted`, confirmed button enters loading state and status switches to `CONTACTED` seamlessly without page reload.
