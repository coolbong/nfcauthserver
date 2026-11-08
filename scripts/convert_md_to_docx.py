import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

def set_cell_margins(cell, top=80, bottom=80, left=100, right=100):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_border(cell, **kwargs):
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        edge_data = kwargs.get(edge)
        if edge_data:
            tag = 'w:{}'.format(edge)
            element = parse_xml(f'<{tag} {nsdecls("w")} w:val="{edge_data.get("val", "single")}" w:sz="{edge_data.get("sz", 4)}" w:space="0" w:color="{edge_data.get("color", "CBD5E1")}"/>')
            tcBorders.append(element)
    tcPr.append(tcBorders)

def build_3page_docx():
    doc = Document()

    # Page Margins: Compact 0.65 inch to comfortably fit 3 pages
    for section in doc.sections:
        section.top_margin = Inches(0.65)
        section.bottom_margin = Inches(0.65)
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)

    # Base font style
    normal_style = doc.styles['Normal']
    normal_style.font.name = '맑은 고딕'
    normal_style.font.size = Pt(9.5)
    normal_style.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    img_flow = os.path.join(base_dir, 'docs', 'images', 'flow_diagram.png')
    img_mockup = os.path.join(base_dir, 'docs', 'images', 'auth_experience_mockup.png')

    # =========================================================================
    # PAGE 1: 개요, 4단계 플로우 인포그래픽, 기존 방식 대비 차별점 비교
    # =========================================================================

    # Title
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(4)
    run_title = p_title.add_run("차세대 NFC 정품 인증 솔루션 소개서")
    run_title.font.name = '맑은 고딕'
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    # Subtitle Callout
    tbl_sub = doc.add_table(rows=1, cols=1)
    tbl_sub.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_sub.columns[0].width = Inches(7.1)
    cell_sub = tbl_sub.cell(0, 0)
    set_cell_background(cell_sub, 'F1F5F9')
    set_cell_margins(cell_sub, top=90, bottom=90, left=140, right=140)
    set_cell_border(cell_sub, left=dict(sz=24, val='single', color='2563EB'))

    p_sub = cell_sub.paragraphs[0]
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(2)
    r1 = p_sub.add_run('"스마트폰 탭 한 번으로 증명되는 100% 정품의 가치"\n')
    r1.font.name = '맑은 고딕'
    r1.font.size = Pt(10)
    r1.font.bold = True
    r1.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
    r2 = p_sub.add_run('별도의 앱 설치 없이 스마트폰을 가져다 대는 것만으로 위조가 불가능한 정품 인증과 독점 브랜드 경험을 제공합니다.')
    r2.font.name = '맑은 고딕'
    r2.font.size = Pt(9)
    r2.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    # 1. 솔루션 개요
    h1 = doc.add_heading(level=1)
    h1.paragraph_format.space_before = Pt(10)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("1. 솔루션 개요 (Executive Summary)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p1 = doc.add_paragraph()
    p1.paragraph_format.line_spacing = 1.2
    p1.paragraph_format.space_after = Pt(6)
    p1.add_run("기존의 홀로그램 스티커나 QR코드는 사진 촬영 및 단순 인쇄로 쉽게 복제되어 가품 유통을 막지 못했습니다. 본 ")
    r_b = p1.add_run("다이내믹 NFC 정품 인증 솔루션")
    r_b.bold = True
    r_b.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)
    p1.add_run("은 금융권 OTP 및 스마트카드 보안 규격(RFC 4226 HOTP)을 적용하여, ")
    r_b2 = p1.add_run("스마트폰과 접촉할 때마다 매번 다른 일회용 암호 토큰을 자동 생성")
    r_b2.bold = True
    p1.add_run("합니다. 따라서 URL을 복사하거나 카드를 복제해도 가품을 절대 만들 수 없습니다.")

    # Image 1: Flow Diagram Infographic
    if os.path.exists(img_flow):
        p_img1 = doc.add_paragraph()
        p_img1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img1.paragraph_format.space_before = Pt(2)
        p_img1.paragraph_format.space_after = Pt(8)
        run_img1 = p_img1.add_run()
        run_img1.add_picture(img_flow, width=Inches(7.1))

    # 2. 기존 인증 방식과의 차이점
    h2 = doc.add_heading(level=1)
    h2.paragraph_format.space_before = Pt(6)
    h2.paragraph_format.space_after = Pt(4)
    r = h2.add_run("2. 기존 인증 방식과의 차이점 (Why Dynamic NFC?)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    tbl_comp = doc.add_table(rows=6, cols=4)
    tbl_comp.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_comp.columns[0].width = Inches(1.3)
    tbl_comp.columns[1].width = Inches(1.8)
    tbl_comp.columns[2].width = Inches(1.7)
    tbl_comp.columns[3].width = Inches(2.3)

    headers = ["비교 항목", "기존 QR코드 / 바코드", "기존 홀로그램 스티커", "본 NFC 정품 인증 솔루션"]
    for c_idx, h_text in enumerate(headers):
        cell = tbl_comp.cell(0, c_idx)
        set_cell_background(cell, '1E3A8A' if c_idx == 3 else '334155')
        set_cell_margins(cell, top=70, bottom=70, left=80, right=80)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(h_text)
        run.font.name = '맑은 고딕'
        run.font.size = Pt(8.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    comp_data = [
        ("복제 방지 능력", "취약 (사진 촬영 및 인쇄 복제 가능)", "보통 (정밀 인쇄로 유사 위조 가능)", "완벽 방어 (매 탭마다 일회용 암호 생성, 복제 불가)"),
        ("사용자 접근성", "카메라 켜기 → 초점 맞추기 → 인식", "육안 확인 (일반인 구별 어려움)", "스마트폰을 제품에 1초 접촉 (Zero-Click 접근)"),
        ("앱 설치 여부", "간혹 전용 리더기/앱 요구", "불필요", "불필요 (기본 브라우저 구동 & 전용앱 전환 지원)"),
        ("재전송/복사 공격", "링크만 알면 누구나 동일 화면 조회", "해당 없음", "이미 사용된 과거 코드는 즉시 차단 및 경고"),
        ("디지털 데이터 연계", "단순 정적 웹페이지 연결에 그침", "디지털 연동 불가", "고유 시리얼, 누적 인증 횟수, 실시간 통계 연동")
    ]

    for r_idx, row_values in enumerate(comp_data, start=1):
        bg_color = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
        for c_idx, val in enumerate(row_values):
            cell = tbl_comp.cell(r_idx, c_idx)
            if c_idx == 3:
                set_cell_background(cell, 'EFF6FF' if r_idx % 2 == 1 else 'DBEAFE')
            else:
                set_cell_background(cell, bg_color)

            set_cell_margins(cell, top=55, bottom=55, left=70, right=70)
            set_cell_border(cell,
                top=dict(sz=4, val='single', color='E2E8F0'),
                bottom=dict(sz=4, val='single', color='E2E8F0'),
                left=dict(sz=4, val='single', color='E2E8F0'),
                right=dict(sz=4, val='single', color='E2E8F0')
            )
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_idx == 0 else WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(val)
            run.font.name = '맑은 고딕'
            run.font.size = Pt(8)
            if c_idx == 0:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
            elif c_idx == 3:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
            else:
                run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    # END OF PAGE 1 -> Explicit Page Break
    doc.add_page_break()

    # =========================================================================
    # PAGE 2: 사용자 입장의 장점 & 실제 화면 목업 및 복제 차단 인포그래픽
    # =========================================================================

    h3 = doc.add_heading(level=1)
    h3.paragraph_format.space_before = Pt(0)
    h3.paragraph_format.space_after = Pt(4)
    r = h3.add_run("3. 사용자(소비자 / 팬덤) 입장에서의 장점")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    user_cards = [
        ("1) 진입 장벽 없는 제로-프릭션 (Zero-Friction)",
         "• 앱 설치 No, 회원가입 No: 낯선 앱 다운로드 없이 스마트폰 기본 인터넷 브라우저로 1초 만에 실행됩니다.\n• 남녀노소 전 세계 팬 누구나 동일한 사용성: 잠금 해제된 스마트폰을 대기만 하면 국경에 관계없이 즉각 동작합니다."),
        ('2) "내 물건은 100% 진짜"라는 절대적 신뢰',
         "• 가품에 대한 불안감 즉각 해소: 고가 굿즈, 명품, 친필 사인 상품의 정품 여부를 0.1초 만에 확인합니다.\n• 중고 거래(리셀) 시 즉석 정품 보증: 현장에서 스마트폰 탭 한 번으로 구매자에게 진품임을 명확하게 입증합니다."),
        ("3) 소장 가치와 프리미엄 경험 극대화",
         "• 상호작용하는 살아있는 디지털 인증서: 단순 종이/플라스틱 카드가 아닌 스마트폰과 소통하는 한정판 굿즈입니다.\n• 세상에 단 하나뿐인 나만의 제품: 카드 번호(#001 한정판), 배우/아티스트명, 최초 인증일이 디지털로 영구 기록됩니다."),
        ("4) 시크릿 VIP 혜택으로의 연결",
         "• 정품 소유자 전용 독점 콘텐츠: 정품 인증 완료 시 미공개 인사 영상, 시크릿 화보, 팬클럽 단독 혜택으로 연결됩니다.")
    ]

    tbl_ucards = doc.add_table(rows=2, cols=2)
    tbl_ucards.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_ucards.columns[0].width = Inches(3.55)
    tbl_ucards.columns[1].width = Inches(3.55)

    for idx, (t, d) in enumerate(user_cards):
        r_i = idx // 2
        c_i = idx % 2
        cell = tbl_ucards.cell(r_i, c_i)
        set_cell_background(cell, 'F8FAFC')
        set_cell_margins(cell, top=70, bottom=70, left=90, right=90)
        set_cell_border(cell,
            top=dict(sz=6, val='single', color='E2E8F0'),
            bottom=dict(sz=6, val='single', color='E2E8F0'),
            left=dict(sz=6, val='single', color='E2E8F0'),
            right=dict(sz=6, val='single', color='E2E8F0')
        )
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2)
        rt = p.add_run(t + "\n")
        rt.font.name = '맑은 고딕'
        rt.font.size = Pt(9.5)
        rt.font.bold = True
        rt.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)

        rd = p.add_run(d)
        rd.font.name = '맑은 고딕'
        rd.font.size = Pt(8.5)
        rd.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    # Image 2: Mobile UI Mockup & Security Comparison Graphic
    if os.path.exists(img_mockup):
        p_img2 = doc.add_paragraph()
        p_img2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img2.paragraph_format.space_before = Pt(10)
        p_img2.paragraph_format.space_after = Pt(4)
        run_img2 = p_img2.add_run()
        run_img2.add_picture(img_mockup, width=Inches(7.1))

    # Caption / explanation under Image 2
    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_cap.paragraph_format.space_before = Pt(0)
    p_cap.paragraph_format.space_after = Pt(0)
    rcap = p_cap.add_run("▲ [실제 화면] 정품 태그 탭 시 VIP 인증서가 열리며(좌), URL 복사·가품 복제 시도 시 0.1초 만에 '복제 의심 경고' 차단(우)")
    rcap.font.name = '맑은 고딕'
    rcap.font.size = Pt(8)
    rcap.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # END OF PAGE 2 -> Explicit Page Break
    doc.add_page_break()

    # =========================================================================
    # PAGE 3: 도입 기업 입장의 장점, 적용 분야, 라이브 데모 안내
    # =========================================================================

    h4 = doc.add_heading(level=1)
    h4.paragraph_format.space_before = Pt(0)
    h4.paragraph_format.space_after = Pt(4)
    r = h4.add_run("4. 도입 기업(브랜드 / 기획사) 입장에서의 장점")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    biz_cards = [
        ("1) 가품 유통 및 브랜드 훼손 100% 원천 방어",
         "금융권 암호 알고리즘(RFC 4226)을 적용하여, 복제품 제작 비용이 정품 제작 비용을 초과하게 만들어 가품 업자의 모조 시도를 원천 차단하고 브랜드 가치를 보호합니다."),
        ("2) 오프라인 구매자를 온라인 충성 고객(D2C)으로 전환",
         "오프라인 매장/팝업에서 구매한 익명 고객이 정품 인증을 위해 스마트폰을 탭하는 순간, 공식 온라인몰 회원가입 및 멤버십 프로모션으로 유입시키는 직접 마케팅 채널이 열립니다."),
        ("3) 글로벌 실시간 유통 및 이상 징후 감지 (Data Intelligence)",
         "어느 국가, 어느 도시에서 제품이 언제 스캔되었는지 실시간 파악하며, 동일 카드가 여러 지역에서 중복 스캔될 경우 가품 유통 거점을 조기에 탐지하고 법적 증거를 확보합니다."),
        ("4) 기존 제품 공정 및 패키징에 손쉬운 적용",
         "스티커(Inlay) 태그, 에폭시, PVC 스마트카드 등 다양한 폼팩터를 지원하여, 의류 라벨, 화장품 패키지, 굿즈 포토카드 등의 기존 제조 공정을 바꾸지 않고 간편하게 내장 가능합니다."),
        ("5) 저비용·고확장성 서버리스(Cloud) 인프라",
         "수십만 명이 동시에 몰리는 출시일에도 서버 다운 없이 즉각 대응하는 글로벌 Edge 네트워크 구조로 구축되어, 불필요한 고정 유지비 없이 사용량 기반으로 합리적 운영이 가능합니다.")
    ]

    tbl_biz = doc.add_table(rows=5, cols=2)
    tbl_biz.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_biz.columns[0].width = Inches(2.2)
    tbl_biz.columns[1].width = Inches(4.9)

    for b_idx, (b_title, b_desc) in enumerate(biz_cards):
        cell_l = tbl_biz.cell(b_idx, 0)
        cell_r = tbl_biz.cell(b_idx, 1)

        set_cell_background(cell_l, 'F1F5F9')
        set_cell_background(cell_r, 'FFFFFF')

        set_cell_margins(cell_l, top=45, bottom=45, left=70, right=70)
        set_cell_margins(cell_r, top=45, bottom=45, left=70, right=70)

        border_spec = dict(
            top=dict(sz=4, val='single', color='E2E8F0'),
            bottom=dict(sz=4, val='single', color='E2E8F0'),
            left=dict(sz=4, val='single', color='E2E8F0'),
            right=dict(sz=4, val='single', color='E2E8F0')
        )
        set_cell_border(cell_l, **border_spec)
        set_cell_border(cell_r, **border_spec)

        p_l = cell_l.paragraphs[0]
        p_l.paragraph_format.space_after = Pt(0)
        rl = p_l.add_run(b_title)
        rl.font.name = '맑은 고딕'
        rl.font.size = Pt(8.5)
        rl.font.bold = True
        rl.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

        p_r = cell_r.paragraphs[0]
        p_r.paragraph_format.space_after = Pt(0)
        p_r.paragraph_format.line_spacing = 1.15
        rr = p_r.add_run(b_desc)
        rr.font.name = '맑은 고딕'
        rr.font.size = Pt(8)
        rr.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    # 5. 주요 적용 분야
    h5 = doc.add_heading(level=1)
    h5.paragraph_format.space_before = Pt(8)
    h5.paragraph_format.space_after = Pt(4)
    r = h5.add_run("5. 주요 적용 분야 (Use Cases)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    tbl_use = doc.add_table(rows=2, cols=2)
    tbl_use.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_use.columns[0].width = Inches(3.55)
    tbl_use.columns[1].width = Inches(3.55)

    use_cases = [
        ("엔터테인먼트 & K-컬처", "• 한정판 포토카드 & 친필 사인 앨범\n• 공식 콘서트 응원봉 및 MD 굿즈\n→ 가품 거래 원천 차단 및 미공개 영상/보이스 독점 제공"),
        ("럭셔리 패션 & 스트릿웨어", "• 명품 가방, 의류 케어라벨, 신발\n• 한정판 스니커즈 변조 방지 씰\n→ 중고 리셀 거래 시 현장 즉석 정품 인증 도구로 활용"),
        ("아트 & 프리미엄 컬렉터블", "• 미술품/판화 디지털 보증서(COA)\n• 한정판 피규어 및 트레이딩 카드\n→ 영구적이고 훼손 없는 안전한 디지털 소유권 증명"),
        ("프리미엄 뷰티 & 주류 (F&B)", "• 프리미엄 기초 화장품 밀봉 패키지\n• 고급 싱글몰트 위스키, 와인 라벨\n→ 병마개 개봉 시 파손 씰로 내용물 바꿔치기 완벽 방지")
    ]

    for idx, (uc_title, uc_desc) in enumerate(use_cases):
        r_i = idx // 2
        c_i = idx % 2
        cell = tbl_use.cell(r_i, c_i)
        set_cell_background(cell, 'F8FAFC')
        set_cell_margins(cell, top=55, bottom=55, left=80, right=80)
        set_cell_border(cell,
            top=dict(sz=4, val='single', color='CBD5E1'),
            bottom=dict(sz=4, val='single', color='CBD5E1'),
            left=dict(sz=4, val='single', color='CBD5E1'),
            right=dict(sz=4, val='single', color='CBD5E1')
        )
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2)
        run_t = p.add_run(uc_title + "\n")
        run_t.font.name = '맑은 고딕'
        run_t.font.size = Pt(9)
        run_t.font.bold = True
        run_t.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

        run_d = p.add_run(uc_desc)
        run_d.font.name = '맑은 고딕'
        run_d.font.size = Pt(8)
        run_d.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    # 6. 라이브 데모 및 도입 문의 안내 박스
    tbl_demo = doc.add_table(rows=1, cols=1)
    tbl_demo.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_demo.columns[0].width = Inches(7.1)
    cell_demo = tbl_demo.cell(0, 0)
    set_cell_background(cell_demo, 'EFF6FF')
    set_cell_margins(cell_demo, top=70, bottom=70, left=100, right=100)
    set_cell_border(cell_demo,
        top=dict(sz=6, val='single', color='BFDBFE'),
        bottom=dict(sz=6, val='single', color='BFDBFE'),
        left=dict(sz=6, val='single', color='BFDBFE'),
        right=dict(sz=6, val='single', color='BFDBFE')
    )
    p_demo = cell_demo.paragraphs[0]
    p_demo.paragraph_format.space_after = Pt(0)
    rd_t = p_demo.add_run("🌐 실시간 라이브 데모 체험 및 도입 문의\n")
    rd_t.font.name = '맑은 고딕'
    rd_t.font.size = Pt(9.5)
    rd_t.font.bold = True
    rd_t.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)

    rd_c = p_demo.add_run(
        "• 공식 정품 인증 데모: https://nfcauth.vercel.app\n"
        "• 카드 관리자 페이지 (로그인 필요): https://nfcauth.vercel.app/admin\n"
        "• 맞춤형 브랜딩, CRM/팬클럽 연동, 대량 발급 문의는 기술지원팀으로 문의해 주시기 바랍니다."
    )
    rd_c.font.name = '맑은 고딕'
    rd_c.font.size = Pt(8)
    rd_c.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    # Save
    out_docx = os.path.join(base_dir, 'docs', 'SOLUTION_OVERVIEW.docx')
    doc.save(out_docx)
    print(f"[OK] Generated strictly 3-page document: {out_docx}")

if __name__ == '__main__':
    build_3page_docx()
