# Sunlit Foliage still-image prototype

Desktop model for evaluating the look of a post-capture effect on OM-3. Requires Python, NumPy and Pillow.

    python sunlit.py input.jpg crop.jpg
    python sunlit.py input.jpg full.jpg --full-frame

Default output uses the ZATO 978 x 404 center crop. Full frame uses a 978-pixel-wide working grid, then nearest-neighbor expansion to the input dimensions. Both encode JPEG quality 92, horizontal 4:2:2. The input and output buffer models average adjacent chroma pairs using full-range JPEG YCbCr. The camera's actual transfer function, encoder, memory use and latency have not been measured.

The reference was rendered in headless Chrome with the canvas resampling function from App.tsx and the original final-stage engine and forest_colourized preset from CharTyr/ZATO-photo at b38582e175208989cdf3b93f777408d689ff086f. The comparison sample is the 1600 x 1200 FILM 19 Astia 100F OM-3 JPEG credited to androidfanman (CC0) in devkit/photo-code.

The lookup was calibrated on synthetic gray ramps independently of the sample. Render a 256 x 256 image with R=G=B=x and alpha=255 using the same preset through the upstream colour stage. Deduplicate its RGB triples to obtain 23 colors and store the index image as a byte array (row = dither sample, column = lightness). sunlit.npz contains those two arrays. Rendering chooses a sample for each pixel, adds table-based Gaussian noise and quantizes each channel to ten levels. Seeds are fixed for repeatability. Resampling, noise realizations, chroma sharing and JPEG compression can all contribute to differences.

Against the lossless browser reference, decoded JPEG RGB mean absolute error (0..255) was 15.49, or 2.71 after a Gaussian blur (sigma 3 pixels on both RGB images). These numbers compare one image and the two complete pipelines.

## OM-3 firmware integration (emulator)

The development build recognizes FILM 20 only when its 16-byte bank name is the zero-padded ASCII string `Sunlit Foliage`. To make an emulator bank, run `python research/sunlit-foliage/bank.py releases/v0.40.2/LOOKS.BIN path/to/new/LOOKS.BIN`. The tool requires a new output file and copies the other 19 records and their names. FILM 20 starts with a neutral record. The supplied bank is for a separate emulator card.

The capture converter requests the sharp-input Soft Focus path. The existing review-job gate still applies. In xb_gs the finished COLOR frame passes through sunlit_run after shading and before the border. Each invocation allocates one row (2 x image width in bytes); 1024-byte transfers bound each lock. Input is sampled on a grid up to 978 pixels wide, with representative samples within each pair of grid cells. The desktop prototype used Lanczos resampling; this firmware pass uses point samples, an integer lightness lookup, 64 precomputed dither/noise variants and shared pair chroma. The full frame retains its original dimensions.

Run `python tools/test/emu_test.py BUILD --only sunlit-film20-still` with the project's E147 emulator environment. The test opens Picture Mode, selects the named FILM 20, exercises xb_cap and xb_gs with synthetic still and RAW-preview jobs, and checks row padding, guard bytes, saved registers and the ordinary FILM 20 path. The stock blend and buffer-index lookup are stubbed for the supplied development buffer. The emulator cannot execute the optical capture or measure the real cache, JPEG encoder or shutter latency. Selection is read again at the start of xb_gs; changing looks while a shot is queued has not been validated.
