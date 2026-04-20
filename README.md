# pylibviz

Compatibility visualizer for Python libraries, PyPI releases, and Python versions.

## Goal

This project addresses the pain of checking version conflicts between Python packages.
You paste a requirements.txt and get:

- a list of detected packages;
- a timeline of recent releases for each package;
- compatibility comparison by selected Python version;
- highlighted releases that match the requirements specifier.

## How it works

- Static interface (compatible with GitHub Pages).
- Requirements parser and specifier logic in Python, running in the browser via PyScript.
- Release metadata fetched in real time from the PyPI JSON API.
- Compatibility computed from each release's requires_python field.

## Structure

- index.html: main page.
- styles.css: visual styles.
- app.js: PyPI requests and timeline rendering.
- app.py: requirements parser and compatibility evaluation (PEP 508 / specifiers).
- pyscript.toml: Python dependencies loaded in the browser.

## Run locally

Simple option:

```bash
python -m http.server 8000
```

Then open in your browser: <http://localhost:8000>

## Publish on GitHub Pages

This repository already includes a workflow at [.github/workflows/pages.yml](.github/workflows/pages.yml) to publish automatically to GitHub Pages on each push to the `main` branch.

1. Push files to the repository.
2. On GitHub, open Settings > Pages.
3. Under Build and deployment, set Source to GitHub Actions.
4. Push to `main` and wait for the job to finish.
5. The published URL appears in the Actions tab and in Settings > Pages.

## Current limits (MVP)

- Lines with -r/--requirement are flagged but not loaded automatically.
- The view includes the latest 16 releases per package (to keep browser performance stable).
- If a package does not declare requires_python in a release, it is treated as compatible due to missing explicit constraints.
