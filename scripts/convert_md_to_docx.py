import os
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

def set_cell_margins(cell, top=120, bottom=120, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_border(cell, **kwargs):
    """
    kwargs: top, bottom, left, right
    values: dict(sz=12, val='single', color='FF0000', space='0')
    """
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        edge_data = kwargs.get(edge)
        if edge_data:
            tag = 'w:{}'.format(edge)
            element = parse_xml(f'<{tag} {nsdecls("w")} w:val="{edge_data.get("val", "single")}" w:sz="{edge_data.get("sz", 4)}" w:space="0" w:color="{edge_data.get("color", "CBD5E1")}"/>')
            tcBorders.append(element)
    tcPr.append(tcBorders)

def create_document():
    doc = Document()

    # 1. Page Margins (1 inch = 1440 dxa)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # 2. Base Style
    normal_style = doc.styles['Normal']
    normal_style.font.name = '맑은 고딕'
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = RGBColor(0x33, 0x41, 0x55) # Slate 700

    # Read Markdown
    md_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'SOLUTION_OVERVIEW.md')
    with open(md_path, 'r', encoding='utf-8') as f:
        md_text = f.read()

    # 3. Document Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(8)
    run_title = p_title.add_run("차세대 NFC 정품 인증 솔루션 소개서")
    run_title.font.name = '맑은 고딕'
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A) # Deep Blue

    # Subtitle Callout Box
    table_sub = doc.add_table(rows=1, cols=1)
    table_sub.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_sub.autofit = False
    table_sub.columns[0].width = Inches(6.5)
    cell_sub = table_sub.cell(0, 0)
    set_cell_background(cell_sub, 'F1F5F9')
    set_cell_margins(cell_sub, top=140, bottom=140, left=180, right=180)
    set_cell_border(cell_sub, left=dict(sz=24, val='single', color='2563EB'))

    p_sub = cell_sub.paragraphs[0]
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(4)
    run_sub1 = p_sub.add_run('"스마트폰 탭 한 번으로 증명되는 100% 정품의 가치"\n')
    run_sub1.font.name = '맑은 고딕'
    run_sub1.font.size = Pt(11)
    run_sub1.font.bold = True
    run_sub1.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)

    run_sub2 = p_sub.add_run('별도의 앱 설치 없이, 스마트폰을 가져다 대는 것만으로 위조가 불가능한 정품 인증과 브랜드 독점 경험을 제공합니다.')
    run_sub2.font.name = '맑은 고딕'
    run_sub2.font.size = Pt(10)
    run_sub2.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # 4. Section 1: 솔루션 개요
    h1 = doc.add_heading(level=1)
    h1.paragraph_format.space_before = Pt(16)
    h1.paragraph_format.space_after = Pt(8)
    r = h1.add_run("1. 솔루션 개요 (Executive Summary)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p1 = doc.add_paragraph()
    p1.paragraph_format.line_spacing = 1.3
    p1.paragraph_format.space_after = Pt(8)
    r = p1.add_run("전 세계적인 위조품 시장의 급성장과 교묘해진 가품 유통으로 인해, 브랜드와 팬덤(소비자) 모두 심각한 신뢰 위협을 겪고 있습니다. 기존의 홀로그램 스티커나 QR코드는 스마트폰 카메라로 사진을 찍거나 인쇄하는 것만으로 손쉽게 복제되어 근본적인 해결책이 되지 못했습니다.")
    r.font.name = '맑은 고딕'

    p2 = doc.add_paragraph()
    p2.paragraph_format.line_spacing = 1.3
    p2.paragraph_format.space_after = Pt(12)
    r = p2.add_run("본 ")
    r.font.name = '맑은 고딕'
    r_bold = p2.add_run("다이내믹 NFC 정품 인증 솔루션")
    r_bold.font.name = '맑은 고딕'
    r_bold.font.bold = True
    r_bold.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)
    r2 = p2.add_run("은 금융권 OTP 및 스마트카드 보안 규격(RFC 4226 HOTP)을 물리 제품에 적용한 차세대 솔루션입니다. 제품에 내장된 스마트 태그는 ")
    r2.font.name = '맑은 고딕'
    r_bold2 = p2.add_run("스마트폰과 접촉할 때마다 매번 다른 일회용 암호화 토큰을 생성")
    r_bold2.font.name = '맑은 고딕'
    r_bold2.font.bold = True
    r3 = p2.add_run("하므로, 링크를 복사하거나 카드를 복제해도 가품을 절대 만들 수 없습니다.")
    r3.font.name = '맑은 고딕'

    # Flowchart visual box
    tbl_flow = doc.add_table(rows=1, cols=4)
    tbl_flow.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_flow.columns[0].width = Inches(1.6)
    tbl_flow.columns[1].width = Inches(1.6)
    tbl_flow.columns[2].width = Inches(1.6)
    tbl_flow.columns[3].width = Inches(1.6)

    flow_steps = [
        ("Step 1", "📱 스마트폰 접촉", "별도 앱 설치 불필요\n1초 즉각 반응"),
        ("Step 2", "⚡ 다이내믹 코드", "접촉할 때마다 변경\n일회용 보안 OTP"),
        ("Step 3", "☁️ 클라우드 검증", "0.1초 초고속 확인\n복제/재전송 즉시 차단"),
        ("Step 4", "✨ 정품 인증 완료", "배우/시리얼/인증횟수\nVIP 혜택 연결")
    ]

    for i, (step_tag, title, desc) in enumerate(flow_steps):
        cell = tbl_flow.cell(0, i)
        set_cell_background(cell, 'F8FAFC')
        set_cell_margins(cell, top=120, bottom=120, left=100, right=100)
        set_cell_border(cell,
            top=dict(sz=6, val='single', color='E2E8F0'),
            bottom=dict(sz=6, val='single', color='E2E8F0'),
            left=dict(sz=6, val='single', color='E2E8F0'),
            right=dict(sz=6, val='single', color='E2E8F0')
        )
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2)

        r_tag = p.add_run(step_tag + "\n")
        r_tag.font.name = '맑은 고딕'
        r_tag.font.size = Pt(8.5)
        r_tag.font.bold = True
        r_tag.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

        r_t = p.add_run(title + "\n")
        r_t.font.name = '맑은 고딕'
        r_t.font.size = Pt(10)
        r_t.font.bold = True
        r_t.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

        r_d = p.add_run(desc)
        r_d.font.name = '맑은 고딕'
        r_d.font.size = Pt(8.5)
        r_d.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    doc.add_paragraph().paragraph_format.space_after = Pt(14)

    # 5. Section 2: 기존 인증 방식과의 차이점
    h2 = doc.add_heading(level=1)
    h2.paragraph_format.space_before = Pt(16)
    h2.paragraph_format.space_after = Pt(8)
    r = h2.add_run("2. 기존 인증 방식과의 차이점 (Why Dynamic NFC?)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    tbl_comp = doc.add_table(rows=6, cols=4)
    tbl_comp.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_comp.columns[0].width = Inches(1.4)
    tbl_comp.columns[1].width = Inches(1.7)
    tbl_comp.columns[2].width = Inches(1.6)
    tbl_comp.columns[3].width = Inches(1.8)

    headers = ["비교 항목", "기존 QR코드 / 바코드", "기존 홀로그램 스티커", "본 NFC 정품 인증 솔루션"]
    for c_idx, h_text in enumerate(headers):
        cell = tbl_comp.cell(0, c_idx)
        set_cell_background(cell, '1E3A8A' if c_idx == 3 else '334155')
        set_cell_margins(cell, top=140, bottom=140, left=120, right=120)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(h_text)
        run.font.name = '맑은 고딕'
        run.font.size = Pt(9.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    comp_data = [
        ("복제 방지 능력", "취약 (사진 촬영 및 인쇄 복제 가능)", "보통 (정밀 인쇄로 유사 위조 가능)", "완벽 방어\n(매 탭마다 암호 변경, 복제 원천 불가)"),
        ("사용자 접근성", "카메라 켜기 → 초점 맞추기 → 인식", "육안 확인 (일반인 구별 어려움)", "스마트폰을 제품에 1초 접촉\n(Zero-Click 접근)"),
        ("앱 설치 필요 여부", "간혹 전용 리더기/앱 요구", "불필요", "불필요\n(원클릭 웹 접속 & 전용 앱 전환 지원)"),
        ("재전송(복사) 공격", "링크만 알면 누구나 동일 화면 조회", "해당 없음", "이미 사용된 이전 코드는\n즉시 차단 및 복제 경고"),
        ("디지털 데이터 연계", "정적 웹페이지 연결에 그침", "디지털 연동 불가", "고유 시리얼, 인증 횟수,\n실시간 통계 데이터 연동")
    ]

    for r_idx, row_values in enumerate(comp_data, start=1):
        bg_color = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
        for c_idx, val in enumerate(row_values):
            cell = tbl_comp.cell(r_idx, c_idx)
            # highlight NFC column
            if c_idx == 3:
                set_cell_background(cell, 'EFF6FF' if r_idx % 2 == 1 else 'DBEAFE')
            else:
                set_cell_background(cell, bg_color)

            set_cell_margins(cell, top=100, bottom=100, left=100, right=100)
            set_cell_border(cell,
                top=dict(sz=4, val='single', color='E2E8F0'),
                bottom=dict(sz=4, val='single', color='E2E8F0'),
                left=dict(sz=4, val='single', color='E2E8F0'),
                right=dict(sz=4, val='single', color='E2E8F0')
            )
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(val)
            run.font.name = '맑은 고딕'
            run.font.size = Pt(9)
            if c_idx == 0:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
            elif c_idx == 3:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
            else:
                run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_paragraph().paragraph_format.space_after = Pt(14)

    # 6. Section 3: 기본 인증 흐름
    h3 = doc.add_heading(level=1)
    h3.paragraph_format.space_before = Pt(16)
    h3.paragraph_format.space_after = Pt(8)
    r = h3.add_run("3. 기본 인증 흐름 (Authentication Flow)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p_flow_intro = doc.add_paragraph()
    p_flow_intro.paragraph_format.line_spacing = 1.3
    p_flow_intro.paragraph_format.space_after = Pt(8)
    r = p_flow_intro.add_run("소비자는 복잡한 절차 없이 일상적인 스마트폰 사용 경험 그대로 정품을 확인합니다.")
    r.font.name = '맑은 고딕'

    # Sequence Flow Box / Table
    tbl_seq = doc.add_table(rows=5, cols=3)
    tbl_seq.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_seq.columns[0].width = Inches(1.1)
    tbl_seq.columns[1].width = Inches(2.2)
    tbl_seq.columns[2].width = Inches(3.2)

    seq_headers = ["단계", "동작 및 진행 과정", "보안 및 시스템 동작 (0.1초 처리)"]
    for c_idx, h_text in enumerate(seq_headers):
        cell = tbl_seq.cell(0, c_idx)
        set_cell_background(cell, '1E293B')
        set_cell_margins(cell, top=120, bottom=120, left=100, right=100)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(h_text)
        run.font.name = '맑은 고딕'
        run.font.size = Pt(9.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    seq_data = [
        ("Step 1", "스마트폰 가볍게 탭 (Tap)\n제품 라벨/포토카드에 1초 접촉", "스마트카드/NFC 칩 내부에서 자체 카운터를 증가시키며 일회용 보안 토큰(OTP)을 즉시 생성"),
        ("Step 2", "원클릭 브라우저 자동 실행\n앱 설치 없이 화면 즉시 전환", "스마트폰 기본 인터넷 브라우저가 다이내믹 암호화 토큰이 포함된 보안 URL로 자동 접속"),
        ("Step 3", "클라우드 즉각 검증 (0.1초)\n대기 시간 없이 즉시 결과 판별", "서버가 DB의 보안 마스터키와 대조하여 유효성 및 카운터 증가 여부를 0.1초 만에 원자적 검증"),
        ("Step 4", "프리미엄 인증 결과 확인\n정품 승인 또는 복제 의심 경고", "정품 시리얼, 배우명, 인증 횟수 출력\n(만약 링크를 재사용하거나 가품을 복제한 경우 즉시 '복제 의심 경고' 차단)")
    ]

    for r_idx, row_values in enumerate(seq_data, start=1):
        bg_color = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
        for c_idx, val in enumerate(row_values):
            cell = tbl_seq.cell(r_idx, c_idx)
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=100, right=100)
            set_cell_border(cell,
                top=dict(sz=4, val='single', color='E2E8F0'),
                bottom=dict(sz=4, val='single', color='E2E8F0'),
                left=dict(sz=4, val='single', color='E2E8F0'),
                right=dict(sz=4, val='single', color='E2E8F0')
            )
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(val)
            run.font.name = '맑은 고딕'
            run.font.size = Pt(9)
            if c_idx == 0:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)
            elif c_idx == 1:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
            else:
                run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_paragraph().paragraph_format.space_after = Pt(14)

    # 7. Section 4: 사용자 입장에서의 장점
    h4 = doc.add_heading(level=1)
    h4.paragraph_format.space_before = Pt(16)
    h4.paragraph_format.space_after = Pt(8)
    r = h4.add_run("4. 사용자(소비자 / 팬덤) 입장에서의 장점")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    user_benefits = [
        ("1) 진입 장벽 없는 제로-프릭션 (Zero-Friction)", [
            ("앱 설치 No, 회원가입 No", "App Store나 Google Play에서 낯선 앱을 설치할 필요가 없습니다."),
            ("남녀노소 전 세계 누구나 동일한 사용성", "스마트폰을 대기만 하면 1초 만에 구동되어 직관적입니다.")
        ]),
        ('2) "내 물건은 100% 진짜"라는 절대적 신뢰', [
            ("가품에 대한 불안감 즉시 해소", "고가의 명품, 한정판 굿즈, 연예인 친필 사인 등을 구매했을 때 느끼는 가품 불안을 1초 만에 해소합니다."),
            ("중고 거래(리셀) 시 즉석 정품 보증", "스마트폰을 탭하여 상대방 눈앞에서 공식 정품임을 명확하게 입증할 수 있습니다.")
        ]),
        ("3) 소장 가치와 프리미엄 경험 극대화", [
            ("살아있는 디지털 인증서", "단순한 플라스틱이나 종이 카드가 아닌, 스마트폰과 상호작용하는 디지털 소장품으로 변모합니다."),
            ("세상에 단 하나뿐인 나만의 제품", "제품 고유 넘버링(예: #001 한정판), 배우/아티스트의 이름, 첫 스캔 날짜가 영구 기록되어 소장 가치를 극대화합니다.")
        ]),
        ("4) 시크릿 VIP 혜택으로의 연결", [
            ("구매자 전용 프리미엄 콘텐츠", "정품 인증 완료 시 정품 소유자만 열람할 수 있는 미공개 영상, 시크릿 화보, 팬클럽 단독 혜택, 보증서 연장 서비스로 매끄럽게 연결됩니다.")
        ])
    ]

    for title, items in user_benefits:
        p_sub = doc.add_paragraph()
        p_sub.paragraph_format.space_before = Pt(8)
        p_sub.paragraph_format.space_after = Pt(4)
        r = p_sub.add_run(title)
        r.font.name = '맑은 고딕'
        r.font.size = Pt(11.5)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

        for label, desc in items:
            p_item = doc.add_paragraph(style='List Bullet')
            p_item.paragraph_format.space_before = Pt(0)
            p_item.paragraph_format.space_after = Pt(3)
            p_item.paragraph_format.line_spacing = 1.2
            r_bold = p_item.add_run(label + ": ")
            r_bold.font.name = '맑은 고딕'
            r_bold.font.bold = True
            r_bold.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)
            r_desc = p_item.add_run(desc)
            r_desc.font.name = '맑은 고딕'
            r_desc.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(14)

    # 8. Section 5: 도입 기업 입장에서의 장점
    h5 = doc.add_heading(level=1)
    h5.paragraph_format.space_before = Pt(16)
    h5.paragraph_format.space_after = Pt(8)
    r = h5.add_run("5. 도입 기업(브랜드 / 기획사) 입장에서의 장점")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    biz_benefits = [
        ("1) 가품 유통 및 브랜드 훼손 100% 원천 방어",
         "수학적/암호학적으로 검증된 표준 알고리즘(RFC 4226)을 사용하여, 복제품 제작 비용이 정품 제작 비용을 초과하게 만들어 가품 업자의 모조 시도를 원천 차단합니다. 브랜드의 오랜 명성과 프리미엄 이미지를 지켜냅니다."),
        ("2) 오프라인 구매자를 온라인 충성 고객(D2C)으로 전환",
         "오프라인 팝업스토어, 리테일 샵, 앨범 판매처에서 구매한 고객은 대개 익명으로 남습니다. 소비자가 정품 인증을 위해 스마트폰을 탭하는 순간, 브랜드의 공식 온라인몰 회원가입, 멤버십 연동, 프로모션 참여로 직접 유입시키는 강력한 D2C 마케팅 채널이 열립니다."),
        ("3) 글로벌 실시간 유통 및 이상 징후 감지 (Data Intelligence)",
         "어느 국가, 어느 도시에서 제품이 언제 스캔되었는지 대시보드를 통해 실시간으로 파악할 수 있습니다. 특정 지역에서 동일한 카드의 비정상적인 스캔이 급증할 경우 가품 유통 거점을 조기에 탐지하고 법적 조치를 취할 수 있는 데이터 증거를 확보합니다."),
        ("4) 기존 제품 공정 및 패키징에 손쉬운 적용",
         "얇은 스티커(Inlay) 태그, 에폭시 태그, PVC 스마트카드 등 다양한 폼팩터를 지원합니다. 기존 의류의 케어라벨, 신발 밑창, 화장품 단상자, 굿즈 포토카드 등의 기존 제조 공정을 크게 바꾸지 않고도 간편하게 내장할 수 있습니다."),
        ("5) 저비용·고확장성 서버리스(Cloud) 인프라",
         "수십만 명이 동시에 접속하는 한정판 출시일에도 서버 다운 없이 즉각 대응하는 글로벌 Edge 네트워크 구조를 갖추고 있습니다. 불필요한 고정 서버 비용 없이, 사용량에 맞춘 합리적이고 효율적인 운영이 가능합니다.")
    ]

    for title, desc in biz_benefits:
        p_sub = doc.add_paragraph()
        p_sub.paragraph_format.space_before = Pt(8)
        p_sub.paragraph_format.space_after = Pt(2)
        r = p_sub.add_run(title)
        r.font.name = '맑은 고딕'
        r.font.size = Pt(11.5)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

        p_desc = doc.add_paragraph()
        p_desc.paragraph_format.space_before = Pt(0)
        p_desc.paragraph_format.space_after = Pt(6)
        p_desc.paragraph_format.line_spacing = 1.3
        r_desc = p_desc.add_run(desc)
        r_desc.font.name = '맑은 고딕'
        r_desc.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(14)

    # 9. Section 6: 주요 적용 분야
    h6 = doc.add_heading(level=1)
    h6.paragraph_format.space_before = Pt(16)
    h6.paragraph_format.space_after = Pt(8)
    r = h6.add_run("6. 주요 적용 분야 (Use Cases)")
    r.font.name = '맑은 고딕'
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    tbl_use = doc.add_table(rows=2, cols=2)
    tbl_use.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_use.columns[0].width = Inches(3.25)
    tbl_use.columns[1].width = Inches(3.25)

    use_cases = [
        ("엔터테인먼트 & K-컬처", "• 한정판 포토카드 & 앨범\n• 콘서트 공식 응원봉 및 굿즈\n• 아티스트 친필 사인 한정판\n* 가품 거래 차단 및 미공개 음성/영상 독점 제공"),
        ("럭셔리 패션 & 스트릿웨어", "• 명품 가방, 신발, 고가 의류 라벨\n• 한정판 스니커즈 변조 방지 씰\n• 브랜드 VIP 멤버십 연계 태그\n* 리셀 거래 시 현장 즉석 정품 판별 도구"),
        ("아트 & 프리미엄 컬렉터블", "• 미술품/판화 디지털 보증서\n• 한정판 피규어, 완구, 트레이딩 카드\n• 럭셔리 시계 및 보석류 품질 증명\n* 영구적이고 안전한 소유권 증명"),
        ("프리미엄 뷰티 & 주류 (F&B)", "• 프리미엄 기초 화장품 밀봉 패키지\n• 고급 와인 및 싱글몰트 위스키\n• 건강기능식품 개봉 방지 라벨\n* 병마개 개봉 시 파손 씰로 내용물 바꿔치기 방지")
    ]

    for idx, (uc_title, uc_desc) in enumerate(use_cases):
        r_idx = idx // 2
        c_idx = idx % 2
        cell = tbl_use.cell(r_idx, c_idx)
        set_cell_background(cell, 'F8FAFC')
        set_cell_margins(cell, top=140, bottom=140, left=140, right=140)
        set_cell_border(cell,
            top=dict(sz=6, val='single', color='CBD5E1'),
            bottom=dict(sz=6, val='single', color='CBD5E1'),
            left=dict(sz=6, val='single', color='CBD5E1'),
            right=dict(sz=6, val='single', color='CBD5E1')
        )
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(4)
        run_t = p.add_run(uc_title + "\n")
        run_t.font.name = '맑은 고딕'
        run_t.font.size = Pt(11)
        run_t.font.bold = True
        run_t.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

        run_d = p.add_run(uc_desc)
        run_d.font.name = '맑은 고딕'
        run_d.font.size = Pt(9)
        run_d.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_paragraph().paragraph_format.space_after = Pt(20)

    # Output path
    docx_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'SOLUTION_OVERVIEW.docx')
    doc.save(docx_path)
    print(f"[OK] Successfully created: {os.path.abspath(docx_path)}")

if __name__ == '__main__':
    create_document()
