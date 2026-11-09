# Synthesizes a batch of Korean lines with Supertonic (local, CPU) so the model loads only once.
# Usage: python -I supertonic-batch.py '{"voice": "M1", "speed": 1.1, "steps": 16, "jobs": [{"text": ..., "out": ...}]}'
import json
import sys

from supertonic import TTS

job = json.loads(sys.argv[1])
tts = TTS(auto_download=True)
style = tts.get_voice_style(voice_name=job.get("voice", "M1"))
for item in job["jobs"]:
    wav, _ = tts.synthesize(
        item["text"],
        voice_style=style,
        lang="ko",
        total_steps=job.get("steps", 16),
        speed=job.get("speed", 1.1),
    )
    tts.save_audio(wav, item["out"])
    print("ok", item["text"])
