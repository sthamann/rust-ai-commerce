# Draft money previews

`fx-draft.ts` converts product editor draft prices with rational BigInt rates and
half-up target rounding. It imports only shared API currency types. Admin fields
consume the preview; storefront checkout must keep using server quotations.
The currency unit tests cover the binary-floating midpoint counterexample.
