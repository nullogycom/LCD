{
  lib,
  config,
  dream2nix,
  ...
}: {
  imports = [
    dream2nix.modules.dream2nix.nodejs-package-json-v3
    dream2nix.modules.dream2nix.nodejs-granular-v3
  ];

  deps = {nixpkgs, ...}: {
    inherit
      (nixpkgs)
      stdenv
      ;
  };

  nodejs-granular-v3 = {
    buildScript = ''
      tsc
      mv build/index.js build/index.js.tmp
      echo "#!${config.deps.nodejs}/bin/node" > build/index.js
      cat build/index.js.tmp >> build/index.js
      chmod +x ./build/index.js
      patchShebangs .
    '';
  };

  name = lib.mkForce "lucida";
  version = lib.mkForce "1.0.0";

  mkDerivation = {
    src = lib.cleanSource ./.;
    checkPhase = ''
      ./build/index.js
    '';
    doCheck = true;
  };
}