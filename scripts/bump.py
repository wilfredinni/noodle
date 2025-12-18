import re
import os


def increment_version(version):
    major, minor, patch = map(int, version.split("."))
    patch += 1
    return f"{major}.{minor}.{patch}"


def update_pyproject_version(file_path, new_version):
    with open(file_path, "r") as file:
        content = file.read()

    updated_content = re.sub(
        r'version = "\d+\.\d+\.\d+"', f'version = "{new_version}"', content
    )

    with open(file_path, "w") as file:
        file.write(updated_content)


def update_urls_version(file_path, new_version):
    with open(file_path, "r") as file:
        content = file.read()

    updated_content = re.sub(
        r'context\["version"\] = "\d+\.\d+\.\d+"',
        f'context["version"] = "{new_version}"',
        content,
    )

    with open(file_path, "w") as file:
        file.write(updated_content)


def bum_version():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pyproject_file = os.path.join(base_dir, "pyproject.toml")
    urls_file = os.path.join(base_dir, "conf", "urls.py")

    with open(pyproject_file, "r") as file:
        pyproject_content = file.read()

    current_version = re.search(
        r'version = "(\d+\.\d+\.\d+)"', pyproject_content
    ).group(1)
    new_version = increment_version(current_version)

    update_pyproject_version(pyproject_file, new_version)
    update_urls_version(urls_file, new_version)

    print(f"Version updated to {new_version} in both pyproject.toml and urls.py")


if __name__ == "__main__":
    bum_version()
