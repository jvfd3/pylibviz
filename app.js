const SUPPORTED_PYTHON_VERSIONS = [
  "3.8",
  "3.9",
  "3.10",
  "3.11",
  "3.12",
  "3.13",
];

const RELEASE_LIMIT_PER_PACKAGE = 16;

const els = {
  requirementsInput: document.getElementById("requirements-input"),
  pythonSelect: document.getElementById("python-select"),
  analyzeBtn: document.getElementById("analyze-btn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
};

initializePythonVersionSelector();
attachEvents();

function initializePythonVersionSelector() {
  const defaults = new Set(["3.10", "3.11", "3.12", "3.13"]);

  // Reset and build a continuous version bar.
  els.pythonSelect.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "python-version-bar";

  for (const version of SUPPORTED_PYTHON_VERSIONS) {
    const segment = document.createElement("button");
    segment.className = "python-segment";
    segment.type = "button";
    segment.dataset.version = version;
    segment.title = `Python ${version}`;
    segment.setAttribute("aria-label", `Python ${version}`);
    segment.textContent = version;

    if (defaults.has(version)) {
      segment.classList.add("selected");
    }

    segment.addEventListener("click", function (e) {
      e.preventDefault();
      this.classList.toggle("selected");
    });

    bar.appendChild(segment);
  }

  els.pythonSelect.appendChild(bar);
}

function attachEvents() {
  els.analyzeBtn.addEventListener("click", onAnalyze);

  // Shortcut: Ctrl+R (or Cmd+R) to analyze compatibility.
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "r") {
      e.preventDefault();
      onAnalyze();
    }
  });
}

function selectedPythonVersions() {
  return [...document.querySelectorAll(".python-segment.selected")].map(
    (i) => i.dataset.version,
  );
}

async function onAnalyze() {
  try {
    setStatus("Preparing Python parser...");
    await waitForPythonParser();

    const selectedPy = selectedPythonVersions();
    if (selectedPy.length === 0) {
      renderError("Select at least one Python version to compare.");
      return;
    }

    const requirementsText = els.requirementsInput.value || "";
    const requirements = parseRequirements(requirementsText);

    const validReqs = requirements.filter((r) => r.name);
    const warnings = requirements.filter((r) => r.warning);

    if (validReqs.length === 0) {
      renderError("No valid dependencies found. Check the input text.");
      return;
    }

    setStatus("Fetching metadata from PyPI...");
    const packageData = await Promise.all(
      validReqs.map((req) => analyzePackage(req, selectedPy)),
    );

    if (warnings.length > 0) {
      setStatus(
        `Analysis completed for ${packageData.length} package(s) with ${warnings.length} warning(s).`,
      );
    }
    renderTimeline(packageData, selectedPy);
    if (warnings.length === 0) {
      setStatus(`Analysis completed for ${packageData.length} package(s).`);
    }
  } catch (error) {
    renderError(`Analysis failed: ${error.message}`);
  }
}

function parseRequirements(text) {
  const raw = window.parse_requirements_py(text);
  return JSON.parse(raw);
}

async function analyzePackage(requirement, selectedPython) {
  const packageName = requirement.name;
  const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Package ${packageName} was not found on PyPI.`);
  }

  const payload = await response.json();
  const releases = normalizeReleases(
    payload.releases,
    requirement,
    selectedPython,
  );

  return {
    packageName,
    specifier: requirement.specifier || "(no requirement constraint)",
    requestedByUser: requirement.raw,
    latestVersion: payload.info?.version || "unknown",
    releases,
  };
}

function normalizeReleases(releasesObj, requirement, selectedPython) {
  const rows = [];

  for (const [version, files] of Object.entries(releasesObj || {})) {
    if (!Array.isArray(files) || files.length === 0) {
      continue;
    }

    const sortableFiles = [...files]
      .filter((f) => f.upload_time_iso_8601)
      .sort((a, b) =>
        a.upload_time_iso_8601.localeCompare(b.upload_time_iso_8601),
      );
    if (sortableFiles.length === 0) {
      continue;
    }

    const firstFile = sortableFiles[0];
    const requiresPython =
      sortableFiles.find(
        (f) => f.requires_python && String(f.requires_python).trim(),
      )?.requires_python || "";

    const compat = {};
    for (const py of selectedPython) {
      compat[py] = window.is_python_compatible_py(requiresPython, py);
    }

    rows.push({
      version,
      uploadTime: firstFile.upload_time_iso_8601,
      uploadDate: firstFile.upload_time_iso_8601.slice(0, 10),
      requiresPython,
      matchesUserSpecifier: window.version_matches_specifier_py(
        version,
        requirement.specifier || "",
      ),
      compat,
    });
  }

  rows.sort((a, b) => b.uploadTime.localeCompare(a.uploadTime));
  return rows.slice(0, RELEASE_LIMIT_PER_PACKAGE);
}

function renderCompatibilityBar(release, selectedPy) {
  /**
   * Renders a continuous compatibility bar
   * Similar to the Python version selector
   */
  const segments = selectedPy
    .map((py) => {
      const ok = release.compat[py];
      return `
        <div 
          class="compat-segment ${ok ? "compat-segment-ok" : "compat-segment-bad"}" 
          title="Python ${py}: ${ok ? "compatible" : "not compatible"}"
        >
          <span class="compat-version">${py}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="compat-bar">
      ${segments}
    </div>
  `;
}

function countCompatiblePython(release, selectedPy) {
  return selectedPy.reduce(
    (count, py) => count + (release.compat[py] ? 1 : 0),
    0,
  );
}

function selectPrimaryRelease(releases, selectedPy) {
  if (!releases || releases.length === 0) {
    return { index: -1, reason: "" };
  }

  // Priority 1: most recent release that matches the requirements specifier.
  const matchesSpecifierIndex = releases.findIndex(
    (r) => r.matchesUserSpecifier,
  );
  if (matchesSpecifierIndex !== -1) {
    return {
      index: matchesSpecifierIndex,
      reason: "highlight: matches specifier",
    };
  }

  // Priority 2: most recent release with the highest compatibility across selected Python versions.
  let bestIndex = 0;
  let bestScore = countCompatiblePython(releases[0], selectedPy);
  for (let i = 1; i < releases.length; i += 1) {
    const score = countCompatiblePython(releases[i], selectedPy);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestScore > 0) {
    return {
      index: bestIndex,
      reason: `highlight: ${bestScore}/${selectedPy.length} compatible`,
    };
  }

  // Priority 3: most recent release (list is already sorted by descending date).
  return { index: 0, reason: "highlight: most recent release" };
}

function renderReleaseRow(release, selectedPy, highlightReason = "") {
  const compatBar = renderCompatibilityBar(release, selectedPy);

  const hitBadge = release.matchesUserSpecifier
    ? '<span class="badge badge-hit">matches specifier</span>'
    : "";

  const focusBadge = highlightReason
    ? `<span class="badge badge-focus">${escapeHtml(highlightReason)}</span>`
    : "";

  const reqPyLabel = release.requiresPython
    ? escapeHtml(release.requiresPython)
    : "not provided";

  return `
    <article class="release-row">
      <div class="release-layout">
        <div class="release-meta-vertical">
          <div class="meta-line">
            <span class="meta-key">Version:</span>
            <span class="meta-value">v${escapeHtml(release.version)}</span>
          </div>
          <div class="meta-line">
            <span class="meta-key">Date:</span>
            <span class="meta-value">${escapeHtml(release.uploadDate)}</span>
          </div>
          <div class="meta-line">
            <span class="meta-key">Python:</span>
            <span class="meta-value">${reqPyLabel}</span>
          </div>
        </div>
      
        <div class="compat-container">
          ${compatBar}
          <div class="badges">${hitBadge}${focusBadge}</div>
        </div>
      </div>
    </article>
  `;
}

function renderTimeline(packageData, selectedPy) {
  if (packageData.length === 0) {
    els.results.innerHTML = '<div class="empty">No results to display.</div>';
    return;
  }

  const cards = packageData.map((pkg) => {
    if (!pkg.releases || pkg.releases.length === 0) {
      return `
        <section class="pkg-card">
          <div class="pkg-head">
            <span class="pkg-name">${escapeHtml(pkg.packageName)}</span>
            <span class="pkg-spec">Required version: ${escapeHtml(pkg.specifier)}</span>
          </div>
          <div class="timeline"><div class="empty">No releases with dates.</div></div>
        </section>
      `;
    }

    const { index: primaryIndex, reason } = selectPrimaryRelease(
      pkg.releases,
      selectedPy,
    );

    const primaryRelease = pkg.releases[primaryIndex] || pkg.releases[0];
    const fallbackIndex = primaryRelease === pkg.releases[0] ? 0 : primaryIndex;

    const extraRows = pkg.releases
      .filter((_, idx) => idx !== fallbackIndex)
      .map((release) => renderReleaseRow(release, selectedPy))
      .join("");

    const extrasHtml = extraRows
      ? `
        <details class="pkg-collapse">
          <summary>show more versions (${pkg.releases.length - 1})</summary>
          <div class="pkg-collapse-content">${extraRows}</div>
        </details>
      `
      : "";

    return `
      <section class="pkg-card">
        <div class="pkg-head">
          <span class="pkg-name">${escapeHtml(pkg.packageName)}</span>
          <span class="pkg-spec">Required version: ${escapeHtml(pkg.specifier)}</span>
        </div>
        <div class="timeline">
          ${renderReleaseRow(primaryRelease, selectedPy, reason)}
          ${extrasHtml}
        </div>
      </section>
    `;
  });

  els.results.innerHTML = cards.join("");
}

function renderError(message) {
  setStatus("Error during analysis.");
  els.results.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function setStatus(message) {
  els.status.textContent = message;
}

function waitForPythonParser() {
  return new Promise((resolve, reject) => {
    const timeoutMs = 14000;
    const start = performance.now();

    const tick = () => {
      if (typeof window.parse_requirements_py === "function") {
        resolve();
        return;
      }

      if (performance.now() - start > timeoutMs) {
        reject(new Error("PyScript did not initialize in time."));
        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
