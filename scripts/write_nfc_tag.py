"""
scripts/write_nfc_tag.py
NFC Authentication 태그 발급 및 동기화 도구

- 타깃 리더기: 'CB Virtual Contact 0' (기본값) 및 OMNIKEY 등 모든 PC/SC 리더기 지원
- 기능:
  1. 'CB Virtual Contact 0' 우선 연결 및 스마트 탐색
  2. 태그 하드웨어 UID 추출 (가상 카드 환경 시 DB 기본 UID 자동 매핑)
  3. Supabase DB와 태그 UID 실시간 동기화 및 counter(0) 초기화
  4. NDEF URL 작성 (https://coolbong.github.io/nfcauthserver/?uid=...&cnt=...&mac=...&kid=1)
  5. SDM (Secure Dynamic Messaging) 보안 미러링 설정 (UID, 3바이트 카운터, MAC)
"""

import sys
import os
import time
import argparse
import ctypes
from ctypes import wintypes
import urllib.request
import json

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
        sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)
    except Exception:
        pass

# ==========================================
# 1. 설정 및 기본값
# ==========================================
TARGET_READER_DEFAULT = "CB Virtual Contact 0"
DEFAULT_DEMO_UID = "04DE5F1EACC040"

SUPABASE_PROJECT_REF = os.getenv("SUPABASE_PROJECT_REF", "jklfqmbaubvnbrbuhzak")
SUPABASE_ACCESS_TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN", "")

DEMO_URL_HOST = "coolbong.github.io/nfcauthserver/?"
DEMO_URL_FULL = f"https://{DEMO_URL_HOST}uid=00000000000000&cnt=000000&mac=0000000000000000&kid=1"

# ==========================================
# 2. Windows PC/SC (winscard.dll) 네이티브 바인딩
# ==========================================
winscard = ctypes.windll.winscard
SCARDCONTEXT = ctypes.c_size_t
SCARDHANDLE = ctypes.c_size_t

SCARD_SCOPE_USER = 0
SCARD_SHARE_SHARED = 2
SCARD_PROTOCOL_T0 = 1
SCARD_PROTOCOL_T1 = 2
SCARD_PROTOCOL_TX = SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1
SCARD_LEAVE_CARD = 0

winscard.SCardTransmit.argtypes = [
    SCARDHANDLE,
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_ubyte),
    wintypes.DWORD,
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_ubyte),
    ctypes.POINTER(wintypes.DWORD)
]
winscard.SCardTransmit.restype = wintypes.LONG

pci_t0 = ctypes.c_void_p.in_dll(winscard, 'g_rgSCardT0Pci')
pci_t1 = ctypes.c_void_p.in_dll(winscard, 'g_rgSCardT1Pci')


def send_apdu(hCard, active_protocol, apdu_bytes):
    """APDU 송수신 함수 (T=0 GET RESPONSE 자동 처리)"""
    pci = pci_t0 if active_protocol == SCARD_PROTOCOL_T0 else pci_t1
    send_buf = (ctypes.c_ubyte * len(apdu_bytes))(*apdu_bytes)
    recv_buf = (ctypes.c_ubyte * 258)()
    recv_len = wintypes.DWORD(len(recv_buf))

    ret = winscard.SCardTransmit(
        hCard,
        ctypes.byref(pci),
        send_buf,
        len(apdu_bytes),
        None,
        recv_buf,
        ctypes.byref(recv_len)
    )
    if ret != 0:
        return None, ret

    resp = bytes(recv_buf[:recv_len.value])

    # T=0 프로토콜에서 61 XX (추가 응답 데이터 존재) 발생 시 GET RESPONSE 자동 전송
    if active_protocol == SCARD_PROTOCOL_T0 and len(resp) == 2 and resp[0] == 0x61:
        le = resp[1]
        get_resp_cmd = [0x00, 0xC0, 0x00, 0x00, le]
        s_buf2 = (ctypes.c_ubyte * len(get_resp_cmd))(*get_resp_cmd)
        r_len2 = wintypes.DWORD(258)
        ret2 = winscard.SCardTransmit(
            hCard,
            ctypes.byref(pci),
            s_buf2,
            len(get_resp_cmd),
            None,
            recv_buf,
            ctypes.byref(r_len2)
        )
        if ret2 == 0:
            resp = bytes(recv_buf[:r_len2.value])

    return resp, 0


def list_readers():
    """연결된 PC/SC 리더기 목록 조회"""
    hContext = SCARDCONTEXT()
    ret = winscard.SCardEstablishContext(SCARD_SCOPE_USER, None, None, ctypes.byref(hContext))
    if ret != 0:
        print(f"[!] PC/SC 컨텍스트 생성 실패 (코드: {hex(ret & 0xFFFFFFFF)})")
        return []

    pcchReaders = wintypes.DWORD(0)
    winscard.SCardListReadersA(hContext, None, None, ctypes.byref(pcchReaders))
    if pcchReaders.value == 0:
        winscard.SCardReleaseContext(hContext)
        return []

    buf = ctypes.create_string_buffer(pcchReaders.value)
    winscard.SCardListReadersA(hContext, None, buf, ctypes.byref(pcchReaders))
    readers = [r.decode('utf-8', errors='ignore') for r in buf.raw[:pcchReaders.value].split(b'\x00') if r]
    winscard.SCardReleaseContext(hContext)
    return readers


def select_target_reader(readers, preferred_name=None):
    """지정된 리더기 우선 선택 (기본값: 'CB Virtual Contact 0')"""
    if not readers:
        return None

    target = preferred_name or TARGET_READER_DEFAULT

    # 1. 지정된 리더기 대소문자 무관 탐색
    for r in readers:
        if target.lower() in r.lower():
            return r

    # 2. 'CB Virtual' 관련 리더기 탐색
    for r in readers:
        if "cb virtual" in r.lower():
            return r

    # 3. 비접촉/Contactless 리더기 탐색
    keywords = ['cl', 'contactless', '5422cl', 'nfc', 'pcd']
    for kw in keywords:
        for r in readers:
            if kw in r.lower():
                return r

    return readers[0]


def update_supabase_tag_uid(new_uid_hex):
    """Supabase DB의 태그 UID 업데이트 및 카운터 초기화"""
    uid_lower = new_uid_hex.lower()
    url = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_REF}/database/query"

    sql = f"UPDATE public.nfc_tags SET uid = '{uid_lower}', last_counter = 0;"

    req = urllib.request.Request(
        url,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {SUPABASE_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status in (200, 201):
                return True, "DB 업데이트 성공"
            return False, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        return False, f"HTTP {e.code}: {err_msg}"
    except Exception as e:
        return False, str(e)


def create_ndef_payload(url):
    """NFC Forum NDEF URI 메시지 생성 (Prefix 0x04: https://)"""
    url_no_prefix = url.replace("https://", "")
    payload = bytes([0x04]) + url_no_prefix.encode("ascii")
    ndef_record = bytes([0xD1, 0x01, len(payload), 0x55]) + payload
    ndef_file = len(ndef_record).to_bytes(2, "big") + ndef_record
    return ndef_file


def run_tag_writer(reader_override=None, uid_override=None, auto_sync_db=True):
    print("=" * 68)
    print("   NFC Authentication 보안 태그 발급 및 설정 도구")
    print("=" * 68)

    readers = list_readers()
    if not readers:
        print("[❌] 연결된 PC/SC 리더기를 찾을 수 없습니다.")
        return

    reader_name = select_target_reader(readers, reader_override)
    print(f"[🔍] 선택된 리더기: {reader_name}")

    hContext = SCARDCONTEXT()
    winscard.SCardEstablishContext(SCARD_SCOPE_USER, None, None, ctypes.byref(hContext))

    hCard = SCARDHANDLE()
    dwActiveProto = wintypes.DWORD()

    # 태그/카드 연결 시도
    ret = winscard.SCardConnectA(
        hContext,
        reader_name.encode("utf-8"),
        SCARD_SHARE_SHARED,
        SCARD_PROTOCOL_TX,
        ctypes.byref(hCard),
        ctypes.byref(dwActiveProto)
    )

    if ret != 0:
        print("\n👉 리더기에 카드가 감지되지 않아 대기 중입니다...")
        while True:
            ret = winscard.SCardConnectA(
                hContext,
                reader_name.encode("utf-8"),
                SCARD_SHARE_SHARED,
                SCARD_PROTOCOL_TX,
                ctypes.byref(hCard),
                ctypes.byref(dwActiveProto)
            )
            if ret == 0:
                break
            time.sleep(0.5)

    proto_name = "T=0" if dwActiveProto.value == SCARD_PROTOCOL_T0 else "T=1"
    print(f"\n[✅] 태그/카드 연결 성공! (프로토콜: {proto_name})")

    # 1. 태그 UID 읽기
    tag_uid = None
    if uid_override:
        tag_uid = uid_override.upper()
        print(f"  📌 지정된 UID 사용 : {tag_uid}")
    else:
        # PC/SC 표준 Get Data (FF CA 00 00 00)
        uid_apdu = [0xFF, 0xCA, 0x00, 0x00, 0x00]
        resp, _ = send_apdu(hCard, dwActiveProto.value, uid_apdu)
        if resp and len(resp) >= 6 and resp[-2:] == b'\x90\x00':
            tag_uid = resp[:-2].hex().upper()
            print(f"  📌 태그 하드웨어 고유 UID : {tag_uid}")
        else:
            # 가상 Contact 리더기이거나 하드웨어 UID 미지원 시 기본 데모 UID 적용
            tag_uid = DEFAULT_DEMO_UID
            print(f"  📌 리더기 특성상 하드웨어 UID 조회가 없으므로 DB 데모 UID 적용: {tag_uid}")

    # 2. Supabase DB와 UID 동기화
    if tag_uid and auto_sync_db:
        print(f"\n[🔄] Supabase DB에 태그 UID({tag_uid}) 동기화 및 카운터(0) 초기화...")
        ok, msg = update_supabase_tag_uid(tag_uid)
        if ok:
            print(f"  ✅ DB 동기화 완료! 이제 이 태그로 정품 인증이 정상 처리됩니다.")
        else:
            print(f"  ⚠️ DB 동기화 알림 ({msg})")

    # 3. NDEF 메시지 작성 및 오프셋 계산
    ndef_bytes = create_ndef_payload(DEMO_URL_FULL)
    uid_offset = ndef_bytes.find(b"uid=") + len(b"uid=")
    cnt_offset = ndef_bytes.find(b"cnt=") + len(b"cnt=")
    mac_offset = ndef_bytes.find(b"mac=") + len(b"mac=")

    print(f"\n[📝] NDEF URL 데이터 계산:")
    print(f"  - Target URL : {DEMO_URL_FULL}")
    print(f"  - UID 오프셋   : {uid_offset} (0x{uid_offset:02X})")
    print(f"  - 카운터 오프셋: {cnt_offset} (0x{cnt_offset:02X}) [3-byte Big-Endian]")
    print(f"  - MAC 오프셋   : {mac_offset} (0x{mac_offset:02X})")

    # Select NDEF Application (AID: D2760000850101)
    sel_app = [0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01]
    resp, _ = send_apdu(hCard, dwActiveProto.value, sel_app)
    resp_hex = resp.hex().upper() if resp else "NO_RESP"
    print(f"\n[1/3] NDEF 애플리케이션 선택 (AID: D2760000850101) -> 응답: {resp_hex}")

    if resp and resp[-2:] == b'\x90\x00':
        # Select NDEF File (0xE104)
        sel_file = [0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x04]
        resp_file, _ = send_apdu(hCard, dwActiveProto.value, sel_file)
        print(f"[2/3] NDEF 파일 선택 (0xE104) -> 응답: {resp_file.hex().upper() if resp_file else 'NO_RESP'}")

        # Check existing NDEF URL on card
        read_nlen, _ = send_apdu(hCard, dwActiveProto.value, [0x00, 0xB0, 0x00, 0x00, 0x02])
        if read_nlen and len(read_nlen) >= 4 and read_nlen[-2:] == b'\x90\x00':
            existing_nlen = int.from_bytes(read_nlen[:2], 'big')
            if existing_nlen > 0:
                read_rec, _ = send_apdu(hCard, dwActiveProto.value, [0x00, 0xB0, 0x00, 0x02, min(existing_nlen, 128)])
                if read_rec and len(read_rec) > 7:
                    try:
                        prefix_byte = read_rec[4]
                        prefix_str = "https://" if prefix_byte == 0x04 else ("http://" if prefix_byte == 0x03 else "")
                        existing_url = prefix_str + read_rec[5:-2].decode('ascii', errors='ignore')
                        print(f"  📖 [확인] 현재 태그에 세팅된 NDEF URL : {existing_url}")
                    except Exception:
                        pass

        # UpdateBinary NLEN = 0
        send_apdu(hCard, dwActiveProto.value, [0x00, 0xD6, 0x00, 0x00, 0x02, 0x00, 0x00])

        # Write NDEF Payload
        update_apdu = [0x00, 0xD6, 0x00, 0x02, len(ndef_bytes) - 2] + list(ndef_bytes[2:])
        send_apdu(hCard, dwActiveProto.value, update_apdu)

        # Write NLEN
        nlen_msb = ndef_bytes[0]
        nlen_lsb = ndef_bytes[1]
        resp_write, _ = send_apdu(hCard, dwActiveProto.value, [0x00, 0xD6, 0x00, 0x00, 0x02, nlen_msb, nlen_lsb])
        print(f"      NDEF 레코드 갱신 완료 -> 응답: {resp_write.hex().upper() if resp_write else 'NO_RESP'}")

        # 4. SDM (Secure Dynamic Messaging) 활성화 (하드웨어 칩용)
        uid_off_le = list(uid_offset.to_bytes(3, 'little'))
        cnt_off_le = list(cnt_offset.to_bytes(3, 'little'))
        mac_off_le = list(mac_offset.to_bytes(3, 'little'))

        change_settings_cmd = (
            [0x90, 0x5F, 0x00, 0x00, 0x13]
            + [0x02]                    # FileNo: 0x02
            + [0x40]                    # FileOption: SDM Plain
            + [0x00, 0xE0]              # AccessRights
            + [0xC1]                    # SDMOptions
            + [0x01, 0xE1]              # SDMAccessRights
            + uid_off_le                # UIDOffset
            + cnt_off_le                # SDMReadCtrOffset
            + mac_off_le                # SDMMACOffset
            + mac_off_le                # SDMMACInputOffset
            + [0x00]                    # Le
        )
        sdm_resp, _ = send_apdu(hCard, dwActiveProto.value, change_settings_cmd)
        sdm_hex = sdm_resp.hex().upper() if sdm_resp else "NO_RESP"
        if sdm_hex.endswith("9000") or sdm_hex.endswith("9100"):
            print(f"[3/3] SDM 보안 미러링 설정 명령 -> 응답: {sdm_hex} (성공)")
        elif sdm_hex.startswith("6D"):
            print(f"[3/3] SDM 설정: 가상 JavaCard NDEF Applet 환경 (정적 NDEF 에뮬레이션 정상 동작)")
        else:
            print(f"[3/3] SDM 설정 명령 결과: {sdm_hex}")
    else:
        print(f"  ℹ️ 현재 가상 카드에 NDEF 표준 애플릿이 선택되지 않았습니다. (응답: {resp_hex})")
        print(f"     (가상 카드 서버 run_virtual_card.bat 실행 후 다시 시도해 주세요)")

    winscard.SCardDisconnect(hCard, SCARD_LEAVE_CARD)
    winscard.SCardReleaseContext(hContext)

    print("\n" + "=" * 68)
    print("🎉 처리 완료!")
    print(f"  - 등록된 UID : {tag_uid}")
    print(f"  - 초기 카운터 : 0")
    print(f"  - 실시간 테스트 URL:")
    print(f"    https://coolbong.github.io/nfcauthserver/?uid={tag_uid}&cnt=000001&mac=YOUR_MAC&kid=1")
    print("=" * 68)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NFC Authentication 태그 발급 및 동기화 도구")
    parser.add_argument("--reader", default=TARGET_READER_DEFAULT, help="사용할 PC/SC 리더기 이름")
    parser.add_argument("--uid", default=None, help="적용할 UID (기본값: 자동 추출 또는 DB 데모 UID)")
    parser.add_argument("--no-sync", action="store_true", help="DB 동기화 건너뛰기")

    args = parser.parse_args()
    run_tag_writer(reader_override=args.reader, uid_override=args.uid, auto_sync_db=(not args.no_sync))
