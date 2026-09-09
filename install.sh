#!/bin/sh
# Installs stillwood from its GitHub releases on macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/Ahm3tJ4f/stillwood/main/install.sh | sh
#
# Settings, all optional:
#   STILLWOOD_VERSION      a release tag such as v0.1.0 (default: the latest release)
#   STILLWOOD_INSTALL_DIR  where the binary goes (default: ~/.local/bin)
set -eu

repo="Ahm3tJ4f/stillwood"
version="${STILLWOOD_VERSION:-latest}"
dir="${STILLWOOD_INSTALL_DIR:-$HOME/.local/bin}"

fail() {
	echo "stillwood: $*" >&2
	exit 1
}

case "$(uname -s)" in
Darwin) os=darwin ;;
Linux) os=linux ;;
*) fail "this script supports macOS and Linux. On Windows, use install.ps1." ;;
esac
case "$(uname -m)" in
x86_64 | amd64) arch=x64 ;;
arm64 | aarch64) arch=arm64 ;;
*) fail "no build for the $(uname -m) processor" ;;
esac
# A shell under Rosetta reports x64 on Apple silicon; the native build is better.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then
	arch=arm64
fi
if [ "$os" = linux ] && ldd --version 2>&1 | grep -qi musl; then
	fail "the Linux builds need glibc. On musl systems, use: bunx stillwood"
fi

if [ "$version" = latest ]; then
	base="https://github.com/$repo/releases/latest/download"
else
	base="https://github.com/$repo/releases/download/$version"
fi
base="${STILLWOOD_DOWNLOAD_URL:-$base}"
asset="stillwood-$os-$arch.tar.gz"

download() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$1" -o "$2"
	elif command -v wget >/dev/null 2>&1; then
		wget -q "$1" -O "$2"
	else
		fail "curl or wget is necessary"
	fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

echo "stillwood: downloading $asset"
download "$base/$asset" "$tmp/$asset" || fail "could not download $base/$asset"
download "$base/SHA256SUMS" "$tmp/SHA256SUMS" || fail "could not download the checksums"

expected=$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)
if command -v sha256sum >/dev/null 2>&1; then
	actual=$(sha256sum "$tmp/$asset" | cut -d ' ' -f 1)
else
	actual=$(shasum -a 256 "$tmp/$asset" | cut -d ' ' -f 1)
fi
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the checksum of $asset is wrong"

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$dir"
mv "$tmp/stillwood" "$dir/stillwood"
chmod 755 "$dir/stillwood"
echo "stillwood: installed $("$dir/stillwood" --version) to $dir/stillwood"

case ":$PATH:" in
*":$dir:"*) echo "stillwood: start it with: stillwood" ;;
*) echo "stillwood: $dir is not in your PATH. Add this line to your shell profile:
  export PATH=\"$dir:\$PATH\"" ;;
esac
