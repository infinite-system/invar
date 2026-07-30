# Vendor composition lattice

## Dependency map

- [Network admission binds identity manifest and bytes][admission] supplies the verified immutable
  input to [Installed vendor versions change atomically][install].
- [Installed vendor versions change atomically][install] supplies one selected next-startup
  composition to [Vendor plugins load before kernel seal][runtime].
- [Vendor plugins load before kernel seal][runtime] is the external half of
  [External plugin discovery precedes application boot][discovery].
- [External plugin discovery precedes application boot][discovery] preserves
  [The app is built only after the kernel is sealed][seal].

## Composition

These records jointly produce restart-safe third-party composition. The edge signs one immutable
version. The installer selects it atomically. The runtime verifies it before import. AppLoader
finishes registration before Bootstrap seals and constructs. If any member falls, signed bytes can
become mutable state, or a live application can observe a partial class graph.

[admission]: network-admission.invariants.md#network-admission-binds-identity-manifest-and-bytes
[install]: vendors.invariants.md#installed-vendor-versions-change-atomically
[runtime]: vendors.invariants.md#vendor-plugins-load-before-kernel-seal
[discovery]: ../app/app.invariants.md#external-plugin-discovery-precedes-application-boot
[seal]: ../../../project.invariants.md#the-app-is-built-only-after-the-kernel-is-sealed
