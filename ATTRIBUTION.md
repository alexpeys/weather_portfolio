# Attribution

Weather Portfolio is heavily inspired by and derived from [Theo Jaffee’s Weather Atlas](https://github.com/tjaffee99/weather), also available at [weather.theojaffee.net](https://weather.theojaffee.net). The upstream commit inspected during development was `1766450a9202482d1ff5fc6c3bad682b27849f742e`.

The current app replaces Weather Atlas’s coarse representative climate sample with complete 2016–2025 daily histories. The portfolio interface, monthly optimizer, cost arithmetic, and current history fetcher were developed for this project. The public repository does not include the legacy Weather Atlas extraction decoder, map geometry, fonts, or application assets. The MIT license applies to this project’s original code, not to third-party datasets or upstream material.

## Weather

- [Open-Meteo ERA5-Seamless historical API](https://open-meteo.com/en/docs/historical-weather-api), combining ECMWF / Copernicus Climate Change Service ERA5-Land temperature and ERA5 precipitation, wind, and cloud cover.
- Open-Meteo data is used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes include daytime aggregation, removal of February 29, daily threshold classification, ten-year averaging, and monthly normalization. Every city’s API query is retained in `dist/climate.json`.
- The original ERA5 / Google ARCO-ERA5 representative sample used by Weather Atlas is not used for the current weather calculations.

## Locations

City coordinates use Natural Earth and GeoNames points retained from Weather Atlas, plus state-matched [Open-Meteo / GeoNames geocoding](https://open-meteo.com/en/docs/geocoding-api) for Bend, Eugene, Minneapolis, Reno, Jackson WY, Bozeman, Boston, Santa Barbara, Asheville, and Philadelphia. Source queries and GeoNames IDs are retained in `dist/cities.json`. Palo Alto uses the city-center coordinate 37.4419° N, 122.143° W.

## Housing

Public Redfin listing-page price facts were retrieved October 11, 2026. Exact 3-bedroom / 2-bath observations were deduplicated and aggregated into sample medians. Source links, addresses, sample sizes, pagination, and retrieval metadata are retained in `dist/housing.json`.

These non-random, first-page asking-price samples are not comprehensive citywide medians or completed-sale data. Some sources returned cached snapshots. Redfin does not publish or endorse this derived index. The application code license does not relicense third-party source material.
