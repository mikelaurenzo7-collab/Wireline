import argparse
from pathlib import Path

from reportlab import rl_config
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    ROOT
    / "brand-work"
    / "launch-2026-09-outbound"
    / "exports"
    / "investor"
    / "botbound-outbound-investor-one-pager-2026-09.pdf"
)

# ReportLab otherwise embeds wall-clock metadata and a random document ID.
# Invariant mode makes the same approved inputs produce identical PDF bytes.
rl_config.invariant = 1

INK = HexColor("#0A0A0E")
VIOLET = HexColor("#8B6EF2")
VIOLET_LIGHT = HexColor("#C4B5FD")
PLATINUM = HexColor("#F8F7FC")
MIST = HexColor("#C9C5D6")
PAPER = HexColor("#F6F3EC")
BODY = HexColor("#36323E")
MUTED = HexColor("#5F5966")
RULE = HexColor("#C9C3B7")


def register_fonts() -> None:
    fonts = ROOT / "brand-work" / "fonts"
    pdfmetrics.registerFont(TTFont("Inter", str(fonts / "Inter-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Inter-SemiBold", str(fonts / "Inter-SemiBold.ttf")))
    pdfmetrics.registerFont(TTFont("Inter-Bold", str(fonts / "Inter-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("Inter-ExtraBold", str(fonts / "Inter-ExtraBold.ttf")))
    pdfmetrics.registerFont(TTFont("InterTight-ExtraBold", str(fonts / "InterTight-ExtraBold.ttf")))
    pdfmetrics.registerFont(TTFont("IBMPlexMono-Bold", str(fonts / "IBMPlexMono-Bold.ttf")))


def text(c: canvas.Canvas, value: str, x: float, y: float, font: str, size: float, color=INK) -> None:
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, value)


def build(output: Path = DEFAULT_OUTPUT) -> None:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = output.with_suffix(f"{output.suffix}.tmp")

    width, height = letter
    c = canvas.Canvas(
        str(temporary_output),
        pagesize=letter,
        pageCompression=1,
        invariant=1,
    )
    c.setTitle("BotBound Investor Brief - Outbound Wedge")
    c.setAuthor("BotBound")
    c.setSubject("BotBound outbound launch and operating model")
    c.setCreator("BotBound launch production")

    c.setFillColor(PAPER)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    header_h = 214
    c.setFillColor(INK)
    c.rect(0, height - header_h, width, header_h, fill=1, stroke=0)
    c.setFillColor(VIOLET)
    c.setFillAlpha(0.13)
    c.circle(width - 68, height - 66, 122, fill=1, stroke=0)
    c.setFillAlpha(1)

    icon = ROOT / "public" / "brand" / "botbound-app-icon.png"
    c.drawImage(str(icon), 38, height - 71, width=30, height=30, mask="auto")
    text(c, "Bot", 76, height - 61, "InterTight-ExtraBold", 19, PLATINUM)
    bot_width = pdfmetrics.stringWidth("Bot", "InterTight-ExtraBold", 19)
    text(c, "Bound", 76 + bot_width, height - 61, "InterTight-ExtraBold", 19, VIOLET_LIGHT)

    text(c, "Investor Brief / Outbound Wedge", 38, height - 112, "IBMPlexMono-Bold", 7.6, VIOLET_LIGHT)
    text(c, "Find. Call.", 36, height - 163, "InterTight-ExtraBold", 38, PLATINUM)
    prefix_width = pdfmetrics.stringWidth("Find. Call.", "InterTight-ExtraBold", 38)
    text(c, " Book.", 36 + prefix_width, height - 163, "InterTight-ExtraBold", 38, VIOLET_LIGHT)
    text(
        c,
        "Bots work approved markets and lists, make calls, and drive clear outcomes.",
        38,
        height - 193,
        "Inter-SemiBold",
        10.3,
        MIST,
    )

    body_top = height - header_h
    text(c, "The Wedge", 38, body_top - 40, "IBMPlexMono-Bold", 7.4, INK)
    text(c, "Outbound Is Still a Stack.", 37, body_top - 76, "InterTight-ExtraBold", 22, INK)
    text(c, "BotBound Makes It a Bot.", 37, body_top - 102, "InterTight-ExtraBold", 22, VIOLET)
    text(
        c,
        "Lead discovery, lists, scripts, calls, calendars, follow-up, and review",
        38,
        body_top - 134,
        "Inter-SemiBold",
        10,
        BODY,
    )
    text(c, "become one job-specific operating path.", 38, body_top - 149, "Inter-SemiBold", 10, BODY)

    panel_x, panel_y, panel_w, panel_h = 38, body_top - 272, width - 76, 94
    c.setFillColor(INK)
    c.roundRect(panel_x, panel_y, panel_w, panel_h, 14, fill=1, stroke=0)
    text(c, "Owner Control", panel_x + 18, panel_y + 70, "IBMPlexMono-Bold", 7.1, VIOLET_LIGHT)
    text(c, "Your Bots. Your Rules.", panel_x + 18, panel_y + 43, "InterTight-ExtraBold", 16.8, PLATINUM)
    text(c, "Calls. Follow-Up. Owner Control.", panel_x + 18, panel_y + 22, "InterTight-ExtraBold", 16.8, PLATINUM)
    text(c, "Configured sources, tools, permissions, approvals, and handoffs.", panel_x + 18, panel_y + 7, "Inter-SemiBold", 7.5, MIST)

    why_y = panel_y - 39
    text(c, "Why BotBound", 38, why_y, "IBMPlexMono-Bold", 7.4, INK)

    rows = [
        ("Job-Specific Bots", "Sales / Recruiting / Appointments / Reactivation / Intake"),
        (
            "Room for Your Next Bot.",
            "Land with Sales. Expand into Recruiting, Appointments, Reactivation, and Intake.",
        ),
        ("Rehearse Free. Plans from $19/mo.", "Free Builder is private. Starter: 1 live Bot, 50 voice minutes/month; availability applies."),
    ]
    row_y = why_y - 39
    for title, detail in rows:
        text(c, title, 38, row_y, "InterTight-ExtraBold", 15.5, INK)
        text(c, detail, 38, row_y - 17, "Inter-SemiBold", 8.7, MUTED)
        row_y -= 66

    c.setStrokeColor(RULE)
    c.setLineWidth(0.7)
    c.line(38, 35, width - 38, 35)
    text(c, "BOTBOUND.ME", 38, 17, "IBMPlexMono-Bold", 7.1, INK)
    close = "Put Your Bot on the Line"
    c.setFont("Inter-Bold", 8)
    c.setFillColor(VIOLET)
    c.drawRightString(width - 38, 17, close)

    c.showPage()
    c.save()
    temporary_output.replace(output)
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build(args.output.resolve())
