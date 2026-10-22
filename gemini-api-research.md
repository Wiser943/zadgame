# Gemini API findings used for Pet Answer mode

- Google currently lists `gemini-3.5-flash-lite` as a stable model and says it is low-latency/cost-effective; its model card confirms structured outputs support. Source: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite (last updated 2026-07-30).
- Google says new projects should use current Flash models, including `gemini-3.5-flash-lite` or `gemini-3.8-flash`; 2.5 models are access-limited to users who actively used them previously. Source: https://ai.google.dev/gemini-api/docs/models
- Google troubleshooting distinguishes invalid/restricted keys, quota/rate limits, request syntax, model availability, and advises not retrying permanent 400/402/403 errors. Source: https://ai.google.dev/gemini-api/docs/troubleshooting
- Diagnostic limitation: this Sandbox process has no `GEMINI_*` or Google AI environment variables and is not the deployed host, so no real request can validate the user's hosted key. Never print or request the key in chat; use sanitized hosting logs/status only.
