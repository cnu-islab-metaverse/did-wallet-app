pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// NEW-scenario demo with an explicit public / private split (distinct from the
// all-private `credential.circom`):
//   private inputs : age, secret
//   public  input  : minAge
//   public  outputs: ok, commitment
// Proves "age >= minAge" (age stays private) and publishes commitment = Poseidon(secret)
// (secret stays private) — a nullifier-style public value the verifier can pin to.
template AgeCommit() {
    signal input age;          // private
    signal input secret;       // private
    signal input minAge;       // public (see `main` below)
    signal output ok;          // public output
    signal output commitment;  // public output = Poseidon(secret)

    component ge = GreaterEqThan(8);
    ge.in[0] <== age;
    ge.in[1] <== minAge;
    ok <== ge.out;

    component h = Poseidon(1);
    h.inputs[0] <== secret;
    commitment <== h.out;
}

component main { public [minAge] } = AgeCommit();
