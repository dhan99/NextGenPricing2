#!/usr/bin/env python3
"""Generate docs/DealPad_Executive_Summary.pdf — single-page TL;DR
for stakeholders who want the pitch without the deck.

Layout (US Letter portrait):
  Header band      DealPad title + tagline
  Lead             1-line problem + 1-line opportunity
  Phase strip      5 phases as a horizontal timeline
  Differentiators  3 columns (Tax-first / AI-native / Q2C-integrated)
  ROI + asks       2-column footer summary
  Live demo URL + contact

Re-run from repo root:
    python3 scripts/audit/generate_executive_summary_pdf.py
"""
from __future__ import annotations

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth

OUT_PATH = "docs/DealPad_Executive_Summary.pdf"

# ---- Brand palette ----
ARM_AMBER = HexColor("#DA720F")
ARM_OLIVE = HexColor("#949300")
ARM_DARK = HexColor("#1F2A37")
ARM_MUTED = HexColor("#6B7A90")
ARM_LIGHT_AMBER = HexColor("#FFF1DA")
ARM_LIGHT_OLIVE = HexColor("#F1F1DC")
ARM_BG = HexColor("#FAFAF7")
PHASE_GREEN = HexColor("#6B9E4F")
PHASE_BLUE = HexColor("#3B6EA8")
PHASE_PURPLE = HexColor("#7B4F9E")
PHASE_TEAL = HexColor("#4F9E9C")

PAGE_W, PAGE_H = letter   # 612 × 792 pt
MARGIN = 0.5 * inch


def wrap_text(c, text, max_w, font_name, font_size):
    """Greedy word wrap. Returns list of lines."""
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for w in words[1:]:
        candidate = current + " " + w
        if stringWidth(candidate, font_name, font_size) <= max_w:
            current = candidate
        else:
            lines.append(current)
            current = w
    lines.append(current)
    return lines


def draw_text(c, x, y, text, font="Helvetica", size=10, color=ARM_DARK,
              bold=False):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else font, size)
    c.drawString(x, y, text)


def draw_wrapped(c, x, y, w, text, font="Helvetica", size=10, color=ARM_DARK,
                 bold=False, leading=None):
    font_name = "Helvetica-Bold" if bold else font
    leading = leading or (size * 1.25)
    lines = wrap_text(c, text, w, font_name, size)
    c.setFillColor(color)
    c.setFont(font_name, size)
    for i, line in enumerate(lines):
        c.drawString(x, y - i * leading, line)
    return y - len(lines) * leading  # next-y after the block


def draw_filled_rect(c, x, y, w, h, fill_color, stroke_color=None):
    c.setFillColor(fill_color)
    if stroke_color is not None:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(0.5)
        c.rect(x, y, w, h, fill=1, stroke=1)
    else:
        c.rect(x, y, w, h, fill=1, stroke=0)


def main() -> None:
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    c = canvas.Canvas(OUT_PATH, pagesize=letter)
    c.setTitle("DealPad — Pricing & Scoping 2.0 — Executive Summary")
    c.setAuthor("DealPad")
    c.setSubject("5-phase delivery plan for Armanino DealPad team")

    # Background
    draw_filled_rect(c, 0, 0, PAGE_W, PAGE_H, ARM_BG)

    # ---- Header band ----
    band_h = 0.85 * inch
    draw_filled_rect(c, 0, PAGE_H - band_h, PAGE_W, band_h, ARM_AMBER)
    # Olive accent line
    draw_filled_rect(c, 0, PAGE_H - band_h - 3, PAGE_W, 3, ARM_OLIVE)

    draw_text(c, MARGIN, PAGE_H - 0.32 * inch,
              "DealPad", font="Helvetica-Bold", size=22, color=white)
    draw_text(c, MARGIN, PAGE_H - 0.55 * inch,
              "Pricing & Scoping 2.0 — Executive Summary",
              font="Helvetica", size=13, color=white)
    # Right-align the tagline + sub-line
    tag = "Tax-first  |  AI-native  |  Q2C-integrated"
    tw = stringWidth(tag, "Helvetica-Bold", 10)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(PAGE_W - MARGIN - tw, PAGE_H - 0.32 * inch, tag)
    sub = "Stakeholder briefing — Armanino"
    sw = stringWidth(sub, "Helvetica", 9)
    c.setFont("Helvetica", 9)
    c.drawString(PAGE_W - MARGIN - sw, PAGE_H - 0.55 * inch, sub)

    # ---- Lead paragraph ----
    cur_y = PAGE_H - band_h - 0.30 * inch
    draw_text(c, MARGIN, cur_y, "The opportunity",
              font="Helvetica-Bold", size=12, color=ARM_AMBER)
    cur_y -= 0.18 * inch
    cur_y = draw_wrapped(c, MARGIN, cur_y, PAGE_W - 2 * MARGIN,
        "Replace 200+ Excel pricing workbooks with one governed AI-native platform. "
        "Tax engagements modeled across 4-entity tabs. Calc parity to your workbooks at the cent. "
        "AI starts at heuristic in Phase 1 and graduates to real LLMs (Phase 2), vector intelligence "
        "(Phase 3), and trained ML on your historical data (Phase 5). Intapp Intake + Screening "
        "land in Phase 4 — DealPad remains the pricing engine; Intapp stays the conflicts/intake "
        "source-of-truth.",
        size=10, color=ARM_DARK, leading=12.5)

    # ---- Phase strip ----
    cur_y -= 0.18 * inch
    draw_text(c, MARGIN, cur_y, "5 phases × 8 weeks  =  40 weeks  (milestone-gated GO at each handoff)",
              font="Helvetica-Bold", size=11, color=ARM_OLIVE)
    cur_y -= 0.10 * inch

    phases = [
        ("PHASE 1", "Excel Parity", "+ Tax Foundation",
         "Calc parity • Tax scope (1040/1120/1065/1120S) • Multi-entity tabs • Heuristic AI",
         PHASE_GREEN),
        ("PHASE 2", "Pricing Sophistication", "+ Real LLMs",
         "All 6 fee models • Batch renewals (Tax-season) • Real LLM AI • Telemetry day-1",
         ARM_AMBER),
        ("PHASE 3", "Intelligence Engine", "Vectors • Voice • Watchdogs",
         "pgvector k-NN <500ms • Voice→scope • Scope-creep detector • Workday push",
         PHASE_BLUE),
        ("PHASE 4", "Intapp + Client Maturity", "Intake • Screening • Portal",
         "Intapp Intake AI extraction • Screening sync • Magic-link portal • Real-time collab",
         PHASE_PURPLE),
        ("PHASE 5", "Production + Trained ML", "Tax-trained models",
         "Tax effort estimator <10% MAPE • LP margin solver • Slack/Teams • Multi-region",
         PHASE_TEAL),
    ]
    strip_top = cur_y - 0.05 * inch
    strip_h = 1.45 * inch
    strip_w = (PAGE_W - 2 * MARGIN - 4 * 0.05 * inch) / 5  # 5 cards, 4 gaps

    for i, (label, head1, head2, body, color) in enumerate(phases):
        x = MARGIN + i * (strip_w + 0.05 * inch)
        # Card
        draw_filled_rect(c, x, strip_top - strip_h, strip_w, strip_h,
                         white, stroke_color=color)
        # Color header
        draw_filled_rect(c, x, strip_top - 0.32 * inch, strip_w, 0.32 * inch, color)
        # Phase label centered
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 9)
        lw = stringWidth(label, "Helvetica-Bold", 9)
        c.drawString(x + (strip_w - lw) / 2, strip_top - 0.21 * inch, label)
        # Headlines
        draw_wrapped(c, x + 5, strip_top - 0.5 * inch, strip_w - 10, head1,
                     size=9, color=color, bold=True, leading=11)
        draw_wrapped(c, x + 5, strip_top - 0.66 * inch, strip_w - 10, head2,
                     size=8, color=ARM_MUTED, bold=False, leading=9)
        # Body
        draw_wrapped(c, x + 5, strip_top - 0.85 * inch, strip_w - 10, body,
                     size=7.5, color=ARM_DARK, leading=10)

    cur_y = strip_top - strip_h - 0.20 * inch

    # ---- Differentiators (3 columns) ----
    col_w = (PAGE_W - 2 * MARGIN - 0.20 * inch) / 3
    diff_h = 1.10 * inch
    diff_top = cur_y
    cols = [
        ("Tax-first by design", ARM_AMBER, [
            "1040 / 1120 / 1065 / 1120S / Schedule K seeded P1",
            "Multi-entity worksheets (one deal, four entities)",
            "Tax PHB Standard Bundle = assembly engine demo",
            "Tax-renewal batch = 200+ deals in one job",
        ]),
        ("AI from day one", PHASE_BLUE, [
            "Heuristic Phase 1 → real LLMs Phase 2",
            "pgvector similarity Phase 3 (sub-500ms)",
            "Trained ML on your Tax history Phase 5",
            "AI cost telemetry from first LLM call",
        ]),
        ("Q2C-integrated", PHASE_GREEN, [
            "D365: bi-directional from Phase 1",
            "Workday: cost-center + project push Phase 3",
            "Intapp: Intake + Screening Phase 4",
            "Conga: engagement-letter delivery Phase 3",
        ]),
    ]
    for i, (title, color, items) in enumerate(cols):
        x = MARGIN + i * (col_w + 0.10 * inch)
        # Card
        draw_filled_rect(c, x, diff_top - diff_h, col_w, diff_h,
                         white, stroke_color=color)
        # Left color stripe
        draw_filled_rect(c, x, diff_top - diff_h, 0.10 * inch, diff_h, color)
        # Title
        draw_text(c, x + 0.20 * inch, diff_top - 0.18 * inch, title,
                  font="Helvetica-Bold", size=11, color=color)
        # Items
        item_y = diff_top - 0.36 * inch
        for it in items:
            c.setFillColor(color)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x + 0.20 * inch, item_y, "•")
            item_y = draw_wrapped(c, x + 0.32 * inch, item_y,
                                  col_w - 0.40 * inch, it,
                                  size=8, color=ARM_DARK, leading=10)
            item_y -= 0.04 * inch

    cur_y = diff_top - diff_h - 0.20 * inch

    # ---- Asks + Deliverables (2 columns) ----
    box_w = (PAGE_W - 2 * MARGIN - 0.15 * inch) / 2
    box_h = 1.55 * inch
    box_top = cur_y

    # Asks
    draw_filled_rect(c, MARGIN, box_top - box_h, box_w, box_h,
                     ARM_LIGHT_AMBER, stroke_color=ARM_AMBER)
    draw_text(c, MARGIN + 0.12 * inch, box_top - 0.20 * inch,
              "What we need from Armanino",
              font="Helvetica-Bold", size=11, color=ARM_AMBER)
    asks = [
        "10 representative Excel workbooks for calc parity",
        "Tax scope-catalog source data + PHB definition",
        "D365 sandbox access for opportunity-context auto-load",
        "PDL + PO part-time embed for parity acceptance",
        "Phase 2: Anthropic / OpenAI / Azure key access",
        "Phase 4: Intapp Intake + Screening API access",
        "Phase 5: Historical engagement data for ML training",
    ]
    item_y = box_top - 0.40 * inch
    for ask in asks:
        c.setFillColor(ARM_AMBER)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(MARGIN + 0.12 * inch, item_y, "•")
        item_y = draw_wrapped(c, MARGIN + 0.24 * inch, item_y,
                              box_w - 0.36 * inch, ask,
                              size=8.5, color=ARM_DARK, leading=10)
        item_y -= 0.03 * inch

    # Deliverables
    x_right = MARGIN + box_w + 0.15 * inch
    draw_filled_rect(c, x_right, box_top - box_h, box_w, box_h,
                     ARM_LIGHT_OLIVE, stroke_color=ARM_OLIVE)
    draw_text(c, x_right + 0.12 * inch, box_top - 0.20 * inch,
              "What you get",
              font="Helvetica-Bold", size=11, color=ARM_OLIVE)
    gets = [
        "Wk 4 — Shared dev URL with Tax catalog seeded",
        "Wk 8 — Calc parity sign-off; Phase 1 demo",
        "Wk 16 — Real LLMs powering risk + margin AI",
        "Wk 24 — Vector similarity + voice-to-scope live",
        "Wk 32 — Intapp Intake/Screening + client portal",
        "Wk 40 — Trained ML + Slack/Teams + production",
        "Always — open code, audit trail, no vendor lock-in",
    ]
    item_y = box_top - 0.40 * inch
    for g in gets:
        c.setFillColor(ARM_OLIVE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x_right + 0.12 * inch, item_y, "•")
        item_y = draw_wrapped(c, x_right + 0.24 * inch, item_y,
                              box_w - 0.36 * inch, g,
                              size=8.5, color=ARM_DARK, leading=10)
        item_y -= 0.03 * inch

    cur_y = box_top - box_h - 0.18 * inch

    # ---- Footer CTA ----
    cta_h = 0.40 * inch
    draw_filled_rect(c, MARGIN, cur_y - cta_h, PAGE_W - 2 * MARGIN, cta_h, ARM_AMBER)
    cta = ("Ask: 8-week Phase 1 GO. Calc parity proven. Tax foundation seeded. "
           "AI-native demo by Week 9.")
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    cta_w = stringWidth(cta, "Helvetica-Bold", 11)
    c.drawString(MARGIN + (PAGE_W - 2 * MARGIN - cta_w) / 2,
                 cur_y - cta_h + 0.13 * inch, cta)

    # ---- Live demo footer ----
    foot_y = MARGIN - 0.10 * inch
    draw_text(c, MARGIN, foot_y,
              "Live demo: https://dealpad-demo.onrender.com",
              font="Helvetica-Bold", size=9, color=ARM_OLIVE)
    contact = "Source + docs: github.com/dhan99/NextGenPricing2"
    c.setFillColor(ARM_MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(PAGE_W - MARGIN - stringWidth(contact, "Helvetica", 9),
                 foot_y, contact)

    c.showPage()
    c.save()
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
