import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('docs/images', exist_ok=True)

FONT_REG = 'C:/Windows/Fonts/malgun.ttf'
FONT_BOLD = 'C:/Windows/Fonts/malgunbd.ttf'

def get_font(size, bold=False):
    path = FONT_BOLD if bold else FONT_REG
    return ImageFont.truetype(path, size)

def create_flow_diagram():
    # 1800 x 540 for high crispness
    w, h = 1800, 500
    img = Image.new('RGB', (w, h), '#FFFFFF')
    draw = ImageDraw.Draw(img)

    # Background subtle border / rounded container
    draw.rounded_rectangle([20, 20, w-20, h-20], radius=24, fill='#F8FAFC', outline='#E2E8F0', width=2)

    # Title Banner inside diagram
    draw.text((60, 48), "다이내믹 NFC 정품 인증 프로세스 (0.1초 원터치 검증)", font=get_font(28, bold=True), fill='#1E3A8A')
    draw.text((60, 88), "스마트폰을 제품에 대는 순간부터 클라우드 검증까지 전 과정이 원활하게 자동 처리됩니다.", font=get_font(18), fill='#64748B')

    card_y0, card_y1 = 140, 440
    cards = [
        {
            "num": "STEP 01",
            "title": "스마트폰 접촉 (Tap)",
            "subtitle": "별도 앱 설치 불필요",
            "desc": "아이폰 / 갤럭시 등 스마트폰을\n포토카드나 제품에 1초간 접촉",
            "color": "#2563EB",
            "bg": "#EFF6FF",
            "border": "#BFDBFE"
        },
        {
            "num": "STEP 02",
            "title": "동적 일회용 암호 생성",
            "subtitle": "접촉할 때마다 자동 갱신",
            "desc": "NFC 칩 내부에서 카운터를 올리며\n위조 불가능한 일회용 토큰 생성",
            "color": "#4F46E5",
            "bg": "#EEF2FF",
            "border": "#C7D2FE"
        },
        {
            "num": "STEP 03",
            "title": "클라우드 즉시 검증",
            "subtitle": "0.1초 초고속 판별",
            "desc": "서버의 보안 마스터키와 대조하여\n토큰 유효성 및 복제 여부 검증",
            "color": "#059669",
            "bg": "#ECFDF5",
            "border": "#A7F3D0"
        },
        {
            "num": "STEP 04",
            "title": "VIP 정품 인증 완료",
            "subtitle": "나만의 디지털 보증서",
            "desc": "배우명, 카드번호 #001,\n인증횟수 및 단독 콘텐츠 제공",
            "color": "#0284C7",
            "bg": "#F0F9FF",
            "border": "#BAE6FD"
        }
    ]

    card_w = 360
    gap = 60
    start_x = 60

    for i, c in enumerate(cards):
        x0 = start_x + i * (card_w + gap)
        x1 = x0 + card_w

        # Draw Card
        draw.rounded_rectangle([x0, card_y0, x1, card_y1], radius=18, fill=c["bg"], outline=c["border"], width=2)

        # Top Badge
        draw.rounded_rectangle([x0+24, card_y0+24, x0+120, card_y0+58], radius=8, fill=c["color"])
        draw.text((x0+38, card_y0+30), c["num"], font=get_font(15, bold=True), fill='#FFFFFF')

        # Title
        draw.text((x0+24, card_y0+75), c["title"], font=get_font(22, bold=True), fill='#0F172A')
        draw.text((x0+24, card_y0+112), c["subtitle"], font=get_font(16, bold=True), fill=c["color"])

        # Divider line
        draw.line([x0+24, card_y0+145, x1-24, card_y0+145], fill=c["border"], width=1)

        # Description
        draw.multiline_text((x0+24, card_y0+165), c["desc"], font=get_font(17), fill='#475569', spacing=8)

        # Draw Arrow to next card
        if i < len(cards) - 1:
            arrow_x = x1 + 18
            arrow_y = (card_y0 + card_y1) // 2
            # draw modern chevron arrow
            draw.polygon([
                (arrow_x, arrow_y - 18),
                (arrow_x + 22, arrow_y),
                (arrow_x, arrow_y + 18),
                (arrow_x + 8, arrow_y)
            ], fill='#94A3B8')

    out_path = 'docs/images/flow_diagram.png'
    img.save(out_path, dpi=(300, 300))
    print(f"[OK] Generated {out_path}")

def create_security_and_mockup_graphic():
    # 1800 x 780 for high crispness
    w, h = 1800, 780
    img = Image.new('RGB', (w, h), '#FFFFFF')
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([20, 20, w-20, h-20], radius=24, fill='#F8FAFC', outline='#E2E8F0', width=2)

    # Title
    draw.text((60, 48), "실제 스마트폰 인증 화면 및 복제 차단 메커니즘", font=get_font(28, bold=True), fill='#1E3A8A')
    draw.text((60, 88), "최초 정품 스캔 시 VIP 인증서가 열리며, 동일 링크를 공유·복제할 경우 0.1초 만에 '복제 의심 경고'가 작동합니다.", font=get_font(18), fill='#64748B')

    # Left phone: Normal Authentic Screen
    phone_w, phone_h = 440, 580
    p1_x0, p1_y0 = 80, 145
    p1_x1, p1_y1 = p1_x0 + phone_w, p1_y0 + phone_h

    # Phone Frame 1 (Authentic)
    draw.rounded_rectangle([p1_x0, p1_y0, p1_x1, p1_y1], radius=32, fill='#0F172A', outline='#334155', width=3)
    # Screen Area
    s1_x0, s1_y0, s1_x1, s1_y1 = p1_x0+12, p1_y0+12, p1_x1-12, p1_y1-12
    draw.rounded_rectangle([s1_x0, s1_y0, s1_x1, s1_y1], radius=24, fill='#111827')

    # Top Notch / Camera bar
    draw.rounded_rectangle([p1_x0 + 150, s1_y0 + 8, p1_x0 + 290, s1_y0 + 26], radius=8, fill='#1F2937')

    # Badge: Authentic
    draw.rounded_rectangle([s1_x0 + 120, s1_y0 + 45, s1_x1 - 120, s1_y0 + 85], radius=20, fill='#064E3B', outline='#059669', width=2)
    draw.text((s1_x0 + 148, s1_y0 + 53), "✓ 공식 정품 인증", font=get_font(16, bold=True), fill='#34D399')

    # Photocard Card Box
    draw.rounded_rectangle([s1_x0 + 35, s1_y0 + 105, s1_x1 - 35, s1_y0 + 285], radius=16, fill='#1F2937', outline='#374151', width=1)
    draw.text((s1_x0 + 55, s1_y0 + 125), "한정판 아티스트 포토카드", font=get_font(14, bold=True), fill='#9CA3AF')
    draw.text((s1_x0 + 55, s1_y0 + 150), "배현성 (Bae Hyeon-seong)", font=get_font(20, bold=True), fill='#F9FAFB')
    draw.rounded_rectangle([s1_x0 + 55, s1_y0 + 190, s1_x0 + 160, s1_y0 + 225], radius=8, fill='#1D4ED8')
    draw.text((s1_x0 + 72, s1_y0 + 198), "카드번호 #001", font=get_font(13, bold=True), fill='#FFFFFF')
    draw.text((s1_x0 + 55, s1_y0 + 245), "NFC Smartcard Authentic Edition", font=get_font(13), fill='#6B7280')

    # Verification Info Table inside Phone
    draw.rounded_rectangle([s1_x0 + 35, s1_y0 + 305, s1_x1 - 35, s1_y0 + 445], radius=14, fill='#182234', outline='#1E293B')
    fields = [
        ("인증 상태", "100% 정상 정품 (AUTHENTIC)", "#34D399"),
        ("배우명", "배현성", "#F3F4F6"),
        ("카드 번호", "#001 (Official Limited)", "#93C5FD"),
        ("최초 인증일시", "2026.11.05 14:39:10", "#9CA3AF"),
        ("누적 인증 횟수", "1회 (최초 검증자 소유)", "#FCD34D")
    ]
    for idx, (label, val, val_color) in enumerate(fields):
        yy = s1_y0 + 320 + idx * 24
        draw.text((s1_x0 + 50, yy), label, font=get_font(13), fill='#94A3B8')
        draw.text((s1_x0 + 165, yy), val, font=get_font(13, bold=True), fill=val_color)

    # Action Button
    draw.rounded_rectangle([s1_x0 + 35, s1_y0 + 470, s1_x1 - 35, s1_y0 + 518], radius=12, fill='#2563EB')
    draw.text((s1_x0 + 115, s1_y0 + 484), "VIP 단독 미공개 콘텐츠 보기 →", font=get_font(15, bold=True), fill='#FFFFFF')

    # Phone 1 Label below
    draw.text((p1_x0 + 110, p1_y1 + 10), "[화면 1] 정상 정품 인증 성공 시", font=get_font(16, bold=True), fill='#059669')

    # Middle Comparison / Attack Box
    mid_x0, mid_y0 = 570, 190
    mid_x1, mid_y1 = 1170, 670

    draw.rounded_rectangle([mid_x0, mid_y0, mid_x1, mid_y1], radius=20, fill='#FFFFFF', outline='#CBD5E1', width=2)
    draw.text((mid_x0 + 30, mid_y0 + 30), "🛡️ 왜 가품 복제가 원천적으로 불가능한가?", font=get_font(22, bold=True), fill='#1E3A8A')

    points = [
        ("1. 매번 바뀌는 일회용 암호 토큰", "스마트폰을 접촉할 때마다 태그 내부 카운터(HOTP)가 자동 증가하며 새로운 암호 코드를 생성합니다."),
        ("2. 이전 URL 복사 및 링크 공유 차단", "가품 업자가 정품 카드의 URL을 복사하여 다른 곳에 뿌려도, 이미 사용된 과거 카운터는 서버에서 즉시 거절됩니다."),
        ("3. 금융권 수준의 하드웨어 보안", "암호화 키는 칩 내부에 물리적으로 격리되어 있어 현존하는 소프트웨어 방식으로 칩을 복제할 수 없습니다."),
        ("4. 실시간 위치/시간 이상 징후 감지", "동일 태그가 다른 국가나 도시에서 동시에 스캔될 경우 즉각 모니터링 시스템에 기록되어 가품 거점을 적발합니다.")
    ]

    for p_idx, (p_t, p_d) in enumerate(points):
        y_pos = mid_y0 + 80 + p_idx * 105
        # Badge
        draw.rounded_rectangle([mid_x0 + 30, y_pos, mid_x0 + 60, y_pos + 30], radius=6, fill='#EFF6FF')
        draw.text((mid_x0 + 40, y_pos + 4), str(p_idx+1), font=get_font(16, bold=True), fill='#2563EB')
        draw.text((mid_x0 + 75, y_pos + 3), p_t, font=get_font(18, bold=True), fill='#0F172A')
        draw.multiline_text((mid_x0 + 75, y_pos + 34), p_d, font=get_font(15), fill='#475569', spacing=4)

    # Right Phone: Replay Attack Warning Screen
    p2_x0 = 1240
    p2_x1 = p2_x0 + phone_w

    draw.rounded_rectangle([p2_x0, p1_y0, p2_x1, p1_y1], radius=32, fill='#0F172A', outline='#334155', width=3)
    s2_x0, s2_y0, s2_x1, s2_y1 = p2_x0+12, p1_y0+12, p2_x1-12, p1_y1-12
    draw.rounded_rectangle([s2_x0, s2_y0, s2_x1, s2_y1], radius=24, fill='#111827')

    # Notch
    draw.rounded_rectangle([p2_x0 + 150, s2_y0 + 8, p2_x0 + 290, s2_y0 + 26], radius=8, fill='#1F2937')

    # Badge: Warning
    draw.rounded_rectangle([s2_x0 + 110, s2_y0 + 45, s2_x1 - 110, s2_y0 + 85], radius=20, fill='#450A0A', outline='#DC2626', width=2)
    draw.text((s2_x0 + 130, s2_y0 + 53), "⚠️ 복제 의심 경고 감지", font=get_font(16, bold=True), fill='#F87171')

    # Warning Icon / Box
    draw.rounded_rectangle([s2_x0 + 35, s2_y0 + 110, s2_x1 - 35, s2_y0 + 290], radius=16, fill='#1F1919', outline='#7F1D1D', width=1)
    draw.text((s2_x0 + 55, s2_y0 + 135), "재전송 / 불법 복제 감지", font=get_font(20, bold=True), fill='#FCA5A5')
    draw.multiline_text((s2_x0 + 55, s2_y0 + 175), "이전에 이미 사용된 일회용 암호 토큰입니다.\n\n정품 태그를 직접 소지하지 않고\nURL을 복사하여 접속한 가품 또는\n중복 스캔으로 판정되었습니다.", font=get_font(14), fill='#D1D5DB', spacing=6)

    # Info table inside Warning Phone
    draw.rounded_rectangle([s2_x0 + 35, s2_y0 + 310, s2_x1 - 35, s2_y0 + 445], radius=14, fill='#1C1917', outline='#292524')
    fields2 = [
        ("보안 상태", "비정상 접속 차단 (BLOCKED)", "#EF4444"),
        ("위조 감지 사유", "카운터 재사용 (COUNTER_REPLAY)", "#F87171"),
        ("보호 조치", "위조품 유통망 IP 자동 기록", "#FBBF24"),
        ("해결 방법", "실물 태그 직접 재접촉 필요", "#9CA3AF")
    ]
    for idx, (label, val, val_color) in enumerate(fields2):
        yy = s2_y0 + 328 + idx * 26
        draw.text((s2_x0 + 50, yy), label, font=get_font(13), fill='#94A3B8')
        draw.text((s2_x0 + 155, yy), val, font=get_font(13, bold=True), fill=val_color)

    # Action Button: Report
    draw.rounded_rectangle([s2_x0 + 35, s2_y0 + 470, s2_x1 - 35, s2_y0 + 518], radius=12, fill='#7F1D1D')
    draw.text((s2_x0 + 135, s2_y0 + 484), "가품 의심 신고 센터 연결", font=get_font(15, bold=True), fill='#FEE2E2')

    # Phone 2 Label below
    draw.text((p2_x0 + 95, p1_y1 + 10), "[화면 2] 가품 복제 / URL 재사용 시도 차단", font=get_font(16, bold=True), fill='#DC2626')

    out_path = 'docs/images/auth_experience_mockup.png'
    img.save(out_path, dpi=(300, 300))
    print(f"[OK] Generated {out_path}")

if __name__ == '__main__':
    create_flow_diagram()
    create_security_and_mockup_graphic()
