# AllConnect Life-Sim Expansion Roadmap

This build includes the configurable dark-mode control. The following proposed systems are the agreed product scope; they should be shipped incrementally with server-authoritative transactions and tests, not activated as untested placeholder endpoints.

## Shared foundations
- Keep city events server-authoritative and deterministic per event window.
- All money-changing actions must use atomic conditional updates and idempotency keys.
- Every recurring charge must show its amount, due date, reason and transaction record before/after processing.
- Preserve the existing map renderer and route data unless a feature explicitly requires a map-layer addition.
- Preserve AllConnect brand accents: blue `#075BFF`, gold `#FFC400`, purple `#9C27F5`, orange `#FF9D00`; use these as accents while neutral dark surfaces follow the user's darkness setting.

## Planned systems
1. Property lifecycle: maintenance, condition, weather damage, insurance limits, deductibles and claim history.
2. Living economy: event-based inflation, price index, variable utility tariffs and transparent bill breakdowns.
3. Vehicle ownership: servicing, fuel, insurance, fines, parking, condition and resale value.
4. Business operations: demand, operating expenses, staff wages, reputation, promotions and competition.
5. Player marketplace: listings, escrow-like transaction state, fees, receipts, anti-duplicate sale checks and dispute reporting.
6. Social reputation: events, parties, invitations, venue access and community achievements.
7. Developer ecosystem: project dashboard, approved app directory, verified analytics, monetization eligibility and payout history.
8. City events: power/water outages, flooded road closures, construction, traffic and emergency services.
9. Banking: savings, loans, repayment schedules and simulated credit scoring.
10. Progression: careers, skills, achievements, quests and separate leaderboards.

## Rollout order
Property + weather and economy first; then vehicle/business expenses; then marketplace; then social reputation; then developer marketplace; finally banking and progression polish. Each phase must include migration review, route authorization tests, atomic transaction tests, and browser/mobile smoke tests.
