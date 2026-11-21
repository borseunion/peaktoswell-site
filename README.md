# peaktoswell-site

What https://peaktoswell.com serves (GitHub Pages, branch `main`).

- `data/` is written by the backend on its timetable (repository `borseunion/peaktoswell`, private). Nothing else writes there, and the backend touches nothing outside `data/` and `.nojekyll`.
- `index.html` and `app/` are the app: plain HTML, CSS and one JavaScript module, with no build step. What is in the repository is what the browser loads.
- `sw.js` is the service worker. It keeps the app and every data file the app has shown on the device, so that both open without a connection; with a connection the data always comes from the network.
- `manifest.webmanifest` and `app/icons/` let a phone install the app on its home screen.
- `tests/` and `package.json` hold the tests of the app's functions: `node --test tests/app.test.mjs` (Node 22, no dependencies).
- `CNAME` is written by GitHub for the domain.

The app follows the approved design canvas "PeakToSwell App".

## After a change

Raise the version number in three places together: `?v=` on the two lines of `index.html`, and `VERSION` in `sw.js`. Browsers and the service worker then fetch the new files; a test checks that the three agree. The number shown on the About screen is `VERSION` in `app/app.js`.

## Credits

Font: Manrope, under the SIL Open Font License 1.1 (`app/fonts/OFL.txt`). Weather data by Open-Meteo.com (CC BY 4.0). Lift, slope and snow status from the resorts' own reports, many of them through LiftRadar.
