# Formbricks Undiscovered Bugs Audit Report

This report documents undiscovered bugs identified across the Formbricks repository (`packages/surveys`, `packages/types`, and `apps/web`). Each bug has been assessed against the **Security Policy** (`SECURITY.md`), **Contributing Guidelines** (`CONTRIBUTING.md`), and **Code of Conduct** (`CODE_OF_CONDUCT.md`).

---

## 1. Summary of Discovered Bugs

| # | Bug Title | Affected Files | Severity | Type | Status |
|---|-----------|----------------|----------|------|--------|
| **FB-BUG-01** | `RangeError: Invalid time value` crash on DD-MM-YYYY dates in recall replacement | `packages/surveys/src/lib/date-time.ts`<br>`packages/surveys/src/lib/recall.ts` | **High** | Runtime Crash | **Targeted for PR (Minimal, High-Merge)** |
| **FB-BUG-02** | `isEmpty` logic operator returns `false` for unanswered / undefined questions and matrix rows | `packages/surveys/src/lib/logic.ts`<br>`apps/web/lib/surveyLogic/utils.ts` | **Medium-High** | Logic Engine Failure | Documented |
| **FB-BUG-03** | `where-clause.ts` silently ignores `isEmpty`, `isNotEmpty`, and `isAnyOf` response filter criteria | `apps/web/lib/response/where-clause.ts` | **Medium** | Query Filter Bug | Documented |
| **FB-BUG-04** | Unhandled JSON parse exception in `makeRequest` on non-JSON HTTP responses | `packages/surveys/src/lib/utils.ts` | **Medium** | Network Resilience | Documented |
| **FB-BUG-05** | `isDateLiteral` regex rejects valid ISO-8601 timestamps with microsecond precision | `packages/types/surveys/expression-types.ts` | **Low-Medium** | Type / Parser Edge Case | Documented |

---

## 2. Bug Details & Root Cause Analysis

### FB-BUG-01: Runtime Crash (`RangeError: Invalid time value`) on DD-MM-YYYY Dates in Recall Replacement
- **Location:**
  - `packages/surveys/src/lib/date-time.ts` (lines 1–23)
  - `packages/surveys/src/lib/recall.ts` (lines 66–72)
- **Classification:** Functional / Runtime Crash (Non-security)
- **Description:**
  `isValidDateString` accepts both `YYYY-MM-DD` and `DD-MM-YYYY` formats. For `DD-MM-YYYY` (e.g. `"15-01-2023"`), it converts the string internally to test validity with `new Date()`. However, `isValidDateString` only returns a boolean without returning or normalizing the parsed date.
  In `packages/surveys/src/lib/recall.ts`:
  ```ts
  if (value) {
    if (isValidDateString(value)) {
      value = formatDateWithOrdinal(new Date(value), languageCode);
    } else if (Array.isArray(value)) {
      value = value.filter((item) => item).join(", ");
    }
  }
  ```
  `new Date("15-01-2023")` evaluates to `Invalid Date` in V8/Node/browsers. When passed to `formatDateWithOrdinal(date, locale)`, `Intl.DateTimeFormat(locale, ...).format(date)` throws `RangeError: Invalid time value`. This unhandled exception immediately crashes the entire survey renderer when rendering headlines or subheaders containing recall.
  Additionally, `Array.isArray(value)` is placed in `else if`, meaning single-item array choices like `["2023-01-15"]` are coerced to strings and formatted as dates rather than remaining array options.
- **Minimal Fix:**
  1. Export `parseDateString(value: string): Date | null` in `date-time.ts` that normalizes `DD-MM-YYYY` before creating the `Date` object and validates `!isNaN(date.getTime())`.
  2. Guard `formatDateWithOrdinal` against invalid dates (`isNaN(date.getTime())`).
  3. Update `recall.ts` to check `Array.isArray(value)` first, and use `parseDateString(value)` for date formatting.

---

### FB-BUG-02: `isEmpty` Operator Returns `false` for Unanswered / Undefined Fields and Matrix Rows
- **Location:**
  - `packages/surveys/src/lib/logic.ts` (lines 520–525)
  - `apps/web/lib/surveyLogic/utils.ts` (lines 598–603)
- **Classification:** Logic / Survey Flow (Non-security)
- **Description:**
  In both logic engines (`packages/surveys/src/lib/logic.ts` and `apps/web/lib/surveyLogic/utils.ts`):
  ```ts
  case "isSet":
  case "isNotEmpty":
    return leftValue !== undefined && leftValue !== null && leftValue !== "";
  case "isNotSet":
    return leftValue === undefined || leftValue === null || leftValue === "";
  case "isEmpty":
    return leftValue === "";
  ```
  `isEmpty` is strictly `leftValue === ""`. When a question or matrix row is unanswered, `leftValue` is `undefined`.
  Therefore:
  - `isEmpty` evaluates to `false` (because `undefined === ""` is false).
  - `isNotEmpty` evaluates to `false` (because `leftValue` is undefined).
  An unanswered question or row is treated as neither empty nor not-empty. Jump logic configured with "if Question is empty" fails to trigger when the question is skipped.
- **Minimal Fix:**
  Align `isEmpty` with `isNotSet`:
  ```ts
  case "isNotSet":
  case "isEmpty":
    return (
      leftValue === undefined ||
      leftValue === null ||
      leftValue === "" ||
      (Array.isArray(leftValue) && leftValue.length === 0) ||
      (typeof leftValue === "object" && Object.keys(leftValue).length === 0)
    );
  ```

---

### FB-BUG-03: `where-clause.ts` Silently Drops `isEmpty`, `isNotEmpty`, and `isAnyOf` Criteria
- **Location:** `apps/web/lib/response/where-clause.ts` (lines 960–1030)
- **Classification:** Backend Query / Filtering (Non-security)
- **Description:**
  `packages/types/responses.ts` defines `ZResponseFilterCriteriaIsEmpty`, `ZResponseFilterCriteriaIsNotEmpty`, and `ZResponseFilterCriteriaIsAnyOf` as valid data filter conditions. However, in `apps/web/lib/response/where-clause.ts`, the switch statement on `val.op` omits handlers for `isEmpty`, `isNotEmpty`, and `isAnyOf`. Any query with these filter operators silently falls through without generating Prisma WHERE clauses, returning completely unfiltered responses.
- **Minimal Fix:**
  Add case handlers in `where-clause.ts` for `isEmpty`, `isNotEmpty`, and `isAnyOf`.

---

### FB-BUG-04: Unhandled JSON Parse Exception in `makeRequest` on Non-JSON HTTP Responses
- **Location:** `packages/surveys/src/lib/utils.ts` (line 199)
- **Classification:** Network Resilience (Non-security)
- **Description:**
  In `makeRequest`:
  ```ts
  const response = res.data;
  const json = (await response.json()) as ApiResponse;
  ```
  `await response.json()` is not wrapped in a try/catch. If an upstream proxy or server returns 502/504 Bad Gateway (HTML), 500 error page, or 204 No Content, `response.json()` throws a `SyntaxError: Unexpected token < in JSON at position 0`. This uncaught exception crashes the caller instead of returning `{ ok: false, error: ... }`.
- **Minimal Fix:**
  Safely handle `response.json()` parsing failure and return an `ApiErrorResponse` with HTTP status.

---

### FB-BUG-05: `isDateLiteral` Regex Rejects ISO Timestamps with Microsecond Precision
- **Location:** `packages/types/surveys/expression-types.ts` (lines 54–71)
- **Classification:** Date Expression Parsing (Non-security)
- **Description:**
  `TIME_PART = /^T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?/;` restricts fractional seconds to at most 3 digits (`\d{1,3}`). Timestamps stored in PostgreSQL often include microsecond precision (`\d{6}`, e.g. `2026-11-04T12:00:00.123456Z`).
  When passed to `isDateLiteral`, the milliseconds regex matches only the first 3 digits, leaving trailing digits that fail the `OFFSET_PART` test, causing `isDateLiteral` to return `false` for valid database timestamps.
- **Minimal Fix:**
  Update fractional seconds regex to `(?:\.\d{1,9})?`.

---

## 3. Compliance & Policy Review

- **Security Policy (`SECURITY.md`):**
  None of the discovered bugs are security vulnerabilities (no privilege escalation, no data leakage, no auth bypass, no sandbox escape). They are strictly client-side runtime crashes, survey flow logic bugs, or query filtering issues. Therefore, per `SECURITY.md`, these are suitable for public issue tracking and pull requests.
- **Contributing Guidelines (`CONTRIBUTING.md`):**
  Changes must be minimal, self-contained, and accompanied by unit tests.
- **Code of Conduct (`CODE_OF_CONDUCT.md`):**
  All communication and PR descriptions adhere to constructive, respectful open-source standards.
- **Author Identity:**
  All commits, branches, and PRs are created under `shyamsharmas124-commits`.

---

## 4. Selected Bug for Minimal PR: FB-BUG-01

**Why FB-BUG-01 is optimal for immediate PR:**
1. **Critical impact:** Fixes an uncaught `RangeError` that crashes the entire survey UI when recall encounters a DD-MM-YYYY date string.
2. **Minimal diff:** ~15 lines across two files (`packages/surveys/src/lib/date-time.ts` and `packages/surveys/src/lib/recall.ts`).
3. **Zero risk of regression:** Does not alter any public API schema, database schema, or exported package interfaces.
4. **Clean testability:** Easily verified with unit tests in `date-time.test.ts` and `recall.test.ts`.
