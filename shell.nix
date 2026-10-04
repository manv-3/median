{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    python3
    python3Packages.pip
    python3Packages.virtualenv
  ];

  shellHook = ''
    echo "Median Nix development environment loaded."
    echo "Python: $(python3 --version)"
    echo "Pip:    $(pip --version 2>/dev/null || echo 'not loaded')"
  '';
}
