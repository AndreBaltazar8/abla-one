# Desktop builds: the compiler's own shell (matching LLVM) plus the Vulkan,
# X11, GL and OpenSSL libraries a desktop app links. They are build inputs, so
# the Nix toolchain records their paths in the executable.
let
  base = import ../ablac/shell.nix {};
  # The system channel: its libraries share the C library the compiled
  # program links against.
  pkgs = import <nixpkgs> {};
in
base.overrideAttrs (old: {
  buildInputs = (old.buildInputs or []) ++ [ pkgs.vulkan-loader pkgs.xorg.libX11 pkgs.libglvnd pkgs.openssl ];
  shellHook = old.shellHook + ''
    export LIBRARY_PATH="${pkgs.vulkan-loader}/lib:${pkgs.xorg.libX11}/lib:${pkgs.libglvnd}/lib:${pkgs.openssl.out}/lib''${LIBRARY_PATH:+:$LIBRARY_PATH}"
    export ABLA_DESKTOP_RPATH="${pkgs.vulkan-loader}/lib:${pkgs.xorg.libX11}/lib:${pkgs.libglvnd}/lib:${pkgs.openssl.out}/lib"
  '';
})
