"""Read V12/V13 MF sweep pages in order, with sharpness, Focus Indicator, raw PDAF, lens and ZAF."""
import argparse
import json
import struct
from pathlib import Path

from read_focus_trace import DEVICES, EMPTY, OUTCOMES
from read_zaf_zone import ROW, decode_row


HEADER = struct.Struct('<4s5I')
LENS = struct.Struct('<hBBI')
VIEW = struct.Struct('<3IBbBB')
FI = struct.Struct('<4BhH2I')
ZAF_INFO = struct.Struct('<IhBB')
PDAF_L0 = struct.Struct('<4B4H4B')
PDAF_L1 = struct.Struct('<3I4B')
PDAF_L2 = struct.Struct('<2h3I')
STRIDE_V1 = ROW.size + LENS.size
STRIDE_V2 = STRIDE_V1 + VIEW.size + FI.size + ZAF_INFO.size
STRIDE = STRIDE_V2 + PDAF_L0.size + PDAF_L1.size + PDAF_L2.size


def _decode_v2_tail(data, offset):
    fine, coarse, measure_seq, raw_band, shift, outcome, view_flags = VIEW.unpack_from(data, offset)
    channel_id = view_flags & 3
    sharp_ok = bool(view_flags & 4)
    overlay_active = bool(view_flags & 8)
    if outcome == 255:
        outcome_name = None
    elif outcome < len(OUTCOMES):
        outcome_name = OUTCOMES[outcome]
    else:
        return None
    if channel_id and channel_id not in DEVICES:
        return None
    if sharp_ok:
        if raw_band > 4:
            return None
        score = round(16 * fine / coarse, 4) if coarse else None
    else:
        if (fine, coarse, raw_band) != (EMPTY, EMPTY, 255):
            return None
        fine = coarse = raw_band = score = None
    drawn_shift = shift if overlay_active and shift != -128 else None
    if drawn_shift is not None and not -4 <= drawn_shift <= 4:
        return None

    fi_valid, fi_index, fi_dir, fi_raw, fi_prev_pos, lens_status, fi_hyst_tick, fi_seq = FI.unpack_from(
        data, offset + VIEW.size)
    if fi_valid not in (0, 1) or fi_index > 100 or fi_dir > 3:
        return None

    zaf_token, zaf_defmm, zaf_ranging, zaf_area = ZAF_INFO.unpack_from(
        data, offset + VIEW.size + FI.size)
    token_ok = zaf_token != EMPTY

    return dict(
        edge_sharpness=dict(
            valid=sharp_ok,
            fine=fine,
            coarse=coarse,
            score=score,
            raw_band=raw_band,
            measure_seq=measure_seq,
        ),
        split_draw=dict(
            channel=DEVICES.get(channel_id),
            outcome=outcome_name,
            overlay_active=overlay_active,
            applied_shift=drawn_shift,
        ),
        focus_indicator=dict(
            valid=bool(fi_valid),
            direction=fi_dir,
            magnitude=fi_index,
            update_seq=fi_seq,
            updated=False,
            producer_initialized=fi_prev_pos != -32768,
            raw_direction=fi_raw & 15,
            hysteresis_active=bool(fi_raw & 16),
            getter_invoked=bool(fi_raw & 128),
            hysteresis_tick=fi_hyst_tick,
            prev_lens_position=None if fi_prev_pos == -32768 else fi_prev_pos,
            lens_status=lens_status,
        ),
        zaf_info=dict(
            ranging=bool(zaf_ranging),
            token=zaf_token if token_ok else None,
            defocus=zaf_defmm if token_ok and zaf_defmm != -32768 else None,
            area=zaf_area,
        ),
    )


def _decode_v3_pdaf(data, offset):
    (stream_en, stream_mode, cap_active, cap_state,
     rf0, rf1, rf2, rf3,
     r_wr, r_latest, r_ready, r_locked) = PDAF_L0.unpack_from(data, offset)
    raw_a_hash, raw_b_hash, raw_meta0, hw_refcnt, hw_busy, zaf_cmd, af_state_d8 = PDAF_L1.unpack_from(
        data, offset + PDAF_L0.size)
    aux_99ec, af_work_val, aux_99f0, aux_99f4, aux_99fc = PDAF_L2.unpack_from(
        data, offset + PDAF_L0.size + PDAF_L1.size)

    def _slot(v):
        return None if v == 255 else v

    if any(v not in (0, 1, 2, 3, 255) for v in (r_wr, r_latest, r_ready, r_locked)):
        return None

    return dict(
        pdaf_raw=dict(
            stream_enabled=bool(stream_en),
            stream_mode=stream_mode,
            capture_active=cap_active,
            capture_state=cap_state,
            ring_flags=[rf0, rf1, rf2, rf3],
            write_slot=_slot(r_wr),
            latest_slot=_slot(r_latest),
            ready_slot=_slot(r_ready),
            locked_slot=_slot(r_locked),
            center_a_hash=raw_a_hash if r_latest != 255 and raw_a_hash else None,
            center_b_hash=raw_b_hash if r_latest != 255 and raw_b_hash else None,
            meta0=None if raw_meta0 == EMPTY else raw_meta0,
            hw_refcnt=hw_refcnt,
            hw_busy=bool(hw_busy),
            zaf_cmd=zaf_cmd,
            af_state=af_state_d8,
        ),
        pdaf_aux_center=dict(
            af_work_value=None if af_work_val == -32768 else af_work_val,
            buf_99ec=None if aux_99ec == -32768 else aux_99ec,
            buf_99f0=None if aux_99f0 == EMPTY else aux_99f0,
            buf_99f4=None if aux_99f4 == EMPTY else aux_99f4,
            buf_99fc=None if aux_99fc == EMPTY else aux_99fc,
        ),
    )


def decode_pages(paths):
    sessions = {}
    session_versions = {}
    damaged = []
    for path in sorted(paths):
        data = path.read_bytes()
        if len(data) < HEADER.size:
            damaged.append(path.name)
            continue
        magic, version, session, first, count, stride = HEADER.unpack_from(data)
        if magic != b'OMSW':
            damaged.append(path.name)
            continue
        expected_stride = {1: STRIDE_V1, 2: STRIDE_V2, 3: STRIDE}.get(version)
        if expected_stride != stride:
            raise ValueError(f'{path}: unsupported sweep version {version} or row size {stride}')
        if not session or not first or not 1 <= count <= 64 or len(data) != HEADER.size + count * stride:
            damaged.append(path.name)
            continue
        page = {}
        for i in range(count):
            at = HEADER.size + i * stride
            row = decode_row(ROW.unpack_from(data, at))
            if row['seq'] != first + i:
                break
            pos, valid, inhibit, shutter = LENS.unpack_from(data, at + ROW.size)
            row.update(lens_position=pos if valid and pos != -32768 else None,
                       lens_valid=bool(valid), lens_inhibit=inhibit, shutter_event=shutter)
            if version >= 2:
                extra = _decode_v2_tail(data, at + STRIDE_V1)
                if extra is None:
                    break
                row.update(extra)
            if version >= 3:
                pdaf = _decode_v3_pdaf(data, at + STRIDE_V2)
                if pdaf is None:
                    break
                row.update(pdaf)
            page[first + i] = row
        if len(page) != count:
            damaged.append(path.name)
            continue
        if session in session_versions and session_versions[session] != version:
            raise ValueError(f'{path}: mixed sweep versions in session {session}')
        session_versions[session] = version
        rows = sessions.setdefault(session, {})
        for seq, row in page.items():
            if seq in rows and rows[seq] != row:
                raise ValueError(f'{path}: conflicting sample {seq} in session {session}')
            rows[seq] = row
    result = []
    for session, rows in sorted(sessions.items()):
        missing = []
        previous = 0
        ordered = []
        for seq in sorted(rows):
            if seq > previous + 1:
                missing.append([previous + 1, seq - 1])
            row = rows[seq]
            if 'focus_indicator' in row:
                fi = dict(row['focus_indicator'])
                if seq == 1:
                    fi['updated'] = fi['update_seq'] > 0
                elif seq == previous + 1:
                    fi['updated'] = fi['update_seq'] != rows[previous]['focus_indicator']['update_seq']
                else:
                    fi['updated'] = None
                row = {**row, 'focus_indicator': fi}
            ordered.append(row)
            previous = seq
        result.append(dict(session=session, missing_ranges=missing, rows=ordered))
    return dict(damaged_pages=damaged, sessions=result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    paths = sorted(args.directory.glob('ZS[0-9][0-9][0-9][0-9][0-9][0-9].BIN'))
    if not paths:
        parser.error('No MF sweep pages in this directory')
    print(json.dumps(decode_pages(paths), indent=2))
