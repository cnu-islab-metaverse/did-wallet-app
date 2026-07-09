# circuits — local Groth16 ZK pipeline (circom + snarkjs)

Build ZK circuits and their proving/verification keys **entirely on your machine**.
Groth16, on-chain-focused (each build also emits a Solidity `Verifier.sol`).

## One-time setup

- **circom compiler** (Rust binary): `cargo install --git https://github.com/iden3/circom.git circom`
- **deps**: `yarn install` (installs `circomlib` + `snarkjs`)

## Two separate commands (key generation vs verification)

Kept apart on purpose: re-checking a proof must NOT silently regenerate keys.

**Key generation** — run only when the circuit/condition changes:
```bash
yarn build <name> [ptauPower]     # e.g. yarn build agecheck 12
```
All local: `circom` compile → **Powers of Tau (phase 1)** → `groth16 setup` (phase 2) +
contribute → export `verification_key.json` + `Verifier.sol`. Outputs → `build/<name>/`
(`.r1cs`, `<name>_js/<name>.wasm`, `<name>_final.zkey`, `verification_key.json`, `Verifier.sol`).

**Verification** — prove + verify against the EXISTING build (no key regen):
```bash
yarn verify <name>                # e.g. yarn verify agecheck
```
Proves `<name>.input.json` and verifies; prints the Solidity calldata. Errors if the keys
don't exist yet (run `yarn build <name>` first).

## New scenario = new circuit

1. Write `circuits/<scenario>.circom` (compose circomlib components — SMTVerifier,
   EdDSAPoseidonVerifier, comparators, …).
2. Add `<scenario>.input.json` (sample witness).
3. `yarn build <scenario>` → fresh keys + verifier.
4. Wire the `wasm` + `_final.zkey` into the prover (wallet) and the `verification_key.json`
   into the off-chain verifier (`verifier-web`) / deploy `Verifier.sol` on-chain.

## Trusted-setup notes (Groth16)

- Groth16 needs a **per-circuit** phase-2 setup — re-run `build` for every new circuit.
- The phase-1 Powers of Tau here is generated locally with a **single contributor =
  demo-grade** (fine for research/demo, not a production ceremony). For production,
  place a community ptau (e.g. `powersOfTau28_hez_final_15.ptau`) in `./ptau/` named
  `pot<power>_final.ptau` and it will be reused instead of generated.

## `agecheck` (example)

Minimal circuit proving a private `age >= ` public `threshold` — used to exercise the
whole local pipeline end-to-end before building the real credential circuits.
