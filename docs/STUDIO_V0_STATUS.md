# Studio V0 status

The functional editor bootstrap is implemented.

Studio V2 now adds:

- touch pinch-to-zoom while preserving world-point anchoring;
- contextual Inspector fields from a shared Studio schema registry;
- versioned persistence encode/decode with domain invariant validation;
- an automated mandatory smoke that performs create → move → edit → connect Route → undo → redo → save → reload and compares the restored canonical document;
- exact canonical undo/redo snapshots, fixing timestamp drift discovered by the new smoke test;
- refusal of undo/redo when the current document has diverged from the expected history snapshot.

The temporary validation workflow passed format, lint, typecheck, tests and build, then removed itself. A permanent read-only CI run on the clean head is still required before the technical Gate 6 evidence is considered complete. Interactive browser smoke on the public preview remains a separate manual check.
