# make_icon.R: Strativis app icon, drawn with lithoglyph ####

library(lithoglyph)
args <- commandArgs(trailingOnly = TRUE)
out_dir <- args[1]

draw_icon <- function(file, px) {
  grDevices::png(file, width = px, height = px, bg = "transparent", res = 72)
  on.exit(grDevices::dev.off())
  graphics::par(mar = c(0, 0, 0, 0))
  graphics::plot.new()
  graphics::plot.window(xlim = c(0, 1), ylim = c(0, 1), xaxs = "i", yaxs = "i")
  # rounded square background
  r <- 0.18
  t <- seq(0, pi / 2, length.out = 20)
  cx <- c(1 - r + r * cos(t), r + r * cos(t + pi / 2), r + r * cos(t + pi), 1 - r + r * cos(t + 1.5 * pi))
  cy <- c(1 - r + r * sin(t), 1 - r + r * sin(t + pi / 2), r + r * sin(t + pi), r + r * sin(t + 1.5 * pi))
  graphics::polygon(cx, cy, col = "#3A4246", border = NA)
  upi <- c(1 / (px / 72), 1 / (px / 72))
  pl <- pretty_litholog(
    base = c(0.16, 0.33, 0.47, 0.62, 0.74), top = c(0.33, 0.47, 0.62, 0.74, 0.86),
    width = c(0.48, 0.74, 0.58, 0.82, 0.6), contact = c("sharp", "erosive", "sharp", "convex", "sharp"),
    left = 0.2, corner = 0.06 * px / 72, amp = 0.02 * px / 72, upi = upi
  )
  # Munsell rock colours: dark gray N3 shale, grayish orange 10YR 7/4 sandstone,
  # light gray N7 limestone, moderate yellowish brown 10YR 5/4 conglomerate,
  # pale yellowish brown 10YR 6/2 dolostone
  fills <- c("#56595A", "#C8AB80", "#B4B6B2", "#8E7552", "#A39581")
  pats <- c("shale", "sandstone", "limestone", "conglomerate", "dolostone")
  for (k in seq_len(nrow(pl$beds))) {
    s <- pl$log[pl$log$i == pl$beds$i[k], ]
    graphics::polygon(s$xy, s$dt, col = fills[k], border = NA)
    if (px >= 96) {
      fill_pattern(s$xy, s$dt, pats[k], scale = px / 300, col = "#2A2D2E", lwd = px / 400,
        bg = NA)
    }
    graphics::polygon(s$xy, s$dt, col = NA, border = "#E8E4DC", lwd = max(1, px / 90))
  }
  graphics::segments(0.2, 0.16, 0.2, 0.86, col = "#E8E4DC", lwd = max(1, px / 60))
}

sizes <- c(mdpi = 48, hdpi = 72, xhdpi = 96, xxhdpi = 144, xxxhdpi = 192)
for (nm in names(sizes)) {
  d <- file.path(out_dir, paste0("mipmap-", nm))
  dir.create(d, recursive = TRUE, showWarnings = FALSE)
  draw_icon(file.path(d, "ic_launcher.png"), sizes[[nm]])
}
draw_icon(file.path(out_dir, "..", "..", "..", "..", "strativis_icon_512.png"), 512)
cat("icons written\n")
