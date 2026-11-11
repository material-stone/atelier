cues = [
 (0.0, 3.5, "Atelier (atelier.materialstone.dev), the game hub of Material Stone Games"),
 (3.5, 7.5, "The player signs in with Google"),
 (7.5, 16.0, "Basic Google Sign-In asks only for name, email and profile picture.\nNo YouTube access is requested here."),
 (16.0, 18.5, "After sign-in, Atelier offers a YouTube subscription check\nfor this week's subscriber prototype"),
 (18.5, 23.5, "The player clicks \"Verify subscription\" and picks the same Google account"),
 (23.5, 28.0, "Google shows the unverified-app notice (expected before verification).\nThe player continues via Advanced."),
 (28.0, 41.5, "Consent screen: Atelier requests a single scope,\n\"View your YouTube account\" (youtube.readonly)"),
 (41.5, 57.0, "The address bar shows this app's OAuth client ID (client_id=...)"),
 (57.0, 60.0, "The player allows access"),
 (60.0, 64.0, "Our server calls subscriptions.list once (mine=true, forChannelId = our channel)\nand confirms the subscription"),
 (64.0, 73.0, "Atelier stores only yes/no and an expiry (end of this week). The access token is never stored.\nPlayers can clear the check at any time in Settings."),
 (73.0, 88.0, "This week's subscriber prototype is now playable"),
 (88.0, 100.3, "Privacy policy: YouTube data use follows the Google API Services\nUser Data Policy, including the Limited Use requirements"),
]
NL = chr(92) + "N"
def srt(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
def ass(t):
    cs = int(round(t * 100)); h, cs = divmod(cs, 360000); m, cs = divmod(cs, 6000); s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"
with open("subs.srt", "w", encoding="utf-8") as f:
    for i, (a, b, t) in enumerate(cues, 1):
        f.write(f"{i}\n{srt(a)} --> {srt(b)}\n{t}\n\n")
head = """[Script Info]
ScriptType: v4.00+
PlayResX: 3438
PlayResY: 1438
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H00FFFFFF,&H30000000,&H30000000,1,0,0,0,100,100,0,0,3,18,0,2,80,80,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
with open("subs.ass", "w", encoding="utf-8") as f:
    f.write(head)
    for a, b, t in cues:
        f.write(f"Dialogue: 0,{ass(a)},{ass(b)},Default,,0,0,0,,{t.replace(chr(10), NL)}\n")
