"""Generate the film's voices with a free, open-source Hebrew text-to-speech model, then give every
character its own sound with ffmpeg.  Output: audio/<id>.mp3 + audio/manifest.json

Needs network access to huggingface.co (the model) and PyPI (the Python packages):
    pip install torch --index-url https://download.pytorch.org/whl/cpu   (or: pip install torch)
    pip install transformers soundfile uroman
    node tools/export_lines.mjs
    python3 tools/make_voices.py            # add --limit 5 to try a few lines first
"""
import json, subprocess, sys, pathlib, argparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODEL = 'facebook/mms-tts-heb'   # Meta "Massively Multilingual Speech" Hebrew voice (CC-BY-NC 4.0)

# per-character sound: pitch factor (>1 higher), tempo, extra ffmpeg filters
VOICES = {
    'narrator': (1.00, 0.96, 'equalizer=f=180:t=q:w=1:g=2'),
    'kharu':    (0.80, 0.95, 'aecho=0.8:0.5:35:0.25,equalizer=f=120:t=q:w=1:g=4'),
    'nefira':   (1.10, 0.94, 'aecho=0.8:0.85:120|260:0.35|0.22,highpass=f=160'),
    'sethar':   (0.68, 0.92, 'aecho=0.8:0.8:70|190:0.55|0.35,equalizer=f=90:t=q:w=1:g=6'),
    'lina':     (1.30, 1.05, 'highpass=f=200'),
    'yasif':    (0.90, 0.95, 'vibrato=f=5:d=0.06'),
    'tamun':    (0.96, 0.95, 'vibrato=f=4.5:d=0.09'),
    'keeper':   (0.62, 0.90, 'aecho=0.7:0.7:280:0.45,lowpass=f=3200'),
    'memory':   (1.00, 0.92, 'lowpass=f=3400,aecho=0.8:0.9:420:0.3'),
}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--limit', type=int, default=0); ap.add_argument('--lines', default=str(ROOT / 'tools' / 'lines.json')); args = ap.parse_args()
    import torch, soundfile as sf
    from transformers import VitsModel, AutoTokenizer
    lines = json.loads(pathlib.Path(args.lines).read_text(encoding='utf-8'))
    if args.limit: lines = lines[:args.limit]
    out = ROOT / 'audio'; out.mkdir(exist_ok=True)
    tok = AutoTokenizer.from_pretrained(MODEL); model = VitsModel.from_pretrained(MODEL)
    model.speaking_rate = 0.95
    uroman = None
    if getattr(tok, 'is_uroman', False):
        import uroman as ur; uroman = ur.Uroman()
    sr = model.config.sampling_rate
    manifest = {}
    for i, ln in enumerate(lines):
        mp3 = out / f"{ln['id']}.mp3"
        if not mp3.exists():
            text = uroman.romanize_string(ln['text']) if uroman else ln['text']
            with torch.no_grad():
                wav = model(**tok(text, return_tensors='pt')).waveform[0].numpy()
            raw = out / 'tmp.wav'; sf.write(raw, wav, sr)
            pitch, tempo, extra = VOICES.get(ln['speaker'], VOICES['narrator'])
            filt = f'asetrate={int(sr * pitch)},aresample={sr},atempo={tempo / pitch:.4f}'
            if extra: filt += ',' + extra
            filt += ',loudnorm=I=-16:TP=-1.5'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw), '-af', filt, '-ac', '1', '-b:a', '64k', str(mp3)], check=True)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp3)], capture_output=True, text=True).stdout or 0)
        manifest[ln['id']] = round(dur, 2)
        print(f'{i + 1}/{len(lines)} {ln["speaker"]:8s} {dur:5.1f}s', flush=True)
    (out / 'tmp.wav').unlink(missing_ok=True)
    (out / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    print('done:', len(manifest), 'voice files in audio/')

if __name__ == '__main__':
    main()
