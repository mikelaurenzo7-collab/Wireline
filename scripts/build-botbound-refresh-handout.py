"""Build the current customer handout from reviewed campaign art and native text."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'brand-work/launch-2026-09-refresh/exports'
OUT.mkdir(parents=True, exist_ok=True)
for name, file in [('Display', 'InterTight-ExtraBold.ttf'), ('Body', 'Inter-Regular.ttf'), ('Bold', 'Inter-SemiBold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(ROOT / 'brand-work/fonts' / file)))
pdf = canvas.Canvas(str(OUT / 'BotBound-Stay-in-the-Work.pdf'), pagesize=(612,792))
pdf.setTitle('BotBound | Stay in the Work')
pdf.setAuthor('BotBound')
pdf.setSubject('AI bots for calls, texts, and email. Customer overview; prepared for launch.')
pdf.setFillColor(HexColor('#08070D')); pdf.rect(0,0,612,792,fill=1,stroke=0)

def line(txt,x,y,size=12,color='#D3CBDF',font='Body'):
    pdf.setFillColor(HexColor(color));pdf.setFont(font,size);pdf.drawString(x,y,txt)

pdf.saveState()
clip=pdf.beginPath();clip.rect(327,455,285,337);pdf.clipPath(clip,stroke=0,fill=0)
pdf.drawImage(str(ROOT / 'brand-work/launch-2026-09-refresh/sources/stay-in-the-work.png'),327,433,285,356.25)
pdf.restoreState()
line('Bot',38,744,28,'#F8F7FC','Display')
line('Bound',78,744,28,'#A78BFA','Display')
line('Stay in',38,646,48,'#F8F7FC','Display')
line('the Work.',38,596,48,'#C4B5FD','Display')
line('Bots for calls, texts,',38,547,15)
line('and email.',38,524,15)
line('Your Business. Your Voice. Your Rules.',38,422,23,'#F8F7FC','Display')
line('AI bots for the conversations that keep business moving.',38,394,13)
items = [
    ('Answer Questions', 'Give callers clear answers from your business knowledge.'),
    ('Keep Conversations Moving', 'Handle calls, texts, and email with the channels you connect.'),
    ('Stay in Control', 'Set the rules, rehearse privately, and define the handoff.')
]
for i,(heading,body) in enumerate(items):
    y=336-i*74
    line(heading,38,y,18,'#C4B5FD','Display')
    line(body,38,y-24,12)
pdf.setStrokeColor(HexColor('#332942'));pdf.line(38,142,574,142)
pdf.setFillColor(HexColor('#B298FB'));pdf.roundRect(38,75,147,43,8,fill=1,stroke=0)
line('Start Free',64,90,17,'#100B19','Bold')
destination='https://botbound.app/signup?plan=free&utm_source=handout&utm_medium=pdf&utm_campaign=bb_launch_refresh_202609'
pdf.linkURL(destination,(38,75,185,118),relative=0,thickness=0)
line('BotBound.app',441,92,16,'#F8F7FC','Bold')
pdf.linkURL('https://botbound.app',(435,78,577,115),relative=0,thickness=0)
line('Private testing free. Live use paid.',38,49,11)
line('Live channels require eligible setup and availability.',38,31,10,'#B6B1C6')
pdf.save()
print(OUT / 'BotBound-Stay-in-the-Work.pdf')
