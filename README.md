# peaktoswell-site

What https://peaktoswell.com serves (GitHub Pages, branch `main`).

- `data/` is written by the backend on its timetable (repository `borseunion/peaktoswell`, private). Nothing else writes there, and the backend touches nothing outside `data/` and `.nojekyll`.
- `index.html` and `app/` are the app: plain HTML, CSS and one JavaScript module, with no build step. What is in the repository is what the browser loads.
- `tests/` and `package.json` hold the tests of the app's functions: `node --test tests/app.test.mjs` (Node 22, no dependencies).
- `CNAME` is written by GitHub for the domain.

The app follows the approved design canvas "PeakToSwell App". After a change to `app/app.js` or `app/app.css`, raise the `?v=` number on their two lines in `index.html`, so that browsers fetch the new files.

Font: Manrope, under the SIL Open Font License 1.1 (`app/fonts/OFL.txt`). Weather data by Open-Meteo.com (CC BY 4.0). Lift, slope and snow status from the resorts' own reports, many of them through LiftRadar.
