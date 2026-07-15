#!/usr/bin/env python3
"""Audit every file referenced by a completed note artifact manifest."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--plan-file", type=Path, required=True)
    parser.add_argument("--expected-bundles", type=int, default=102)
    args = parser.parse_args()

    output_dir = args.output_dir.resolve()
    manifest_path = output_dir / "manifest.json"
    queue_path = output_dir / "upload-queue.csv"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    summary = manifest.get("summary", {})
    expected_summary = {
        "expectedArticleBundles": args.expected_bundles,
        "generatedArticleBundles": args.expected_bundles,
        "readyArticleBundles": args.expected_bundles,
        "failedArticleBundles": 0,
        "expectedDocuments": args.expected_bundles * 2,
        "readyDocuments": args.expected_bundles * 2,
        "expectedArtifactFiles": args.expected_bundles * 6,
        "readyArtifactFiles": args.expected_bundles * 6,
        "countMatchesPlan": True,
    }
    if manifest.get("state") != "ready":
        errors.append(f"manifest state is {manifest.get('state')!r}, not 'ready'")
    for key, expected in expected_summary.items():
        if summary.get(key) != expected:
            errors.append(f"summary.{key}: expected {expected!r}, got {summary.get(key)!r}")

    settings = manifest.get("settings", {})
    if settings.get("includeDate") is not False:
        errors.append("includeDate is not false")
    if settings.get("showPageNumbers") is not True:
        errors.append("showPageNumbers is not true")
    if settings.get("footerText") != "Created by motoki":
        errors.append("footer text does not exactly match 'Created by motoki'")

    plan_hash = sha256(args.plan_file.resolve())
    if manifest.get("plan", {}).get("sha256") != plan_hash:
        errors.append("plan SHA-256 does not match the current plan file")
    snapshot_path = output_dir / "source-snapshot.json"
    if not snapshot_path.exists() or manifest.get("source", {}).get("sha256") != sha256(snapshot_path):
        errors.append("source snapshot SHA-256 mismatch")

    articles = manifest.get("articles", [])
    if len(articles) != args.expected_bundles:
        errors.append(f"expected {args.expected_bundles} articles, got {len(articles)}")

    artifact_paths: set[str] = set()
    total_pages = 0
    max_file: tuple[int, str] = (0, "")
    for article in articles:
        if article.get("status") != "ready":
            errors.append(f"article not ready: {article.get('bookId')} {article.get('articleCode')}")
        documents = article.get("documents", [])
        if len(documents) != 2:
            errors.append(f"article does not have two documents: {article.get('bookId')} {article.get('articleCode')}")
        for document in documents:
            validation = document.get("validation", {})
            total_pages += int(validation.get("fullPages") or 0)
            required_checks = ["a4Portrait", "titleFound", "footerFound", "pageNumberFound"]
            if any(validation.get(key) is not True for key in required_checks):
                errors.append(f"validation failed: {article.get('bookId')} {article.get('articleCode')} {document.get('role')}")
            if validation.get("samplePages") != 1:
                errors.append(f"sample is not one page: {document.get('role')}")
            if validation.get("expectedPages") != validation.get("fullPages"):
                errors.append(f"full page count mismatch: {document.get('role')}")
            for key in ("fullPdf", "samplePdf", "previewPng"):
                record = document.get(key, {})
                relative_path = record.get("path")
                if not relative_path or relative_path in artifact_paths:
                    errors.append(f"missing or duplicate artifact path: {relative_path!r}")
                    continue
                artifact_paths.add(relative_path)
                path = output_dir / relative_path
                if not path.is_file():
                    errors.append(f"missing artifact: {relative_path}")
                    continue
                size = path.stat().st_size
                if size != record.get("bytes"):
                    errors.append(f"size mismatch: {relative_path}")
                if sha256(path) != record.get("sha256"):
                    errors.append(f"SHA-256 mismatch: {relative_path}")
                if size > max_file[0]:
                    max_file = (size, relative_path)

    actual_artifacts = {
        path.relative_to(output_dir).as_posix()
        for path in output_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in {".pdf", ".png"}
    }
    if actual_artifacts != artifact_paths:
        errors.append(
            f"actual/manifest artifact sets differ: actual={len(actual_artifacts)}, manifest={len(artifact_paths)}"
        )
    debug_files = [path for path in output_dir.rglob("*") if path.is_file() and "debug" in path.name.lower()]
    if debug_files:
        errors.append(f"debug files found: {len(debug_files)}")

    with queue_path.open("r", encoding="utf-8-sig", newline="") as file_handle:
        queue_rows = list(csv.DictReader(file_handle))
    if len(queue_rows) != args.expected_bundles:
        errors.append(f"upload queue has {len(queue_rows)} rows")

    result = {
        "ok": not errors,
        "state": manifest.get("state"),
        "articleBundles": len(articles),
        "documents": sum(len(article.get("documents", [])) for article in articles),
        "artifactFiles": len(artifact_paths),
        "pdfFiles": sum(path.lower().endswith(".pdf") for path in artifact_paths),
        "pngFiles": sum(path.lower().endswith(".png") for path in artifact_paths),
        "fullPdfPages": total_pages,
        "uploadQueueRows": len(queue_rows),
        "debugFiles": len(debug_files),
        "maxArtifactBytes": max_file[0],
        "maxArtifactPath": max_file[1],
        "errors": errors,
    }
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
