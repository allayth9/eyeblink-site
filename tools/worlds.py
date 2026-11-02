"""Hand-built animated scenes, one per service. Shown only inside that service's page."""

DEFS = '''<defs>
 <linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FE0E8"/><stop offset=".55" stop-color="#2E62FF"/><stop offset="1" stop-color="#8B5CFF"/></linearGradient>
 <linearGradient id="wg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E07BE0"/><stop offset=".5" stop-color="#8B5CFF"/><stop offset="1" stop-color="#2E62FF"/></linearGradient>
 <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#9fb6ff" stroke-opacity=".07"/></pattern>
</defs>'''
FONT = 'font-family="Oswald, system-ui, sans-serif"'

def films():
    stripes = "".join(f'<path d="M{20+i*58},0 l34,0 l-24,46 l-34,0 z" fill="#EEF2F6"/>' for i in range(8))
    perf = "".join(f'<rect x="{i*30+8}" y="6" width="16" height="10" rx="2" fill="#04061A"/><rect x="{i*30+8}" y="56" width="16" height="10" rx="2" fill="#04061A"/>' for i in range(30))
    frames = "".join(f'<rect x="{i*120+6}" y="20" width="108" height="32" rx="3" fill="url(#wg)" opacity="{.25+((i*37)%5)*.12:.2f}"/>' for i in range(8))
    return f'''<svg viewBox="0 0 600 520" role="img" aria-label="Clapperboard">{DEFS}
<rect width="600" height="520" fill="url(#grid)"/>
<g stroke="#EEF2F6" stroke-opacity=".5" stroke-width="2" fill="none"><path d="M40 70V40h30M560 70V40h-30M40 400v30h30M560 400v30h-30"/></g>
<g {FONT} font-size="12" fill="#AEBBD2" letter-spacing="2"><circle class="rec-dot" cx="470" cy="56" r="6" fill="#E07BE0"/><text x="484" y="61">REC</text><text x="58" y="61">4K · 24 FPS</text></g>
<g transform="translate(110,120)">
 <g class="clap-arm"><rect x="0" y="0" width="380" height="46" rx="6" fill="#0b1238"/><clipPath id="armc"><rect x="0" y="0" width="380" height="46" rx="6"/></clipPath><g clip-path="url(#armc)">{stripes}</g></g>
 <rect x="0" y="54" width="380" height="46" rx="6" fill="#0b1238"/><g clip-path="url(#armc)" transform="translate(0,54)">{stripes}</g>
 <rect x="0" y="108" width="380" height="190" rx="10" fill="#070b26" stroke="url(#wg)" stroke-width="1.5"/>
 <g {FONT} fill="#EEF2F6">
  <text x="20" y="140" font-size="11" letter-spacing="3" fill="#6F7FA0">PRODUCTION</text><text x="20" y="166" font-size="20" font-weight="600" letter-spacing="3">EYEBLINK STUDIO</text>
  <line x1="20" y1="184" x2="360" y2="184" stroke="#2a3466"/>
  <text x="20" y="208" font-size="11" letter-spacing="3" fill="#6F7FA0">SCENE</text><text x="20" y="246" font-size="34" font-weight="300">01</text>
  <text x="140" y="208" font-size="11" letter-spacing="3" fill="#6F7FA0">TAKE</text><text x="140" y="246" font-size="34" font-weight="300">03</text>
  <text x="260" y="208" font-size="11" letter-spacing="3" fill="#6F7FA0">ROLL</text><text x="260" y="246" font-size="34" font-weight="300" fill="url(#wg)">A</text>
  <line x1="120" y1="196" x2="120" y2="284" stroke="#2a3466"/><line x1="240" y1="196" x2="240" y2="284" stroke="#2a3466"/>
  <text x="20" y="282" font-size="10" letter-spacing="3" fill="#6F7FA0">DIR · DOP · EDIT</text>
 </g>
</g>
<g transform="translate(0,440)"><rect width="600" height="72" fill="#0b1238"/><g class="film-strip">{perf}{frames}</g></g>
</svg>'''

def motion():
    keys = "".join(f'<rect class="mo-key" x="{110+i*120}" y="447" width="12" height="12" fill="url(#wg)" transform="rotate(45 {116+i*120} 453)"/>' for i in range(4))
    return f'''<svg viewBox="0 0 600 520" role="img" aria-label="Motion graphics">{DEFS}
<rect width="600" height="520" fill="url(#grid)"/>
<g stroke="#9fb6ff" stroke-opacity=".35" stroke-width="1"><line x1="70" y1="250" x2="150" y2="120"/><line x1="350" y1="170" x2="250" y2="70"/><line x1="350" y1="170" x2="450" y2="270"/><line x1="520" y1="110" x2="470" y2="250"/></g>
<path d="M70,250 C160,60 300,60 350,170 S470,300 520,110" fill="none" stroke="#2a3466" stroke-width="2" stroke-dasharray="4 6"/>
<path class="mo-path" d="M70,250 C160,60 300,60 350,170 S470,300 520,110" fill="none" stroke="url(#wg)" stroke-width="3" stroke-linecap="round"/>
<g fill="#EEF2F6"><circle cx="150" cy="120" r="5"/><circle cx="250" cy="70" r="5"/><circle cx="450" cy="270" r="5"/><circle cx="470" cy="250" r="5"/></g>
<g fill="#04061A" stroke="#EEF2F6" stroke-width="2"><rect x="64" y="244" width="12" height="12"/><rect x="344" y="164" width="12" height="12"/><rect x="514" y="104" width="12" height="12"/></g>
<circle class="mo-ball" r="12" fill="url(#wg)" style="filter:drop-shadow(0 0 12px #3FE0E8)"/>
<rect class="mo-morph" x="420" y="300" width="88" height="88" rx="44" fill="none" stroke="url(#wg2)" stroke-width="2.5"/>
<g class="mo-spin"><circle cx="150" cy="350" r="46" fill="none" stroke="url(#wg)" stroke-width="2" stroke-dasharray="6 10"/></g>
<g transform="translate(250,320)"><rect width="130" height="80" rx="10" fill="#070b26" stroke="#2a3466"/><path d="M14 66 C60 66 70 14 116 14" fill="none" stroke="#3FE0E8" stroke-width="2"/><g {FONT} font-size="9" fill="#6F7FA0" letter-spacing="1.5"><text x="12" y="20">EASE OUT</text></g></g>
<g transform="translate(0,0)"><rect x="50" y="430" width="500" height="46" rx="10" fill="#070b26" stroke="#2a3466"/>{keys}
<g class="mo-playhead"><line x1="80" y1="424" x2="80" y2="482" stroke="#E07BE0" stroke-width="2"/><path d="M74 420h12l-6 8z" fill="#E07BE0"/></g></g>
<g {FONT} font-size="11" fill="#AEBBD2" letter-spacing="2"><text x="50" y="500">POSITION · SCALE · ROTATION · OPACITY</text></g>
</svg>'''

def editing():
    wave = "".join(f'<rect x="{60+i*8}" y="{432-((i*53)%26)}" width="4" height="{8+((i*53)%26)*2}" rx="2" fill="#3FE0E8" opacity=".75" style="animation-delay:{(i%9)*.08:.2f}s"/>' for i in range(60))
    return f'''<svg viewBox="0 0 600 520" role="img" aria-label="Editing timeline">{DEFS}
<rect width="600" height="520" fill="url(#grid)"/>
<g transform="translate(120,40)"><rect width="360" height="203" rx="10" fill="#070b26" stroke="#2a3466"/>
 <rect x="10" y="10" width="340" height="183" rx="6" fill="url(#wg)" opacity=".28"/>
 <circle cx="250" cy="70" r="34" fill="#E07BE0" opacity=".35"/><path d="M10 160 L110 100 L190 150 L260 110 L350 170 L350 193 L10 193 Z" fill="#04061A" opacity=".7"/>
 <rect x="10" y="10" width="340" height="22" fill="#04061A" opacity=".6"/><rect x="10" y="171" width="340" height="22" fill="#04061A" opacity=".6"/>
 <g {FONT} font-size="11" fill="#EEF2F6" letter-spacing="2"><text x="18" y="25">PROGRAM</text><text x="262" y="25">00:00:12:08</text></g></g>
<g {FONT} font-size="11" fill="#6F7FA0" letter-spacing="1.5"><text x="22" y="304">V2</text><text x="22" y="350">V1</text><text x="22" y="432">A1</text></g>
<rect x="50" y="280" width="510" height="180" rx="10" fill="#070b26" stroke="#2a3466"/>
<rect x="60" y="290" width="140" height="22" rx="4" fill="#8B5CFF" opacity=".8"/><rect x="330" y="290" width="110" height="22" rx="4" fill="#E07BE0" opacity=".75"/>
<rect x="60" y="334" width="190" height="30" rx="4" fill="#2E62FF"/><rect x="254" y="334" width="120" height="30" rx="4" fill="#2E62FF" opacity=".75"/><rect x="378" y="334" width="170" height="30" rx="4" fill="#2E62FF" opacity=".9"/>
<g class="ed-cut"><line x1="252" y1="326" x2="252" y2="372" stroke="#EEF2F6" stroke-width="2"/><circle cx="252" cy="322" r="6" fill="none" stroke="#EEF2F6" stroke-width="2"/></g>
<g class="ed-wave">{wave}</g>
<g class="ed-playhead"><line x1="70" y1="276" x2="70" y2="466" stroke="#3FE0E8" stroke-width="2"/><path d="M63 270h14l-7 9z" fill="#3FE0E8"/></g>
<g {FONT} font-size="11" fill="#AEBBD2" letter-spacing="2"><text x="50" y="496">CUT · TRIM · RHYTHM · SOUND</text></g>
</svg>'''

def social():
    def screen(y, a, b, n):
        return (f'<g transform="translate(0,{y})"><rect x="0" y="0" width="220" height="300" fill="url(#{a})" opacity=".55"/>'
                f'<circle cx="{60+n*40}" cy="{110+n*20}" r="{50+n*12}" fill="#{b}" opacity=".35"/>'
                f'<rect x="18" y="214" width="120" height="10" rx="5" fill="#EEF2F6" opacity=".85"/><rect x="18" y="232" width="80" height="8" rx="4" fill="#EEF2F6" opacity=".5"/></g>')
    return f'''<svg viewBox="0 0 600 520" role="img" aria-label="Social video">{DEFS}
<rect width="600" height="520" fill="url(#grid)"/>
<g transform="translate(190,40)">
 <rect x="-10" y="-10" width="240" height="460" rx="38" fill="#070b26" stroke="url(#wg)" stroke-width="2"/>
 <clipPath id="scr"><rect x="0" y="0" width="220" height="440" rx="30"/></clipPath>
 <g clip-path="url(#scr)"><rect width="220" height="440" fill="#04061A"/>
  <g class="so-feed">{screen(0,'wg','3FE0E8',0)}{screen(300,'wg2','2E62FF',1)}{screen(600,'wg','E07BE0',2)}{screen(900,'wg2','3FE0E8',0)}</g>
  <g transform="translate(14,16)"><rect width="60" height="3" rx="1.5" fill="#EEF2F6" opacity=".35"/><rect class="so-bar" width="60" height="3" rx="1.5" fill="#EEF2F6"/>
   <rect x="66" width="60" height="3" rx="1.5" fill="#EEF2F6" opacity=".35"/><rect x="132" width="60" height="3" rx="1.5" fill="#EEF2F6" opacity=".35"/></g>
  <g transform="translate(180,250)" fill="#EEF2F6"><path class="so-heart" d="M12 21s-8-5.3-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.7-8 11-8 11z" fill="#E07BE0"/>
   <path d="M5 50h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H11l-5 4v-4H5a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" opacity=".85"/><path d="M4 92l16-8-6 16-2-6z" opacity=".85"/></g>
 </g>
 <rect x="80" y="-2" width="60" height="8" rx="4" fill="#04061A"/>
</g>
<g {FONT} font-size="11" fill="#AEBBD2" letter-spacing="2"><text x="40" y="120">HOOK · 0–3s</text><text x="430" y="260">9 : 16</text><text x="40" y="420">CAPTIONS</text></g>
<g stroke="#9fb6ff" stroke-opacity=".35"><line x1="140" y1="116" x2="186" y2="116"/><line x1="414" y1="256" x2="436" y2="256"/><line x1="122" y1="416" x2="186" y2="416"/></g>
</svg>'''

WORLDS = {"films": films, "motion": motion, "editing": editing, "social": social}
