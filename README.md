# KasProof — Proof of Existence on Kaspa

Permanently timestamp any file on the Kaspa BlockDAG.

**No accounts. No uploads. No trust. Just math and chain.**

## How it works

1. **Hash** — Your file is SHA-256 hashed locally in your browser
2. **Stamp** — The hash becomes a Kaspa address. A transaction is sent to it.
3. **Verify** — Anyone can re-hash the file and check the address. If it has transactions, the file was stamped.

## Protocol

KasProof implements the **KPP-1** (Kaspa Proof Protocol) standard. Every stamp transaction includes a KPP-1 inscription in the payload, making stamps discoverable by indexers and block explorers.

## Cost

3 KAS per stamp — 2 KAS to miners, 1 KAS protocol fee, 0.2 KAS proof dust (reclaimable).

## Privacy

- Your file never leaves your browser
- Only the SHA-256 hash touches the blockchain
- No accounts, no emails, no tracking

## Links

- Website: [kasproof.com](https://kasproof.com)
- Protocol: KPP-1
- Chain: [kaspa.org](https://kaspa.org)

---

*Proof of existence for everyone. Immutable. Unforgeable. On Kaspa.*
