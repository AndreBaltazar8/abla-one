# Experimental locked mobile dependency

This branch stages a public-package backend dependency. It is separate from the
tested workspace/iOS branch, is not adopted by NovaKind, and is not ready for a
main merge before its package and workspace gates pass.

The Android runtime, shared tree encoder and iOS query import one centralized
`oneMobileSource()` rather than escaping the package through a workspace sibling
path. The source uses an immutable mobile revision, not HEAD or a branch.
Consumers importing mobile directly must request the same name, URL, selector
kind and revision. Different identities collide; compiler0.2.47 has no root
override for a dependency's provider source.

Workspace adoption also requires aligning the actual Android host/native source
pin and generating the root application's package lock. Do not update a One pin
alone or silently fetch a different mobile revision from NovaKind's pinned
sibling graph. That migration needs its own focused/native/full validation.

The original checkout-free consumer run42158003402 exposed two issues: an
existing compiler scan cycle (confirmed upstream, fix0f293310 planned for0.2.48)
and these workspace-relative backend imports. The native workspace contracts
remain independently green. This branch addresses only the latter source
issue. It makes no claim that the compiler fix or the migration has passed.
