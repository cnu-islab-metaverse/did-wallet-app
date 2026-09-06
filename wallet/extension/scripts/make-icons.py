# [작업] 확장 아이콘(icon-128.png · icon-34.png)을 그린다. 이 스크립트가 아이콘의 원본이다 —
#        PNG 를 직접 고치지 말고 여기를 고친 뒤 다시 실행한다.
# [결과] chrome-extension/public/ 에 두 PNG 를 쓴다.
#
#   python scripts/make-icons.py
#
# 색은 플랫폼 화면·지갑 셸과 같은 그러데이션(#6D8BFF → #A06DFF)을 쓴다.
# 도형은 방패 안에 체크를 뚫어낸 것 — 흰 방패에서 체크 모양만 파내 아래 그러데이션이 비친다.
# 34px 에서도 뭉개지지 않도록 큰 캔버스에 그린 뒤 축소한다.
import math
import os
from PIL import Image, ImageDraw

S = 1024                      # 작업 캔버스. 최종 크기로 줄인다.
OUT = os.path.join(os.path.dirname(__file__), '..', 'chrome-extension', 'public')

C1 = (0x6D, 0x8B, 0xFF)       # 그러데이션 시작
C2 = (0xA0, 0x6D, 0xFF)       # 그러데이션 끝

# 정규화 좌표(0..1). 크기를 바꿔도 비율이 유지된다.
CORNER = 0.22                 # 둥근 모서리 반지름
SHIELD = dict(cx=0.5, cy=0.50, w=0.46, h=0.56)
CHECK = [(0.385, 0.492), (0.463, 0.575), (0.625, 0.395)]
CHECK_W = 0.098               # 체크 굵기


def gradient(size):
    """135° 선형 그러데이션. 대각선 방향으로 C1 → C2."""
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(C1, C2))
    return img


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def shield_points(size):
    """위는 각진 어깨, 아래는 한 점으로 모이는 고전적인 방패."""
    cx, cy = SHIELD['cx'] * size, SHIELD['cy'] * size
    w, h = SHIELD['w'] * size, SHIELD['h'] * size
    top, bot = cy - h / 2, cy + h / 2
    left, right = cx - w / 2, cx + w / 2
    straight = top + 0.38 * h          # 여기까지는 수직, 그 아래로 오므라든다

    def curve(x0, y0, ctrl_x, ctrl_y, x1, y1, n=40):
        out = []
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            out.append((
                u * u * x0 + 2 * u * t * ctrl_x + t * t * x1,
                u * u * y0 + 2 * u * t * ctrl_y + t * t * y1,
            ))
        return out

    pts = [(left, top), (right, top), (right, straight)]
    pts += curve(right, straight, right, bot - 0.08 * h, cx, bot)
    pts += curve(cx, bot, left, bot - 0.08 * h, left, straight)
    pts.append((left, top))
    return pts


def check_mask(size):
    """굵은 꺾은선. 끝과 꼭짓점을 원으로 채워 둥근 마감을 만든다."""
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    w = CHECK_W * size
    pts = [(x * size, y * size) for x, y in CHECK]
    d.line(pts, fill=255, width=round(w), joint='curve')
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    return m


def build(size):
    bg = gradient(size).convert('RGBA')
    bg.putalpha(rounded_mask(size, round(CORNER * size)))

    # 방패에서 체크를 뺀 부분만 흰색으로 덮는다 → 체크는 그러데이션이 비쳐 보인다.
    sh = Image.new('L', (size, size), 0)
    ImageDraw.Draw(sh).polygon(shield_points(size), fill=255)
    ck = check_mask(size)
    knockout = Image.composite(Image.new('L', (size, size), 0), sh, ck)

    white = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    return Image.composite(white, bg, knockout)


def main():
    art = build(S)
    os.makedirs(OUT, exist_ok=True)
    for px in (128, 34):
        path = os.path.abspath(os.path.join(OUT, f'icon-{px}.png'))
        art.resize((px, px), Image.LANCZOS).save(path)
        print('wrote', path)


if __name__ == '__main__':
    main()
