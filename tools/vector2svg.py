#!/usr/bin/env python3
"""Convert Android vector drawables to SVG so web targets can use the same icons.

Usage: vector2svg.py OUT_DIR drawable.xml...
Handles <path> fill/stroke attributes and <group> translate/rotate/scale.
Colours become currentColor when --tint is given (icons tinted by CSS).
"""
import sys, os, xml.etree.ElementTree as ET
A = '{http://schemas.android.com/apk/res/android}'

def color(v, tint):
    if not v: return 'none'
    if v.startswith('@'): return 'none' if 'transparent' in v else 'currentColor'
    v = v.lstrip('#')
    if len(v) == 8 and v[:2] == '00': return 'none'
    if tint: return 'currentColor'
    if len(v) == 8: v = v[2:]
    return '#' + v

def convert(el, tint):
    out = []
    for c in el:
        if c.tag == 'path':
            attrs = [f'd="{c.get(A+"pathData")}"']
            attrs.append(f'fill="{color(c.get(A+"fillColor"), tint)}"')
            if c.get(A + 'strokeColor'):
                attrs.append(f'stroke="{color(c.get(A+"strokeColor"), tint)}"')
                attrs.append(f'stroke-width="{c.get(A+"strokeWidth", "1")}"')
                for k, s in (('strokeLineCap', 'stroke-linecap'), ('strokeLineJoin', 'stroke-linejoin')):
                    if c.get(A + k): attrs.append(f'{s}="{c.get(A+k)}"')
            if c.get(A + 'fillType') == 'evenOdd': attrs.append('fill-rule="evenodd"')
            out.append('<path ' + ' '.join(attrs) + '/>')
        elif c.tag == 'group':
            t = []
            px, py = c.get(A + 'pivotX', '0'), c.get(A + 'pivotY', '0')
            if c.get(A + 'translateX') or c.get(A + 'translateY'):
                t.append(f'translate({c.get(A+"translateX","0")} {c.get(A+"translateY","0")})')
            if c.get(A + 'rotation'): t.append(f'rotate({c.get(A+"rotation")} {px} {py})')
            if c.get(A + 'scaleX') or c.get(A + 'scaleY'):
                t.append(f'translate({px} {py}) scale({c.get(A+"scaleX","1")} {c.get(A+"scaleY","1")}) translate(-{px} -{py})')
            out.append(f'<g transform="{" ".join(t)}">' + convert(c, tint) + '</g>')
    return ''.join(out)

def main():
    args = sys.argv[1:]
    tint = '--tint' in args
    args = [a for a in args if a != '--tint']
    out, files = args[0], args[1:]
    os.makedirs(out, exist_ok=True)
    for f in files:
        root = ET.parse(f).getroot()
        w, h = root.get(A + 'viewportWidth'), root.get(A + 'viewportHeight')
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">{convert(root, tint)}</svg>\n'
        name = os.path.splitext(os.path.basename(f))[0]
        open(os.path.join(out, name + '.svg'), 'w').write(svg)

if __name__ == '__main__':
    main()
