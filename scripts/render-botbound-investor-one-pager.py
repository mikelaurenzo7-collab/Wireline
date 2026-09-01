from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "brand-work" / "launch-2026-09" / "exports" / "investor"
PDF_PATH = OUT / "botbound-investor-one-pager-2026-09.pdf"

FONT_DIR = ROOT / "brand-work" / "fonts"
SIGNAL = ROOT / "brand-work" / "launch-2026-09" / "sources" / "botbound-the-signal-ooh-wide.png"

OBSIDIAN = HexColor("#0A0A0E")
BLACK_VIOLET = HexColor("#050508")
VIOLET = HexColor("#A78BFA")
RECEIVER = HexColor("#8B5CF6")
LILAC = HexColor("#C4B5FD")
WHITE = HexColor("#F5F4F8")
PLATINUM = HexColor("#C7CCD6")
SMOKE = HexColor("#B6B1C6")
PANEL = HexColor("#15121F")
PANEL_2 = HexColor("#1D172C")


def register_fonts():
    pdfmetrics.registerFont(TTFont("Inter", str(FONT_DIR / "Inter-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("InterSemi", str(FONT_DIR / "Inter-SemiBold.ttf")))
    pdfmetrics.registerFont(TTFont("InterBold", str(FONT_DIR / "Inter-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("InterExtra", str(FONT_DIR / "Inter-ExtraBold.ttf")))
    pdfmetrics.registerFont(TTFont("InterTightExtra", str(FONT_DIR / "InterTight-ExtraBold.ttf")))
    pdfmetrics.registerFont(TTFont("PlexBold", str(FONT_DIR / "IBMPlexMono-Bold.ttf")))


def text(c, value, x, y, font="Inter", size=9, color=WHITE):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x, y, value)


def right_text(c, value, x, y, font="Inter", size=9, color=WHITE):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawRightString(x, y, value)


def wrap(c, value, x, y, width, font="Inter", size=8.4, leading=11, color=PLATINUM, max_lines=6):
    words = value.split()
    lines = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if c.stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    for idx, line_value in enumerate(lines[:max_lines]):
        text(c, line_value, x, y - idx * leading, font, size, color)
    return y - min(len(lines), max_lines) * leading


def eyebrow(c, value, x, y):
    text(c, value.upper(), x, y, "PlexBold", 7.4, LILAC)


def panel(c, x, y, w, h, title, body, number=None):
    c.setFillColor(PANEL)
    c.setStrokeColor(HexColor("#3E3554"))
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, 10, fill=1, stroke=1)
    if number:
        text(c, number, x + 13, y + h - 19, "PlexBold", 7.2, VIOLET)
        title_y = y + h - 36
    else:
        title_y = y + h - 23
    text(c, title, x + 13, title_y, "InterBold", 10.5, WHITE)
    wrap(c, body, x + 13, title_y - 16, w - 26, "Inter", 7.6, 10.3, SMOKE, 5)


def render():
    register_fonts()
    OUT.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_PATH), pagesize=letter)
    page_w, page_h = letter
    c.setTitle("BotBound Investor One-Pager — September 2026")
    c.setAuthor("BotBound")
    c.setSubject("Investor and design-partner overview")

    c.setFillColor(OBSIDIAN)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    # Editorial signal plate, clipped into the hero.
    hero_h = 244
    c.saveState()
    clip = c.beginPath()
    clip.rect(0, page_h - hero_h, page_w, hero_h)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(str(SIGNAL), 0, page_h - 344, width=612, height=344, mask="auto")
    c.setFillAlpha(0.74)
    c.setFillColor(BLACK_VIOLET)
    c.rect(0, page_h - hero_h, 390, hero_h, fill=1, stroke=0)
    c.setFillAlpha(0.26)
    c.rect(390, page_h - hero_h, 222, hero_h, fill=1, stroke=0)
    c.restoreState()

    # Wordmark and investor context.
    text(c, "Bot", 32, 754, "InterExtra", 19, WHITE)
    text(c, "Bound", 64, 754, "InterExtra", 19, VIOLET)
    right_text(c, "INVESTOR + DESIGN-PARTNER BRIEF", 580, 758, "PlexBold", 6.6, LILAC)
    eyebrow(c, "The second ring", 33, 714)
    text(c, "PUT YOUR BOT", 31, 663, "InterTightExtra", 34, WHITE)
    text(c, "ON THE LINE.", 31, 627, "InterTightExtra", 34, VIOLET)
    wrap(
        c,
        "The operating layer for one trained Bot across calls, texts, and email—so the work keeps moving when the human cannot stop to answer.",
        33,
        595,
        360,
        "InterSemi",
        9.1,
        12.3,
        WHITE,
        3,
    )
    text(c, "BOTBOUND.ME", 33, 558, "PlexBold", 7.4, WHITE)

    # Thesis strip.
    strip_y = 506
    c.setFillColor(PANEL_2)
    c.roundRect(28, strip_y, 556, 34, 8, fill=1, stroke=0)
    text(c, "THE THESIS", 41, strip_y + 13, "PlexBold", 7.0, LILAC)
    text(c, "Every unanswered moment is a workflow waiting for an operator.", 122, strip_y + 12, "InterBold", 9.2, WHITE)

    gap = 9
    col_w = (556 - gap * 2) / 3
    row_y = 392
    row_h = 101
    panel(
        c,
        28,
        row_y,
        col_w,
        row_h,
        "A costly interruption",
        "Owner-operators are forced to choose between the customer in front of them and the customer trying to reach them.",
        "01 / PROBLEM",
    )
    panel(
        c,
        28 + col_w + gap,
        row_y,
        col_w,
        row_h,
        "One Bot, trained once",
        "Give it the job, knowledge, tone, rules, tools, approvals, and handoffs. Then launch it across the channels the work already uses.",
        "02 / PRODUCT",
    )
    panel(
        c,
        28 + (col_w + gap) * 2,
        row_y,
        col_w,
        row_h,
        "Review makes it better",
        "Calls become outcomes. Text and email keep the next step moving. Humans review, correct, approve, and improve the playbook.",
        "03 / LOOP",
    )

    # Product architecture—simple enough to scan in one breath.
    eyebrow(c, "How the line works", 31, 365)
    flow_y = 319
    flow_labels = [
        ("CUSTOMER", "calls · texts · email"),
        ("CHANNEL RAILS", "Twilio voice + SMS · email"),
        ("BOTBOUND", "policy · memory · actions"),
        ("OPENAI", "Realtime voice · intelligence"),
    ]
    flow_w = 127
    flow_gap = 11
    for idx, (title, detail) in enumerate(flow_labels):
        x = 29 + idx * (flow_w + flow_gap)
        c.setFillColor(PANEL if idx != 2 else HexColor("#2B1C55"))
        c.setStrokeColor(RECEIVER if idx == 2 else HexColor("#403852"))
        c.roundRect(x, flow_y, flow_w, 35, 7, fill=1, stroke=1)
        text(c, title, x + 10, flow_y + 21, "PlexBold", 7.0, WHITE)
        text(c, detail, x + 10, flow_y + 9, "Inter", 5.9, PLATINUM)
        if idx < 3:
            text(c, "→", x + flow_w + 2, flow_y + 13, "InterBold", 8, VIOLET)

    # Product proof pillars without fabricated traction.
    proof_y = 217
    c.setFillColor(BLACK_VIOLET)
    c.setStrokeColor(HexColor("#3E3554"))
    c.roundRect(28, proof_y, 556, 83, 10, fill=1, stroke=1)
    eyebrow(c, "What exists now", 42, proof_y + 61)
    proof = [
        ("10", "built-in OpenAI voices"),
        ("1", "selected voice per runtime session"),
        ("3", "connected customer channels"),
        ("4", "Build → Train → Launch → Improve"),
    ]
    proof_x = [43, 176, 327, 434]
    proof_sizes = [18, 18, 18, 18]
    for idx, (number, label) in enumerate(proof):
        x = proof_x[idx]
        text(c, number, x, proof_y + 31, "InterTightExtra", proof_sizes[idx], VIOLET)
        wrap(c, label, x + 25, proof_y + 36, 97 if idx != 3 else 116, "InterSemi", 6.7, 8.4, WHITE, 3)

    # Market motion and business model.
    panel(
        c,
        28,
        100,
        270,
        97,
        "The wedge",
        "Appointment-driven and service businesses where both hands are already doing the work: home services, automotive, salons, clinics, property services, hospitality, and local operators.",
        "GO-TO-MARKET",
    )
    panel(
        c,
        307,
        100,
        277,
        97,
        "Build free. Go live from $19/month.",
        "A low-friction builder becomes a paid operating relationship when a Bot goes live. Additional Bots expand with the business.",
        "BUSINESS MODEL",
    )

    # Call to conversation.
    c.setFillColor(VIOLET)
    c.roundRect(28, 49, 556, 37, 9, fill=1, stroke=0)
    text(c, "SEEKING", 42, 64, "PlexBold", 6.8, BLACK_VIOLET)
    text(c, "Investor and design-partner conversations for a controlled launch.", 102, 62, "InterBold", 9.2, BLACK_VIOLET)
    right_text(c, "support@botbound.me", 572, 63, "InterSemi", 7.6, BLACK_VIOLET)

    text(c, "Current-worktree product and pricing snapshot · 2026-09-01 · No customer, traction, or performance claims.", 29, 27, "Inter", 5.7, SMOKE)
    right_text(c, "PUT YOUR BOT ON THE LINE", 583, 27, "PlexBold", 5.8, LILAC)

    c.showPage()
    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    render()
