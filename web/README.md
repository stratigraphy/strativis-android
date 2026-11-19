# Strativis web app

The same Strativis as the Android app, opened in a browser. It is the way to
offer Strativis on iPhone and iPad without an Apple Developer account, and it
also runs on any PC, which makes it the quickest way to try a change.

## What users do on iPhone or iPad

1. Open the web address in Safari.
2. Share > Add to Home Screen.
3. Open Strativis from the home screen. After the first visit it works offline.

Sections are kept in the browser's storage on the device, as in the Android app.
Saving a PDF or an export opens the share sheet (Save to Files, AirDrop, Mail).

## Publishing (GitHub Pages)

The app is online at https://stratigraphy.github.io/strativis-android/, served
from the `gh-pages` branch, which holds only the built site. To publish a new
version: run `Rscript web/build_site.R site` and replace the contents of the
`gh-pages` branch with the folder `site`.

Users get the new version the next time they open the app with a connection.
`web/ci/web.yml` is an alternative: copied to `.github/workflows/web.yml`, it
builds and publishes the site on every push (then set Settings > Pages > Source
to GitHub Actions).

## Trying it on your PC

```
Rscript web/build_site.R site
```

writes the folder `site`. Serve it on localhost (for example
`Rscript -e "servr::httd('site', port = 8765)"`) and open
http://localhost:8765 in a browser. Opening `index.html` as a file does not work:
browsers load the app's modules only from a web address.

## Files

* `build_site.R`: copies the web app from the Android assets, adds the files
  below and writes the offline file list. The Android assets are not changed.
* `web.js`: offline registration, and saving through the share sheet on iPhone and iPad.
* `sw.js`: keeps all files on the device for offline use.
* `manifest.webmanifest`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`: name and icon on the home screen.

## Differences from the Android app

* Compass-clinometer on iPhone and iPad: Safari gives the phone's orientation
  relative to an arbitrary direction plus a magnetic compass heading. While the
  phone is held roughly flat, `web.js` uses the heading to find north; the
  gyroscope then keeps north while the phone lies on a steep surface. So: hold
  the phone flat for a moment before laying it on the plane. Until north is
  found, the app marks the direction as relative.
* On iPhone and iPad, Safari shows an "Install Strativis" guide until the app is
  on the home screen.
* The donation link is shown (the store rules do not apply to a website).

## Checked

Built with R 4.3 and run in WebKit (the engine of Safari) and Chromium with an
iPhone profile: install guide shown in Safari and not in the installed app; the
app loads, draws the preview, saves the PDF, the R export (ZIP) and the project
file through the share sheet, switches to French, and starts with the web
server switched off (offline). The compass calculation was checked on simulated
sensor readings (500 orientations, largest error 0.3°), not yet on a real iPhone.
