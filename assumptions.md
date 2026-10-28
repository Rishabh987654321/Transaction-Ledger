# Assumptions and Decisions

These assumptions keep the assessment implementable and make ambiguous behavior explicit. Adjust only if the evaluator specifies otherwise.

1. **Single tenant, no login.** The assignment describes accounts but no application users, roles, or ownership model. The assessment API has no authentication. Do not claim it is safe for public financial use.
2. **Account name.** Name is required, trimmed, and limited to 120 characters.
3. **Initial balance.** It is always zero. The API rejects a supplied balance rather than accepting client-controlled money.
4. **Currency.** Currency is INR and all values use two decimal places (paise). The assignment does not state currency; INR is selected because the hiring organization is India-based. State this in the submission and make it easy to change.
5. **Amount wire format.** Accept decimal strings such as `"10.50"`, not floating-point JSON numbers, to avoid precision loss. Reject zero, negative values, exponent notation, and more than two decimal places.
6. **Description.** Required and trimmed, 1–500 characters.
7. **Reference uniqueness.** `(account_id, reference_id)` is unique. Duplicate retries return HTTP 200 with the original immutable transaction and `duplicate: true`, regardless of whether retry payload matches. No second balance update occurs.
8. **Balance floor.** Balances cannot go below zero. Debit that would overdraw returns 422.
9. **Pagination.** Defaults to page 1 and limit 20; maximum limit is 100. Invalid values return 400. Empty page beyond the last page returns an empty list with accurate metadata.
10. **Sort order.** `created_at DESC, id DESC` provides latest-first output plus a deterministic tie-break.
11. **Transaction immutability.** No edit/delete endpoints are implemented. If stronger enforcement is desired, restrict DB privileges or add triggers.
12. **Timestamps.** Generated server-side and stored UTC. Client timestamps are not accepted.
13. **Current balance.** Cached on account row for quick reads and updated atomically with every ledger record. A transaction history aggregate remains the reconciliation source.
14. **Transfer bonus.** If implemented, a transfer creates one linked debit and credit transaction within a single database transaction. Source and destination must differ. Idempotency is scoped to a transfer reference.
15. **Scope.** No frontend is required by the PDF. A neo-brutalist UI is an optional demonstration layer because the requester asked for a visual direction.
16. **No AI feature.** The job description mentions generative AI, but this specific assessment tests ledger correctness. Adding an LLM would be unrelated and introduce unnecessary risk/cost.
