# Makes assets/sounds/ping.wav: a loud two-tone beep, 1.2 s, small file. Run: python3 scripts/make-ping-sound.py
import math
import struct
import wave

RATE = 16000
samples = []
for i in range(int(RATE * 1.2)):
    t = i / RATE
    tone = 1500 if int(t / 0.15) % 2 == 0 else 1000
    # a sine pushed past full scale and clipped sounds louder and harsher
    value = max(-1.0, min(1.0, 1.6 * math.sin(2 * math.pi * tone * t)))
    samples.append(int(value * 30000))

with wave.open('assets/sounds/ping.wav', 'wb') as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(RATE)
    f.writeframes(struct.pack('<%dh' % len(samples), *samples))
