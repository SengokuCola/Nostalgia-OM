# The om-emu pin, shared by research/setup.sh and tools/emulator/bump_om_emu.sh. Source it with REPO and EMU set.
# Modified by SengokuCola for the Caduceus for OM-3 fork.
EMU_GIT=https://github.com/flatpanda/om-emu
EMU_PIN=$REPO/tools/emulator/om-emu.pin   # "COMMIT YYYY-MM-DD": the om-emu commit to use, and when upstream was last checked
EMU_MAX_AGE_DAYS=7                        # as tools/test/emu_test.py
EMU_MODEL=E147
EMU_STOCK=OLY_E_147_1100_0000_0000.BIN

# Sets EMU_REV and EMU_CHECKED from the pin file.
emu_read_pin() {
  read -r EMU_REV EMU_CHECKED _ <"$EMU_PIN" || true
  EMU_CHECKED=${EMU_CHECKED%$'\r'}   # a pin saved with Windows line ends
  [[ ${EMU_REV:-} =~ ^[0-9a-f]{40}$ && ${EMU_CHECKED:-} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] \
    && emu_pin_age >/dev/null 2>&1 \
    || { echo "$EMU_PIN: expected one line, 'COMMIT YYYY-MM-DD' with the full 40-character commit"; return 1; }
}

# Prints the pin's age in days.
emu_pin_age() {
  python3 -c 'import datetime, sys; print((datetime.date.today() - datetime.date.fromisoformat(sys.argv[1])).days)' \
    "$EMU_CHECKED"
}

# emu_use COMMIT STOCK_BIN: checks out om-emu at COMMIT and unpacks E147's blocks for it. Fetches only when the
# commit is not in the clone yet, so a set-up workspace needs no network.
emu_use() {
  local rev=$1 stock=$2
  [ -d "$EMU/.git" ] || git clone --quiet "$EMU_GIT" "$EMU"
  if ! git -C "$EMU" cat-file -e "$rev^{commit}" 2>/dev/null; then
    if [ -f "$EMU/.git/shallow" ]; then git -C "$EMU" fetch --quiet --unshallow origin
    else git -C "$EMU" fetch --quiet origin; fi
    git -C "$EMU" cat-file -e "$rev^{commit}" 2>/dev/null || git -C "$EMU" fetch --quiet origin "$rev"
  fi
  if [ "$(git -C "$EMU" rev-parse HEAD)" != "$rev" ]; then
    git -C "$EMU" checkout --quiet --detach "$rev"
    rm -rf "$EMU/unpacked/$EMU_MODEL"   # unpack again with this commit's unpacker
  fi
  mkdir -p "$EMU/fw"
  python3 "$REPO/tools/emulator/camera_fidelity.py" "$EMU" --apply || return 1
  [ -f "$EMU/fw/$EMU_STOCK" ] || cp "$stock" "$EMU/fw/$EMU_STOCK"
  (cd "$EMU" && node emu/bin/fetch-fw.mjs --model "$EMU_MODEL" --bin "fw/$EMU_STOCK" >/dev/null 2>&1 \
    || node emu/bin/fetch-fw.mjs --model "$EMU_MODEL" --bin "fw/$EMU_STOCK")
}
