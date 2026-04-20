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
  summary: document.getElementById("summary-content"),
  results: document.getElementById("results"),
};

initializePythonVersionSelector();
attachEvents();

function initializePythonVersionSelector() {
  const defaults = new Set(["3.10", "3.11", "3.12", "3.13"]);

  for (const version of SUPPORTED_PYTHON_VERSIONS) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "python-version";
    input.value = version;
    input.checked = defaults.has(version);

    const text = document.createTextNode(`Python ${version}`);
    label.appendChild(input);
    label.appendChild(text);
    els.pythonSelect.appendChild(label);
  }
}

function attachEvents() {
  els.analyzeBtn.addEventListener("click", onAnalyze);
}

function selectedPythonVersions() {
  return [
    ...document.querySelectorAll("input[name='python-version']:checked"),
  ].map((i) => i.value);
}

async function onAnalyze() {
  try {
    setStatus("Preparando parser Python...");
    await waitForPythonParser();

    const selectedPy = selectedPythonVersions();
    if (selectedPy.length === 0) {
      renderError("Selecione ao menos uma versao do Python para comparar.");
      return;
    }

    const requirementsText = els.requirementsInput.value || "";
    const requirements = parseRequirements(requirementsText);

    const validReqs = requirements.filter((r) => r.name);
    const warnings = requirements.filter((r) => r.warning);

    if (validReqs.length === 0) {
      renderError(
        "Nenhuma dependencia valida encontrada. Verifique o texto inserido.",
      );
      return;
    }

    setStatus("Consultando metadados no PyPI...");
    const packageData = await Promise.all(
      validReqs.map((req) => analyzePackage(req, selectedPy)),
    );

    renderSummary(validReqs, warnings, selectedPy, packageData);
    renderTimeline(packageData, selectedPy);
    setStatus(`Analise concluida para ${packageData.length} pacote(s).`);
  } catch (error) {
    renderError(`Falha na analise: ${error.message}`);
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
    throw new Error(`Pacote ${packageName} nao encontrado no PyPI.`);
  }

  const payload = await response.json();
  const releases = normalizeReleases(
    payload.releases,
    requirement,
    selectedPython,
  );

  return {
    packageName,
    specifier: requirement.specifier || "(sem restricao no requirements)",
    requestedByUser: requirement.raw,
    latestVersion: payload.info?.version || "desconhecida",
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

function renderSummary(validReqs, warnings, selectedPy, packageData) {
  const matchingCounts = packageData.map((pkg) => {
    const matches = pkg.releases.filter((r) => r.matchesUserSpecifier).length;
    return `${pkg.packageName}: ${matches}/${pkg.releases.length} versoes no recorte atendem ao specifier`;
  });

  const warningHtml = warnings.length
    ? `<p><strong>Observacoes:</strong> ${warnings
        .map(
          (w) =>
            `linha ${w.line} (${escapeHtml(w.raw)}): ${escapeHtml(w.warning)}`,
        )
        .join(" | ")}</p>`
    : "";

  els.summary.innerHTML = `
    <p><strong>Pacotes analisados:</strong> ${validReqs.length}</p>
    <p><strong>Python selecionado:</strong> ${selectedPy.join(", ")}</p>
    <p><strong>Recorte por pacote:</strong> ultimas ${RELEASE_LIMIT_PER_PACKAGE} releases com data disponivel</p>
    <p>${matchingCounts.map(escapeHtml).join("<br>")}</p>
    ${warningHtml}
  `;
}

function renderTimeline(packageData, selectedPy) {
  if (packageData.length === 0) {
    els.results.innerHTML =
      '<div class="empty">Nenhum resultado para exibir.</div>';
    return;
  }

  const cards = packageData.map((pkg) => {
    const releaseRows = pkg.releases
      .map((release) => {
        const compatBadges = selectedPy
          .map((py) => {
            const ok = release.compat[py];
            return `<span class="badge ${ok ? "badge-ok" : "badge-bad"}">${ok ? "OK" : "X"} py${py}</span>`;
          })
          .join(" ");

        const hitBadge = release.matchesUserSpecifier
          ? '<span class="badge badge-hit">atende specifier</span>'
          : "";

        const reqPyLabel = release.requiresPython
          ? `requires_python: ${escapeHtml(release.requiresPython)}`
          : "requires_python: nao informado";

        return `
          <article class="release-row">
            <div class="release-meta">
              <span>v${escapeHtml(release.version)}</span>
              <span>${escapeHtml(release.uploadDate)}</span>
              <span>${reqPyLabel}</span>
            </div>
            <div class="badges">${compatBadges} ${hitBadge}</div>
          </article>
        `;
      })
      .join("");

    return `
      <section class="pkg-card">
        <div class="pkg-head">
          <span class="pkg-name">${escapeHtml(pkg.packageName)}</span>
          <span class="pkg-spec">specifier no requirements: ${escapeHtml(pkg.specifier)}</span>
        </div>
        <div class="timeline">${releaseRows || '<div class="empty">Sem releases com data.</div>'}</div>
      </section>
    `;
  });

  els.results.innerHTML = cards.join("");
}

function renderError(message) {
  setStatus("Erro durante a analise.");
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
        reject(new Error("PyScript nao inicializou a tempo."));
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
