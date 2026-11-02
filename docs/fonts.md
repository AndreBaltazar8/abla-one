# Inter font assets

The committed fonts identify themselves as Inter Variable version 4.001,
`git-9221beed3`. Inter's source is [rsms/inter](https://github.com/rsms/inter);
the exact downloaded variable-font file is not retained in this repository.
The font is licensed under the SIL Open Font License 1.1; see
[assets/fonts/LICENSE](../assets/fonts/LICENSE).

The former `tools/fonts.py` (last present at commit `f43b77f`) used FontTools
on an externally supplied `InterVariable.ttf` to produce static instances at
weights 400, 500, 600 and 700, with optical size 14 when that axis was present.
It also wrote `src/layout/inter_metrics.ab`: advances and ascent/descent in
1/1000 em for ASCII 32–126, Latin-1 160–255 and selected punctuation.

Its separate `--glyphs` mode read those four static fonts, decomposed glyph
contours and wrote `src/raster/inter_glyphs.ab` for the software rasterizer.
For each weight it stored little-endian signed 16-bit outline words as base64,
with offsets in the same code-point order as the metrics. The source argument
was unused in this mode. No regeneration is part of the build.

SHA-256 of the committed artifacts:

```text
1b9e33491bc62433b5c662806309dea04a5bd37b51de500638e9b90ab660e598  assets/fonts/Inter-400.ttf
612e56a809789a963b3069eec6984612936feb17f768c6ba183f0e5781778083  assets/fonts/Inter-500.ttf
d69829e71f751ff41e2f8515dd95d44e11e4d1c9f5bb566080a782db0c0bee04  assets/fonts/Inter-600.ttf
599f0bcad09fdd376e9295bdc53d27576163f4b841d24cc8eed3c10f53a1d403  assets/fonts/Inter-700.ttf
29543cea1aefc0dd562f4e76694258b6ff21f162ed1f0ef3e7dff587f5a912c1  src/layout/inter_metrics.ab
83d99a0fe2d1f35ea164ad304b5da73690e89eb3a2139199af7749ff6fdcd4b7  src/raster/inter_glyphs.ab
```
