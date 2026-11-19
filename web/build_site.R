# build_site.R: the Strativis web app (installable, works offline) ####
# Run from the repository root: Rscript web/build_site.R [output folder]
# Copies the web app from the Android assets, adds the files in web/ and
# writes the list of files the browser keeps for offline use (sw.js).

args <- commandArgs(trailingOnly = TRUE)
out <- "site"
if (length(args) >= 1) {
  out <- args[1]
}
src <- file.path("app", "src", "main", "assets", "www")
web <- "web"
if (!file.exists(file.path(src, "index.html"))) {
  stop("run this script from the repository root (", src, " not found)")
}

# Copy the web app ####
unlink(out, recursive = TRUE)
dir.create(out, recursive = TRUE)
files <- list.files(src, recursive = TRUE)
for (f in files) {
  dir.create(dirname(file.path(out, f)), recursive = TRUE, showWarnings = FALSE)
  file.copy(file.path(src, f), file.path(out, f), overwrite = TRUE)
}
extra <- c("manifest.webmanifest", "web.js", "apple-touch-icon.png", "icon-192.png", "icon-512.png")
for (f in extra) {
  file.copy(file.path(web, f), file.path(out, f), overwrite = TRUE)
}
invisible(file.create(file.path(out, ".nojekyll")))

# Add the web-only tags to index.html ####
index <- file.path(out, "index.html")
html <- readLines(index, encoding = "UTF-8", warn = FALSE)
at <- grep("<link rel=\"stylesheet\" href=\"style.css\">", html, fixed = TRUE)
if (length(at) != 1) {
  stop("index.html: the style sheet line was not found exactly once")
}
tags <- c(
  "<link rel=\"manifest\" href=\"manifest.webmanifest\">",
  "<link rel=\"icon\" href=\"icon-192.png\">",
  "<link rel=\"apple-touch-icon\" href=\"apple-touch-icon.png\">",
  "<meta name=\"mobile-web-app-capable\" content=\"yes\">",
  "<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">",
  "<meta name=\"apple-mobile-web-app-title\" content=\"Strativis\">",
  "<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"default\">",
  "<script src=\"web.js\"></script>"
)
html <- c(html[seq_len(at)], tags, html[seq(at + 1, length(html))])
con <- file(index, open = "wb")
writeLines(enc2utf8(html), con, sep = "\n", useBytes = TRUE)
close(con)

# Write sw.js with the file list and a version made from the contents ####
keep <- sort(list.files(out, recursive = TRUE))
sums <- tools::md5sum(file.path(out, keep))
tmp <- tempfile()
writeLines(paste(keep, sums), tmp)
version <- unname(tools::md5sum(tmp))
unlink(tmp)
sw <- readLines(file.path(web, "sw.js"), encoding = "UTF-8", warn = FALSE)
list_js <- paste0("[\n  \"./\",\n", paste0("  \"", keep, "\"", collapse = ",\n"), "\n]")
sw <- sub("__VERSION__", version, sw, fixed = TRUE)
sw <- sub("__FILES__", list_js, sw, fixed = TRUE)
con <- file(file.path(out, "sw.js"), open = "wb")
writeLines(enc2utf8(sw), con, sep = "\n", useBytes = TRUE)
close(con)

cat("web app written to", out, "(", length(keep), "files, version", version, ")\n")
