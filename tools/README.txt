Scripts (R, run with Rscript):

  make_metrics.R  writes app/src/main/assets/www/engine/metrics.js, the
                  Helvetica glyph widths and heights used to place text, read
                  from the AFM files that come with R (grDevices)
  make_icon.R     draws the launcher icons

The drawing engine in app/src/main/assets/www/engine/ is a JavaScript port of
the R packages lithoglyph and Strativis (same logs, same PDF). The R packages
remain the reference: tests compared both outputs number by number and page
by page.
