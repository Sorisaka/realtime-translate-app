from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and install an Argos Translate language package.")
    parser.add_argument("--source", default="en", help="Source language code. Default: en")
    parser.add_argument("--target", default="ja", help="Target language code. Default: ja")
    args = parser.parse_args()

    try:
        from argostranslate import package
    except ImportError as exc:
        raise SystemExit(
            "argostranslate is not installed. Activate backend/.venv and run "
            "`python -m pip install -r backend/requirements.txt`."
        ) from exc

    package.update_package_index()
    available_packages = package.get_available_packages()
    selected_package = next(
        (
            item
            for item in available_packages
            if item.from_code == args.source and item.to_code == args.target
        ),
        None,
    )
    if selected_package is None:
        raise SystemExit(f"No Argos Translate package found for {args.source}->{args.target}.")

    package_path = selected_package.download()
    package.install_from_path(package_path)
    print(f"Installed Argos Translate package {args.source}->{args.target}.")


if __name__ == "__main__":
    main()
