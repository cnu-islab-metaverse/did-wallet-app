pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";

// Minimal example circuit to exercise the full local Groth16 pipeline.
// Proves: a PRIVATE `age` is >= a PUBLIC `threshold`, without revealing `age`.
// Output `ok` is 1 when the predicate holds.
template AgeCheck() {
    signal input age;        // private
    signal input threshold;  // public (see `main` below)
    signal output ok;

    // 8-bit range is enough for human ages (0..255).
    component ge = GreaterEqThan(8);
    ge.in[0] <== age;
    ge.in[1] <== threshold;
    ok <== ge.out;
}

// `threshold` is public; `age` stays private.
component main { public [threshold] } = AgeCheck();
