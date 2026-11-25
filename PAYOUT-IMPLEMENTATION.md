# Payout seasons implementation

This release adds a separate payout layer. Existing `User.ac.cash` remains the virtual in-game balance and is not deleted when a payout request is submitted.

## Admin setup

Open `/admin`, sign in, and use **Withdrawals**. Create a season with start/end dates, then configure all three batches. Each batch has its own opening/closing dates, budget, maximum payout, minimum payout, units-per-naira rate, status, and budget-rollover option.

Eligibility rules are switches. The implemented rules are minimum balance, account age, completed payout registration/legal details, account in good standing, and optional minimum P-Gist posts. The default minimum balance is 3,000,000 units; the default rate is 3,333.333333 units per ₦1; the default maximum counted balance is 5,000,000 units; and the default maximum payout is ₦1,500.

## Player flow

A player opens AllConnect Pay → Withdrawals. If not eligible, the screen explains each failed rule and gives preparation guidance. If eligible, the player chooses Batch 1, 2, or 3 once. The choice starts the rotation order `Batch 1 → Batch 3 → Batch 2` from the selected starting point. Season 1 exposes one slot; later seasons expose up to two slots. A slot is locked by a unique season/slot record. A request requires bank details and is submitted for admin approval.

Bank account numbers are encrypted at rest with AES-256-GCM using a key derived from `SESSION_SECRET`; only the bank name, account name, and last four digits are returned to the player/admin UI.

## Rollover and review

If a player skips a slot or an admin rolls a request over, the units remain available for the next scheduled slot. When submitting within a season, already-used units are excluded so the same eligible units cannot be withdrawn twice. Batch budgets are enforced at admin approval; approval calculates the remaining amount under the batch budget and maximum.

## Manual payment (no payment gateway)

Payments are made by hand: the team sends a normal bank transfer. Nothing in the app moves money, so there is no provider, webhook or API key. The admin Withdrawals page is the working screen:

1. **Open a batch.** A new season starts with every batch as *draft*. In *Existing seasons*, set the season to *scheduled* or *active* and each batch to *open* (players can only submit while the season is on, inside the batch dates, and the batch is open). You can pause or close a batch the same way.
2. **Review a request.** Each request shows the player's username, legal name, units, estimate and bank name / account name / last four digits. Choose **Approve** (the amount is fixed here, within the batch budget and maximum), **Hold**, **Roll over** (units stay available for the player's next slot) or **Reject** (you type a reason the player sees).
3. **Pay.** On an approved request click **Show bank details** to see the full account number (it is decrypted only on that click, never in lists, and each look is written to the server log without the number). Make the transfer in your bank app, then click **Mark as paid** and type the transfer reference. *Mark as paid* only works after *Approve*, and the paid amount is the approved amount.
4. **The player is told at every step**, with a notification (and a card for approved / paid): approved, paid (with your reference), hold, roll over, reject (with your reason). Players see friendly status text in AllConnect Pay → Withdrawals. Admin notes stay private to the team.

Money rules are unchanged: `User.ac.cash` is the virtual balance and is not reduced by a payout; the batch budget is checked when you approve; a request that is rolled over or rejected frees its units for the next slot.
