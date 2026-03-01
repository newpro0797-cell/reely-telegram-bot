"""
FFmpeg Stitcher — Modal Serverless Endpoint
Deploy with: python3 -m modal deploy ffmpeg_stitcher.py

This endpoint replaces the Docker-local FFmpeg step for Vercel deployments.
It receives base64-encoded images and audio, stitches them into a video, and
returns the video as base64.
"""
import base64
import os
import subprocess
import tempfile
import math
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["ffmpeg"])
    .pip_install(["flask"])
)

app = modal.App("reely-ffmpeg-stitcher")

with image.imports():
    from flask import Flask, request, jsonify


@app.cls(
    image=image,
    cpu=2.0,
    memory=4096,
    scaledown_window=120,
    timeout=600,
)
class FFmpegStitcher:
    @modal.method()
    def stitch(
        self,
        scenes,           # list of { scene_number, image_base64, display_duration_seconds }
        audio_base64,     # base64-encoded WAV
        resolution="1080x1920",
        crf=23,
        ken_burns=True,
        transition_effect="none",
        transition_duration=0.5,
    ):
        width, height = resolution.split("x")
        w, h = int(width), int(height)
        fps = 30

        with tempfile.TemporaryDirectory() as tmpdir:
            # Write audio
            audio_path = os.path.join(tmpdir, "audio.wav")
            with open(audio_path, "wb") as f:
                f.write(base64.b64decode(audio_base64))

            # Write scene images and create clips
            clip_paths = []
            for scene in sorted(scenes, key=lambda s: s["scene_number"]):
                sn = scene["scene_number"]
                dur = scene["display_duration_seconds"]
                total_frames = math.ceil(dur * fps)

                img_path = os.path.join(tmpdir, f"scene_{sn}.png")
                with open(img_path, "wb") as f:
                    f.write(base64.b64decode(scene["image_base64"]))

                clip_path = os.path.join(tmpdir, f"clip_{sn}.mp4")

                if ken_burns:
                    cmd = [
                        "ffmpeg", "-y", "-loop", "1", "-i", img_path,
                        "-vf",
                        f"zoompan=z='min(zoom+0.001,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps},format=yuv420p",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
                        "-frames:v", str(total_frames),
                        clip_path,
                    ]
                else:
                    cmd = [
                        "ffmpeg", "-y", "-loop", "1", "-i", img_path,
                        "-t", str(dur),
                        "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(fps), "-preset", "fast",
                        clip_path,
                    ]

                subprocess.run(cmd, check=True, capture_output=True)
                clip_paths.append(clip_path)

            # Concatenate
            silent_path = os.path.join(tmpdir, "silent.mp4")

            if transition_effect != "none" and transition_effect and len(clip_paths) > 1:
                # xfade transitions
                xfade_map = {
                    "fade": "fade", "slide_left": "slideleft",
                    "slide_right": "slideright", "zoom_in": "circlecrop",
                    "zoom_out": "circleopen",
                }
                ffmpeg_trans = xfade_map.get(transition_effect, "fade")

                inputs = []
                for cp in clip_paths:
                    inputs += ["-i", cp]

                filters = []
                prev = "[0:v]"
                for i in range(1, len(clip_paths)):
                    offset = max(0, i * 5 - transition_duration)
                    out_label = "outv" if i == len(clip_paths) - 1 else f"v{i}"
                    filters.append(
                        f"{prev}[{i}:v]xfade=transition={ffmpeg_trans}:duration={transition_duration}:offset={offset}[{out_label}]"
                    )
                    prev = f"[{out_label}]"

                cmd = ["ffmpeg", "-y"] + inputs + [
                    "-filter_complex", ";".join(filters),
                    "-map", "[outv]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", str(crf), "-preset", "fast",
                    silent_path,
                ]
                subprocess.run(cmd, check=True, capture_output=True)
            else:
                # Simple concat
                concat_path = os.path.join(tmpdir, "concat.txt")
                with open(concat_path, "w") as f:
                    for cp in clip_paths:
                        f.write(f"file '{cp}'\n")

                cmd = [
                    "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                    "-i", concat_path,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", str(crf), "-preset", "fast",
                    silent_path,
                ]
                subprocess.run(cmd, check=True, capture_output=True)

            # Merge audio
            final_path = os.path.join(tmpdir, "final.mp4")
            cmd = [
                "ffmpeg", "-y",
                "-i", silent_path, "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                final_path,
            ]
            subprocess.run(cmd, check=True, capture_output=True)

            with open(final_path, "rb") as f:
                video_bytes = f.read()

            return video_bytes


@app.function(image=image, cpu="0.5", memory="1GiB")
@modal.wsgi_app()
def flask_app():
    web_app = Flask(__name__)

    @web_app.route("/")
    def health():
        return jsonify({"status": "alive"})

    @web_app.route("/stitch", methods=["POST"])
    def stitch_video():
        data = request.get_json(force=True)

        scenes = data.get("scenes")
        audio_base64 = data.get("audio_base64")
        if not scenes or not audio_base64:
            return jsonify({"error": "scenes and audio_base64 required"}), 400

        stitcher = FFmpegStitcher()
        video_bytes = stitcher.stitch.remote(
            scenes=scenes,
            audio_base64=audio_base64,
            resolution=data.get("resolution", "1080x1920"),
            crf=data.get("crf", 23),
            ken_burns=data.get("ken_burns", True),
            transition_effect=data.get("transition_effect", "none"),
            transition_duration=data.get("transition_duration", 0.5),
        )

        return jsonify({
            "video": base64.b64encode(video_bytes).decode("utf-8"),
            "format": "mp4",
        })

    @web_app.route("/compress", methods=["POST"])
    def compress_video():
        data = request.get_json(force=True)
        video_base64 = data.get("video_base64")
        if not video_base64:
            return jsonify({"error": "video_base64 required"}), 400

        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.mp4")
            output_path = os.path.join(tmpdir, "output.mp4")
            
            with open(input_path, "wb") as f:
                f.write(base64.b64decode(video_base64))

            # Compress video to target < 25MB by forcing lower bitrate & downscaling
            cmd = [
                "ffmpeg", "-y", "-i", input_path,
                "-vf", "scale=-2:854", # downscale to max 854p height
                "-c:v", "libx264", "-crf", "32", "-preset", "faster",
                "-c:a", "aac", "-b:a", "96k",
                "-movflags", "+faststart",
                output_path
            ]
            subprocess.run(cmd, check=True, capture_output=True)

            with open(output_path, "rb") as f:
                video_bytes = f.read()

        return jsonify({
            "video": base64.b64encode(video_bytes).decode("utf-8"),
            "format": "mp4",
        })

    return web_app
