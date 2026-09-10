#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE="$ROOT_DIR/native/pi-aware-mic-status.c"
OUTPUT="$ROOT_DIR/bin/pi-aware-mic-status"
TEMP_OUTPUT="$OUTPUT.tmp.$$"

cleanup() {
  rm -f "$TEMP_OUTPUT"
}
trap cleanup EXIT HUP INT TERM

SDK_PATH=$(xcrun --sdk macosx --show-sdk-path)
CLANG=$(xcrun --sdk macosx --find clang)
PYTHON=$(xcrun --find python3)
mkdir -p "$ROOT_DIR/bin"

"$CLANG" \
  -arch arm64 \
  -isysroot "$SDK_PATH" \
  -mmacosx-version-min=26.0 \
  -std=c11 \
  -O2 \
  -Wall \
  -Wextra \
  -Werror \
  -Wl,-no_adhoc_codesign \
  "$SOURCE" \
  -framework CoreAudio \
  -o "$TEMP_OUTPUT"

"$PYTHON" - "$TEMP_OUTPUT" <<'PY'
import hashlib
import struct
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = bytearray(path.read_bytes())
if len(data) < 32 or struct.unpack_from("<I", data, 0)[0] != 0xFEEDFACF:
    raise SystemExit("expected a thin 64-bit little-endian Mach-O executable")

command_count = struct.unpack_from("<I", data, 16)[0]
offset = 32
uuid_offset = None
for _ in range(command_count):
    if offset + 8 > len(data):
        raise SystemExit("truncated Mach-O load commands")
    command, command_size = struct.unpack_from("<II", data, offset)
    if command_size < 8 or offset + command_size > len(data):
        raise SystemExit("invalid Mach-O load command")
    if command == 0x1B:
        if command_size < 24 or uuid_offset is not None:
            raise SystemExit("invalid Mach-O UUID command")
        uuid_offset = offset + 8
    offset += command_size

if uuid_offset is None:
    raise SystemExit("missing Mach-O UUID command")

data[uuid_offset : uuid_offset + 16] = bytes(16)
digest = bytearray(hashlib.sha256(data).digest()[:16])
digest[6] = (digest[6] & 0x0F) | 0x50
digest[8] = (digest[8] & 0x3F) | 0x80
data[uuid_offset : uuid_offset + 16] = digest
path.write_bytes(data)
PY

chmod 755 "$TEMP_OUTPUT"
/usr/bin/codesign \
  --force \
  --sign - \
  --identifier com.gyrozepelix.pi-aware.mic-status \
  "$TEMP_OUTPUT"
mv "$TEMP_OUTPUT" "$OUTPUT"
trap - EXIT HUP INT TERM
