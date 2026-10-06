"""Génère les sons courts du coach (synthèse : aucun droit d'auteur, domaine public).
Usage : python3 scripts/make-sounds.py  →  assets/sounds/{warning,alarm,success}.wav"""
import math, struct, wave, os

RATE = 22050

def tone(notes, path, volume=0.5):
    """notes : [(fréquence Hz, durée s)] ; enveloppe douce pour éviter les clics."""
    frames = bytearray()
    for freq, dur in notes:
        n = int(RATE * dur)
        for i in range(n):
            t = i / RATE
            env = min(1.0, i / (0.01 * RATE), (n - i) / (0.04 * RATE))  # attaque 10 ms, extinction 40 ms
            s = math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(4 * math.pi * freq * t)
            frames += struct.pack('<h', int(max(-1, min(1, s / 1.25 * env * volume)) * 32767))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(frames))

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
os.makedirs(out, exist_ok=True)
tone([(660, 0.14), (0, 0.06), (660, 0.14)], os.path.join(out, 'warning.wav'))            # deux bips moyens
tone([(880, 0.12), (620, 0.12), (880, 0.12), (620, 0.16)], os.path.join(out, 'alarm.wav'))  # alternance montante/descendante
tone([(523, 0.10), (659, 0.10), (784, 0.22)], os.path.join(out, 'success.wav'))             # arpège do-mi-sol
print('ok')
