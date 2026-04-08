# Berean — Legal, Compliance & Contacts

## POPIA Compliance (South Africa)

Berean is inherently POPIA-compliant by design — no action required beyond publishing a privacy notice.

**Why it's outside POPIA scope:**
- KV counters (view_count, completion_count): raw integers, no user identifiers — not "personal information"
- IndexedDB (sermon notes, API keys): never leaves user's device — developer never processes it
- Cloudflare Web Analytics: no cookies, no IP fingerprinting, fully anonymous

**Registration:** Individual hobbyist with no registered entity — NO registration required.
If an NPO/company/trust is created: register Information Officer via IR e-Services portal.

**Required action:** Publish Zero-Data Privacy Notice in app footer stating:
1. No personal data collected (no names, emails, IP addresses, cookies)
2. All user content stored locally via IndexedDB only
3. Anonymous aggregate counters for study session metrics
4. Cloudflare privacy-first analytics (no personal data)

**⚠️ Critical architectural warning:** If AI calls are ever routed through a server-side proxy,
server logs capture IP + query content → instant POPIA trigger. Maintain BYOK client-side architecture.

---

## Escalation Contacts

| Issue | Contact | Notes |
|---|---|---|
| API.Bible rate limit | support@api.bible | Cite non-commercial SA ministry tool; request ministry key |
| API.Bible AI exemption | support@api.bible | Attach diagram showing zero copyrighted text transmitted; inference ≠ training |
| BSSA Afrikaans offline | copyright@biblesociety.co.za | Cite CrossWire SWORD precedent; target AFR53 first |
| BSSA Setswana offline | copyright@biblesociety.co.za | No Toleo Wazi equivalent |
| Biblica Toleo Wazi | No permission needed | CC BY-SA — just display "Biblica®" |
| Biblica NIV exemption | permissions@biblica.com | Low probability — frame as non-commercial SA tool |
| SR Greek NT attribution | No permission needed | CC BY 4.0 — credit Alan Bunning + CNTR in About screen |
| unfoldingWord Afrikaans | Monitor Door43/GitHub | No CC Afrikaans Bible exists yet — integrate when released |
