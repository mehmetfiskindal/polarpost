#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run sailfish:prepare -- --arch aarch64
project="$PWD/.gea-sailfish/build/polar-post-aarch64/project"
mkdir -p dist/sailfish

docker run --rm --network none \
  --mount type=volume,src=sailfish-5.1.0.11-aarch64-build,dst=/sdk,readonly \
  --mount "type=bind,src=$project,dst=/input,readonly" \
  --mount "type=bind,src=$PWD/dist/sailfish,dst=/output" \
  --entrypoint /bin/bash sailfish-arm64-probe:local -ec '
    mkdir /build-root
    cp -a /sdk/. /build-root/
    mkdir -p /build-root/tmp/polar-post /build-root/tmp/polar-rpms
    cp -a /input/. /build-root/tmp/polar-post/
    chroot /build-root rpmbuild -bb \
      --define "_builddir /tmp/polar-post" \
      --define "_rpmdir /tmp/polar-rpms" \
      --define "_smp_mflags -j4" \
      /tmp/polar-post/rpm/harbour-gea-polar-post.spec
    for path in /build-root/tmp/polar-rpms/aarch64/harbour-gea-polar-post-[0-9]*.rpm; do
      chroot /build-root rpm -qp "${path#/build-root}"
      cp "$path" /output/
    done
  '
