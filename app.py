import json
from packaging.requirements import Requirement, InvalidRequirement
from packaging.specifiers import SpecifierSet, InvalidSpecifier
from packaging.version import Version, InvalidVersion
from pyodide.ffi import create_proxy
import js


def parse_requirements_text(text: str) -> str:
    parsed = []
    for index, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("-r ") or line.startswith("--requirement"):
            parsed.append(
                {
                    "line": index,
                    "raw": raw_line,
                    "warning": "-r references are not processed in this MVP.",
                }
            )
            continue

        try:
            req = Requirement(line)
            parsed.append(
                {
                    "line": index,
                    "raw": raw_line,
                    "name": req.name,
                    "specifier": str(req.specifier),
                    "extras": sorted(list(req.extras)),
                }
            )
        except InvalidRequirement:
            parsed.append(
                {
                    "line": index,
                    "raw": raw_line,
                    "warning": "Invalid line for PEP 508 parser.",
                }
            )

    return json.dumps(parsed)


def is_python_compatible(requires_python: str, python_version: str) -> bool:
    requires_python = (requires_python or "").strip()
    if not requires_python:
        return True

    try:
        return Version(python_version) in SpecifierSet(requires_python)
    except (InvalidSpecifier, InvalidVersion):
        return True


def version_matches_specifier(version: str, specifier: str) -> bool:
    specifier = (specifier or "").strip()
    if not specifier:
        return True

    try:
        return Version(version) in SpecifierSet(specifier)
    except (InvalidSpecifier, InvalidVersion):
        return False


js.window.parse_requirements_py = create_proxy(parse_requirements_text)
js.window.is_python_compatible_py = create_proxy(is_python_compatible)
js.window.version_matches_specifier_py = create_proxy(
    version_matches_specifier)
