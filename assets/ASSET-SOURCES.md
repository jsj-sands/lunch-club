# Brand assets and fonts

Retrieved and verified on 2026-10-19. These assets are hosted locally by the app; loading the app does not contact a font CDN.

## SANDS Lab CI

The company source is [SANDS Lab's official CI page](https://www.sandslab.io/ko/company/about).

- `favicon.svg`: the two native vector paths from **page 9, Favicon**, in the official [SANDS Lab CI Guidelines](https://www.sandslab.io/files/32a18c0f5d3b45d995b00d33974e8fd6). This is the flat symbol shown in the supplied reference image. Paths, fills, and the outline stroke are preserved; the background and surrounding presentation elements are excluded. The 150 × 150 view box preserves the guide's clear space. There are no gradients, raster images, or font dependencies.
- `sands-symbol.svg`: the exact same two paths, fills, and stroke as `favicon.svg`, with a tight view box around the artwork for alignment beside the wordmark in the app header. Only transparent outer space is omitted; the symbol itself is neither scaled disproportionately nor redrawn. The separate `favicon.svg` retains the official clear space for the browser tab.
- `sands-wordmark.svg`: the eight original letter outlines from the official [horizontal CI SVG](https://www.sandslab.io/api/media/file/symbol-horizontal-light.svg). The symbol and construction guides are excluded. The wordmark's letterforms, spacing, proportions, and original `#2C323C` fill are unchanged. The logo uses the official **SANDS Lab** outlines.

The CI remains SANDS Lab's brand property. Font licenses below apply only to their respective fonts.

Source SHA-256 checksums:

```text
CI Guidelines PDF
3ec4d466f04c48d5439304652a2004ab232fdb49d9b331a7dc12879ebca7bbf0

Horizontal CI SVG
5888ca053faecc2400b343fb6bc29b1f4a61cf485d937b1378d976cf66d477a3
```

## Red Hat Display

- File: `fonts/red-hat-display-latin.woff2`
- License: `fonts/OFL-Red-Hat-Display.txt`, copied from [Google Fonts' official Red Hat Display directory](https://raw.githubusercontent.com/google/fonts/main/ofl/redhatdisplay/OFL.txt).
- Typeface owner/source: [Red Hat's font repository](https://github.com/RedHatOfficial/RedHatFont) and [Red Hat's typography standards](https://www.redhat.com/en/about/brand/standards/typography).
- Downloaded unchanged from the Latin variable file supplied by the [Google Fonts CSS API](https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@300..900&display=swap):
  `https://fonts.gstatic.com/s/redhatdisplay/v21/8vIQ7wUr0m80wwYf0QCXZzYzUoTg_T6h.woff2`
- Font family: **Red Hat Display**. Font version: **1.030**.
- Actual `wght` axis: **300–900**, default **400**.
- Size: **30,672 bytes**.
- SHA-256: `f7a7830b81e351f89b91f0201de71c8d937e25df5a3e31ecca9b4ee877abedb7`.
- Validation: WOFF2 signature, all fontTools tables decoded, 231 Unicode entries, complete `Lunch Club` character coverage. This Latin subset does not contain Korean glyphs.

## Pretendard Variable

- File: `fonts/pretendard-variable.woff2`
- License: `fonts/Pretendard-OFL.txt`, copied unchanged from the [author's v1.3.9 license](https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE).
- Source: [orioncactus/pretendard](https://github.com/orioncactus/pretendard), the original author's official repository.
- Downloaded unchanged from:
  `https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`
- Font family: **Pretendard Variable**. Font version: **1.309; Glyphs 3.2 (3225)**.
- Actual internal `wght` axis: **45–930**, default **400**. The app may declare and use the requested **100–900** range. The upstream CSS's declared 45–920 range differs slightly from the font's internal range.
- Size: **2,057,688 bytes**.
- SHA-256: `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4`.
- Validation: WOFF2 signature, all fontTools tables decoded, 14,336 Unicode entries, and all **11,172 modern Hangul syllables U+AC00–U+D7A3** including `가` and `힣` are present. This is one complete font file, not a group of dynamic subset files.

Use Red Hat Display first and Pretendard Variable second in the font stack to render Latin text in Red Hat Display and Korean text in Pretendard. Keep both SIL Open Font License files with the distributed fonts.
