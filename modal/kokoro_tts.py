from io import BytesIO
import base64
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["espeak-ng", "libsndfile1"])
    .pip_install(["kokoro>=0.9.2", "soundfile", "numpy", "flask"])
)

app = modal.App("reely-kokoro")

with image.imports():
    from flask import Flask, request, jsonify

@app.cls(
    image=image,
    cpu=2.0,
    memory=4096,
    scaledown_window=120,
    timeout=300,
)
class KokoroModel:

    @modal.enter()
    def load(self):
        from kokoro import KPipeline
        self.pipeline = KPipeline(lang_code='a')
        print("Kokoro TTS loaded!")

    @modal.method()
    def synthesize(self, text, voice="af_sarah", speed=1.0):
        import numpy as np
        import soundfile as sf
        chunks = list(self.pipeline(text, voice=voice, speed=speed))
        audio = np.concatenate([seg for _, _, seg in chunks])
        sample_rate = 24000
        buf = BytesIO()
        sf.write(buf, audio, sample_rate, format='WAV')
        duration = round(len(audio) / sample_rate, 3)
        return buf.getvalue(), duration

@app.function(image=image, cpu="0.5", memory="1GiB")
@modal.wsgi_app()
def flask_app():
    web_app = Flask(__name__)

    @web_app.route("/")
    def health():
        return jsonify({"status": "alive"})

    @web_app.route("/generate", methods=["POST"])
    def generate_speech():
        data = request.get_json(force=True)
        text = data.get("text")
        if not text:
            return jsonify({"error": "text is required"}), 400
        model = KokoroModel()
        audio_bytes, duration = model.synthesize.remote(
            text=text,
            voice=data.get("voice", "af_sarah"),
            speed=data.get("speed", 1.0),
        )
        return jsonify({
            "audio": base64.b64encode(audio_bytes).decode("utf-8"),
            "duration_seconds": duration,
            "format": "wav"
        })

    return web_app
